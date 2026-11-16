"""
Annotate the Loom event-dial review screenshot for external design review.

Input : review/event-dial/annotation/base-2x.png  (2944×2016, same deterministic
        state as review/event-dial/04-hold-s01.png: READ ×1 / S01/12 / ring 30°)
Output: review/event-dial/annotation/
          annotated-overview.png   full scene, major zones + legend
          04-hold-s01.annotated.png 1× copy of the overview (exact user file size)
          annotated-dial.png       dial zoom, all stator/rotor bands + read head
          annotated-console.png    fixed readout + control box + queue
          annotated-readout.png    readout panel typography at ~4×
          regions.json / regions.md  machine-readable + human-readable tables

All geometry is expressed in the 1472×1008 design space and mapped 1:1 to the
1× screenshot (the 2× capture is exactly 2 px per design px).
"""
import json
import math
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "review", "event-dial", "annotation")
BASE = os.path.join(OUT, "base-2x.png")

FONT = "C:/Windows/Fonts/msyh.ttc"
FONT_B = "C:/Windows/Fonts/msyhbd.ttc"

INK = (31, 41, 51)
MUTED = (104, 112, 120)
PAPER = (251, 249, 246)
CREAM = (246, 242, 232)
LINE = (201, 196, 181)

LAYERS = {
    "stator": ("固定机械", (46, 111, 149), (46, 111, 149, 34)),
    "rotor": ("旋转部件", (194, 65, 12), (234, 88, 12, 40)),
    "readout": ("固定读数器", (47, 125, 50), (47, 125, 50, 44)),
    "front": ("固定前端", (47, 125, 50), (47, 125, 50, 40)),
    "context": ("非转盘上下文", (107, 114, 128), (107, 114, 128, 26)),
}

CX, CY = -610.0, -390.0


def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold else FONT, size, index=0)


def annulus(cx, cy, r_in, r_out, a0, a1, steps=72):
    pts = []
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        pts.append((cx + math.cos(a) * r_out, cy + math.sin(a) * r_out))
    for i in range(steps, -1, -1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        pts.append((cx + math.cos(a) * r_in, cy + math.sin(a) * r_in))
    return pts


def disc_sector(cx, cy, r, a0, a1, steps=72):
    pts = [(cx, cy)]
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts


def scaled_pts(pts, scale, ox=0, oy=0):
    return [(ox + x * scale, oy + y * scale) for x, y in pts]


def rect_pts(x, y, w, h):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def dashed_line(draw, pts, fill, width=2, dash=10, gap=7):
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        length = math.hypot(x2 - x1, y2 - y1)
        if length == 0:
            continue
        ux, uy = (x2 - x1) / length, (y2 - y1) / length
        t = 0.0
        while t < length:
            t2 = min(length, t + dash)
            draw.line([(x1 + ux * t, y1 + uy * t), (x1 + ux * t2, y1 + uy * t2)], fill=fill, width=width)
            t += dash + gap


def tag_chip(draw, xy, text, color, size=15):
    f = font(size, True)
    tw = draw.textlength(text, font=f)
    x, y = xy
    draw.rounded_rectangle([x, y, x + tw + 14, y + size + 12], radius=7, fill=color + (34,), outline=color + (170,), width=2)
    draw.text((x + 7, y + 4), text, font=f, fill=color)


def badge(draw, x, y, number, color, r=26, size=24):
    draw.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255), outline=color, width=5)
    f = font(size, True)
    tw = draw.textlength(str(number), font=f)
    bbox = f.getbbox(str(number))
    draw.text((x - tw / 2, y - (bbox[3] + bbox[1]) / 2), str(number), font=f, fill=INK)


# ------------------------------------------------------------------ overview

