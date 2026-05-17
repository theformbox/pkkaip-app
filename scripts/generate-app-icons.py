#!/usr/bin/env python3
"""Crop logo from a tall screenshot and write favicon / PWA icon assets."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument(
        "image",
        type=Path,
        nargs="?",
        default=Path.home() / "Downloads" / "IMG_9239.PNG",
        help="Source PNG (default: ~/Downloads/IMG_9239.PNG)",
    )
    args = p.parse_args()
    src: Path = args.image

    if not src.is_file():
        print(f"Not found: {src}", file=sys.stderr)
        sys.exit(1)

    root = Path(__file__).resolve().parents[1]
    app_dir = root / "app"
    public_dir = root / "public"
    public_dir.mkdir(parents=True, exist_ok=True)

    img = Image.open(src).convert("RGBA")
    arr = np.array(img)
    row_brightness = arr.mean(axis=(1, 2))
    bright_rows = np.where(row_brightness > 30)[0]
    gaps = np.diff(bright_rows)
    big_gaps = np.where(gaps > 50)[0]
    top = int(bright_rows[0])
    bottom = int(bright_rows[big_gaps[0]])

    logo = img.crop((0, top, 1170, bottom))
    w, h = logo.size
    s = min(w, h)
    logo = logo.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))

    logo.resize((32, 32), Image.LANCZOS).save(app_dir / "favicon.ico")
    logo.resize((180, 180), Image.LANCZOS).save(app_dir / "apple-icon.png")
    logo.resize((192, 192), Image.LANCZOS).save(public_dir / "icon-192.png")
    print("Wrote:", app_dir / "favicon.ico")
    print("Wrote:", app_dir / "apple-icon.png")
    print("Wrote:", public_dir / "icon-192.png")


if __name__ == "__main__":
    main()
