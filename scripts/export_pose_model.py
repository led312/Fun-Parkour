"""Export YOLO26n-pose to ONNX for browser-side inference (onnxruntime-web).

Usage:
    python -m venv .venv-pose
    .venv-pose/Scripts/pip install ultralytics onnx
    .venv-pose/Scripts/python scripts/export_pose_model.py
"""

import shutil
from pathlib import Path

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)

model = YOLO("yolo26n-pose.pt")  # auto-downloads on first run
exported = Path(model.export(format="onnx", imgsz=640, simplify=True, opset=17))

dest = OUT_DIR / "yolo26n-pose.onnx"
shutil.move(str(exported), dest)
print(f"Exported model -> {dest} ({dest.stat().st_size / 1e6:.1f} MB)")