OVERVIEW = [
    dict(id=1, zh="内鼓面（静止）", en="inner drum face · stator", layer="stator",
         anchor=(110, 150), geom=("disc", 0, 975, 13, 74),
         note="蓝弧以内的静止鼓面：同心导环、径向细线、两个椭圆检视窗；不属于旋转件。"),
    dict(id=2, zh="蓝弧 + 工具色弧段", en="blue reference arc + tool accent", layer="stator",
         anchor=(239, 100), geom=("annulus", 972, 988, 23, 72),
         note="r=980 的基准弧固定不动；22°–58° 彩色段随当前工具变色（此处 READ 蓝）。"),
    dict(id=3, zh="12 槽卡窗索引鼓（会转）", en="12-window index drum · rotor", layer="rotor",
         anchor=(390, 70), geom=("annulus", 1012, 1128, 20, 74),
         note="12 个环扇卡窗，每格 30°；新工具事件前进一格（180 ms）。此帧环相 30°。"),
    dict(id=4, zh="固定读头", en="fixed read head · pointer + mount", layer="stator",
         anchor=(258, 338), geom=("line", (1002, 1168), 40),
         note="40° 处的针+箭头+螺栓座，固定不动；卡窗转到其下标为“读数”。"),
    dict(id=5, zh="读头导管", en="read-head conduit", layer="stator", fill=False, open=True,
         anchor=(300, 505), geom=("poly", [(312, 384), (352, 470), (250, 520), (214, 587)]),
         note="读头 → 控制箱的静态波纹导管，暗示信号/机械耦合。"),
    dict(id=6, zh="固定夹块", en="fixed clamp blocks", layer="stator",
         anchor=(346, 171), geom=("point", (346, 171)),
         note="4 块可见夹块把固定外壳锁在盘面上，不随鼓转动。"),
    dict(id=7, zh="固定读数器", en="fixed readout panel", layer="readout",
         anchor=(18, 796), geom=("rect", 24, 812, 320, 150),
         note="轴对齐矩形面板，装在共享底座上；TYPE / ×N / Sxx/12 / detail / age + 工具色 chip/rule。"),
    dict(id=8, zh="控制箱", en="control box", layer="front",
         anchor=(70, 568), geom=("rect", 88, 585, 245, 205),
         note="线圈模块、张力表、旋钮、按键、穿卡排；波纹导管接入顶端。"),
    dict(id=9, zh="队列牌", en="queue coupler + count", layer="front",
         anchor=(505, 852), geom=("rect", 353, 834, 138, 36),
         note="织机 FIFO 队列长度（此帧 0）；与转盘“组”语义不同。"),
    dict(id=10, zh="共享底座 + 安装鞍座", en="shared chassis bed + saddle", layer="stator", fill=False,
         anchor=(700, 855), geom=("rect", 79, 840, 1326, 30),
         note="转盘外壳与织机共用的床身；40° 处有切向鞍座，把固定外壳锁到机架。"),
    dict(id=11, zh="织机（非转盘）", en="loom machine · context", layer="context", fill=False,
         anchor=(900, 500), geom=("rect", 513, 139, 866, 690),
         note="主轴、综框、筘、梭、织物；由 Mechanism 驱动，与转盘只共享事件与底座。"),
    dict(id=12, zh="图纸底 / 标注", en="exhibition sheet + captions", layer="context",
         anchor=(1180, 955), geom=("point", (1180, 955)),
         note="1472×1008 图纸、注册点、FIG.01 与底部目录标注；不是机械件。"),
]

