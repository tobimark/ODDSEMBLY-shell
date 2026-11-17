import { Sprite, Texture } from 'pixi.js';
import type { ToolName } from '../../../core/types';
import { line, type Pen } from './drawing';
import { toolColor } from './toolPalette';
import { DRAFT, warpOver } from './draft';

export const WEAVE = { x: 354, y: 278, w: 832, h: 420, ends: 112, fell: 698 };

/**
 * The cloth starts empty and grows upward from the take-up beam: every pick lays
 * one row at the fell, and the fell line rides up with it. Filling stops at ~80%
 * of the warp field so the beater and shuttle stay inside the frame; the next pick
 * after that starts a fresh cloth (explicit "new bolt" reset).
 */
export const CLOTH = {
  top: 278,
  bottom: 830,
  /** px of cloth per pick */
  rowH: 8,
  /** rows to reach the "full" state (≈80% of the field) */
  rowsFull: 55,
} as const;

const CLOTH_H = CLOTH.bottom - CLOTH.top;
/** Warp must reach the fell, so it runs all the way to the take-up beam. */
const WARP_H = CLOTH.bottom - WEAVE.y;
const RES = 2;
const SUB = 2;                       // px per weft line
const SUB_PER_ROW = CLOTH.rowH / SUB;

/** Eye height per shaft (warp-sprite local px); the frames sit 39 px above. */
const SHAFT_EYE = [133, 195, 257, 319];
const LIFT_PX = 22;

