FROM nvidia/cuda:12.2.2-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models/huggingface \
    TRANSFORMERS_CACHE=/models/huggingface

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates wget curl build-essential ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Miniconda keeps the CUDA/PyTorch stack isolated from the host.
RUN wget -qO /tmp/miniconda.sh https://repo.anaconda.com/miniconda/Miniconda3-py312_25.1.1-1-Linux-x86_64.sh \
    && bash /tmp/miniconda.sh -b -p /opt/conda \
    && rm /tmp/miniconda.sh
ENV PATH=/opt/conda/bin:$PATH

WORKDIR /opt/TRELLIS
RUN git clone --recurse-submodules --depth 1 https://github.com/microsoft/TRELLIS.git /opt/TRELLIS \
    && . ./setup.sh --new-env --basic --xformers --flash-attn --diffoctreerast --spconv --mipgaussian --kaolin --nvdiffrast \
    && conda run -n trellis pip install --no-cache-dir fastapi uvicorn[standard] pydantic

COPY app.py /opt/zeros-engine/app.py
WORKDIR /opt/zeros-engine

ENV ZEROS_TRELLIS_MODEL=microsoft/TRELLIS-text-xlarge
ENV ZEROS_3D_OUTPUT_DIR=/data/outputs
ENV ZEROS_TEXTURE_SIZE=4096
ENV ZEROS_MESH_SIMPLIFY=0.15
ENV ZEROS_SAMPLING_STEPS=12
ENV ZEROS_SS_CFG=7.5
ENV ZEROS_SLAT_CFG=3.0
ENV ZEROS_MAX_CONCURRENT_JOBS=1

VOLUME ["/data/outputs", "/models"]
EXPOSE 8080

CMD ["conda", "run", "--no-capture-output", "-n", "trellis", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
