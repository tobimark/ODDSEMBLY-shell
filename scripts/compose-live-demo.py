#!/usr/bin/env python
"""Fuse one real run into a single video.

Left  : the real OpenCode CLI transcript, line by line, on the run's clock.
Right : the real Loom page frames captured from the same run (CDP screencast).

Both surfaces come from `scripts/capture-live-demo.mjs`; nothing is re-staged.
usage: python scripts/compose-live-demo.py
"""
import bisect
import json
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = os.path.join(ROOT, ".tmp")
FRAMES_DIR = os.path.join(TMP, "screencast")
OUT_DIR = os.path.join(TMP, "videoframes")
OUT_FILE = os.path.join(ROOT, "shots", "opencode-loom-live.mp4")

W, H = 1440, 900
LEFT_W = 486
FPS = 12
PAD = 16
LINE_H = 19
FONT_SIZE = 14

FFMPEG = os.environ.get("FFMPEG") or (
    r"C:\Users\51159\AppData\Roaming\Python\Python312\site-packages"
    r"\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
)

COLORS = {
    "bg": (12, 15, 20),
    "panel": (16, 20, 26),
    "rail": (32, 40, 52),
    "banner": (94, 225, 226),
    "out": (214, 221, 233),
    "err": (255, 123, 114),
    "dim": (110, 124, 143),
    "ink": (236, 240, 246),
}


def load_font(size=FONT_SIZE, bold=False):
    for name in (("consolab.ttf" if bold else "consola.ttf"), "consola.ttf", "cour.ttf"):
        p = os.path.join(r"C:\Windows\Fonts", name)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


FONT = load_font()
FONT_BOLD = load_font(FONT_SIZE, True)
FONT_SMALL = load_font(12)


def wrap(text, width):
    if not text:
        return [""]
    out, cur = [], ""
    for ch in text:
        if ch == "\t":
            ch = "  "
        cur += ch
        if len(cur) >= width:
            out.append(cur)
            cur = ""
    if cur:
        out.append(cur)
    return out or [""]


def build_visible_lines(transcript, t_ms, chars):
    """All wrapped lines whose source line had arrived by t_ms."""
    visible = []
    for row in transcript:
        if row["t"] > t_ms:
            break
        for i, part in enumerate(wrap(row["text"], chars)):
            visible.append((row["kind"], part, i == 0))
    return visible


def compose(transcript, frames, times, duration):
    os.makedirs(OUT_DIR, exist_ok=True)
    for f in os.listdir(OUT_DIR):
        os.remove(os.path.join(OUT_DIR, f))
    os.makedirs(os.path.join(ROOT, "shots"), exist_ok=True)

    frame_times = [f["t"] for f in frames]
    chars = max(20, (LEFT_W - PAD * 2) // 8)
    max_rows = (H - 56 - PAD) // LINE_H

    for idx, t in enumerate(times):
        canvas = Image.new("RGB", (W, H), COLORS["bg"])
        draw = ImageDraw.Draw(canvas)

        # ---- left: terminal ------------------------------------------------
        draw.rectangle([0, 0, LEFT_W, H], fill=COLORS["panel"])
        draw.rectangle([LEFT_W, 0, LEFT_W + 1, H], fill=COLORS["rail"])

        draw.rectangle([0, 0, LEFT_W, 30], fill=(10, 13, 18))
        draw.text((PAD, 8), "opencode · real CLI", font=FONT_BOLD, fill=COLORS["banner"])
        draw.text((LEFT_W - PAD - 66, 9), f"t {t / 1000:6.1f}s", font=FONT_SMALL, fill=COLORS["dim"])

        lines = build_visible_lines(transcript, t, chars)
        view = lines[-max_rows:] if len(lines) > max_rows else lines
        y = 40
        for kind, text, first in view:
            colour = COLORS.get(kind, COLORS["out"])
            if kind == "dim":
                colour = COLORS["dim"]
            draw.text((PAD, y), text, font=FONT, fill=colour)
            y += LINE_H
        # caret
        draw.rectangle([PAD, H - 20, PAD + 7, H - 21 + LINE_H], fill=COLORS["banner"])

        # ---- right: loom ---------------------------------------------------
        pos = bisect.bisect_right(frame_times, t) - 1
        if pos >= 0:
            shot = frames[pos]
            path = os.path.join(FRAMES_DIR, shot["file"])
            if os.path.exists(path):
                img = Image.open(path).convert("RGB")
                scale = min((W - LEFT_W) / img.width, (H - 44) / img.height)
                new = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
                x = LEFT_W + ((W - LEFT_W) - new.width) // 2
                yy = 40 + ((H - 44) - new.height) // 2
                canvas.paste(new, (x, yy))
                draw.text((LEFT_W + PAD, 12), "KUNLUNMETA · LOOM", font=FONT_BOLD, fill=COLORS["banner"])
                caption = "live · driven by the calls at left"
                cw = draw.textbbox((0, 0), caption, font=FONT_SMALL)[2]
                draw.text((W - PAD - cw, 13), caption, font=FONT_SMALL, fill=COLORS["dim"])

        canvas.save(os.path.join(OUT_DIR, f"f-{idx:05d}.jpg"), quality=88)
        if idx % 120 == 0:
            print(f"  frame {idx}/{len(times)}")


def main():
    session = json.load(open(os.path.join(TMP, "demo-session.json"), encoding="utf-8"))
    transcript = session["transcript"]
    frames = session["frames"]
    if not frames:
        print("no frames captured", file=sys.stderr)
        return 1

    duration = max(transcript[-1]["t"], frames[-1]["t"]) + 2500
    step = 1000 // FPS
    times = list(range(0, duration, step))
    print(f"composing {len(times)} frames ({duration / 1000:.1f}s, {FPS} fps)")

    compose(transcript, frames, times, duration)

    cmd = [
        FFMPEG, "-hide_banner", "-loglevel", "warning", "-y",
        "-framerate", str(FPS), "-i", os.path.join(OUT_DIR, "f-%05d.jpg"),
        "-c:v", "libx264", "-preset", "medium", "-crf", "22",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT_FILE,
    ]
    print("encoding →", OUT_FILE)
    subprocess.run(cmd, check=True)
    shutil.rmtree(OUT_DIR, ignore_errors=True)
    print("saved", OUT_FILE, f"{os.path.getsize(OUT_FILE) / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
