import { Container, Graphics } from 'pixi.js';
import { T } from '../theme';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: number; kind: 'dust' | 'spark' }
interface Ring { x: number; y: number; r: number; life: number; max: number; color: number }

export class Particles extends Container {
  private g = new Graphics();
  private parts: Particle[] = [];
  private rings: Ring[] = [];
  private seed = 1;

  constructor() {
    super();
    this.addChild(this.g);
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  burst(x: number, y: number, strength = 1, color: number = T.teal): void {
    const n = Math.round(6 + strength * 10);
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const sp = 18 + this.rand() * 46 * strength;
      this.parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.55 - 10,
        life: 0,
        max: 0.5 + this.rand() * 0.6,
        size: 0.7 + this.rand() * 1.6,
        color,
        kind: this.rand() > 0.72 ? 'spark' : 'dust',
      });
    }
  }

  ring(x: number, y: number, color: number = T.teal, size = 26): void {
    this.rings.push({ x, y, r: 3, life: 0, max: 0.75 + size / 120, color });
  }

  update(dt: number): void {
    const g = this.g;
    g.clear();
    for (const p of this.parts) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
      p.vx *= 0.985;
      const k = 1 - p.life / p.max;
      if (k <= 0) continue;
      if (p.kind === 'spark') {
        g.moveTo(p.x, p.y).lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02)
          .stroke({ width: 0.7, color: T.teal, alpha: 0.55 * k });
      } else {
        g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: 0.18 * k });
      }
    }
    this.parts = this.parts.filter((p) => p.life < p.max);

    for (const r of this.rings) {
      r.life += dt;
      const k = 1 - r.life / r.max;
      if (k <= 0) continue;
      g.circle(r.x, r.y, r.r + (1 - k) * 46).stroke({ width: 1.0, color: r.color, alpha: 0.35 * k });
    }
    this.rings = this.rings.filter((r) => r.life < r.max);
  }
}
