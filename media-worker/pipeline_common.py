"""Bounded RIFE preparation. JSON progress on stdout; no network or secrets here."""
import contextlib
import fcntl
import hashlib
import json
import math
import os
import subprocess
import sys
import time
from fractions import Fraction
from pathlib import Path


def progress(stage, completed=0, total=0):
    print(json.dumps({"stage": stage, "completed": completed, "total": total}), flush=True)


def preparation_factor(fps, duration):
    if not math.isfinite(fps) or not 6 <= fps <= 96 or not math.isfinite(duration) or not 0 < duration <= 120:
        raise RuntimeError("GPU preparation requires a 6–96 FPS clip of at most 120 seconds")
    return max(4, math.ceil(96 / fps))


def command(args, timeout=300):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=timeout)


def probe(path):
    result = command(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_streams", "-of", "json", str(path)])
    streams = json.loads(result.stdout).get("streams", [])
    if not streams:
        raise RuntimeError("The uploaded file has no video stream")
    return streams[0]


@contextlib.contextmanager
def gpu_lock():
    path = Path(os.environ.get("GPU_LOCK_PATH", "/gpu-lock/stack-structure-gpu.lock"))
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+") as handle:
        deadline = time.monotonic() + 900
        progress("waiting-for-gpu")
        while True:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() > deadline:
                    raise RuntimeError("Timed out waiting for the shared GPU")
                time.sleep(.25)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)
