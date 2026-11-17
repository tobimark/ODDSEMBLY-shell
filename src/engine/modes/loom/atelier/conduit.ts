import { Graphics } from 'pixi.js';

/**
 * Conduit between the event dial and the drive cluster.
 *
 * The reference machine carries a corrugated conduit from the read head to its
 * control box and only recolours it per event. KunlunMeta keeps that geometry
 * (vertical drop, right-angle elbow, horizontal run into the gear housing) and
 * turns the colour change into something directional: a light pulse travels the
 * run in the call's tool colour, so the signal visibly reaches the device.
 */
const PATH: readonly [number, number][] = [
  [-34, 548], [-34, 792], [118, 792], [118, 766],
];

const SEG = PATH.slice(1).map((p, i) => {
  const a = PATH[i];
  const dx = p[0] - a[0]; const dy = p[1] - a[1];
  return { a, b: p, len: Math.hypot(dx, dy) };
});
const TOTAL = SEG.reduce((n, s) => n + s.len, 0);

function pointAt(d: number): [number, number] {
  let left = Math.max(0, Math.min(TOTAL, d));
  for (const s of SEG) {
    if (left <= s.len) {
      const t = s.len ? left / s.len : 0;
      return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
    }
    left -= s.len;
  }
  return PATH[PATH.length - 1];
}

/** One pulse = one tool call; a few may overlap under a burst without unbounded work. */
const PULSE_SECONDS = 0.26;
const TRAIL = 46;

export class Conduit {
  readonly view = new Graphics();
  /** Called once per pulse when the light reaches the device. */
  onArrive: (color: number) => void = () => {};
  private pulses: { color: number; t: number }[] = [];

  fire(color: number) {
    if (this.pulses.length >= 3) this.pulses.shift();
    this.pulses.push({ color, t: 0 });
  }

  get busy() { return this.pulses.length > 0; }

  update(dt: number) {
    for (const p of this.pulses) p.t += dt;
    const arrived = this.pulses.filter((p) => p.t >= PULSE_SECONDS);
    this.pulses = this.pulses.filter((p) => p.t < PULSE_SECONDS);
    for (const p of arrived) this.onArrive(p.color);
    this.draw();
  }

  private draw() {
    const g = this.view; g.clear();

    // Static hardware: a light guide clipped into small brackets.
    const poly = (w: number, color: number, alpha = 1) => {
      g.moveTo(PATH[0][0], PATH[0][1]);
      for (let i = 1; i < PATH.length; i++) g.lineTo(PATH[i][0], PATH[i][1]);
      g.stroke({ color, width: w, alpha, join: 'round', cap: 'round' });
    };
    poly(11, 0xc9c5b6);
    poly(7.5, 0xf2efe3);
    poly(2.4, 0xd6d0c0);

    for (const d of [0.18, 0.52, 0.86]) {
      const [x, y] = pointAt(TOTAL * d);
      const vertical = Math.abs(x + 34) < 1;
      const w = vertical ? 20 : 16; const h = vertical ? 14 : 20;
      g.roundRect(x - w / 2, y - h / 2, w, h, 3).fill(0xdcd7c8).stroke({ color: 0x9d9686, width: 0.9 });
    }
    // Terminal block where the run meets the drive housing.
    g.roundRect(106, 752, 24, 22, 4).fill(0xe6e1d3).stroke({ color: 0x9d9686, width: 0.9 });
    g.circle(118, 763, 3).fill(0xb5ae9d);

    for (const p of this.pulses) {
      const head = Math.min(1, p.t / PULSE_SECONDS) * TOTAL;
      const tail = Math.max(0, head - TRAIL);
      for (let i = 0; i < 10; i++) {
        const a = tail + ((head - tail) * i) / 10;
        const b = tail + ((head - tail) * (i + 1)) / 10;
        const [x0, y0] = pointAt(a); const [x1, y1] = pointAt(b);
        const k = (i + 1) / 10;
        g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: p.color, width: 3 + k * 3.4, alpha: 0.12 + k * 0.5, cap: 'round' });
      }
      const [hx, hy] = pointAt(head);
      g.circle(hx, hy, 4.6).fill({ color: p.color, alpha: 0.30 });
      g.circle(hx, hy, 2.2).fill({ color: 0xffffff, alpha: 0.85 });
    }
  }

  destroy() { this.view.destroy(); }
}