# dial detail: all bands + read head + conduit
DIAL_BANDS = [
    dict(id=1, zh="内鼓面（静止）", en="inner drum face", layer="stator",
         anchor=(110, 150), geom=("disc", 0, 975, 13, 74)),
    dict(id=2, zh="蓝弧（固定基准 r=980）", en="blue reference arc", layer="stator",
         anchor=(239, 100), geom=("annulus", 972, 988, 23, 72)),
    dict(id=3, zh="工具色弧段 22°–58°", en="tool accent segment", layer="stator",
         anchor=(276, 22), geom=("annulus", 972, 988, 22, 58)),
    dict(id=4, zh="12 环扇卡窗（旋转）", en="12 card windows · rotor", layer="rotor",
         anchor=(424, 52), geom=("annulus", 1012, 1128, 20, 74)),
    dict(id=5, zh="当前卡窗叠色（工具色）", en="current-slot tint", layer="rotor",
         anchor=(330, 118), geom=("annulus", 1012, 1128, 28, 52)),
    dict(id=6, zh="分度隔圈 + 12 索引销", en="separator ring + 12 pips", layer="rotor",
         anchor=(372, 232), geom=("annulus", 1140, 1152, 18, 74)),
    dict(id=7, zh="5° 刻度带（旋转）", en="5° engraved scale", layer="rotor",
         anchor=(411, 176), geom=("annulus", 1152, 1182, 17, 74)),
    dict(id=8, zh="滚花握持带（固定）", en="knurled grip band", layer="stator",
         anchor=(475, 116), geom=("annulus", 1182, 1212, 17, 74)),
    dict(id=9, zh="外圈细纹带（固定）", en="fine-ruled outer band", layer="stator",
         anchor=(523, 138), geom=("annulus", 1212, 1296, 17, 74)),
    dict(id=10, zh="外唇 / 接缝（固定）", en="outer lip + rim joints", layer="stator",
         anchor=(600, 50), geom=("annulus", 1296, 1312, 17, 74)),
    dict(id=11, zh="固定夹块 ×4 可见", en="fixed clamps", layer="stator",
         anchor=(63, 545), geom=("point", (63, 545))),
    dict(id=12, zh="固定读头（针+箭头+座）", en="fixed read head", layer="stator",
         anchor=(262, 336), geom=("poly", [(157, 254), (285, 361), (312, 384), (157, 254)])),
    dict(id=13, zh="读头波纹导管", en="read-head conduit", layer="stator",
         anchor=(300, 505), geom=("poly", [(312, 384), (352, 470), (250, 520), (214, 587)])),
]

CONSOLE = [
    dict(id=1, zh="固定读数器面板", en="fixed readout panel (320×150)", layer="readout",
         anchor=(18, 796), geom=("rect", 24, 812, 320, 150)),
    dict(id=2, zh="控制箱", en="control box", layer="front",
         anchor=(70, 568), geom=("rect", 88, 585, 245, 205)),
    dict(id=3, zh="箱→面板短连线", en="box → panel console link", layer="front",
         anchor=(210, 800), geom=("line", (210, 790, 210, 812))),
    dict(id=4, zh="面板→队列短连线", en="panel → queue console link", layer="front",
         anchor=(350, 846), geom=("line", (344, 846, 353, 852))),
    dict(id=5, zh="队列牌 QUEUE n", en="queue plate + count", layer="front",
         anchor=(505, 852), geom=("rect", 353, 834, 138, 36)),
]

READOUT_ITEMS = [
    dict(id=1, zh="面板外壳 / 四角螺钉", en="enamel shell + 4 corner screws", geom=("rect", 4, 4, 312, 142), anchor=(24, 18)),
    dict(id=2, zh="标题 EVENT READOUT", en="7.5 px header", geom=("rect", 14, 12, 78, 16), anchor=(80, 28)),
    dict(id=3, zh="工具色 chip", en="18×9 colour chip", geom=("rect", 270, 14, 20, 10), anchor=(280, 20)),
    dict(id=4, zh="TYPE 26 px bold", en="primary readout line", geom=("rect", 16, 42, 110, 34), anchor=(90, 60)),
    dict(id=5, zh="×N 20 px bold（右对齐）", en="multiplier, right aligned", geom=("rect", 250, 46, 40, 30), anchor=(280, 62)),
    dict(id=6, zh="颜色分隔线（工具色）", en="tool-colour rule", geom=("rect", 16, 76, 288, 3), anchor=(160, 78)),
    dict(id=7, zh="Sxx/12 10 px mono", en="slot / total", geom=("rect", 16, 88, 60, 16), anchor=(60, 96)),
    dict(id=8, zh="detail 9 px mono", en="event detail line", geom=("rect", 16, 106, 205, 16), anchor=(150, 114)),
    dict(id=9, zh="age 8 px mono", en="event age", geom=("rect", 16, 130, 55, 14), anchor=(55, 137)),
    dict(id=10, zh="12-SLOT INDEX 说明", en="fixed caption 6.2 px", geom=("rect", 226, 130, 68, 12), anchor=(260, 136)),
    dict(id=11, zh="安装耳 + 螺栓", en="mounting tab", geom=("rect", 134, 136, 52, 12), anchor=(160, 142)),
]


