# Zeros 3D AI Engine

This is the actual model-generation backend for Zeros' 3D mode.

## What it is

- **No Meshy API key**
- **No Tripo API key**
- **No hosted 3D-generation provider**
- Loads Microsoft's open-source **TRELLIS text-xlarge (2B)** weights directly
- Produces an actual generated mesh plus Gaussian representation and exports a textured GLB
- Uses 4K texture extraction by default
- Keeps the generated artifact on the GPU service until Zeros downloads it

TRELLIS officially supports text-to-3D and can emit meshes, Gaussians and radiance fields. Microsoft publishes text-base, text-large and text-xlarge models; the XL model is 2B parameters. The project documents NVIDIA GPU requirements and recommends the image-conditioned pipeline when maximum detail is required. Zeros intentionally uses the text pipeline here so a user can start with a simple prompt without a 3D-generator API key.

## GPU requirement

Run this service on a Linux NVIDIA GPU machine. The official TRELLIS documentation lists 16 GB VRAM as the minimum for the project; the 2B XL text model should be treated as a high-memory workload, with **24–32 GB VRAM preferred** for reliable production operation.

Cloudflare Pages/Workers is **not** the place to run the neural 3D model itself. The Zeros web app stays on Cloudflare and calls this private GPU service through `/api/model`.

## Start

Build the container on a machine with an NVIDIA driver and NVIDIA Container Toolkit:

```bash
docker build -t zeros-3d-engine .
docker run --gpus all -p 8080:8080 \
  -e ZEROS_ENGINE_TOKEN='your-private-internal-token' \
  -v zeros-3d-models:/models \
  -v zeros-3d-output:/data/outputs \
  zeros-3d-engine
```

The first start downloads the public TRELLIS weights into `/models`. No Hugging Face or 3D-provider API key is required for the public TRELLIS checkpoint.

## Connect the Cloudflare app

Set these server-side Cloudflare secrets/variables:

- `ZEROS_3D_ENGINE_URL` — private/public HTTPS base URL for this service
- `ZEROS_3D_ENGINE_TOKEN` — the same internal token configured on the GPU service

These are **Zeros infrastructure credentials**, not a Meshy/Tripo generation key.

## Generation pipeline

```text
Simple user prompt
      ↓
Zeros 3D gateway
      ↓
Prompt compiler
      ↓
TRELLIS text-xlarge (2B)
      ↓
Native 3D structured latent generation
      ↓
Real mesh + Gaussian representation
      ↓
GLB extraction + PBR texture baking
      ↓
4K textured GLB
      ↓
Validation
      ↓
Zeros ModelViewer
```

Three.js is not used to construct the asset. It is only used by the existing Zeros viewer for displaying the resulting GLB, camera controls, studio lighting and inspection tools.

## Production-quality note

This service is designed to create a genuinely generated 3D asset rather than a procedural Three.js approximation. It does **not** honestly promise that every one-line prompt is automatically a finished Hollywood/VFX asset: current open 3D generators can still produce topology, underside, material, or proportion defects. Zeros therefore keeps generation separate from the viewer so a future production post-processing stage can add automated topology validation, UV checks, mesh repair, LODs and artist-directed refinement without replacing the actual AI-generated geometry.
