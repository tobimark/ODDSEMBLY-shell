"""Assemble the demo screencast frames into a shareable GIF.

    python tools/demo/gif.py [--frames DIR] [--out FILE] [--fps 8] [--width 1080]

Frames come from `Page.startScreencast` in demo.mjs — real browser frames of the
real UI, so this is a genuine screen recording, just re-encoded for portability.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys

from PIL import Image


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default=os.path.join("tools", "demo", "out", "frames"))
    ap.add_argument("--out", default=os.path.join("tools", "demo", "out", "demo.gif"))
    ap.add_argument("--fps", type=float, default=8.0)
    ap.add_argument("--width", type=int, default=1080)
    ap.add_argument("--colors", type=int, default=256)
    args = ap.parse_args()

    if not os.path.isdir(args.frames):
        print(f"frames dir not found: {args.frames}", file=sys.stderr)
        return 2
    names = sorted(n for n in os.listdir(args.frames) if n.lower().endswith((".jpg", ".jpeg", ".png")))
    if not names:
        print("no frames", file=sys.stderr)
        return 2

    images: list[Image.Image] = []
    seen: set[str] = set()
    dropped = 0
    for name in names:
        p = os.path.join(args.frames, name)
        digest = hashlib.sha256(open(p, "rb").read()).hexdigest()
        if digest in seen:            # collapse identical consecutive frames
            dropped += 1
            continue
        seen.add(digest)
        im = Image.open(p).convert("RGB")
        if im.width != args.width:
            h = max(1, round(im.height * args.width / im.width))
            im = im.resize((args.width, h), Image.LANCZOS)
        images.append(im)

    if not images:
        print("all frames identical?", file=sys.stderr)
        return 2

    # A GIF is 256 colours; quantise with a shared palette so the UI keeps its
    # paper/ink character instead of dithering into mud.
    base = images[0]
    palette_src = base.convert("P", palette=Image.ADAPTIVE, colors=args.colors)
    converted = [im.convert("RGB").quantize(palette=palette_src, dither=Image.NONE) for im in images]

    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    duration = max(20, int(1000 / max(args.fps, 1)))
    converted[0].save(
        args.out,
        save_all=True,
        append_images=converted[1:],
        duration=duration,
        loop=0,
        optimize=True,
        disposal=2,
    )
    size_kb = os.path.getsize(args.out) // 1024
    print(f"wrote {args.out}  frames={len(images)} (dropped {dropped} duplicates)  {size_kb} KB  {args.width}px @ {args.fps}fps")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