# --------------------------------------------------------------- utilities

def geometry_points(geom):
    kind = geom[0]
    if kind == "annulus":
        _, r_in, r_out, a0, a1 = geom
        return annulus(CX, CY, r_in, r_out, a0, a1)
    if kind == "disc":
        _, r_in, r, a0, a1 = geom
        return disc_sector(CX, CY, r, a0, a1)
    if kind == "rect":
        _, x, y, w, h = geom
        return rect_pts(x, y, w, h)
    if kind == "poly":
        return geom[1]
    if kind == "line":
        if len(geom) == 3:
            _, radius_span, deg = geom
            r0, r1 = radius_span
            a = math.radians(deg)
            return [(CX + math.cos(a) * r0, CY + math.sin(a) * r0),
                    (CX + math.cos(a) * r1, CY + math.sin(a) * r1)]
        _, coords = geom
        x0, y0, x1, y1 = coords
        return [(x0, y0), (x1, y1)]
    if kind == "point":
        x, y = geom[1]
        return rect_pts(x - 9, y - 9, 18, 18)
    raise ValueError(kind)


def draw_geometry(draw, geom, scale, ox, oy, layer, fill=True, outline=True, dashed=False, open_path=False):
    color = LAYERS[layer][1]
    pts = scaled_pts(geometry_points(geom), scale, ox, oy)
    if fill and not open_path:
        draw.polygon(pts, fill=LAYERS[layer][2])
    if outline:
        path = pts + ([] if open_path else [pts[0]])
        if dashed:
            dashed_line(draw, path, color + (140,), 2)
        else:
            draw.line(path, fill=color + (210,), width=3, joint="curve")


def wrapped(draw, text, fnt, max_width):
    lines, line = [], ""
    for ch in text:
        if draw.textlength(line + ch, font=fnt) <= max_width:
            line += ch
        else:
            lines.append(line)
            line = ch
    if line:
        lines.append(line)
    return lines


def legend_panel(size, title, tagline, regions, leader_map=None, row_h=76, width=820):
    """Build legend panel as RGBA image plus a list of row midpoints (canvas y)."""
    pad = 26
    head_h = 92
    rows_h = row_h * len(regions)
    h = max(size[1], head_h + rows_h + 40)
    panel_h = h
    img = Image.new("RGBA", (width, panel_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, width - 1, panel_h - 1], radius=14, fill=(255, 255, 255, 244), outline=LINE + (255,), width=2)
    d.text((pad, 18), title, font=font(30, True), fill=INK)
    d.text((pad, 58), tagline, font=font(16), fill=MUTED)
    y = head_h
    midpoints = []
    for region in regions:
        layer_zh, layer_color, _ = LAYERS[region.get("layer", "readout")]
        badge_x = pad + 24
        mid = y + row_h / 2
        midpoints.append(mid)
        badge(d, badge_x, mid, region["id"], layer_color, r=22, size=20)
        d.text((pad + 58, y + 10), region["zh"], font=font(24, True), fill=INK)
        d.text((pad + 58, y + 40), region["en"], font=font(15), fill=MUTED)
        tag = layer_zh
        f = font(14, True)
        tw = d.textlength(tag, font=f)
        d.rounded_rectangle([width - 24 - tw - 14, y + 14, width - 24, y + 14 + 26], radius=6,
                            fill=layer_color + (32,), outline=layer_color + (150,), width=2)
        d.text((width - 24 - tw - 7, y + 18), tag, font=f, fill=layer_color)
        if y > head_h:
            d.line([(pad, y), (width - pad, y)], fill=(231, 226, 214, 255), width=1)
        y += row_h
    return img, midpoints


