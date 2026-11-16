import { Sprite, Texture } from 'pixi.js';
import type { ToolName } from '../../events/types';
import { C, line, type Pen } from './drawing';

export const WEAVE = { x: 354, y: 278, w: 832, h: 420, ends: 192, fell: 698 };
export const YARNS = ['#303B66', '#697C8B', '#B6BCB5', '#DDD4BB', '#A7BCB1', '#458F93', '#33CBCC', '#A7D7CC', '#D1CDB8', '#83999B', '#526D80', '#29345D', '#8B9C9A', '#CABCA0', '#599A98', '#2E6378'];
const RES = 2;
export class Textile {
  readonly warp: Sprite;
  readonly cloth: Sprite;
  readonly front: Sprite;
  private warpCanvas = document.createElement('canvas');
  private clothCanvas = document.createElement('canvas');
  private frontCanvas = document.createElement('canvas');
  private f: Pen;
  private w: Pen;
  private c: Pen;
  private rows: ToolName[] = [];
  private picks = 0;
  private lastShed = -1;
  constructor() {
    this.warpCanvas.width = WEAVE.w * RES; this.warpCanvas.height = WEAVE.h * RES;
    this.clothCanvas.width = WEAVE.w * RES; this.clothCanvas.height = 146 * RES;
    this.frontCanvas.width = WEAVE.w * RES; this.frontCanvas.height = 46 * RES;
    this.f = this.frontCanvas.getContext('2d')!; this.f.scale(RES, RES);
    this.w = this.warpCanvas.getContext('2d')!; this.c = this.clothCanvas.getContext('2d')!;
    this.w.scale(RES, RES); this.c.scale(RES, RES);
    this.warp = new Sprite(Texture.from(this.warpCanvas)); this.warp.position.set(WEAVE.x, WEAVE.y); this.warp.width = WEAVE.w; this.warp.height = WEAVE.h;
    this.cloth = new Sprite(Texture.from(this.clothCanvas)); this.cloth.position.set(WEAVE.x, WEAVE.fell); this.cloth.width = WEAVE.w; this.cloth.height = 146;
    this.front = new Sprite(Texture.from(this.frontCanvas)); this.front.position.set(WEAVE.x, 652); this.front.width = WEAVE.w; this.front.height = 46;
    this.drawCloth(); this.update(0, 1);
  }
  commit(type: ToolName) { this.picks++; this.rows.unshift(type); this.rows.length = Math.min(64, this.rows.length); this.drawCloth(); }
  update(shed: number, direction: number) {
    if (Math.abs(this.lastShed - shed * direction) < .001) return;
    this.lastShed = shed * direction;
    this.f.clearRect(0, 0, WEAVE.w, 46);
    for (let i = direction > 0 ? 0 : 1; i < WEAVE.ends; i += 2) {
      const x = 6 + i * (WEAVE.w - 12) / (WEAVE.ends - 1);
      line(this.f, [x, 0, x, 46], YARNS[Math.floor(i / 12)] + '99', .65);
    }
    this.front.texture.source.update();
    const g = this.w; g.clearRect(0, 0, WEAVE.w, WEAVE.h);
    // Back warp is laid first; the front sheet closes over it at the fell.
    for (const parity of [1, 0]) {
      for (let i = parity; i < WEAVE.ends; i += 2) {
        const pitch = (WEAVE.w - 12) / (WEAVE.ends - 1);
        const x = 6 + i * pitch; const group = Math.floor(i / 12);
        const front = parity === 0;
        const lift = shed * (front ? -19 : 19) * direction;
        const eyeY = (front ? 162 : 272) + lift;
        const bend = shed * (front ? -1.5 : 1.5);
        const pts = [x, 0, x, 59, x + bend, eyeY, x, 370, x, 420];
        g.save(); g.translate(1.6, 2); line(g, pts, '#171C6017', 1.8); g.restore();
        const width = i % 12 === 0 ? 1.65 : i % 3 === 0 ? 1.1 : .8;
        line(g, pts, YARNS[group], width);
        line(g, [x - .35, 61, x - .35 + bend, eyeY, x - .35, 370], '#FFFFFF50', .4);
        // Each end passes through a heddle eye, rather than terminating at a beam.
        g.beginPath(); g.ellipse(x + bend, eyeY, 1.5, 4.2, 0, 0, Math.PI * 2); g.strokeStyle = '#5D6D7B90'; g.lineWidth = .6; g.stroke();
        if (i % 2 === 0) line(g, [x + bend, eyeY - 26, x + bend, eyeY - 5], '#7D8E9970', .55);
      }
    }
    for (const x of [1, 3, WEAVE.w - 3, WEAVE.w - 1]) line(g, [x, 0, x, 420], '#576E74', .85);
    this.warp.texture.source.update();
  }
  private drawCloth() {
    const g = this.c; const w = WEAVE.w; g.clearRect(0, 0, w, 170);
    g.fillStyle = '#D2D1BE'; g.fillRect(0, 0, w, 170);
    const eventColors: Record<ToolName, string> = { Read: '#A7BAB8', Edit: '#4A6175', Write: '#33CBCC', Bash: '#171C60', Search: '#BCAC8E' };
    // 2/2 broken twill. The diamond repeat is woven from the same warp palette.
    for (let r = 0; r < 73; r++) {
      const y = r * 2; const globalRow = r - this.picks;
      const weft = this.rows[Math.floor(r / 2)];
      line(g, [0, y + 1.2, w, y + 1.2], weft ? eventColors[weft] : '#A7B7AE', 1.3);
      for (let i = 0; i < WEAVE.ends; i++) {
        const x = 5 + i * (w - 10) / WEAVE.ends;
        const mx = Math.abs((i % 48) - 24); const my = Math.abs(((globalRow % 64 + 64) % 64) - 32) * .75;
        const diamond = mx + my;
        const band = diamond > 16 && diamond < 23 || diamond > 31 && diamond < 36;
        const over = ((i + (i % 48 < 24 ? globalRow : -globalRow)) % 4 + 4) % 4 < 2;
        let color = band ? C.navy : diamond < 15 ? (i % 48 < 24 ? '#458F93' : '#78B9AE') : YARNS[Math.floor(i / 12)];
        if (!over) color = band ? '#617084' : '#C5C9B7';
        g.fillStyle = '#343D4E24'; g.fillRect(x + .7, y + .7, 3.3, 1.7);
        g.fillStyle = color; g.fillRect(x, y, over ? 2.7 : 3.6, over ? 1.8 : .85);
        g.fillStyle = '#FFFFFF30'; g.fillRect(x, y, 2.2, .35);
      }
    }
    // Reinforced selvedge; subtle curled edge belongs to the cloth, not a UI border.
    for (const x of [0, 2.1, 4, w - 5, w - 3, w - 1]) line(g, [x, 0, x, 170], '#E8DDC4', 1.2);
    const shade = g.createLinearGradient(0, 122, 0, 146); shade.addColorStop(0, '#171C6000'); shade.addColorStop(.45, '#FFFFFF18'); shade.addColorStop(1, '#171C6066');
    g.fillStyle = shade; g.fillRect(0, 122, w, 24);
    this.cloth.texture.source.update();
  }
  destroy() { this.warp.texture.destroy(true); this.cloth.texture.destroy(true); this.front.texture.destroy(true); }
}
