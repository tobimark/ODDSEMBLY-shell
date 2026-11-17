"""
Pixel inspection helper for the reference capture (2906x1730 native @200% DPI).

The reference frame lives at ../.tmp/shell/ref.png.  All coordinates are NATIVE
pixels; divide by 2 to get the CSS/logical px used in the replica.

subcommands
  bbox   X0 Y0 X1 Y1            tight ink bbox inside the box + dominant ink colours
  rows   X0 Y0 X1 Y1            vertical runs of ink (text rows / element bands)
  cols   X0 Y0 X1 Y1            horizontal runs of ink (glyph / element columns)
  rle    --row Y | --col X      run-length decode one scanline (bg vs content)
  colors X,Y X,Y ...            sample exact colours
  hist   X0 Y0 X1 Y1 [N]        top-N colours in a region
  edge   --row Y X0 X1          list every colour change along one scanline

examples
  python tools/inspect.py rows 44 540 520 1100          # file-tree rows
  python tools/inspect.py bbox 88 570 430 610           # a text run's ink box
  python tools/inspect.py colors 700,700 2100,900
"""
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT.parent / '.tmp' / 'shell' / 'ref.png'
_im = Image.open(REF).convert('RGB')
A = np.asarray(_im).astype(np.int16)
H, W, _ = A.shape


def _bg(reg):
    return np.median(reg.reshape(-1, 3), axis=0)


def ink_mask(x0, y0, x1, y1, tol=26):
    reg = A[y0:y1, x0:x1]
    bg = _bg(reg)
    return (np.abs(reg - bg).max(axis=2) > tol), bg


def cmd_bbox(x0, y0, x1, y1):
    m, bg = ink_mask(x0, y0, x1, y1)
    ys, xs = np.where(m)
    if not len(xs):
        print('no ink; background #%02X%02X%02X' % tuple(int(v) for v in bg))
        return
    bx = (x0 + int(xs.min()), y0 + int(ys.min()), x0 + int(xs.max()) + 1, y0 + int(ys.max()) + 1)
    print('ink bbox  native=(%d,%d)-(%d,%d)  w=%d h=%d' % (bx[0], bx[1], bx[2], bx[3], bx[2] - bx[0], bx[3] - bx[1]))
    print('   logical=(%.1f,%.1f)-(%.1f,%.1f)  w=%.1f h=%.1f  (relative to client: x-13, y-13)'
          % (bx[0] / 2, bx[1] / 2, bx[2] / 2, bx[3] / 2, (bx[2] - bx[0]) / 2, (bx[3] - bx[1]) / 2))
    print('   client-rel logical=(%.1f,%.1f) w=%.1f h=%.1f'
          % ((bx[0] - 13) / 2, (bx[1] - 13) / 2, (bx[2] - bx[0]) / 2, (bx[3] - bx[1]) / 2))
    sel = A[y0:y1, x0:x1][m]
    c = Counter(map(tuple, sel.tolist()))
    tot = len(sel)
    print('   ink colours:', ', '.join('#%02X%02X%02X %.0f%%' % (k[0], k[1], k[2], v / tot * 100)
                                      for k, v in c.most_common(4)))
    print('   bg #%02X%02X%02X' % tuple(int(v) for v in bg))


def _group(idx, gap=2):
    groups = []
    for i in idx:
        if groups and i - groups[-1][-1] <= gap:
            groups[-1].append(i)
        else:
            groups.append([i])
    return [(g[0], g[-1]) for g in groups]


def cmd_rows(x0, y0, x1, y1):
    m, _ = ink_mask(x0, y0, x1, y1)
    has = m.sum(axis=1) > 0
    for a, b in _group(np.where(has)[0].tolist()):
        print('row y %4d..%4d  h=%3d  (client-rel y %.1f..%.1f)' % (y0 + a, y0 + b, b - a + 1, (y0 + a - 13) / 2, (y0 + b - 13) / 2))


def cmd_cols(x0, y0, x1, y1):
    m, _ = ink_mask(x0, y0, x1, y1)
    has = m.sum(axis=0) > 0
    for a, b in _group(np.where(has)[0].tolist()):
        print('col x %4d..%4d  w=%3d  (client-rel x %.1f..%.1f)' % (x0 + a, x0 + b, b - a + 1, (x0 + a - 13) / 2, (x0 + b - 13) / 2))


def cmd_rle(row=None, col=None):
    if row is not None:
        line = A[row]
        label, base = 'x', 0
    else:
        line = A[:, col]
        label, base = 'y', 0
    start = 0
    for i in range(1, len(line)):
        if not np.array_equal(line[i], line[start]):
            print('%s %4d..%4d  %3d px  #%02X%02X%02X' % (label, start, i - 1, i - start, *line[start]))
            start = i
    print('%s %4d..%4d  %3d px  #%02X%02X%02X' % (label, start, len(line) - 1, len(line) - start, *line[start]))


def cmd_colors(points):
    for p in points:
        x, y = (int(v) for v in p.split(','))
        print('(%4d,%4d) #%02X%02X%02X   client-rel logical (%.1f,%.1f)' % (x, y, *A[y, x], (x - 13) / 2, (y - 13) / 2))


def cmd_hist(x0, y0, x1, y1, n=8):
    reg = A[y0:y1, x0:x1].reshape(-1, 3)
    c = Counter(map(tuple, reg.tolist()))
    tot = len(reg)
    for k, v in c.most_common(n):
        print('#%02X%02X%02X  %6d  %5.1f%%' % (k[0], k[1], k[2], v, v / tot * 100))


def cmd_edge(row, x0, x1):
    prev = None
    for x in range(x0, x1):
        c = tuple(int(v) for v in A[row, x])
        if c != prev:
            print('x=%4d  #%02X%02X%02X' % (x, *c))
            prev = c


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd = sys.argv[1]
    if cmd == 'bbox':
        cmd_bbox(*map(int, sys.argv[2:6]))
    elif cmd == 'rows':
        cmd_rows(*map(int, sys.argv[2:6]))
    elif cmd == 'cols':
        cmd_cols(*map(int, sys.argv[2:6]))
    elif cmd == 'rle':
        if sys.argv[2] == '--row':
            cmd_rle(row=int(sys.argv[3]))
        else:
            cmd_rle(col=int(sys.argv[3]))
    elif cmd == 'colors':
        cmd_colors(sys.argv[2:])
    elif cmd == 'hist':
        cmd_hist(*map(int, sys.argv[2:6]), n=int(sys.argv[6]) if len(sys.argv) > 6 else 8)
    elif cmd == 'edge':
        cmd_edge(int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
