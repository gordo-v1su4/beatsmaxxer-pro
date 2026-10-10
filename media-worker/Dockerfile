FROM oven/bun:1.3.14 AS bun
FROM pytorch/pytorch:2.8.0-cuda12.9-cudnn9-runtime
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir PyNvVideoCodec==2.2.3
ENV NVIDIA_VISIBLE_DEVICES=all NVIDIA_DRIVER_CAPABILITIES=compute,utility,video PYTHONUNBUFFERED=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 INTERPOLATION_PYTHON=/opt/conda/bin/python
WORKDIR /app
COPY media-worker ./media-worker
RUN curl -fsSL https://github.com/HolyWu/vs-rife/releases/download/model/flownet_v4.6.pkl -o /app/media-worker/flownet_v4.6.pkl \
 && echo '008646e761f0e67cb77f0c6c44cfe3c3e5a05d9d9465311b9681ca650ce030db  /app/media-worker/flownet_v4.6.pkl' | sha256sum -c -
COPY api/_lib/mediaGateway.ts ./api/_lib/mediaGateway.ts
COPY api/_lib/interpolationContract.ts ./api/_lib/interpolationContract.ts
CMD ["bun", "run", "media-worker/server.ts"]
