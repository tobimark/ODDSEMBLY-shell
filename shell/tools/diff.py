"""
Pixel diff: replica screenshot vs the native CrommaCode reference frame.

usage:  python tools/diff.py [shot.png] [--save]
Reports per-region mean-abs-diff and the share of pixels off by >8 levels.
The centre GameView canvas is *out of scope* and reported separately.

Colour channels are compared in sRGB space; both images are 2906x1730 native.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT.parent / '.tmp' / 'shell' / 'ref.png'
SHOT = ROOT / 'shots' / 'shell.png'
OUT = ROOT / 'shots' / 'diff'

# regions in native px  (x0, y0, x1, y1)  -- x1/y1 exclusive
REGIONS = {
    'title_bar':   (13, 13, 2892, 109),
    'sidebar':     (13, 110, 541, 1716),
    'nav_bar':     (543, 110, 2892, 212),
    'agent_panel': (2029, 213, 2852, 1699),
    'right_gutter': (2876, 213, 2892, 1716),
    'CENTER_out_of_scope': (543, 213, 2005, 1699),
    'whole_client': (13, 13, 2892, 1716),
}


def load(p):
    im = Image.open(p).convert('RGB')
    return np.asarray(im).astype(np.int16)


def main():
    shot_path = Path(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else SHOT
    ref = load(REF)
    shot = load(shot_path)
    if ref.shape != shot.shape:
        print(f'!! size mismatch ref={ref.shape} shot={shot.shape}')
        h, w = min(ref.shape[0], shot.shape[0]), min(ref.shape[1], shot.shape[1])
        ref, shot = ref[:h, :w], shot[:h, :w]

    d = np.abs(ref - shot)
    dm = d.max(axis=2)

    print(f'ref : {REF.name}')
    print(f'shot: {shot_path.name}')
    print(f'size: {shot.shape[1]}x{shot.shape[0]}')
    print()
    print(f'{"region":22s} {"meanAbs":>8s} {"p95":>5s} {"%>8":>7s} {"%>32":>7s}')
    rows = []
    for name, (x0, y0, x1, y1) in REGIONS.items():
        sub = dm[y0:y1, x0:x1]
        mean = sub.mean()
        p95 = np.percentile(sub, 95)
        p8 = (sub > 8).mean() * 100
        p32 = (sub > 32).mean() * 100
        rows.append((name, mean, p8))
        print(f'{name:22s} {mean:8.2f} {p95:5.0f} {p8:6.2f}% {p32:6.2f}%')

    scored = [r for r in rows if 'out_of_scope' not in r[0] and r[0] != 'whole_client']
    agg = sum(r[1] for r in scored) / len(scored)
    print(f'\nCHROME SCORE  meanAbs={agg:.2f}  (lower is better; 0 = identical)')

    if '--save' in sys.argv:
        OUT.mkdir(parents=True, exist_ok=True)
        heat = np.clip(dm * 4, 0, 255).astype(np.uint8)
        Image.fromarray(heat).save(OUT / 'heat.png')
        # red overlay on the shot where it differs
        overlay = shot.copy().astype(np.uint8)
        mask = dm > 12
        overlay[mask] = [255, 0, 0]
        Image.fromarray(overlay).save(OUT / 'overlay.png')
        # side-by-side halves for eyeballing
        sbs = Image.new('RGB', (ref.shape[1], ref.shape[0]))
        sbs.paste(Image.fromarray(ref.astype(np.uint8)).resize((ref.shape[1] // 2, ref.shape[0])), (0, 0))
        sbs.paste(Image.fromarray(shot.astype(np.uint8)).resize((shot.shape[1] // 2, shot.shape[0])), (ref.shape[1] // 2, 0))
        sbs.save(OUT / 'side-by-side.png')
        print(f'wrote {OUT}/heat.png overlay.png side-by-side.png')


if __name__ == '__main__':
    main()