const shade = (hex: string, f: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

/** Blend a tool colour into the cloth's own pale base, so the weave stays light. */
const tint = (hex: string, t: number) => {
  const a = Number.parseInt(hex.slice(1), 16);
  const b = Number.parseInt('#DCD8C9', 16);
  const ch = (s: number) => Math.round((((a >> s) & 255) * t) + (((b >> s) & 255) * (1 - t)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
};

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
  private lastLifts = '';
  constructor() {
    this.warpCanvas.width = WEAVE.w * RES; this.warpCanvas.height = WARP_H * RES;
    this.clothCanvas.width = WEAVE.w * RES; this.clothCanvas.height = CLOTH_H * RES;
    this.frontCanvas.width = WEAVE.w * RES; this.frontCanvas.height = 46 * RES;
    this.f = this.frontCanvas.getContext('2d')!; this.f.scale(RES, RES);
    this.w = this.warpCanvas.getContext('2d')!; this.c = this.clothCanvas.getContext('2d')!;
    this.w.scale(RES, RES), this.c.scale(RES, RES);
    this.warp = new Sprite(Texture.from(this.warpCanvas)); this.warp.position.set(WEAVE.x, WEAVE.y); this.warp.width = WEAVE.w; this.warp.height = WARP_H;
    this.cloth = new Sprite(Texture.from(this.clothCanvas)); this.cloth.position.set(WEAVE.x, CLOTH.top); this.cloth.width = WEAVE.w; this.cloth.height = CLOTH_H;
    this.front = new Sprite(Texture.from(this.frontCanvas)); this.front.position.set(WEAVE.x, 652); this.front.width = WEAVE.w; this.front.height = 46;
    this.drawCloth(); this.update(0, 1);
  }

  /** Weave one row. Reaching the row limit clears the bolt before the next pick. */
  commit(type: ToolName) {
    if (this.picks >= CLOTH.rowsFull) { this.picks = 0; this.rows = []; }
    this.picks++;
    this.rows.unshift(type);
    this.rows.length = Math.min(CLOTH.rowsFull, this.rows.length);
    this.drawCloth();
  }

  /** 0..1 — how much of the max fill the cloth has taken. */
  get progress() { return this.picks / CLOTH.rowsFull; }
  get rowsWoven() { return this.picks; }
  get rowsFull() { return CLOTH.rowsFull; }
  /** Target cloth height in px (the scene animates up to it during take-up). */
  get height() { return Math.min(CLOTH_H, this.picks * CLOTH.rowH); }
  /** Draft row the loom is working on right now (for telemetry/tests). */
  get draftRow() { return this.picks % DRAFT.rows.length; }

  /**
   * Redraw the warp for a four-shaft shedding: every end threads its own shaft's
   * eye, and each shaft lifts by its own amount. This is the same draft the cloth
   * is generated from, so the fabric records the shed that produced it.
   */
  update(shed: number, direction: number, lifts: number[] = [0, 0, 0, 0]) {
    const sig = `${(shed * direction).toFixed(3)}|${lifts.map((n) => n.toFixed(3)).join(',')}`;
    if (sig === this.lastLifts) return;
    this.lastShed = shed * direction;
    this.lastLifts = sig;

    this.f.clearRect(0, 0, WEAVE.w, 46);
    for (let i = direction > 0 ? 0 : 1; i < WEAVE.ends; i += 2) {
      const x = 6 + i * (WEAVE.w - 12) / (WEAVE.ends - 1);
      line(this.f, [x, 0, x, 46], YARNS[Math.floor(i / 7)] + '99', .65);
    }
    this.front.texture.source.update();

    const g = this.w; g.clearRect(0, 0, WEAVE.w, WARP_H);
    const pitch = (WEAVE.w - 12) / (WEAVE.ends - 1);
    // Back shafts first, so the nearer frames read in front.
    for (let shaft = DRAFT.shafts - 1; shaft >= 0; shaft--) {
      const lift = lifts[shaft] ?? 0;
      for (let i = shaft; i < WEAVE.ends; i += DRAFT.shafts) {
        const x = 6 + i * pitch; const group = Math.floor(i / 7);
        const eyeY = SHAFT_EYE[shaft % SHAFT_EYE.length] - lift * LIFT_PX;
        const bend = (lift - .5) * 3 * direction;
        const pts = [x, 0, x, 59, x + bend, eyeY, x, WARP_H - 82, x, WARP_H];
        g.save(); g.translate(1.6, 2); line(g, pts, '#7A6F6217', 1.8); g.restore();
        const width = i % 7 === 0 ? 1.15 : i % 3 === 0 ? .85 : .65;
        line(g, pts, YARNS[group], width);
        line(g, [x - .35, 61, x - .35 + bend, eyeY, x - .35, WARP_H - 82], '#FFFFFF50', .4);
        // Each end passes through its own heddle eye on the frame.
        g.beginPath(); g.ellipse(x + bend, eyeY, 1.5, 4.2, 0, 0, Math.PI * 2); g.strokeStyle = '#8E9A9590'; g.lineWidth = .6; g.stroke();
        if (i % 2 === 0) line(g, [x + bend, eyeY - 26, x + bend, eyeY - 5], '#A7B0A870', .55);
      }
    }
    for (const x of [1, 3, WEAVE.w - 3, WEAVE.w - 1]) line(g, [x, 0, x, WARP_H], '#A9B2AD', .85);
    this.warp.texture.source.update();
  }

  /**
   * Paint only the rows that exist, bottom-aligned: the newest row sits at the
   * fell (top of the painted band), the oldest at the take-up beam.
   *
   * Every cell is decided by the draft: the end's shaft is lifted for that pick
   * (warp over weft) or it is not (weft over warp). Change the draft and the
   * cloth changes; this is not a fixed texture.
   */
  private drawCloth() {
    const g = this.c; const w = WEAVE.w;
    g.clearRect(0, 0, w, CLOTH_H);
    if (!this.picks) { this.cloth.texture.source.update(); return; }

    const subRows = Math.round(this.picks * SUB_PER_ROW);
    const top = CLOTH_H - subRows * SUB;
    g.fillStyle = '#E7E4D8'; g.fillRect(0, top, w, subRows * SUB);

    for (let s = 0; s < subRows; s++) {
      const y = CLOTH_H - (s + 1) * SUB;
      const pick = Math.floor(s / SUB_PER_ROW);              // 0 = oldest row
      const weft = this.rows[this.rows.length - 1 - pick];
      const weftColor = weft ? toolColor(weft) : '#A7B7AE';
      for (let i = 0; i < WEAVE.ends; i++) {
        const x = 5 + i * (w - 10) / WEAVE.ends;
        // One weft thread per 2 px line: the draft advances per thread, so the
        // twill diagonal comes out at 45° instead of in 8 px blocks.
        const over = warpOver(i, s);
        // The weft face carries the call's colour, but only as a tint over the
        // cloth's own base — the fabric stays pale, the calls read as banding.
        const base = over ? tint(YARNS[Math.floor(i / 7)], 0.62) : tint(weftColor, 0.34);
        const color = shade(base, over ? 0.97 : 0.96);
        g.fillStyle = '#3D414A20'; g.fillRect(x + .7, y + .7, 5.5, 1.7);
        g.fillStyle = color; g.fillRect(x, y, over ? 5.2 : 4.4, over ? 1.7 : 1.2);
        g.fillStyle = '#FFFFFF30'; g.fillRect(x, y, 4.1, .35);
      }
      // One hairline of tool colour per pick: the weft that was just laid.
      if (s % SUB_PER_ROW === 0) line(g, [0, y + 1.5, w, y + 1.5], weftColor + '55', 0.9);
    }

    for (const x of [0, 2.1, 4, w - 5, w - 3, w - 1]) line(g, [x, top, x, CLOTH_H], '#E8DDC4', 1.2);
    const shadeGrad = g.createLinearGradient(0, CLOTH_H - 24, 0, CLOTH_H);
    shadeGrad.addColorStop(0, '#7A6F6200'); shadeGrad.addColorStop(.45, '#FFFFFF18'); shadeGrad.addColorStop(1, '#7A6F621A');
    g.fillStyle = shadeGrad; g.fillRect(0, CLOTH_H - 24, w, 24);
    // The new fell edge catches light — it is the line the shuttle just beat.
    line(g, [0, top + .6, w, top + .6], '#FFFFFFB0', 1.1);
    this.cloth.texture.source.update();
  }
  destroy() { this.warp.texture.destroy(true); this.cloth.texture.destroy(true); this.front.texture.destroy(true); }
}

export const YARNS = [
  '#8E8A7E', '#697C8B', '#B6BCB5', '#DDD4BB', '#A7BCB1', '#458F93', '#33CBCC', '#A7D7CC',
  '#D1CDB8', '#83999B', '#928C7E', '#7B776B', '#8B9C9A', '#CABCA0', '#599A98', '#6F8A86',
];
