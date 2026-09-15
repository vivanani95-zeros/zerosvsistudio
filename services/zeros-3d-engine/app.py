"""Zeros self-hosted text-to-3D inference service.

This service owns the actual 3D generation. It never calls Meshy, Tripo, or
another hosted 3D-generation API. It loads Microsoft's open TRELLIS text-XL
weights directly and turns a prompt into a real textured GLB.

Run this on a Linux NVIDIA GPU host; Cloudflare Pages/Workers should only act
as the thin HTTP gateway in front of it.
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

APP_HOST = os.getenv("ZEROS_ENGINE_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("ZEROS_ENGINE_PORT", "8080"))
MODEL_ID = os.getenv("ZEROS_TRELLIS_MODEL", "microsoft/TRELLIS-text-xlarge")
OUTPUT_DIR = Path(os.getenv("ZEROS_3D_OUTPUT_DIR", "/data/outputs"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

TEXTURE_SIZE = int(os.getenv("ZEROS_TEXTURE_SIZE", "4096"))
# TRELLIS' helper interprets simplify as the fraction of triangles removed.
# Keep this deliberately conservative for cinematic assets.
SIMPLIFY = float(os.getenv("ZEROS_MESH_SIMPLIFY", "0.15"))
SAMPLING_STEPS = int(os.getenv("ZEROS_SAMPLING_STEPS", "12"))
SS_CFG = float(os.getenv("ZEROS_SS_CFG", "7.5"))
SLAT_CFG = float(os.getenv("ZEROS_SLAT_CFG", "3.0"))
MAX_JOBS = int(os.getenv("ZEROS_MAX_CONCURRENT_JOBS", "1"))
INTERNAL_TOKEN = os.getenv("ZEROS_ENGINE_TOKEN", "").strip()

app = FastAPI(title="Zeros 3D AI Engine", version="1.0.0")


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=800)


@dataclass
class Job:
    id: str
    status: str = "queued"
    progress: int = 0
    phase: str = "queued"
    error: str | None = None
    created_at: float = 0.0
    finished_at: float | None = None


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
    """Turn a tiny request into a useful 3D-asset brief without inventing a scene."""
    text = " ".join(prompt.strip().split())
    lower = text.lower()

    # Preserve a user's detailed prompt. Only expand very short prompts where
    # the 3D model would otherwise lack material, scale, and asset intent.
    if len(text) >= 120:
        return text

    suffix = (
        "; single hero 3D asset, physically plausible proportions, complete visible geometry, "
        "clean silhouette, production-quality hard-surface or sculpted forms, realistic materials, "
        "fine surface detail, separate functional-looking components, no text, no logos, no floating parts, "
        "cinematic photorealism, suitable for a film asset"
    )

    if any(word in lower for word in ("car", "vehicle", "automobile")):
        suffix = (
            "; complete premium sports automobile, full exterior body, wheels, tires, glass, headlights, "
            "grille, mirrors, aerodynamic panels and believable panel gaps, physically plausible automotive proportions, "
            "high-end painted metal and glass materials, fine hard-surface detail, no people, no text, no logo, "
            "cinematic photorealistic hero asset"
        )
    elif any(word in lower for word in ("character", "person", "robot", "creature")):
        suffix = (
            "; complete full-body hero asset, coherent anatomy or mechanical proportions, clearly separated limbs and accessories, "
            "detailed clothing or armor, physically plausible materials, clean silhouette, no text, no floating parts, "
            "cinematic high-detail production asset"
        )

    return text + suffix


def set_job(job_id: str, **changes: Any) -> None:
    job = jobs[job_id]
    for key, value in changes.items():
        setattr(job, key, value)


def run_generation(job_id: str, prompt: str) -> None:
    global pipeline
    try:
        if pipeline is None:
            raise RuntimeError("TRELLIS pipeline is not loaded")

        set_job(job_id, status="running", progress=5, phase="geometry")
        compiled = compile_prompt(prompt)

        # Generate a genuine 3D representation. No Three.js, Blender script,
        # primitive assembly, or procedural mesh is involved in this stage.
        outputs = pipeline.run(
            compiled,
            seed=int.from_bytes(os.urandom(4), "big"),
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

        set_job(job_id, progress=72, phase="materializing")
        mesh = outputs["mesh"][0]
        gaussian = outputs["gaussian"][0]

        glb = postprocessing_utils.to_glb(
            gaussian,
            mesh,
            simplify=SIMPLIFY,
            texture_size=TEXTURE_SIZE,
        )

        set_job(job_id, progress=92, phase="validating")
        destination = OUTPUT_DIR / f"{job_id}.glb"
        glb.export(str(destination))

        if not destination.exists() or destination.stat().st_size < 1024:
            raise RuntimeError("Generated GLB failed the artifact validation check")

        set_job(job_id, status="success", progress=100, phase="complete", finished_at=time.time())
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
    # Import/load happens once so every request does not reload several GB of weights.
    pipeline = TrellisTextTo3DPipeline.from_pretrained(MODEL_ID)
    pipeline.cuda()


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": pipeline is not None,
        "model": MODEL_ID,
        "engine": "zeros-self-hosted-trellis",
        "api_keys_for_3d_generator": False,
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
