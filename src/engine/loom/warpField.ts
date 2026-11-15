import { Sprite, Texture } from 'pixi.js';
import { FABRIC } from '../layout';
import { WARP_COLORS } from '../theme';
import type { ToolName } from '../events/types';

const RES = 2;
const W = FABRIC.w;
const H = FABRIC.h;
const ENDS = FABRIC.ends;
const PITCH = FABRIC.pitch;

/** local y landmarks (canvas space: 0 = warp beam, H = bottom beam) */
const Y_BEAM = 2;
const Y_LEASE_1 = 60;
const Y_LEASE_2 = 80;
const Y_EYE_A = 190;
const Y_EYE_B = 286;
const Y_REED = 420;
const Y_CLOTH_TOP = 442;
const ROW_H = 5.4;
const ROWS_MAX = Math.floor((H - Y_CLOTH_TOP - 6) / ROW_H);

interface WeaveRow { type: ToolName; index: number; shade: number }

export class WarpField {
  readonly sprite: Sprite;
  private readonly clothSprite: Sprite;
  private readonly warpCanvas = document.createElement('canvas');
  private readonly clothCanvas = document.createElement('canvas');
  private readonly wctx: CanvasRenderingContext2D;
  private readonly cctx: CanvasRenderingContext2D;
  private readonly warpTex: Texture;
  private readonly clothTex: Texture;

  private shaftA = 0;
  private shaftB = 0;
  private targetA = 0;
  private targetB = 0;
  private scan = -1;
  private scanStrength = 0;
  private tension = 0;
  private pulseY = -1;
  private t = 0;
  private dirtyCloth = true;
  private rows: WeaveRow[] = [];

  private readonly threads: { x: number; color: string; phase: number; parity: number; sag: number }[] = [];

  constructor() {
    this.warpCanvas.width = W * RES;
    this.warpCanvas.height = H * RES;
    this.clothCanvas.width = W * RES;
    this.clothCanvas.height = H * RES;
    this.wctx = this.warpCanvas.getContext('2d')!;
    this.cctx = this.clothCanvas.getContext('2d')!;
    this.wctx.scale(RES, RES);
    this.cctx.scale(RES, RES);

    for (let i = 0; i < ENDS; i++) {
      const c = WARP_COLORS[i % WARP_COLORS.length];
      this.threads.push({
        x: 1.6 + i * PITCH,
        color: `#${c.toString(16).padStart(6, '0')}`,
        phase: (i * 0.618) % 1,
        parity: i % 2,
        sag: 0.4 + ((i * 7) % 11) * 0.06,
      });
    }

    // start with a woven base so the machine reads as working
    const seed: ToolName[] = ['Edit', 'Write', 'Bash', 'Search', 'Read', 'Edit', 'Write'];
    for (let i = 0; i < 40; i++) {
      const type = seed[(i * 5 + 2) % seed.length];
      this.rows.push({ type, index: i, shade: type === 'Bash' ? 0.85 : type === 'Read' ? 0.12 : 0.45 });
    }

    this.warpTex = Texture.from(this.warpCanvas);
    this.warpTex.source.scaleMode = 'linear';
    this.clothTex = Texture.from(this.clothCanvas);
    this.clothTex.source.scaleMode = 'linear';
    this.sprite = new Sprite(this.warpTex);
    this.sprite.width = W; this.sprite.height = H;
    this.clothSprite = new Sprite(this.clothTex);
    this.clothSprite.width = W; this.clothSprite.height = H;
  }

  get display(): Sprite[] { return [this.sprite, this.clothSprite]; }

  setShafts(a: number, b: number): void { this.targetA = a; this.targetB = b; }

  trigger(type: ToolName, rowIndex: number): void {
    if (type === 'Bash') { this.tension = 1; this.pulseY = Y_CLOTH_TOP - 12; }
    else if (type === 'Write') { this.tension = 0.7; this.pulseY = Y_CLOTH_TOP - 16; }
    else if (type === 'Edit') { this.tension = 0.45; this.pulseY = Y_CLOTH_TOP - 22; }
    else if (type === 'Read') { this.scan = 0; this.scanStrength = 1; }
    else { this.scan = 1; this.scanStrength = 0.8; }
    if (type !== 'Read') this.addRow(type, rowIndex);
  }

  addRow(type: ToolName, index: number): void {
    const shades: Record<ToolName, number> = { Read: 0.12, Edit: 0.7, Write: 0.5, Bash: 0.85, Search: 0.35 };
    this.rows.push({ type, index, shade: shades[type] });
    if (this.rows.length > ROWS_MAX) this.rows.shift();
    this.dirtyCloth = true;
  }

