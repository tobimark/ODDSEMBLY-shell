import { Graphics } from 'pixi.js';
import { T } from '../theme';

export function bolt(g: Graphics, x: number, y: number, r = 2.6, alpha = 0.55): void {
  g.circle(x, y, r).fill({ color: T.paper, alpha: 0.9 }).stroke({ width: 0.7, color: T.navy, alpha });
  g.moveTo(x - r * 0.55, y).lineTo(x + r * 0.55, y).stroke({ width: 0.5, color: T.navy, alpha: alpha * 0.8 });
}

export function rivetRow(g: Graphics, x0: number, x1: number, y: number, step = 14, r = 1.6): void {
  for (let x = x0; x <= x1; x += step) bolt(g, x, y, r, 0.4);
}

export function gear(g: Graphics, x: number, y: number, r: number, teeth: number, depth: number, opts: { fill?: number; alpha?: number; hub?: number } = {}): void {
  const step = (Math.PI * 2) / teeth;
  g.moveTo(x + r + depth, y);
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.32;
    const a2 = a0 + step * 0.5;
    const a3 = a0 + step * 0.82;
    g.lineTo(x + (r + depth) * Math.cos(a0), y + (r + depth) * Math.sin(a0));
    g.lineTo(x + (r + depth) * Math.cos(a1), y + (r + depth) * Math.sin(a1));
    g.lineTo(x + r * Math.cos(a2), y + r * Math.sin(a2));
    g.lineTo(x + r * Math.cos(a3), y + r * Math.sin(a3));
    g.lineTo(x + (r + depth) * Math.cos(a3), y + (r + depth) * Math.sin(a3));
  }
  g.closePath();
  g.fill({ color: opts.fill ?? 0xf3eee5, alpha: opts.alpha ?? 1 });
  g.stroke({ width: 0.85, color: T.navy, alpha: 0.62 });
  g.circle(x, y, r * 0.62).stroke({ width: 0.55, color: T.navy, alpha: 0.35 });
  g.circle(x, y, opts.hub ?? r * 0.18).fill({ color: T.navy, alpha: 0.55 });
  g.circle(x, y, opts.hub ?? r * 0.18).stroke({ width: 0.6, color: T.navy, alpha: 0.7 });
}

export function spokes(g: Graphics, x: number, y: number, r: number, n: number, innerR: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.moveTo(x + Math.cos(a) * innerR, y + Math.sin(a) * innerR);
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.stroke({ width: 0.8, color: T.navy, alpha: 0.45 });
}

export function dashedLine(g: Graphics, x1: number, y1: number, x2: number, y2: number, dash = 6, gap = 5, width = 0.7, alpha = 0.35, color = T.navy): void {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  for (let t = 0; t < len; t += dash + gap) {
    const t2 = Math.min(t + dash, len);
    g.moveTo(x1 + ux * t, y1 + uy * t);
    g.lineTo(x1 + ux * t2, y1 + uy * t2);
  }
  g.stroke({ width, color, alpha });
}

export function dimension(g: Graphics, x1: number, y1: number, x2: number, y2: number, alpha = 0.32): void {
  g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 0.55, color: T.navy, alpha });
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  for (const [px, py] of [[x1, y1], [x2, y2]]) {
    g.moveTo(px - nx * 4, py - ny * 4).lineTo(px + nx * 4, py + ny * 4);
    g.stroke({ width: 0.55, color: T.navy, alpha: alpha * 0.9 });
    g.moveTo(px - ux * 4 - nx * 1.6, py - uy * 4 - ny * 1.6).lineTo(px - ux * 4 + nx * 1.6, py - uy * 4 + ny * 1.6);
    g.stroke({ width: 0.5, color: T.navy, alpha: alpha * 0.8 });
  }
}

export function hatch(g: Graphics, x: number, y: number, w: number, h: number, gap = 6, alpha = 0.12): void {
  for (let i = -h; i < w; i += gap) {
    const x1 = Math.max(x, x + i);
    const y1 = y + Math.max(0, -(i));
    const x2 = Math.min(x + w, x + i + h);
    const y2 = y + Math.min(h, x + w - (x + i));
    if (x1 < x + w && x2 > x) {
      g.moveTo(x1, y1).lineTo(x2, y2);
    }
  }
  g.stroke({ width: 0.5, color: T.navy, alpha });
}