# ---------------------------------------------------------------- overview

def make_overview(base):
    scale = 2
    img_w, img_h = base.size
    title_h = 118
    left = 34
    gap = 34
    legend_w = 900
    canvas_w = left + img_w + gap + legend_w + left
    canvas_h = title_h + img_h + 64
    canvas = Image.new("RGB", (canvas_w, canvas_h), (247, 244, 236))
    d = ImageDraw.Draw(canvas)
    d.text((left, 20), "Loom 事件转盘 · 区域标注总览", font=font(40, True), fill=INK)
    d.text((left, 72), "READ ×1 / S01/12 / ring 30° · 1472×1008 设计空间（2× 采集）· 固定读头在 40°",
           font=font(20), fill=MUTED)

    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for region in OVERVIEW:
        dashed = region["layer"] == "context"
        draw_geometry(od, region["geom"], scale, 0, 0, region["layer"],
                      fill=region.get("fill", True) and not dashed, outline=True,
                      dashed=dashed, open_path=region.get("open", False))

    base_rgba = base.convert("RGBA")
    base_rgba.alpha_composite(overlay)
    canvas.paste(base_rgba.convert("RGB"), (left, title_h))

    # badges on the image
    for region in OVERVIEW:
        color = LAYERS[region["layer"]][1]
        x, y = region["anchor"]
        badge(d, left + x * scale, title_h + y * scale, region["id"], color, r=27, size=24)

    legend, _ = legend_panel((legend_w, img_h), "区域说明 / REGIONS", "颜色：蓝=固定机械 · 橙=会运动 · 绿=固定读数器/前端 · 灰=上下文",
                             OVERVIEW, row_h=74, width=legend_w)
    canvas.paste(legend.convert("RGB"), (left + img_w + gap, title_h), legend)
    d.text((left, canvas_h - 46), "细部标注见 annotated-dial.png / annotated-console.png / annotated-readout.png；坐标与说明见 regions.md / regions.json",
           font=font(18), fill=MUTED)
    canvas.save(os.path.join(OUT, "annotated-overview.png"))
    print("overview", canvas.size)

    # plain 1× annotated copy at the original 1472×1008 size (no side legend)
    flat = base.resize((1472, 1008), Image.LANCZOS).convert("RGBA")
    ov2 = Image.new("RGBA", (1472, 1008), (0, 0, 0, 0))
    od2 = ImageDraw.Draw(ov2)
    for region in OVERVIEW:
        dashed = region["layer"] == "context"
        draw_geometry(od2, region["geom"], 1, 0, 0, region["layer"],
                      fill=region.get("fill", True) and not dashed, outline=True,
                      dashed=dashed, open_path=region.get("open", False))
    flat = Image.alpha_composite(flat, ov2).convert("RGB")
    d2 = ImageDraw.Draw(flat)
    for region in OVERVIEW:
        color = LAYERS[region["layer"]][1]
        x, y = region["anchor"]
        badge(d2, x, y, region["id"], color, r=14, size=13)
    note_font = font(9)
    d2.text((1472 - 10 - d2.textlength("编号说明：regions.md / annotated-overview.png", font=note_font), 1008 - 8),
            "编号说明：regions.md / annotated-overview.png", font=note_font, fill=(120, 118, 110))
    flat.save(os.path.join(OUT, "04-hold-s01.annotated.png"))
    print("plain", flat.size)


# ------------------------------------------------------------- dial detail