  update(dt: number, speed: number): void {
    this.t += dt * (0.6 + speed * 0.9);
    this.shaftA += (this.targetA - this.shaftA) * Math.min(1, dt * 10);
    this.shaftB += (this.targetB - this.shaftB) * Math.min(1, dt * 10);
    this.tension = Math.max(0, this.tension - dt * 1.5);
    if (this.scan >= 0) {
      this.scan += dt * (0.85 + speed * 0.5);
      if (this.scan > 1.15) { this.scan = -1; this.scanStrength = 0; }
    }
    if (this.pulseY >= 0) {
      this.pulseY += dt * 48;
      if (this.pulseY > H) this.pulseY = -1;
    }
    this.renderWarp();
    this.warpTex.source.update();
    if (this.dirtyCloth) { this.renderCloth(); this.dirtyCloth = false; }
  }

  private clothTopY(): number {
    const n = Math.min(this.rows.length, ROWS_MAX);
    return H - 5 - n * ROW_H;
  }

  private renderWarp(): void {
    const g = this.wctx;
    g.clearRect(0, 0, W, H);

    // fabric bed
    g.fillStyle = 'rgba(246,241,233,0.55)';
    g.fillRect(0, 0, W, H);

    const clothTop = this.clothTopY();
    const scanY = this.scan >= 0 ? Y_CLOTH_TOP - 20 + this.scan * (H - Y_CLOTH_TOP + 20) : -999;

    for (const th of this.threads) {
      const up = th.parity === 0;
      const eyeTarget = up ? Y_EYE_A + this.shaftA : Y_EYE_B + this.shaftB;
      const eye = eyeTarget + Math.sin(this.t * 1.3 + th.phase * 6.28) * 0.4;
      const sway = Math.sin(this.t * 0.7 + th.phase * 6.28) * 0.5;
      const x = th.x;
      const zig = up ? 0.9 : -0.9;

      const path = (ox: number, oy: number, color: string, width: number, alpha: number) => {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.globalAlpha = alpha;
        g.beginPath();
        g.moveTo(x + ox, Y_BEAM + oy);
        // lease rods: alternate threads cross slightly
        g.lineTo(x + ox + (up ? 0.42 : -0.42), Y_LEASE_1 + oy);
        g.lineTo(x + ox + (up ? -0.32 : 0.32), Y_LEASE_2 + oy);
        // sag to the heddle eye
        g.quadraticCurveTo(x + ox + sway * 0.4, (Y_LEASE_2 + eye) / 2 + oy + th.sag, x + ox + zig, eye + oy);
        // through the reed
        g.lineTo(x + ox, Y_REED + oy);
        // to the fell of the cloth
        g.lineTo(x + ox, clothTop + oy);
        g.stroke();
      };

      path(0.9, 0.9, 'rgba(23,28,96,0.10)', 1.2, 0.9);
      path(0, 0, th.color, 1.15, 1.0);

      if (this.tension > 0.01) {
        const a = this.tension * (0.16 + 0.12 * Math.sin(th.phase * 9 + this.t * 5));
        g.globalAlpha = Math.max(0, a);
        g.strokeStyle = '#33CBCC';
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(x, Math.max(0, this.pulseY - 50));
        g.lineTo(x, Math.min(H, this.pulseY + 50));
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    // heddle eyes on both shafts
    for (const [rowY, off] of [[Y_EYE_A, this.shaftA], [Y_EYE_B, this.shaftB]] as const) {
      for (const th of this.threads) {
        if ((th.parity === 0) !== (rowY === Y_EYE_A)) continue;
        g.strokeStyle = 'rgba(23,28,96,0.5)';
        g.lineWidth = 0.55;
        g.beginPath();
        g.ellipse(th.x, rowY + off, 1.5, 2.0, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }

    // selvedges
    for (const x of [1.2, W - 1.2]) {
      g.strokeStyle = 'rgba(23,28,96,0.42)';
      g.lineWidth = 1.5;
      g.globalAlpha = 0.8;
      g.beginPath(); g.moveTo(x, Y_BEAM); g.lineTo(x, H); g.stroke();
    }
    g.globalAlpha = 1;

    // reed dents (fine vertical wires near the reed line)
    g.strokeStyle = 'rgba(23,28,96,0.16)';
    g.lineWidth = 0.5;
    for (let i = 0; i < ENDS; i += 1) {
      const x = 1.6 + i * PITCH;
      g.beginPath(); g.moveTo(x, Y_REED - 10); g.lineTo(x, Y_REED + 10); g.stroke();
    }

    // soft light bands across the warp (window light / atmosphere)
    for (const [y0, y1, a] of [[118, 152, 0.05], [300, 340, 0.045], [470, 500, 0.04]] as const) {
      const gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, `rgba(255,255,255,${a})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, y0, W, y1 - y0);
    }
    // diagonal sheen
    const sheen = g.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0, 'rgba(255,255,255,0.06)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(23,28,96,0.035)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, W, H);

    // scanning band
    if (this.scan >= 0) {
      const grad = g.createLinearGradient(0, scanY - 26, 0, scanY + 26);
      grad.addColorStop(0, 'rgba(51,203,204,0)');
      grad.addColorStop(0.5, `rgba(51,203,204,${0.14 * this.scanStrength})`);
      grad.addColorStop(1, 'rgba(51,203,204,0)');
      g.fillStyle = grad;
      g.fillRect(0, scanY - 26, W, 52);
      g.strokeStyle = `rgba(31,143,146,${0.5 * this.scanStrength})`;
      g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(0, scanY); g.lineTo(W, scanY); g.stroke();
    }

    // top shaft shadow / beam shade
    const topShade = g.createLinearGradient(0, 0, 0, 34);
    topShade.addColorStop(0, 'rgba(23,28,96,0.10)');
    topShade.addColorStop(1, 'rgba(23,28,96,0)');
    g.fillStyle = topShade;
    g.fillRect(0, 0, W, 34);
  }

  private renderCloth(): void {
    const g = this.cctx;
    g.clearRect(0, 0, W, H);
    const visible = this.rows.slice(-ROWS_MAX);
    const baseY = H - 5 - visible.length * ROW_H;
    const clothTop = baseY;

    // cloth ground
    g.fillStyle = 'rgba(248,243,235,0.97)';
    g.fillRect(0, clothTop, W, H - clothTop);

    for (let r = 0; r < visible.length; r++) {
      const row = visible[r];
      const y = baseY + r * ROW_H;
      const tint = row.type === 'Edit' ? 'rgba(23,28,96,0.035)'
        : row.type === 'Write' ? 'rgba(51,203,204,0.05)'
          : row.type === 'Bash' ? 'rgba(34,38,63,0.045)'
            : row.type === 'Search' ? 'rgba(155,179,168,0.045)'
              : 'rgba(142,155,179,0.025)';
      g.fillStyle = tint;
      g.fillRect(0, y, W, ROW_H);
      if (r % 3 === 0) {
        g.fillStyle = 'rgba(206,190,164,0.08)';
        g.fillRect(0, y, W, ROW_H * 0.5);
      }

      // weft pick
      g.strokeStyle = 'rgba(23,28,96,0.22)';
      g.lineWidth = 0.55;
      g.beginPath();
      g.moveTo(0, y + ROW_H * 0.46);
      g.lineTo(W, y + ROW_H * 0.54);
      g.stroke();

      // twill diagonal accent
      g.strokeStyle = 'rgba(23,28,96,0.06)';
      g.lineWidth = 0.5;
      for (let i = 0; i < ENDS; i += 8) {
        const x = 1.6 + i * PITCH;
        g.beginPath(); g.moveTo(x, y + ROW_H); g.lineTo(x + 14, y); g.stroke();
      }

      // warp stitches (over/under twill)
      for (let i = 0; i < ENDS; i++) {
        const x = 1.6 + i * PITCH;
        const th = this.threads[i];
        const over = ((i + r * 2) % 4) < 2;
        g.strokeStyle = over ? th.color : 'rgba(23,28,96,0.16)';
        g.globalAlpha = over ? 0.55 : 0.35;
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(x, y + 0.5);
        g.lineTo(x, y + ROW_H - 0.5);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    // fell line (cloth edge)
    g.strokeStyle = 'rgba(23,28,96,0.35)';
    g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(0, clothTop); g.lineTo(W, clothTop); g.stroke();
    // fringe
    g.strokeStyle = 'rgba(23,28,96,0.18)';
    g.lineWidth = 0.5;
    for (let i = 0; i < ENDS; i += 2) {
      const x = 1.6 + i * PITCH;
      g.beginPath(); g.moveTo(x, clothTop); g.lineTo(x + 0.6, clothTop - 2.5); g.stroke();
    }

    // selvedge edges
    for (const x of [1.2, W - 1.2]) {
      g.strokeStyle = 'rgba(23,28,96,0.38)';
      g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x, clothTop); g.lineTo(x, H); g.stroke();
    }

    // vertical shading across cloth
    const sh = g.createLinearGradient(0, clothTop, 0, H);
    sh.addColorStop(0, 'rgba(23,28,96,0.02)');
    sh.addColorStop(0.6, 'rgba(23,28,96,0)');
    sh.addColorStop(1, 'rgba(23,28,96,0.10)');
    g.fillStyle = sh;
    g.fillRect(0, clothTop, W, H - clothTop);

    // bottom take-up shadow
    const grad = g.createLinearGradient(0, H - 40, 0, H);
    grad.addColorStop(0, 'rgba(23,28,96,0)');
    grad.addColorStop(1, 'rgba(23,28,96,0.12)');
    g.fillStyle = grad;
    g.fillRect(0, H - 40, W, 40);

    this.clothTex.source.update();
  }
}
