"""
Side-by-side region comparison: reference vs replica vs difference.

usage:
  python tools/compare.py --box X0,Y0,X1,Y1 [--scale 2] [--out name]

Writes shots/diff/cmp-<out>.png: three stacked panels (REF | MINE | DIFF).
All coordinates are NATIVE px of the 2906x1730 raster.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT.parent / '.tmp' / 'shell' / 'ref.png'
SHOT = ROOT / 'shots' / 'shell.png'
OUTDIR = ROOT / 'shots' / 'diff'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--box', required=True)
    ap.add_argument('--scale', type=float, default=2.0)
    ap.add_argument('--out', default=None)
    ap.add_argument('--gap', type=int, default=6)
    ap.add_argument('--shot', default=None, help='replica png (default shots/shell.png)')
    args = ap.parse_args()

    x0, y0, x1, y1 = (int(v) for v in args.box.split(','))
    ref = Image.open(REF).convert('RGB').crop((x0, y0, x1, y1))
    shot_src = Path(args.shot) if args.shot else SHOT
    shot = Image.open(shot_src).convert('RGB')
    if shot.size != Image.open(REF).size:
        shot = shot.resize(Image.open(REF).size)
    shot = shot.crop((x0, y0, x1, y1))

    a = np.asarray(ref).astype(np.int16)
    b = np.asarray(shot).astype(np.int16)
    d = np.abs(a - b).max(axis=2)
    print(f'region {x1-x0}x{y1-y0}  meanAbs={d.mean():.2f}  p95={np.percentile(d,95):.0f}  '
          f'%>8={(d>8).mean()*100:.1f}%  %>32={(d>32).mean()*100:.1f}%')
    # where does the error concentrate?
    ys, xs = np.where(d > 24)
    if len(xs):
        print(f'  worst-error bbox native x{x0+xs.min()}..{x0+xs.max()} y{y0+ys.min()}..{y0+ys.max()}')

    heat = np.zeros((*d.shape, 3), np.uint8)
    heat[..., 0] = np.clip(d * 6, 0, 255)
    heat[..., 1] = np.clip(d * 2, 0, 255)
    heat[..., 2] = np.clip(d * 1, 0, 255)
    heat_img = Image.fromarray(heat)

    s = args.scale
    panels = []
    for im, label in ((ref, 'REF'), (shot, 'MINE'), (heat_img, 'DIFF (x6)')):
        w, h = int(im.width * s), int(im.height * s)
        panels.append(im.resize((w, h), Image.NEAREST))
    W = panels[0].width
    H = sum(p.height for p in panels) + args.gap * 2 + 18 * 3
    sheet = Image.new('RGB', (W, H), (28, 28, 30))
    draw = ImageDraw.Draw(sheet)
    y = 0
    for p, label in zip(panels, ('REF', 'MINE', 'DIFF')):
        draw.text((4, y + 3), label, fill=(240, 240, 240))
        y += 18
        sheet.paste(p, (0, y))
        y += p.height + args.gap
    OUTDIR.mkdir(parents=True, exist_ok=True)
    name = args.out or f'{x0}_{y0}_{x1}_{y1}'
    path = OUTDIR / f'cmp-{name}.png'
    sheet.save(path)
    print('wrote', path)


if __name__ == '__main__':
    main()
