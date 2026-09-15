"""Zeros self-hosted 3D production engine.

The service owns the generation pipeline and never calls a hosted 3D-generation
API. It generates multiple candidates, scores their actual meshes with a
structural quality gate, keeps the strongest candidate, converts it to a
textured GLB, and exposes quality metadata to the caller.

Important: the current generator backend is an interchangeable research backend.
The surrounding Zeros architecture is designed so a future Zeros-3D-1
foundation model can replace it without changing the Cloudflare/API contract.
"""

from __future__ import annotations

import asyncio
import os
import secrets
import time
import traceback
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

os.environ.setdefault("SPCONV_ALGO", "native")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

from trellis.pipelines import TrellisTextTo3DPipeline
from trellis.utils import postprocessing_utils
from quality import evaluate_mesh

APP_HOST = os.getenv("ZEROS_ENGINE_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("ZEROS_ENGINE_PORT", "8080"))
MODEL_ID = os.getenv("ZEROS_TRELLIS_MODEL", "microsoft/TRELLIS-text-xlarge")
OUTPUT_DIR = Path(os.getenv("ZEROS_3D_OUTPUT_DIR", "/data/outputs"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Cinematic defaults favor fidelity over throughput.
TEXTURE_SIZE = int(os.getenv("ZEROS_TEXTURE_SIZE", "4096"))
SIMPLIFY = float(os.getenv("ZEROS_MESH_SIMPLIFY", "0.10"))
SAMPLING_STEPS = int(os.getenv("ZEROS_SAMPLING_STEPS", "16"))
SS_CFG = float(os.getenv("ZEROS_SS_CFG", "7.5"))
SLAT_CFG = float(os.getenv("ZEROS_SLAT_CFG", "3.0"))
CANDIDATES = max(1, min(4, int(os.getenv("ZEROS_CANDIDATES", "2"))))
MIN_QUALITY = float(os.getenv("ZEROS_MIN_QUALITY", "55"))
MAX_JOBS = int(os.getenv("ZEROS_MAX_CONCURRENT_JOBS", "1"))
INTERNAL_TOKEN = os.getenv("ZEROS_ENGINE_TOKEN", "").strip()

app = FastAPI(title="Zeros 3D AI Engine", version="2.0.0")


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=1200)


@dataclass
class Job:
    id: str
    status: str = "queued"
    progress: int = 0
    phase: str = "queued"
    error: str | None = None
    created_at: float = 0.0
    finished_at: float | None = None
    quality: dict[str, Any] | None = None


jobs: dict[str, Job] = {}
semaphore = asyncio.Semaphore(MAX_JOBS)
pipeline: TrellisTextTo3DPipeline | None = None


def authorize(authorization: str | None) -> None:
    if not INTERNAL_TOKEN:
        return
    expected = f"Bearer {INTERNAL_TOKEN}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


def compile_prompt(prompt: str) -> str:
    """Expand short requests into production-oriented 3D briefs."""
    text = " ".join(prompt.strip().split())
    lower = text.lower()
    if len(text) >= 120:
        return text

    base = (
        "; single hero 3D asset; complete visible geometry; coherent proportions; clean silhouette; "
        "physically plausible construction; high-frequency surface detail; distinct functional components; "
        "realistic physically based materials; no text; no logos; no floating parts; cinematic production asset"
    )

    if any(word in lower for word in ("car", "vehicle", "automobile", "supercar", "sports car")):
        base = (
            "; complete premium hero sports automobile; full exterior body; wheels and tires; glass; headlights; "
            "grille; mirrors; aerodynamic panels; believable panel gaps; physically plausible automotive proportions; "
            "high-end painted metal, glass, rubber and carbon-fiber materials; fine hard-surface detail; "
            "no people; no text; no logo; cinematic photorealistic film asset"
        )
    elif any(word in lower for word in ("character", "person", "robot", "creature")):
        base = (
            "; complete full-body hero asset; coherent anatomy or mechanical proportions; connected limbs; "
            "detailed clothing, armor or surface anatomy; grounded accessories; physically plausible materials; "
            "clean silhouette; no text; no floating parts; cinematic high-detail production asset"
        )
    elif any(word in lower for word in ("building", "house", "castle", "temple", "architecture")):
        base = (
            "; complete architectural hero asset; structurally coherent walls, openings, floors and roof; "
            "credible construction details; clean hard-surface edges; realistic stone, concrete, wood or metal materials; "
            "no floating architecture; cinematic production environment asset"
        )

    return text + base


def set_job(job_id: str, **changes: Any) -> None:
    job = jobs[job_id]
    for key, value in changes.items():
        setattr(job, key, value)


def _seed() -> int:
    return int.from_bytes(os.urandom(4), "big")


def run_generation(job_id: str, prompt: str) -> None:
    global pipeline
    try:
        if pipeline is None:
            raise RuntimeError("Zeros 3D generator is not loaded")

        compiled = compile_prompt(prompt)
        best: tuple[float, Any, Any, dict[str, Any]] | None = None

        # Multiple independent samples are intentional: the production gate
        # selects the strongest real mesh instead of trusting one random draw.
        for index in range(CANDIDATES):
            start = 5 + int(index * 52 / CANDIDATES)
            set_job(job_id, status="running", progress=start, phase=f"generating_candidate_{index + 1}")

            outputs = pipeline.run(
                compiled,
                seed=_seed(),
                sparse_structure_sampler_params={
                    "steps": SAMPLING_STEPS,
                    "cfg_strength": SS_CFG,
                },
                slat_sampler_params={
                    "steps": SAMPLING_STEPS,
                    "cfg_strength": SLAT_CFG,
                },
                formats=["mesh", "gaussian"],
            )

            mesh = outputs["mesh"][0]
            gaussian = outputs["gaussian"][0]
            quality = evaluate_mesh(mesh).as_dict()
            score = float(quality["score"])

            if best is None or score > best[0]:
                best = (score, mesh, gaussian, quality)

            set_job(
                job_id,
                progress=min(68, start + int(42 / CANDIDATES)),
                phase=f"candidate_{index + 1}_qa",
                quality={**quality, "candidates_evaluated": index + 1},
            )

        if best is None:
            raise RuntimeError("No valid 3D candidate was produced")

        score, mesh, gaussian, quality = best
        set_job(job_id, progress=74, phase="production_materialization", quality=quality)

        # Keep a deliberately high-fidelity mesh. The value is the fraction of
        # triangles removed by TRELLIS' helper, so 0.10 means conservative decimation.
        glb = postprocessing_utils.to_glb(
            gaussian,
            mesh,
            simplify=SIMPLIFY,
            texture_size=TEXTURE_SIZE,
        )

        set_job(job_id, progress=92, phase="final_asset_validation", quality=quality)
        destination = OUTPUT_DIR / f"{job_id}.glb"
        glb.export(str(destination))

        if not destination.exists() or destination.stat().st_size < 1024:
            raise RuntimeError("Generated GLB failed the artifact validation check")

        quality = {**quality, "candidates_evaluated": CANDIDATES, "minimum_quality_target": MIN_QUALITY}
        if score < MIN_QUALITY:
            quality["quality_warning"] = "Best candidate was returned, but it did not meet the configured heuristic quality target."

        set_job(job_id, status="success", progress=100, phase="complete", quality=quality, finished_at=time.time())
    except Exception as exc:
        traceback.print_exc()
        set_job(
            job_id,
            status="failed",
            progress=100,
            phase="error",
            error=str(exc)[:1000],
            finished_at=time.time(),
        )


@app.on_event("startup")
async def load_pipeline() -> None:
    global pipeline
    pipeline = TrellisTextTo3DPipeline.from_pretrained(MODEL_ID)
    pipeline.cuda()


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": pipeline is not None,
        "engine": "zeros-3d-production-engine",
        "generator_backend": MODEL_ID,
        "candidate_selection": CANDIDATES,
        "texture_size": TEXTURE_SIZE,
        "sampling_steps": SAMPLING_STEPS,
        "api_keys_for_hosted_3d_generator": False,
    }


@app.post("/generate")
async def generate(body: GenerateRequest, authorization: str | None = Header(default=None)) -> dict[str, str]:
    authorize(authorization)
    job_id = secrets.token_urlsafe(18)
    jobs[job_id] = Job(id=job_id, created_at=time.time())

    async def worker() -> None:
        async with semaphore:
            await asyncio.to_thread(run_generation, job_id, body.prompt)

    asyncio.create_task(worker())
    return {"id": job_id, "status": "queued"}


@app.get("/jobs/{job_id}")
async def job_status(job_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(authorization)
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return asdict(job)


@app.get("/files/{job_id}.glb")
async def file(job_id: str, authorization: str | None = Header(default=None)) -> FileResponse:
    authorize(authorization)
    job = jobs.get(job_id)
    path = OUTPUT_DIR / f"{job_id}.glb"
    if not job or job.status != "success" or not path.exists():
        raise HTTPException(status_code=404, detail="Generated asset is not ready")
    return FileResponse(path, media_type="model/gltf-binary", filename="zeros-model.glb")


@app.get("/jobs")
async def list_jobs(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(authorization)
    return {"jobs": [asdict(job) for job in list(jobs.values())[-50:]]}
