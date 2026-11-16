#!/usr/bin/env python
"""Compose side-by-side reference still vs v2 evidence shots for review.

    python scripts/compare-stills.py [--out DIR]

Reference stills come from the CrommaCode analysis package
(D:\\workspace\\gamified-flow\\analysis\\r2-canvas-package\\stills). They are
camera-cropped views of the reference implementation; the v2 evidence shots are
full 1472x1008 design frames at camera zoom 1.0, so panes are matched by aspect
ratio only. This script never resamples the evidence in place: it writes new PNGs.

Outputs review/v2/comparisons/<mode>-vs-reference.png plus a JSON index.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF_DIR = r'D:\workspace\gamified-flow\analysis\r2-canvas-package\stills'
V2 = os.path.join(ROOT, 'review', 'v2')

PANE_W = 900
PAD = 18
LABEL_H = 40
BG = (32, 36, 58)        # #20243A ink
FG = (243, 237, 223)     # #F3EDDF paper
MUTED = (170, 178, 190)


def font(size):
    for candidate in (r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\arial.ttf', r'C:\Windows\Fonts\segoeui.ttf'):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def load(path):
    if not path or not os.path.exists(path):
        return None, 'missing: ' + str(path)
    try:
        return Image.open(path).convert('RGB'), None
    except Exception as exc:  # noqa: BLE001 - report, never fabricate
        return None, f'unreadable: {path}: {exc}'


def pane(img, title, subtitle):
    """Scale to fixed pane width, pad to the same height later by the caller."""
    if img is None:
        canvas = Image.new('RGB', (PANE_W, 620), (58, 62, 84))
        draw = ImageDraw.Draw(canvas)
        draw.text((24, 24), title, fill=FG, font=font(22))
        draw.text((24, 64), subtitle, fill=MUTED, font=font(15))
        draw.text((24, 120), 'NO EVIDENCE FILE', fill=(214, 122, 110), font=font(20))
        return canvas
    ratio = PANE_W / img.width
    scaled = img.resize((PANE_W, max(1, round(img.height * ratio))), Image.LANCZOS)
    canvas = Image.new('RGB', (PANE_W, scaled.height + LABEL_H), BG)
    canvas.paste(scaled, (0, LABEL_H))
    draw = ImageDraw.Draw(canvas)
    draw.text((12, 10), title, fill=FG, font=font(20))
    draw.text((12 + draw.textlength(title, font=font(20)) + 18, 14), subtitle, fill=MUTED, font=font(14))
    return canvas


def compose(name, left_path, right_path, note):
    left, left_err = load(left_path)
    right, right_err = load(right_path)
    left_pane = pane(left, 'REFERENCE (analysis still)', os.path.basename(left_path or '') if left else (left_err or ''))
    right_pane = pane(right, 'V2 EVIDENCE', os.path.basename(right_path or '') if right else (right_err or ''))
    height = max(left_pane.height, right_pane.height) + PAD * 2 + 26
    canvas = Image.new('RGB', (left_pane.width * 2 + PAD * 3, height), BG)
    draw = ImageDraw.Draw(canvas)
    canvas.paste(left_pane, (PAD, 26 + PAD))
    canvas.paste(right_pane, (PAD * 2 + left_pane.width, 26 + PAD))
    draw.text((PAD, 6), note, fill=FG, font=font(17))
    out_dir = os.path.join(V2, 'comparisons')
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f'{name}-vs-reference.png')
    canvas.save(out_path)
    return {
        'mode': name,
        'reference': left_path,
        'referenceAvailable': bool(left),
        'evidence': right_path,
        'evidenceAvailable': bool(right),
        'output': os.path.relpath(out_path, ROOT).replace('\\', '/'),
        'note': note,
        'limitations': [
            'Reference stills are camera-cropped views; v2 shots are full 1472x1008 design frames (zoom 1.0).',
            'This is a human-review aid, not a pixel-parity claim.',
        ],
    }


def newest(candidates):
    """Pick the most recently written existing candidate (final evidence wins once fresher)."""
    existing = [(p, os.path.getmtime(p)) for p in candidates if p and os.path.exists(p)]
    if not existing:
        return candidates[0] if candidates else None
    existing.sort(key=lambda item: item[1], reverse=True)
    return existing[0][0]


def main():
    out_idx = None
    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == '--out' and i + 1 < len(args):
            out_idx = args[i + 1]
    pairs = [
        ('loom',
         os.path.join(REF_DIR, 'Loom_canvas_1472x1008.png'),
         newest([os.path.join(V2, 'shots', 'loom-burst.png')]),
         'Loom — reference camera still vs v2 deterministic burst (12 events, t=8s); FINAL delivery scope = Loom only'),
    ]
    archived = [
        ('chips', os.path.join(REF_DIR, 'Chips_canvas_1472x1008.png'), os.path.join(V2, 'archive', 'comparisons-all-modes', 'chips-vs-reference.png')),
        ('westworld', os.path.join(REF_DIR, 'Westworld_canvas_1472x1008.png'), os.path.join(V2, 'archive', 'comparisons-all-modes', 'westworld-vs-reference.png')),
    ]
    results = [compose(*p) for p in pairs]
    archived_rows = [
        {'mode': mode, 'reference': ref, 'archivedComparison': path if os.path.exists(path) else None,
         'note': 'archived experiment — not part of the final Loom-only delivery'}
        for mode, ref, path in archived
    ]
    index_path = os.path.join(out_idx or os.path.join(V2, 'comparisons'), 'index.json')
    os.makedirs(os.path.dirname(index_path), exist_ok=True)
    with open(index_path, 'w', encoding='utf-8') as fh:
        json.dump({'schema': 'kunlunmeta-v2-reference-comparisons/1', 'scope': 'loom-final', 'pairs': results, 'archived': archived_rows}, fh, ensure_ascii=False, indent=2)
    for row in results:
        print(('OK  ' if row['referenceAvailable'] and row['evidenceAvailable'] else 'PART'), row['output'])
    print('index:', os.path.relpath(index_path, ROOT).replace('\\', '/'))


if __name__ == '__main__':
    main()
