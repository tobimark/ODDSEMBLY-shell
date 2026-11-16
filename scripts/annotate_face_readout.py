"""
Annotated dial-face diagram for the face-mounted readout review.

Base : review/event-dial/recording/static-face-2x.png  (840×860, design crop 0..420 × 0..430 at 2×)
Output: <outdir>/02b-dial-annotated.png + state-geometry.json

Usage: python scripts/annotate_face_readout.py [outdir]
"""
import json
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, "review", "event-dial", "recording", "static-face-2x.png")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "review", "event-dial", "chatgpt-review")
os.makedirs(OUT, exist_ok=True)

FONT = "C:/Windows/Fonts/msyh.ttc"
FONT_B = "C:/Windows/Fonts/msyhbd.ttc"
INK = (31, 41, 51)
MUTED = (105, 112, 120)
LAYER = {"fixed": ("固定", (46, 111, 149)), "rotor": ("旋转", (194, 65, 12)),
         "readout": ("读数器", (47, 125, 50)), "cable": ("连接", (140, 90, 30))}


def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold else FONT, size, index=0)


# (id, zh, en, layer, badge design px, geom outline design px)
REGIONS = [
    (1, "盘面固定读数器", "readout panel, inset in a machined bezel", "readout", (103, 93), ("rect", 7, 23, 205, 163)),
    (2, "Bezel 安装板 + 支脚", "bezel plate + bolted feet", "readout", (28, 170), ("rect", 1, 23, 212, 148)),
    (3, "读数器 → 读头 信号线", "signal cable with 3 clamps", "cable", (244, 258), ("path", [(190, 150), (212, 196), (244, 258), (266, 314), (278, 350)])),
    (4, "读头外壳螺栓座 r≈1224", "read-head mount on outer housing", "fixed", (327, 397), ("circle", 327, 397, 20)),
    (5, "上抬读臂（带投影）", "elevated read arm over the rotor", "fixed", (305, 378), ("leader", 305, 378, 271, 349)),
    (6, "读数窗口 r≈1082（白孔/针/叉）", "fixed read aperture at r≈1082", "fixed", (190, 270), ("leader", 190, 270, 216, 303)),
    (7, "固定定位缺口 r≈1136", "locating bracket in the 1128/1140 gap", "fixed", (248, 322), ("leader", 248, 322, 260, 340)),
    (8, "12 槽旋转卡窗（当前槽叠色）", "rotating 12-slot card windows", "rotor", (220, 200), ("point", 220, 200)),
    (9, "蓝弧 + 工具色弧段 37°–43°", "blue reference arc + tool accent", "fixed", (141, 240), ("point", 141, 240)),
]

W = H = 880
LEGEND_W = 700
TITLE_H = 110
canvas_w = W + LEGEND_W + 70
canvas_h = max(H + TITLE_H + 50, TITLE_H + 90 + 9 * 78 + 40)
canvas = Image.new("RGB", (canvas_w, canvas_h), (247, 244, 236))
base = Image.open(BASE).convert("RGB").resize((W, H), Image.LANCZOS)
canvas.paste(base, (30, TITLE_H))
d = ImageDraw.Draw(canvas)
d.text((30, 18), "Loom 事件转盘 · 盘面读数器与读头装配（标注版）", font=font(34, True), fill=INK)
d.text((30, 64), "design 420×430 @2×；状态 READ ×1 / S01/12 / ring 30°（读数器仍在 40° 读头旁）；坐标均为设计像素",
       font=font(17), fill=MUTED)


def P(x, y):
    return 30 + x * 2, TITLE_H + y * 2


