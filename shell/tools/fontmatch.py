"""
Identify the font family / size / weight of a text run in the reference frame.

The replica ships the *real* fonts embedded in CrommaCode 0.3.11
(Cromma Sans, Maple Mono CN), so this tool renders candidates with those exact
TTF files and scores them against the capture (2906x1730 @200% DPI).

usage
  python tools/fontmatch.py --box X0,Y0,X1,Y1 --text "build_chart_data.py"
  python tools/fontmatch.py --box ... --text ... --sizes 20-40 --top 6

The reported `size` is NATIVE px; divide by 2 for the CSS font-size.
`top`/`left` of the winning render tell you where the ink starts, which is what
you align the DOM element to.
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT.parent / '.tmp' / 'shell' / 'ref.png'
FONT_DIR = ROOT / 'public' / 'fonts'
SYS = Path('C:/Windows/Fonts')

CANDIDATES = {
    'CrommaSans-400': (FONT_DIR / 'CrommaSans-Regular.ttf', None),
    'CrommaSans-500': (FONT_DIR / 'CrommaSans-Medium.ttf', None),
    'MapleMono-400': (FONT_DIR / 'MapleMonoCN-Regular.ttf', None),
    'MapleMono-600': (FONT_DIR / 'MapleMonoCN-SemiBold.ttf', None),
    'MapleMono-700': (FONT_DIR / 'MapleMonoCN-Bold.ttf', None),
    'MicrosoftYaHei-400': (SYS / 'msyh.ttc', 0),
    'MicrosoftYaHei-700': (SYS / 'msyhbd.ttc', 0),
}

_im = Image.open(REF).convert('RGB')
A = np.asarray(_im).astype(np.float32)


def ink_of(box, pad=6):
    x0, y0, x1, y1 = box
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(_im.width, x1 + pad), min(_im.height, y1 + pad)
    reg = A[y0:y1, x0:x1]
    bg = np.median(reg.reshape(-1, 3), axis=0)
    lum = reg.mean(axis=2)
    bgl = float(bg.mean())
    ink = np.clip((bgl - lum) / max(bgl, 40.0), 0, 1)
    return ink, (x0, y0)


def tight(mask, thr=0.18):
    m = mask > thr
    ys, xs = np.where(m)
    if not len(xs):
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def render(text, path, size, index=None):
    kw = {'index': index} if index is not None else {}
    f = ImageFont.truetype(str(path), size, **kw)
    asc, desc = f.getmetrics()
    pad = 8
    w = int(f.getlength(text)) + 2 * pad
    h = asc + desc + 2 * pad
    img = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(img)
    d.text((pad, pad + asc), text, font=f, fill=255, anchor='ls')
    return np.asarray(img).astype(np.float32) / 255.0


def dilate(m):
    out = m.copy()
    out[1:, :] |= m[:-1, :]
    out[:-1, :] |= m[1:, :]
    out[:, 1:] |= m[:, :-1]
    out[:, :-1] |= m[:, 1:]
    return out


def score(ref_ink, cand, thr=0.18):
    rb = tight(ref_ink, thr)
    cb = tight(cand, thr)
    if rb is None or cb is None:
        return 0.0, None, None
    rx0, ry0, rx1, ry1 = rb
    cx0, cy0, cx1, cy1 = cb
    rw, rh = rx1 - rx0, ry1 - ry0
    cw, ch = cx1 - cx0, cy1 - cy0
    # size agreement (width matters most for proportional text)
    ew = abs(rw - cw) / max(rw, cw, 1)
    eh = abs(rh - ch) / max(rh, ch, 1)
    size_score = 1.0 - (0.65 * ew + 0.35 * eh)
    # overlap of the two tight boxes, aligned at their top-left
    h = max(rh, ch)
    w = max(rw, cw)
    a = np.zeros((h, w), bool)
    b = np.zeros((h, w), bool)
    a[:rh, :rw] = ref_ink[ry0:ry1, rx0:rx1] > thr
    b[:ch, :cw] = cand[cy0:cy1, cx0:cx1] > thr
    inter = (a & dilate(b)).sum()
    union = (a | b).sum()
    iou = inter / max(union, 1)
    return 0.58 * iou + 0.42 * size_score, (rw, rh), (cw, ch)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--box', required=True, help='X0,Y0,X1,Y1 in native px')
    ap.add_argument('--text', required=True)
    ap.add_argument('--sizes', default='18-44')
    ap.add_argument('--top', type=int, default=6)
    ap.add_argument('--fonts', default='', help='comma list to restrict candidates')
    args = ap.parse_args()

    x0, y0, x1, y1 = (int(v) for v in args.box.split(','))
    lo, hi = (int(v) for v in args.sizes.split('-'))
    ref_ink, origin = ink_of((x0, y0, x1, y1))
    cands = CANDIDATES
    if args.fonts:
        keep = [s.strip() for s in args.fonts.split(',')]
        cands = {k: v for k, v in CANDIDATES.items() if k in keep}

    res = []
    for name, (path, idx) in cands.items():
        if not Path(path).exists():
            continue
        for size in range(lo, hi + 1):
            cand = render(args.text, path, size, idx)
            sc, rsz, csz = score(ref_ink, cand)
            res.append((sc, name, size, rsz, csz))
    res.sort(key=lambda r: -r[0])
    rb = tight(ref_ink)
    print(f'ref ink bbox (native): {rb}  ->  {rb[2]-rb[0]}x{rb[3]-rb[1]} px')
    print(f'ref ink starts at native ({origin[0]+rb[0]},{origin[1]+rb[1]})')
    print()
    for sc, name, size, rsz, csz in res[:args.top]:
        print(f'  score {sc:.3f}  {name:20s} native={size:2d}  css={size/2:4.1f}px   ink ref={rsz} cand={csz}')


if __name__ == '__main__':
    main()
