"""Deterministic production-quality checks for generated Zeros 3D assets.

This module intentionally does not call a hosted 3D service or another AI model.
It evaluates the actual generated mesh so the engine can reject structurally bad
candidates before returning them to the user.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

import numpy as np
import open3d as o3d


@dataclass
class MeshQuality:
    score: float
    geometry: float
    topology: float
    proportions: float
    integrity: float
    detail: float
    vertices: int
    triangles: int
    components: int
    watertight: bool
    issues: list[str]

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, float(value)))


def evaluate_mesh(mesh: Any) -> MeshQuality:
    """Score a real triangle mesh without using a learned judge.

    The score is deliberately conservative: it rewards valid geometry and
    connected structure, but never pretends a heuristic can prove artistic
    perfection. Future Zeros-3D-QA learned judges can be plugged in later.
    """
    vertices = np.asarray(mesh.vertices)
    triangles = np.asarray(mesh.triangles)
    issues: list[str] = []

    vertex_count = int(len(vertices))
    triangle_count = int(len(triangles))

    if vertex_count == 0 or triangle_count == 0:
        return MeshQuality(0, 0, 0, 0, 0, 0, vertex_count, triangle_count, 0, False, ["empty_mesh"])

    finite = bool(np.isfinite(vertices).all())
    if not finite:
        issues.append("non_finite_vertices")

    bbox_min = vertices.min(axis=0)
    bbox_max = vertices.max(axis=0)
    extent = bbox_max - bbox_min
    max_extent = float(np.max(extent))
    min_extent = float(np.min(extent))

    if max_extent <= 1e-8:
        issues.append("zero_extent")
        proportions = 0.0
    else:
        aspect = min_extent / max_extent
        proportions = _clamp(55.0 + 45.0 * min(1.0, aspect * 8.0))
        if aspect < 0.002:
            issues.append("extreme_aspect_ratio")

    mesh_copy = o3d.geometry.TriangleMesh(mesh)
    try:
        mesh_copy.remove_duplicated_vertices()
        mesh_copy.remove_duplicated_triangles()
        mesh_copy.remove_degenerate_triangles()
        mesh_copy.remove_unreferenced_vertices()
    except Exception:
        issues.append("mesh_cleanup_failed")

    clean_vertices = len(mesh_copy.vertices)
    clean_triangles = len(mesh_copy.triangles)
    if clean_vertices != vertex_count or clean_triangles != triangle_count:
        issues.append("duplicate_or_degenerate_geometry")

    try:
        connected = mesh_copy.cluster_connected_triangles()[0]
        labels = np.asarray(connected)
        components = int(labels.max()) + 1 if len(labels) else 0
    except Exception:
        components = 1
        issues.append("component_analysis_failed")

    try:
        watertight = bool(mesh_copy.is_watertight())
    except Exception:
        watertight = False

    if not watertight:
        issues.append("not_watertight")

    integrity = 100.0
    if not finite:
        integrity -= 70
    if "zero_extent" in issues:
        integrity -= 60
    if "duplicate_or_degenerate_geometry" in issues:
        integrity -= 15
    if components > 12:
        integrity -= min(30, (components - 12) * 2)
        issues.append("many_disconnected_components")

    topology = 100.0
    if not watertight:
        topology -= 22
    if components > 1:
        topology -= min(35, components * 2)
    if clean_triangles < 100:
        topology -= 25
    topology = _clamp(topology)

    # Encourage enough geometric information without imposing a fixed polygon
    # budget on every asset category.
    detail = _clamp(45.0 + min(55.0, np.log10(max(clean_triangles, 10)) * 13.0))
    geometry = _clamp((integrity * 0.55) + (detail * 0.45))

    score = _clamp(
        geometry * 0.35
        + topology * 0.30
        + proportions * 0.15
        + integrity * 0.20
    )

    return MeshQuality(
        score=round(score, 2),
        geometry=round(geometry, 2),
        topology=round(topology, 2),
        proportions=round(proportions, 2),
        integrity=round(integrity, 2),
        detail=round(detail, 2),
        vertices=vertex_count,
        triangles=triangle_count,
        components=components,
        watertight=watertight,
        issues=issues,
    )
