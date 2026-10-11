"""GPU frame pipeline: NVDEC -> CUDA RIFE -> NVENC. No CPU pixel fallback."""
import hashlib
import json
import math
import sys
import time
from fractions import Fraction
from pathlib import Path
from pipeline_common import command, probe, gpu_lock, progress, preparation_factor


def main(source: Path, destination: Path):
    process_started, cpu_started = time.monotonic(), time.process_time()
    import torch
    import torch.nn.functional as F
    import PyNvVideoCodec as nvc
    from rife4_cuda.IFNet_HDv3_v4_6 import IFNet

    info = probe(source)
    fps = float(Fraction(info.get("avg_frame_rate", "0/1")))
    duration = float(info.get("duration", "0"))
    factor = preparation_factor(fps, duration)
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; CPU interpolation is disabled")
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    torch.backends.cudnn.benchmark = True
    dtype, device = torch.float16, torch.device("cuda", 0)
    started = time.monotonic()
    with gpu_lock(), torch.inference_mode():
        progress("loading-gpu-model")
        model = IFNet().eval().requires_grad_(False).to(device=device, dtype=dtype)
        weights = Path(__file__).parent / "flownet_v4.6.pkl"
        with weights.open("rb") as handle:
            model_hash = hashlib.file_digest(handle, "sha256").hexdigest()
        if model_hash != "008646e761f0e67cb77f0c6c44cfe3c3e5a05d9d9465311b9681ca650ce030db":
            raise RuntimeError("RIFE model checksum mismatch")
        state = torch.load(weights, map_location="cpu", weights_only=True)
        model.load_state_dict({k.replace("module.", ""): v for k, v in state.items()}, strict=True)
        del state
        progress("gpu-decoding")
        decoder = nvc.ThreadedDecoder(enc_file_path=str(source), buffer_size=4, gpu_id=0, use_device_memory=True, output_color_type=nvc.OutputColorType.RGBP)
        count = decoder.get_stream_metadata().num_frames
        if not 2 <= count <= 7200:
            raise RuntimeError("Source frame count is outside the preparation limit")
        original_w, original_h = int(info["width"]), int(info["height"])
        scale = min(1, 1280 / original_w, 720 / original_h)
        w, h = max(2, int(original_w * scale) // 2 * 2), max(2, int(original_h * scale) // 2 * 2)
        pw, ph = math.ceil(w / 32) * 32, math.ceil(h / 32) * 32

        def next_image():
            batch = decoder.get_batch_frames(1)
            if not batch:
                return None
            frame = torch.from_dlpack(batch[0])
            if not frame.is_cuda:
                raise RuntimeError("The decoder returned a CPU frame")
            img = frame.unsqueeze(0).to(dtype=dtype) / 255
            if img.shape[-2:] != (h, w):
                img = F.interpolate(img, size=(h, w), mode="bilinear", align_corners=False)
            return F.pad(img, (0, pw - w, 0, ph - h))

        first, second = next_image(), next_image()
        if first is None or second is None:
            raise RuntimeError("The GPU decoder returned too few frames")
        static0, static1 = first.clone(), second.clone()
        flowdiv = torch.tensor([(pw - 1) / 2, (ph - 1) / 2], device=device, dtype=torch.float32)
        grid = torch.cat([torch.linspace(-1, 1, pw, device=device).view(1, 1, 1, pw).expand(1, 1, ph, pw), torch.linspace(-1, 1, ph, device=device).view(1, 1, ph, 1).expand(1, 1, ph, pw)], 1)
        alpha = torch.full((h, w, 1), 255, device=device, dtype=torch.uint8)

        def rgba(img):
            rgb = img[0, :, :h, :w].clamp(0, 1).mul(255).round().to(torch.uint8).permute(1, 2, 0)
            return torch.cat([rgb, alpha], 2).contiguous()

        progress("preparing-gpu-graphs")
        steps = [torch.full((1, 1, ph, pw), n / factor, device=device, dtype=dtype) for n in range(1, factor)]
        for _ in range(3):
            rgba(model(static0, static1, steps[0], flowdiv, grid))
        torch.cuda.synchronize()
        graphs = []
        pool = torch.cuda.graph_pool_handle()
        for step in steps:
            graph = torch.cuda.CUDAGraph()
            with torch.cuda.graph(graph, pool=pool):
                result = rgba(model(static0, static1, step, flowdiv, grid))
            graphs.append((graph, result))
        encoder = nvc.CreateEncoder(w, h, "ABGR", False, gpu_id=0, codec="h264", preset="P4", fps=fps * factor, bitrate=20000000, bf=0, gop=96)
        bitstream = destination.with_suffix(".h264")
        emitted, actual = 0, 2
        with bitstream.open("wb") as output:
            def encode(frame):
                nonlocal emitted
                if not frame.is_cuda:
                    raise RuntimeError("The encoder received a CPU frame")
                torch.cuda.current_stream().synchronize()
                for packet in encoder.Encode(frame):
                    output.write(bytes(packet["data"]))
                emitted += 1

            progress("gpu-interpolating", 0, count * factor)
            while True:
                static0.copy_(first)
                static1.copy_(second)
                base = rgba(first)
                encode(base)
                # Detect large frame changes on the GPU; retain hard scene cuts.
                changed = F.adaptive_avg_pool2d((first[:, :, :h, :w] - second[:, :, :h, :w]).abs().float(), (32, 32)).mean().item() > .3
                for graph, result in graphs:
                    if changed:
                        encode(base)
                    else:
                        graph.replay()
                        encode(result)
                progress("gpu-interpolating", emitted, count * factor)
                first = second
                second = next_image()
                if second is None:
                    break
                actual += 1
                if time.monotonic() - started > 1200:
                    raise RuntimeError("GPU interpolation timed out")
            for _ in range(factor):
                encode(rgba(first))
            for packet in encoder.EndEncode():
                output.write(bytes(packet["data"]))
        if actual != count or emitted != count * factor:
            raise RuntimeError("GPU processing returned an incomplete frame sequence")
        del encoder, graphs, decoder, model
        progress("muxing")
        command(["ffmpeg", "-y", "-v", "error", "-r", str(fps * factor), "-i", str(bitstream), "-an", "-c:v", "copy", "-movflags", "+faststart", str(destination)])
        bitstream.unlink()
        progress("gpu-verifying")
        check = nvc.ThreadedDecoder(enc_file_path=str(destination), buffer_size=4, gpu_id=0, use_device_memory=True, output_color_type=nvc.OutputColorType.RGBP)
        verified = 0
        while True:
            batch = check.get_batch_frames(4)
            if not batch:
                break
            verified += len(batch)
        del check
        if verified != emitted:
            raise RuntimeError("The finished render failed GPU decode verification")
    output_info = probe(destination)
    if abs(float(Fraction(output_info["avg_frame_rate"])) - fps * factor) > .01 or abs(float(output_info["duration"]) - count / fps) > 1 / fps:
        raise RuntimeError("The render failed its frame-rate/duration check")
    with destination.open("rb") as handle:
        sha = hashlib.file_digest(handle, "sha256").hexdigest()
    print(json.dumps({"artifact": {"sha256": sha, "fps": fps * factor, "sourceFps": fps, "duration": float(output_info["duration"]), "width": w, "height": h, "frames": emitted, "factor": factor, "engine": "rife-cuda-nvcodec-2.2.3", "model": "rife-v4.6", "gpu": torch.cuda.get_device_name(0), "processingSeconds": time.monotonic() - started, "totalSeconds": time.monotonic() - process_started, "cpuSeconds": time.process_time() - cpu_started}}), flush=True)


if __name__ == "__main__":
    try:
        main(Path(sys.argv[1]), Path(sys.argv[2]))
    except Exception as exc:
        print(json.dumps({"error": str(exc)[-400:]}), flush=True)
        sys.exit(1)