def make_dial_detail(base):
    scale = 2
    crop = (0, 0, 700, 840)          # design px
    img = base.crop(tuple(v * scale for v in crop))
    legend_w = 860
    gap = 40
    left = 34
    title_h = 112
    canvas_w = left + img.width + gap + legend_w + left
    canvas_h = title_h + img.height + 40
    canvas = Image.new("RGB", (canvas_w, canvas_h), (247, 244, 236))
    d = ImageDraw.Draw(canvas)
    d.text((left, 18), "转盘细部 · 固定定子 vs 旋转索引鼓", font=font(38, True), fill=INK)
    d.text((left, 68), "裁剪 design (0,0)–(700,840) @2×；编号对应右侧说明；环相 30° / 卡窗 1 在下",
           font=font(19), fill=MUTED)

    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for region in DIAL_BANDS:
        draw_geometry(od, region["geom"], scale, 0, 0, region["layer"])
    img = img.convert("RGBA")
    img.alpha_composite(overlay)
    canvas.paste(img.convert("RGB"), (left, title_h))

    # badges (small on thin bands)
    for region in DIAL_BANDS:
        color = LAYERS[region["layer"]][1]
        x, y = region["anchor"]
        badge(d, left + x * scale, title_h + y * scale, region["id"], color, r=24, size=21)

    legend, _ = legend_panel((legend_w, img.height), "转盘部件 / DIAL PARTS",
                             "橙=旋转（ringPhase）· 蓝=固定 · 绿=读数器", DIAL_BANDS, row_h=88, width=legend_w)
    lx = left + img.width + gap
    canvas.paste(legend.convert("RGB"), (lx, title_h), legend)
    canvas.save(os.path.join(OUT, "annotated-dial.png"))
    print("dial", canvas.size)


# ---------------------------------------------------------- console detail

def make_console_detail(base):
    scale = 2
    crop = (0, 540, 540, 1000)
    img = base.crop(tuple(v * scale for v in crop))
    legend_w = 820
    gap = 40
    left = 34
    title_h = 112
    canvas_w = left + img.width + gap + legend_w + left
    canvas_h = title_h + img.height + 40
    canvas = Image.new("RGB", (canvas_w, canvas_h), (247, 244, 236))
    d = ImageDraw.Draw(canvas)
    d.text((left, 18), "固定读数器 + 控制箱 + 队列牌", font=font(38, True), fill=INK)
    d.text((left, 68), "裁剪 design (0,540)–(540,1000) @2×；读数器内部见 annotated-readout.png",
           font=font(19), fill=MUTED)

    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for region in CONSOLE:
        x, y = region["anchor"]
        draw_geometry(od, region["geom"], scale, -crop[0] * scale, -crop[1] * scale, region["layer"], fill=True)
    img = img.convert("RGBA")
    img.alpha_composite(overlay)
    canvas.paste(img.convert("RGB"), (left, title_h))

    for region in CONSOLE:
        color = LAYERS[region["layer"]][1]
        x, y = region["anchor"]
        badge(d, left + (x - crop[0]) * scale, title_h + (y - crop[1]) * scale, region["id"], color, r=24, size=21)

    legend, _ = legend_panel((legend_w, img.height), "读数器 / 控制箱 / 队列",
                             "绿=固定读数器/前端 · 蓝=固定机械", CONSOLE, row_h=88, width=legend_w)
    lx = left + img.width + gap
    canvas.paste(legend.convert("RGB"), (lx, title_h), legend)
    canvas.save(os.path.join(OUT, "annotated-console.png"))
    print("console", canvas.size)


# --------------------------------------------------------- readout detail

