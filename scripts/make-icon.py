"""Rebuild Whippet's app icon from icons/whippet.svg.

Renders the SVG at 256 px with headless Microsoft Edge (transparent background) to icons/whippet-256.png,
then writes icons/whippet.ico with the sizes Windows asks for (16 to 256 px) using Pillow.
The window uses the .ico under `npm start`, and electron-builder takes it for the installer (build.win.icon).

Run from the repo root:  python scripts/make-icon.py
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "icons" / "whippet.svg"
PNG = ROOT / "icons" / "whippet-256.png"
ICO = ROOT / "icons" / "whippet.ico"
SIZES = [16, 24, 32, 48, 64, 128, 256]

EDGE_CANDIDATES = [
    Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Microsoft/Edge/Application/msedge.exe",
    Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Microsoft/Edge/Application/msedge.exe",
]


def main() -> int:
    edge = next((p for p in EDGE_CANDIDATES if p.exists()), None)
    if not edge:
        print("Microsoft Edge not found; it renders the SVG.", file=sys.stderr)
        return 1
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "icon.html"
        page.write_text(
            "<!doctype html><html><head><style>html,body{margin:0;background:transparent}"
            "img{display:block;width:256px;height:256px}</style></head>"
            f'<body><img src="{SVG.as_uri()}"></body></html>',
            encoding="utf-8",
        )
        if PNG.exists():
            PNG.unlink()
        subprocess.run(
            [str(edge), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
             "--window-size=256,256", f"--screenshot={PNG}", page.as_uri()],
            check=False, capture_output=True, timeout=60,
        )
    if not PNG.exists():
        print("Edge did not write the PNG.", file=sys.stderr)
        return 1
    img = Image.open(PNG).convert("RGBA")
    if img.size != (256, 256) or img.getpixel((0, 0))[3] != 0:
        print(f"Unexpected render: size {img.size}, corner alpha {img.getpixel((0, 0))[3]} (want 256x256, 0).", file=sys.stderr)
        return 1
    img.save(ICO, sizes=[(s, s) for s in SIZES])
    written = sorted(Image.open(ICO).info.get("sizes", []))
    print(f"Wrote {PNG.name} and {ICO.name} with sizes {written}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
