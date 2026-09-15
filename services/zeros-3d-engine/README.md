# Zeros 3D AI Engine

This is the self-hosted 3D production backend for Zeros.

## Current goal

Zeros should return the **strongest possible generated asset**, not blindly return the first random sample. The engine therefore generates multiple candidates, evaluates the actual meshes, keeps the strongest candidate, performs high-fidelity GLB materialization, and returns structural quality metadata.

## Current backend

The current research-generation backend is Microsoft's open TRELLIS text-xlarge checkpoint. Zeros does **not** call Meshy, Tripo, or another hosted 3D-generation API, and no 3D-generator API key is required. TRELLIS provides a real text-to-3D generation pipeline and can decode structured 3D latents to meshes and Gaussian representations. Microsoft explicitly recommends image-conditioned generation for maximum detail; the current text-first route is retained for simple prompt-only generation while Zeros' own foundation model is being developed.

This distinction is intentional: the surrounding **Zeros production pipeline is ours**, while the current generator checkpoint is a replaceable research backend. We do not claim that an untrained new Zeros foundation model is already equivalent to a commercial frontier model.

## Cinematic generation defaults

- 2 independent candidates per request
- 16 sampling steps for structure and latent stages
- conservative 10% mesh simplification
- 4096 texture extraction
- deterministic structural mesh QA
- best-candidate selection
- single concurrent GPU job by default

Increase `ZEROS_CANDIDATES` to 3 or 4 when maximum quality is more important than generation time/cost.

## Production QA

`quality.py` evaluates the actual generated triangle mesh without using another learned judge. It checks:

- finite vertex data
- empty/degenerate geometry
- duplicate geometry
- connected components
- watertightness
- geometric extent/proportion sanity
- triangle/detail density
- structural integrity

The quality score is a **heuristic gate**, not a claim of artistic perfection. Future Zeros-3D-QA models can add learned multi-view, material, semantic and production-readiness evaluation.

## Long-term Zeros model roadmap

```text
Prompt
  ↓
ZEROS 3D DIRECTOR
  ↓
ZEROS-3D-1  → foundation generation
  ↓
candidate generation
  ↓
ZEROS-3D-QA → structural + learned quality judging
  ↓
ZEROS-3D-2  → geometry/material/detail refinement
  ↓
ZEROS-3D-3  → productionization, repair, retopology, UV, LOD, rig/physics checks
  ↓
ZEROS ASSET LAB
  ↓
Film / VFX / Game / Web / GLB / FBX
```

The current engine is the infrastructure layer for this roadmap. The future Zeros foundation model can replace `TrellisTextTo3DPipeline` without changing the Cloudflare API contract.

## GPU requirement

Run on a Linux NVIDIA GPU machine. TRELLIS documents 16 GB VRAM as a minimum for the project; for the 2B XL workload, use a high-memory GPU and persistent model storage for production.

Cloudflare Pages/Workers is only the thin gateway. The neural 3D workload belongs on the GPU server.

## Start

Build on a machine with an NVIDIA driver and NVIDIA Container Toolkit:

```bash
docker build -t zeros-3d-engine .
docker run --gpus all -p 8080:8080 \
  -e ZEROS_ENGINE_TOKEN='your-private-internal-token' \
  -v zeros-3d-models:/models \
  -v zeros-3d-output:/data/outputs \
  zeros-3d-engine
```

The first start downloads the public checkpoint into `/models`. No Meshy/Tripo/hosted 3D generation key is required.

## Useful production variables

```text
ZEROS_TRELLIS_MODEL=microsoft/TRELLIS-text-xlarge
ZEROS_TEXTURE_SIZE=4096
ZEROS_MESH_SIMPLIFY=0.10
ZEROS_SAMPLING_STEPS=16
ZEROS_SS_CFG=7.5
ZEROS_SLAT_CFG=3.0
ZEROS_CANDIDATES=2
ZEROS_MIN_QUALITY=55
ZEROS_MAX_CONCURRENT_JOBS=1
```

## Connect Cloudflare

Set these server-side Cloudflare variables/secrets:

- `ZEROS_3D_ENGINE_URL` — HTTPS base URL of this GPU service
- `ZEROS_3D_ENGINE_TOKEN` — same private token configured on the GPU service

These are Zeros infrastructure credentials, not a commercial 3D-generation API key.

## Important quality truth

No software can honestly guarantee that every arbitrary prompt becomes a perfect Hollywood asset automatically. Production-ready 3D requires geometry, topology, UV, material, semantic and downstream-engine validation. The Zeros architecture is deliberately built around those stages so we can keep improving the actual foundation model and the production stack instead of hiding defects behind a viewer.