def make_readout_detail(base):
    scale = 2
    crop = (0, 770, 460, 990)
    img0 = base.crop(tuple(v * scale for v in crop))
    up = 2.0
    img = img0.resize((int(img0.width * up), int(img0.height * up)), Image.LANCZOS)
    zoom = scale * up
    panel_x, panel_y = 24 - crop[0], 812 - crop[1]
    legend_w = 720
    gap = 30
    left = 34
    title_h = 130
    canvas_w = left + img.width + gap + legend_w + left
    canvas_h = title_h + img.height + 40
    canvas = Image.new("RGB", (canvas_w, canvas_h), (247, 244, 236))
    d = ImageDraw.Draw(canvas)
    d.text((left, 20), "固定读数器 · 排版细节", font=font(40, True), fill=INK)
    d.text((left, 74), "design 320×150 @~4×；READ ×1 / S01/12；面板不旋转，所有 Text 位于非旋转层",
           font=font(19), fill=MUTED)
    ix, iy = left, title_h
    canvas.paste(img, (ix, iy))

    # badge anchors in crop-design px (panel occupies x 24..344, y 42..192)
    A = {
        1: (37, 55), 2: (60, 58), 3: (284, 61), 4: (100, 101), 5: (294, 103),
        6: (250, 118), 7: (60, 136), 8: (170, 156), 9: (55, 179), 10: (280, 178), 11: (184, 184),
    }
    for item in READOUT_ITEMS:
        ax, ay = A[item["id"]]
        badge(d, ix + ax * zoom, iy + ay * zoom, item["id"], (194, 65, 12), r=18, size=17)

    legend, _ = legend_panel((legend_w, img.height), "读数器内部 / READOUT ITEMS",
                             "编号对应下方项目；尺寸为 design px", READOUT_ITEMS, row_h=64, width=legend_w)
    canvas.paste(legend.convert("RGB"), (ix + img.width + gap, title_h), legend)
    d.text((left, canvas_h - 24), "编号说明见 regions.md；完整场景见 annotated-overview.png；READ ×1 / S01/12",
           font=font(16), fill=MUTED)
    canvas.save(os.path.join(OUT, "annotated-readout.png"))
    print("readout", canvas.size)


# --------------------------------------------------------------- data files

def write_tables():
    data = dict(
        image="review/event-dial/04-hold-s01.png",
        capture="review/event-dial/annotation/base-2x.png",
        state=dict(phase="holding", type="Read", count=1, slot=1, stepTotal=12,
                    angleDeg=30, ageMs=666.7, queue=0),
        designSpace=[1472, 1008], capturePixels=[2944, 2016],
        regions=OVERVIEW,
        dialParts=DIAL_BANDS,
        consoleParts=CONSOLE,
        readoutItems=READOUT_ITEMS,
    )
    with open(os.path.join(OUT, "regions.json"), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)

    lines = [
        "# 转盘 | 区域清单（与 annotated-*.png 编号对应）",
        "",
        "状态：`READ ×1 / S01/12 / ring 30° / queue 0`；设计空间 1472×1008，2× 采集 2944×2016。",
        "",
        "| # | 区域（中） | Region | 层 | 会动？ | 说明 |",
        "|---|---|---|---|---|---|",
    ]
    for r in OVERVIEW:
        layer = LAYERS[r["layer"]][0]
        moves = "是（ringPhase）" if r["layer"] == "rotor" else "否"
        lines.append(f"| {r['id']} | {r['zh']} | {r['en']} | {layer} | {moves} | {r['note']} |")
    lines += ["", "## 转盘细部编号（annotated-dial.png）", "",
              "| # | 区域（中） | Region | 层 |", "|---|---|---|---|"]
    for r in DIAL_BANDS:
        lines.append(f"| D{r['id']} | {r['zh']} | {r['en']} | {LAYERS[r['layer']][0]} |")
    lines += ["", "## 读数器/控制箱编号（annotated-console.png）", "",
              "| # | 区域（中） | Region | 层 |", "|---|---|---|---|"]
    for r in CONSOLE:
        lines.append(f"| C{r['id']} | {r['zh']} | {r['en']} | {LAYERS[r['layer']][0]} |")
    lines += ["", "## 读数器内部编号（annotated-readout.png）", "",
              "| # | 项目（中） | Item |", "|---|---|---|"]
    for r in READOUT_ITEMS:
        lines.append(f"| R{r['id']} | {r['zh']} | {r['en']} |")
    with open(os.path.join(OUT, "regions.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def main():
    base = Image.open(BASE).convert("RGB")
    assert base.size == (2944, 2016), base.size
    make_overview(base)
    make_dial_detail(base)
    make_console_detail(base)
    make_readout_detail(base)
    write_tables()
    print("done ->", OUT)


if __name__ == "__main__":
    main()