# region outlines
for rid, zh, en, layer, anchor, geom in REGIONS:
    color = LAYER[layer][1]
    kind = geom[0]
    if kind == "rect":
        x0, y0, x1, y1 = geom[1:]
        d.rectangle([30 + x0 * 2, TITLE_H + y0 * 2, 30 + x1 * 2, TITLE_H + y1 * 2], outline=color, width=3)
    elif kind == "circle":
        x, y, r = geom[1:]
        d.ellipse([30 + (x - r) * 2, TITLE_H + (y - r) * 2, 30 + (x + r) * 2, TITLE_H + (y + r) * 2], outline=color, width=3)
    elif kind == "leader":
        x0, y0, x1, y1 = geom[1:]
        d.line([P(x0, y0), P(x1, y1)], fill=color, width=2)
    elif kind == "path":
        pts = [P(x, y) for x, y in geom[1]]
        d.line(pts, fill=color, width=4, joint="curve")

# badges
for rid, zh, en, layer, anchor, geom in REGIONS:
    color = LAYER[layer][1]
    x, y = P(*anchor)
    d.ellipse([x - 22, y - 22, x + 22, y + 22], fill=(255, 255, 255), outline=color, width=4)
    f = font(20, True)
    tw = d.textlength(str(rid), font=f)
    bb = f.getbbox(str(rid))
    d.text((x - tw / 2, y - (bb[3] + bb[1]) / 2), str(rid), font=f, fill=INK)

# legend
lx = 30 + W + 30
d.rounded_rectangle([lx, TITLE_H, lx + LEGEND_W, TITLE_H + 9 * 78 + 20], radius=14,
                    fill=(255, 255, 255, 245), outline=(201, 196, 181), width=2)
d.text((lx + 22, TITLE_H + 20), "区域说明 / REGIONS", font=font(28, True), fill=INK)
d.text((lx + 22, TITLE_H + 58), "蓝=固定机械 · 橙=旋转 · 绿=读数器 · 棕=连接", font=font(15), fill=MUTED)
ry = TITLE_H + 98
for rid, zh, en, layer, anchor, geom in REGIONS:
    color = LAYER[layer][1]
    d.ellipse([lx + 18, ry + 8, lx + 58, ry + 48], fill=(255, 255, 255), outline=color, width=3)
    f = font(18, True)
    tw = d.textlength(str(rid), font=f)
    d.text((lx + 38 - tw / 2, ry + 16), str(rid), font=f, fill=INK)
    d.text((lx + 72, ry + 4), zh, font=font(22, True), fill=INK)
    d.text((lx + 72, ry + 34), en, font=font(14), fill=MUTED)
    d.text((lx + LEGEND_W - 120, ry + 22), LAYER[layer][0], font=font(15, True), fill=color)
    ry += 78

d.text((30, canvas_h - 28), "完整场景见 01-full-scene.png；录屏见 06-dial-readout-fixed.mp4；固定性对照见 05-readout-fixed-strip.png",
       font=font(15), fill=MUTED)
canvas.save(os.path.join(OUT, "02b-dial-annotated.png"))

data = {
    "state": {"type": "Read", "count": 1, "slot": 1, "stepTotal": 12, "angleDeg": 30, "phase": "holding"},
    "designSpace": [1472, 1008],
    "readout": {"x": 8, "y": 30, "w": 190, "h": 126, "cornersMaxRadius": 975.6, "blueArcRadius": 980,
                "bezelInset": 7, "typography": {"type": 22, "mult": 13, "step": 8.2, "detail": 8, "age": 7.4}},
    "readHead": {"angleDeg": 40, "mountR": 1224, "armTipR": 1062, "apertureR": 1082,
                 "locatingR": 1136, "cardOuterR": 1128, "separatorInnerR": 1140},
    "clamps": {"r": [1220, 1290], "anglesDeg": [23, 30, 48, 57]},
    "accent": {"fromDeg": 37, "toDeg": 43, "radius": 980},
    "cardWindows": {"count": 12, "pitchDeg": 30, "rIn": 1012, "rOut": 1128},
    "timing": {"armDelayMs": 105, "moveMs": 180, "holdMs": 2000, "ease": "easeInOutCubic"},
}
with open(os.path.join(OUT, "state-geometry.json"), "w", encoding="utf-8") as fh:
    json.dump(data, fh, ensure_ascii=False, indent=2)
print("wrote", os.path.join(OUT, "02b-dial-annotated.png"), canvas.size)
