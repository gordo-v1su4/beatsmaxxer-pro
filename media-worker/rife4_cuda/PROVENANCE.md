# RIFE 4.6 CUDA implementation

Vendored from HolyWu/vs-rife at commit 3488617283db7c428a83ba4a19382285da698b6a, under its MIT license (LICENSE). Only the RIFE 4.6 network and GPU warp implementation are included; no VapourSynth runtime dependency.

Model: https://github.com/HolyWu/vs-rife/releases/download/model/flownet_v4.6.pkl
SHA-256: 008646e761f0e67cb77f0c6c44cfe3c3e5a05d9d9465311b9681ca650ce030db

Weights are downloaded and hash-checked in the container build; they are not committed. NVIDIA PyNvVideoCodec keeps decoded and encoded frame buffers on the GPU.
