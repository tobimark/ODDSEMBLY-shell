/** Programmatic material art for the Chips world. Everything is baked once. */
import { Sprite, Texture } from 'pixi.js';
import {
  C, arc, bearing, bolt, cachedTexture, chip, chipStack, circle, CHIP_COLORS,
  dashLine, dotField, ellipse, hatch, label, line, metal, paper, paperCard, PALETTE,
  plate, poly, rect, ring, serif, shadow, sheetMarks, surface, tickRing, tracked, washi, toolGlyph,
} from '../../core/drawing';
import { LAYOUT, CARD_STOCK, handSlot } from './layout';
import type { ToolName } from '../../core/types';
import { FAMILIES, TOOL_NOTES } from './cards';

const W = 1472;
const H = 1008;

/** The exhibition sheet: warm paper, faint catalogue arc, ledger rails. */
export function chipsBackdrop(): Sprite {
  return surface(W, H, (g) => {
    paper(g, W, H, { dots: true, dotGap: 16, vignette: true, seed: 41 });
    // Shared catalogue gesture: a huge etched arc leaving the left edge.
    const cx = 46; const cy = 664;
    for (const r of [318, 330, 344, 620, 646]) {
      g.save();
      g.beginPath(); g.arc(cx, cy, r, -Math.PI * 0.78, Math.PI * 0.26);
      g.strokeStyle = r > 400 ? '#8C918438' : '#8C918455'; g.lineWidth = r > 400 ? 0.6 : 0.9; g.stroke();
      g.restore();
    }
    // radial tick belt on the big etched ring
    for (let i = 0; i <= 42; i++) {
      const a = -Math.PI * 0.72 + (i / 42) * Math.PI * 1.0;
      const major = i % 6 === 0;
      const r0 = 620 - (major ? 16 : 8);
      line(g, [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * 646, cy + Math.sin(a) * 646], major ? '#8C918466' : '#8C918433', major ? 1 : 0.6);
    }
    // sparse compass dots along the arc band
    for (let i = 0; i < 30; i++) {
      const a = -Math.PI * 0.75 + (i / 30) * Math.PI * 1.1;
      circle(g, cx + Math.cos(a) * 634, cy + Math.sin(a) * 634, 1.1, '#FFFFFF');
      circle(g, cx + Math.cos(a) * 634, cy + Math.sin(a) * 634, 1.7, '#00000000', '#8C918433', 0.5);
    }
    // soft contact shadow under the table
    g.save(); g.filter = 'blur(18px)'; rect(g, LAYOUT.table.x + 14, LAYOUT.table.y + 20, LAYOUT.table.w - 10, LAYOUT.table.h - 6, '#2A24181A', 30); g.restore();
    sheetMarks(g, W, H, { label: 'FIG. 02', sub: 'THE CALL BECOMES A CARD.', right: 'EVENT-DRIVEN / SERIES 02' });
    // engraved bottom ruler (shared with the reference catalogue sheets)
    const ry = 926;
    line(g, [40, ry, W - 40, ry], '#9AA09A66', 0.8);
    for (let x = 40, i = 0; x <= W - 40; x += 12, i++) {
      const h = i % 5 === 0 ? 7 : 3.5;
      line(g, [x, ry, x, ry + h], '#9AA09A66', i % 5 === 0 ? 0.9 : 0.55);
    }
    for (let i = 0, x = 40; x <= W - 40; x += 120, i++) label(g, String(i).padStart(2, '0'), x, ry + 17, 6, '#9AA09A');
    // quiet margin note
    label(g, 'CHIPS / A TABLE FOR TOOL CALLS', 42, 158, 9, '#8B9398');
    line(g, [40, 166, 206, 166], '#AAB1B251', 0.7);
    // vertical catalogue tag on the left margin
    g.save(); g.translate(58, 560); g.rotate(-Math.PI / 2);
    tracked(g, '02 / CHIPS · THE CALL BECOMES A CARD', 0, 0, 7.5, '#9AA09A99', 3.2, 'left');
    g.restore();
    line(g, [76, 262, 76, 448], '#AAB1B244', 0.7);
  });
}

/** Light paper table with a stitched rail, slot ghosts and a faint weave field. */
export function tableSurface(): Sprite {
  const { w, h } = LAYOUT.table;
  return surface(w, h, (g) => {
    // linen board body
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#F4EEE2'); grad.addColorStop(0.5, '#EFE7D8'); grad.addColorStop(1, '#E9DFCC');
    rect(g, 0, 0, w, h, grad, 26, '#A79F8B');
    // inner field
    const fx = LAYOUT.felt.x - LAYOUT.table.x; const fy = LAYOUT.felt.y - LAYOUT.table.y;
    shadow(g, fx + 3, fy + 5, LAYOUT.felt.w, LAYOUT.felt.h, 18, '#5C513C1C', 10);
    const field = g.createLinearGradient(fx, fy, fx + LAYOUT.felt.w, fy + LAYOUT.felt.h);
    field.addColorStop(0, '#FCF8EF'); field.addColorStop(0.55, '#F8F2E6'); field.addColorStop(1, '#F1E9DA');
    rect(g, fx, fy, LAYOUT.felt.w, LAYOUT.felt.h, field, 18, '#B3A992');
    // fine weave field: faint diagonal threads
    g.save(); rect(g, fx + 8, fy + 8, LAYOUT.felt.w - 16, LAYOUT.felt.h - 16, '#00000000', 14); g.clip();
    for (let d = -LAYOUT.felt.h; d < LAYOUT.felt.w + LAYOUT.felt.h; d += 5) {
      line(g, [fx + d, fy, fx + d + LAYOUT.felt.h, fy + LAYOUT.felt.h], '#8E826522', 0.5);
      line(g, [fx + d, fy + LAYOUT.felt.h, fx + d + LAYOUT.felt.h, fy], '#FFFFFF55', 0.5);
    }
    g.restore();
    // stitched rail: double line with dashes
    const rail = 22;
    g.save(); g.setLineDash([7, 5]);
    rect(g, rail, rail, w - rail * 2, h - rail * 2, '#00000000', 18);
    g.strokeStyle = '#8A7C5F'; g.lineWidth = 1.1; g.stroke(); g.restore();
    rect(g, rail - 6, rail - 6, w - (rail - 6) * 2, h - (rail - 6) * 2, '#00000000', 20, '#C6BCA5');
    // brass corner plates
    for (const [x, y, sx, sy] of [[14, 14, 1, 1], [w - 14, 14, -1, 1], [14, h - 14, 1, -1], [w - 14, h - 14, -1, -1]] as const) {
      g.save(); g.translate(x, y); g.scale(sx, sy);
      poly(g, [0, 0, 74, 0, 74, 16, 52, 16, 52, 40, 16, 40, 16, 74, 0, 74], '#B08A5B', '#7E5E35');
      poly(g, [3, 3, 68, 3, 68, 12, 47, 12, 47, 35, 12, 35, 12, 68, 3, 68], '#D9BD8C', '#EFE0C0');
      bolt(g, 9, 9, 2.4); bolt(g, 30, 9, 2.2); bolt(g, 9, 30, 2.2);
      g.restore();
    }
    // slot ghosts
    for (let i = 0; i < 5; i++) {
      const s = handSlot(i);
      const lx = s.x - LAYOUT.table.x; const ly = s.y - LAYOUT.table.y;
      g.save(); g.translate(lx, ly); g.rotate(s.rot);
      const cw = LAYOUT.card.w; const ch = LAYOUT.card.h;
      rect(g, -cw / 2, -ch / 2, cw, ch, '#00000008', 8, '#B9AF98');
      rect(g, -cw / 2 + 4, -ch / 2 + 4, cw - 8, ch - 8, '#00000000', 6, '#CFC6B2');
      // corner ticks
      line(g, [-cw / 2, -ch / 2 + 12, -cw / 2, -ch / 2 + 2, -cw / 2 + 10, -ch / 2], '#96896E', 0.7);
      line(g, [cw / 2, ch / 2 - 12, cw / 2, ch / 2 - 2, cw / 2 - 10, ch / 2], '#96896E', 0.7);
      label(g, String(i + 1).padStart(2, '0'), 0, ch / 2 - 8, 6, '#B0A487', 'center');
      g.restore();
    }
    // teal thread woven through the slots
    g.save(); g.setLineDash([4, 4]);
    line(g, [LAYOUT.felt.x - LAYOUT.table.x + 26, LAYOUT.hand.y - LAYOUT.table.y + 96, LAYOUT.felt.x - LAYOUT.table.x + LAYOUT.felt.w - 26, LAYOUT.hand.y - LAYOUT.table.y + 96], '#2AA7AA55', 1);
    g.restore();
    // faint call lanes: the dealer shoe feeds the five seats
    for (let i = 0; i < 5; i++) {
      const s = handSlot(i);
      const ex = s.x - LAYOUT.table.x; const ey = s.y - LAYOUT.table.y + 34;
      g.save(); g.setLineDash([3, 5]);
      g.beginPath(); g.moveTo(112, 316);
      const mx = (112 + ex) / 2; const my = Math.min(316, ey) - 30 - Math.abs(i - 2) * 6;
      g.quadraticCurveTo(mx, my, ex, ey);
      g.strokeStyle = '#2AA7AA2E'; g.lineWidth = 0.8; g.stroke();
      g.restore();
      circle(g, ex, ey, 1.6, '#2AA7AA66');
    }
    // brass clamp brackets at the left/right mid-rails
    for (const [x, y] of [[10, 208], [w - 10, 208], [10, 430], [w - 10, 430]] as const) {
      g.save(); g.translate(x, y); if (x > w / 2) g.scale(-1, 1);
      poly(g, [0, -14, 26, -14, 26, 14, 0, 14, 0, 6, 16, 6, 16, -6, 0, -6], '#B08A5B', '#7E5E35');
      poly(g, [2, -11, 22, -11, 22, 11, 2, 11, 2, 3, 14, 3, 14, -3, 2, -3], '#E2C896', '#F4E6C8');
      bolt(g, 6, 0, 2.2); g.restore();
    }
    // pot bowl under the hand: where the hand's chips are gathered before scoring
    const px = w / 2; const py = 474;
    ellipse(g, px, py + 16, 118, 20, '#5C513C18');
    ellipse(g, px, py, 112, 46, '#D9CBAD', '#A79C85');
    ellipse(g, px, py - 2, 100, 38, '#C9B995', '#8F836C');
    ellipse(g, px, py + 2, 92, 32, '#3A3222', '#1F1B12');
    // a few resting chips
    for (const [dx, dy, col] of [[-38, 2, '#2A3A78'], [8, -4, '#2AA7AA'], [46, 4, '#B28D5E'], [-8, 8, '#2A3A78'], [30, 10, '#D9CFBA']] as const) {
      ellipse(g, px + dx, py + dy, 16, 7, col, '#00000044');
      ellipse(g, px + dx, py + dy - 2, 14, 6, col, '#FFFFFF22');
    }
    tracked(g, 'POT', px, py + 26, 6, '#E8DCC2', 2.2, 'center');
    // centre watermark medallion
    const wxC = w / 2; const wyC = 150;
    for (const r of [86, 76, 52]) { g.save(); g.beginPath(); g.arc(wxC, wyC, r, 0, Math.PI * 2); g.strokeStyle = '#171C6012'; g.lineWidth = 0.9; g.stroke(); g.restore(); }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r0 = i % 4 === 0 ? 76 : 81;
      line(g, [wxC + Math.cos(a) * r0, wyC + Math.sin(a) * r0, wxC + Math.cos(a) * 86, wyC + Math.sin(a) * 86], '#171C6018', 0.7);
    }
    tracked(g, 'KUNLUNMETA', wxC, wyC + 6, 11, '#171C6018', 5, 'center');
    label(g, 'TOOL-CALL TABLE / KH-02', wxC, wyC + 26, 7, '#171C601A', 'center');
    // family legend, vertical, upper-left of the field (clear of the shoe and gauge)
    FAMILIES.forEach((f, i) => {
      const x = 26; const y = 84 + i * 19;
      rect(g, x, y - 12, 194, 16, '#171C6007', 3, '#C3BAA5');
      toolGlyph(g, f, x + 12, y - 3, 11, '#5C5A4E');
      label(g, f.toUpperCase(), x + 23, y + 1, 7.2, '#5C5A4E');
      label(g, TOOL_NOTES[f], x + 82, y + 1, 5.8, '#8C8676');
    });
    label(g, 'DEALER: KUNLUNMETA · NO REAL MONEY, ONLY TOKENS', w - 34, h - 40, 6.5, '#8C8676', 'right');
    // bottom rail ruler and serial
    const ry = h - 20;
    line(g, [30, ry, w - 30, ry], '#A79E8888', 0.7);
    for (let x = 30, i = 0; x <= w - 30; x += 9, i++) {
      line(g, [x, ry, x, ry - (i % 5 === 0 ? 6 : 3)], '#A79E8866', i % 5 === 0 ? 0.8 : 0.5);
    }
    label(g, 'KH-02 · TABLE FOR TOOL CALLS · 45 CARDS', w / 2, ry - 12, 5.6, '#A39C89', 'center');
  });
}

/** Hand ledger plaque. Labels are baked; numbers are live Pixi Text. */
export function scoreBoard(): Sprite {
  const { w, h } = LAYOUT.board;
  return surface(w, h, (g) => {
    paperCard(g, 0, 0, w, h, { r: 14, fill: '#FCF8EE', stroke: '#AFA690', ticks: false, shadowBlur: 18 });
    // engraved title strip
    line(g, [16, 34, w - 16, 34], '#B7AE99', 0.7);
    tracked(g, 'HAND LEDGER', 20, 24, 9, '#6F6A5B', 3.4);
    label(g, '第 · 手', 168, 24, 8, '#8C8676');
    label(g, 'SERIES 02 / TABLE KH-02', w - 20, 24, 6.5, '#9B9585', 'right');
    // recessed wells
    const well = (x: number, y: number, ww: number, hh: number, title: string, sub: string) => {
      const grd = g.createLinearGradient(x, y, x, y + hh);
      grd.addColorStop(0, '#E8E1D1'); grd.addColorStop(0.18, '#F4EEE1'); grd.addColorStop(1, '#F8F3E8');
      rect(g, x + 1, y + 2, ww, hh, '#2A241810', 8);
      rect(g, x, y, ww, hh, grd, 8, '#B9B09A');
      rect(g, x + 3, y + 3, ww - 6, hh - 6, '#00000000', 6, '#D6CFBC');
      label(g, title, x + 10, y + 16, 7, '#837C6A');
      label(g, sub, x + 10, y + hh - 10, 6, '#A39C89');
      // corner ticks
      line(g, [x + 6, y + hh - 12, x + 6, y + hh - 6, x + 12, y + hh - 6], '#9B9585', 0.6);
      line(g, [x + ww - 6, y + 6, x + ww - 12, y + 6], '#9B9585', 0.6);
    };
    // hand number
    well(16, 48, 120, 88, 'HAND', '本手');
    // score (largest)
    well(148, 48, 246, 88, 'SCORE / 得分', '累计');
    // chips
    well(406, 48, 100, 88, 'CHIPS', '筹码');
    // multiplier
    well(518, 48, 84, 88, 'MULT', '倍率');
    // hand dots + target
    label(g, '本手', 20, 160, 7, '#837C6A');
    for (let i = 0; i < 5; i++) {
      circle(g, 54 + i * 22, 157, 6.2, '#EEE7D7', '#A79E88', 0.9);
      circle(g, 54 + i * 22, 157, 2.2, '#C9C2AE');
    }
    label(g, 'QUOTA / 目标', w - 20, 160, 7, '#837C6A', 'right');
    // screws
    for (const [x, y] of [[9, 9], [w - 9, 9], [9, h - 9], [w - 9, h - 9]] as const) bolt(g, x, y, 2.8);
  });
}

/** Face-down card back: navy stock with a fine teal guilloche. */
export function cardBackTexture(): Texture {
  return cachedTexture('chips:card-back', 118, 170, (g) => {
    rect(g, 0, 0, 118, 170, CARD_STOCK.paperA, 8, '#A79E88');
    const grad = g.createLinearGradient(0, 0, 118, 170);
    grad.addColorStop(0, '#232A72'); grad.addColorStop(0.55, '#171C60'); grad.addColorStop(1, '#111544');
    rect(g, 4, 4, 110, 162, grad, 6, '#0C1036');
    rect(g, 7, 7, 104, 156, '#00000000', 5, '#4C549A');
    // guilloche lattice
    g.save(); rect(g, 10, 10, 98, 150, '#00000000', 4); g.clip();
    for (let d = -170; d < 200; d += 9) {
      line(g, [d, 0, d + 170, 170], '#33CBCC22', 0.8);
      line(g, [d + 170, 0, d, 170], '#33CBCC18', 0.7);
    }
    for (let i = 0; i < 4; i++) {
      rect(g, 14 + i * 6, 14 + i * 8, 90 - i * 12, 142 - i * 16, '#00000000', 4, '#8E97D966');
    }
    g.restore();
    // central seal
    circle(g, 59, 85, 23, '#0E1240', '#8E97D9', 0.9);
    circle(g, 59, 85, 18, '#00000000', '#33CBCC55', 0.7);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      line(g, [59 + Math.cos(a) * 18.5, 85 + Math.sin(a) * 18.5, 59 + Math.cos(a) * 22, 85 + Math.sin(a) * 22], '#33CBCC66', 0.6);
    }
    tracked(g, 'KM', 59, 91, 13, '#DFF6F4', 2.5, 'center');
    // corner pips
    for (const [x, y] of [[13, 13], [105, 13], [13, 157], [105, 157]] as const) circle(g, x, y, 2, '#33CBCC66');
  });
}

/** Card face material — per tool family. Dynamic numerals/detail are Pixi Text. */
export function cardFrontTexture(family: ToolName): Texture {
  return cachedTexture(`chips:card-front:${family}`, 118, 170, (g) => {
    const tints: Record<ToolName, { band: string; deep: string; pale: string }> = {
      Read: { band: '#DCE2EC', deep: '#425679', pale: '#EDF0F5' },
      Edit: { band: '#D9DAE7', deep: '#171C60', pale: '#ECEDF3' },
      Write: { band: '#D6EFEE', deep: '#1F8F92', pale: '#EAF7F6' },
      Bash: { band: '#DFDEE2', deep: '#22263F', pale: '#ECECEF' },
      Search: { band: '#E2EBE2', deep: '#5F7A6B', pale: '#F0F5EF' },
    };
    const t = tints[family];
    const base = g.createLinearGradient(0, 0, 0, 170);
    base.addColorStop(0, '#FEFCF6'); base.addColorStop(0.72, '#FAF6EC'); base.addColorStop(1, '#F1EBDD');
    rect(g, 0, 0, 118, 170, base, 8, '#ABA28D');
    rect(g, 3.5, 3.5, 111, 163, '#00000000', 6, '#D8D1C0');
    // family band
    rect(g, 6, 6, 106, 30, t.pale, 4, '#C9C1AE');
    line(g, [6, 36, 112, 36], t.deep + '55', 0.8);
    toolGlyph(g, family, 20, 21, 15, t.deep, 1.15);
    label(g, family.toUpperCase(), 32, 24, 7.5, t.deep);
    label(g, TOOL_NOTES[family].split(' · ')[0], 108, 24, 5.2, t.deep, 'right');
    // rank well (live numeral is composited on top)
    rect(g, 8, 41, 40, 40, '#F3EDDE', 4, '#C6BEA9');
    rect(g, 11, 44, 34, 34, '#00000000', 3, '#DDD6C4');
    label(g, 'RANK', 28, 76, 4.4, '#A39C89', 'center');
    // central medallion
    circle(g, 59, 92, 23, t.pale, '#C9C1AE', 0.8);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      line(g, [59 + Math.cos(a) * 19, 92 + Math.sin(a) * 19, 59 + Math.cos(a) * 22, 92 + Math.sin(a) * 22], t.deep + '44', 0.6);
    }
    toolGlyph(g, family, 59, 92, 25, t.deep, 1.35);
    // detail area
    line(g, [8, 120, 110, 120], '#C9C1AE', 0.7);
    line(g, [8, 160, 110, 160], '#D8D1C0', 0.7);
    // corner brackets
    line(g, [8, 44, 8, 39, 13, 39], '#8E8672', 0.7);
    line(g, [110, 126, 110, 131, 105, 131], '#8E8672', 0.7);
    // subtle grain
    for (let i = 0; i < 90; i++) {
      const x = (i * 37) % 114 + 2; const y = (i * 59) % 166 + 2;
      circle(g, x, y, 0.35, '#8C7F6522');
    }
  });
}

/** Brass dealer shoe with a rear stack of card backs held in the mouth. */
export function shoeSprite(): Sprite {
  const { w, h } = LAYOUT.shoe;
  return surface(w, h, (g) => {
    shadow(g, 8, 16, w - 20, h - 16, 12, '#2A24181A', 14);
    // rear card stack (card backs standing in the shoe mouth)
    for (let i = 9; i >= 0; i--) {
      const y = 24 + i * 2.2;
      rect(g, 24 + i * 0.4, y, w - 48, 66, '#F2EAD7', 3, '#A9A08B');
      rect(g, 27 + i * 0.4, y + 3, w - 54, 60, '#1B216B', 2, '#3D4590');
      line(g, [32 + i * 0.4, y + 12, w - 32 + i * 0.4, y + 12], '#4E57A0', 0.5);
      line(g, [32 + i * 0.4, y + 20, w - 32 + i * 0.4, y + 20], '#4E57A055', 0.5);
    }
    // brass apron / body
    const body = g.createLinearGradient(0, 40, w, 40);
    body.addColorStop(0, '#8A6A3F'); body.addColorStop(0.18, '#C9A874'); body.addColorStop(0.5, '#E8D2A6');
    body.addColorStop(0.82, '#B9955F'); body.addColorStop(1, '#7C5C33');
    g.beginPath();
    g.moveTo(4, 64); g.lineTo(w - 4, 64); g.lineTo(w - 12, h - 20); g.quadraticCurveTo(w - 12, h - 8, w - 26, h - 8);
    g.lineTo(26, h - 8); g.quadraticCurveTo(12, h - 8, 12, h - 22); g.closePath();
    g.fillStyle = body; g.fill();
    g.strokeStyle = '#6F512C'; g.lineWidth = 1.2; g.stroke();
    // engraved front plate
    rect(g, 16, 80, w - 32, h - 110, '#F1E2C2', 4, '#A8855A');
    rect(g, 20, 84, w - 40, h - 118, '#00000000', 3, '#FBF1DA');
    tracked(g, 'KUNLUNMETA', w / 2, 102, 5.6, '#6F512C', 1.4, 'center');
    label(g, 'DEALER 02', w / 2, 114, 4.6, '#8A6A3F', 'center');
    // count window
    rect(g, 26, 126, w - 52, 30, '#2B2418', 4, '#5A4527');
    rect(g, 30, 130, w - 60, 22, '#E9DBB9', 3, '#C6AE84');
    // feet
    metal(g, 22, h - 10, w - 44, 8);
    bolt(g, 18, 72, 2.2); bolt(g, w - 18, 72, 2.2);
  });
}

/** Recessed discard tray with stacked card edges. */
export function discardSprite(): Sprite {
  const { w, h } = LAYOUT.discard;
  return surface(w, h, (g) => {
    shadow(g, 5, 9, w - 8, h - 8, 12, '#2A241814', 10);
    rect(g, 4, 4, w - 8, h - 8, '#DDD3BE', 12, '#A79C85');
    rect(g, 9, 9, w - 18, h - 18, '#C9BEA6', 9, '#8F836C');
    const inner = g.createLinearGradient(0, 0, 0, h);
    inner.addColorStop(0, '#E9DFC9'); inner.addColorStop(1, '#D6C9AF');
    rect(g, 13, 13, w - 26, h - 26, inner, 7, '#B7AB92');
    for (let i = 0; i < 6; i++) {
      rect(g, 20 + i * 1.3, h - 46 - i * 7, w - 40, 40, '#F4EDDC', 3, '#BDB29B');
      line(g, [24, h - 42 - i * 7, w - 24, h - 42 - i * 7], '#D2CAB8', 0.7);
    }
    label(g, 'DISCARD / 弃牌', w / 2, h - 18, 6.5, '#7C725C', 'center');
    bolt(g, 11, 11, 2.2); bolt(g, w - 11, 11, 2.2); bolt(g, 11, h - 11, 2.2); bolt(g, w - 11, h - 11, 2.2);
  });
}

/** Sponsor / voucher slot with the shared hatch placeholder. */
export function sponsorSprite(): Sprite {
  const { w, h } = LAYOUT.sponsor;
  return surface(w, h, (g) => {
    paperCard(g, 0, 0, w, h, { r: 12, fill: '#FCF8EE', stroke: '#AFA690', ticks: true, shadowBlur: 16 });
    label(g, 'SPONSOR / 赞助席', 16, 24, 7, '#837C6A');
    label(g, 'SERIES 02', w - 16, 24, 6, '#A39C89', 'right');
    line(g, [14, 32, w - 14, 32], '#B7AE99', 0.7);
    // hatched empty slot
    washi(g, 16, 44, w - 32, 150, 6, '#6F6858', 0.10, 14);
    tracked(g, '虚位以待', w / 2, 122, 16, '#6F6858' + '88', 5, 'center');
    // gold coin button
    circle(g, w - 34, 214, 16, '#2C9E5E', '#1D7A45', 1.2);
    circle(g, w - 34, 214, 12.5, '#3DBB72', '#FFFFFF66', 0.7);
    label(g, '$', w - 34, 219, 13, '#EEFBF2', 'center');
    line(g, [16, 208, w - 60, 208], '#C9C1AE', 0.7);
    label(g, 'UNLOCK AT ANTE', 16, 220, 5.5, '#9A937F');
    for (let i = 0; i < 4; i++) { circle(g, 22 + i * 13, 236, 3.6, '#EFE8D8', '#A79E88', 0.7); }
    bolt(g, 8, 8, 2.2); bolt(g, w - 8, 8, 2.2); bolt(g, 8, h - 8, 2.2); bolt(g, w - 8, h - 8, 2.2);
  });
}

/** Settlement ticket printer: brass housing + paper slot. */
export function printerSprite(): Sprite {
  const { w, h } = LAYOUT.printer;
  return surface(w, h, (g) => {
    paperCard(g, 0, 0, w, h, { r: 12, fill: '#F7F1E5', stroke: '#AFA690', ticks: false, shadowBlur: 14 });
    label(g, 'SETTLEMENT / 结算票据', 14, 22, 6.5, '#837C6A');
    line(g, [12, 30, w - 12, 30], '#B7AE99', 0.7);
    // brass mechanism plate
    shadow(g, 14, 40, w - 28, 46, 5, '#2A241814', 6);
    rect(g, 12, 38, w - 24, 46, '#C7A878', 6, '#7E5E35');
    rect(g, 16, 42, w - 32, 38, '#E9D5AB', 4, '#F6E8CA');
    rect(g, 30, 52, w - 60, 6, '#171C60', 3, '#0C1036');
    line(g, [24, 64, w - 24, 64], '#A8855A', 0.7);
    // guide rollers
    circle(g, 26, 74, 5, '#D9D3C2', '#7D7460', 1);
    circle(g, 26, 74, 2, '#171C60');
    circle(g, w - 26, 74, 5, '#D9D3C2', '#7D7460', 1);
    circle(g, w - 26, 74, 2, '#171C60');
    label(g, 'PRINT', w - 16, 36, 5, '#9A937F', 'right');
    // paper path
    rect(g, 22, 94, w - 44, h - 106, '#FDFBF4', 3, '#B9B09A');
    for (let x = 26; x < w - 24; x += 6) circle(g, x, 99, 0.8, '#B9B09C');
    line(g, [28, 108, w - 28, 108], '#DED7C6', 0.6);
    line(g, [28, 222, w - 28, 222], '#DED7C6', 0.6);
    label(g, 'NO CASH VALUE · TOKEN RECEIPT', w / 2, h - 16, 4.6, '#B0A995', 'center');
    bolt(g, 8, 8, 2.2); bolt(g, w - 8, 8, 2.2); bolt(g, 8, h - 8, 2.2); bolt(g, w - 8, h - 8, 2.2);
  });
}

/** Chip tray with three denominations (live stacks drawn on top). */
export function chipTraySprite(): Sprite {
  const { w, h } = LAYOUT.chips;
  return surface(w, h, (g) => {
    paperCard(g, 0, 0, w, h, { r: 12, fill: '#F7F1E5', stroke: '#AFA690', ticks: false, shadowBlur: 14 });
    label(g, 'CHIP TRAY / 筹码', 14, 22, 6.5, '#837C6A');
    line(g, [12, 30, w - 12, 30], '#B7AE99', 0.7);
    const wells = [[36, 78], [114, 78], [192, 78]] as const;
    for (const [x, y] of wells) {
      ellipse(g, x + 14, y + 22, 28, 30, '#E3DAC7', '#B3A992');
      ellipse(g, x + 14, y + 18, 22, 22, '#D6CBB4', '#A79C85');
    }
    label(g, 'NAVY / 10', 50, 142, 5.5, '#8C8676', 'center');
    label(g, 'TEAL / 50', 128, 142, 5.5, '#8C8676', 'center');
    label(g, 'BRASS / 100', 206, 142, 5.5, '#8C8676', 'center');
    bolt(g, 8, 8, 2.2); bolt(g, w - 8, 8, 2.2); bolt(g, 8, h - 8, 2.2); bolt(g, w - 8, h - 8, 2.2);
  });
}

/** Live chip sprite used by the tray and the payout cascade. */
export function chipTexture(kind: 'navy' | 'teal' | 'brass'): Texture {
  return cachedTexture(`chips:chip:${kind}`, 48, 48, (g) => {
    const colors = CHIP_COLORS[kind];
    circle(g, 24, 24, 22, '#2A241820');
    chip(g, 24, 22, 21, colors);
  }, 2.5);
}

/** Small gold bell on the table corner. */
export function bellSprite(): Sprite {
  return surface(54, 54, (g) => {
    circle(g, 27, 30, 15, '#2A241816');
    poly(g, [12, 36, 16, 20, 27, 12, 38, 20, 42, 36], '#C7A878', '#7E5E35');
    poly(g, [16, 35, 19, 22, 27, 15, 35, 22, 38, 35], '#E7D2A8', '#F4E6C8');
    rect(g, 10, 36, 34, 5, '#B08A5B', 2, '#7E5E35');
    circle(g, 27, 12, 3.4, '#D9C79E', '#7E5E35', 0.8);
    circle(g, 27, 43, 3, '#8C6A3F');
  });
}

/** Response helper: local coordinates for board wells (absolute design space). */
export const BOARD_ABS = {
  handValue: { x: LAYOUT.board.x + 76, y: LAYOUT.board.y + 112 },
  scoreValue: { x: LAYOUT.board.x + 388, y: LAYOUT.board.y + 112 },
  chipsValue: { x: LAYOUT.board.x + 456, y: LAYOUT.board.y + 112 },
  multValue: { x: LAYOUT.board.x + 560, y: LAYOUT.board.y + 112 },
  dotY: LAYOUT.board.y + 157,
  dotX0: LAYOUT.board.x + 54,
  dotGap: 22,
  quota: { x: LAYOUT.board.x + LAYOUT.board.w - 20, y: LAYOUT.board.y + 174 },
} as const;

/** Re-export small helpers used by the dynamic layers. */
export const ART = { C, PALETTE, chip, chipStack, arc, dashLine, dotField, hatch, ring, tickRing, bearing, plate, metal };
export type { Pen } from '../../core/drawing';
export { handSlot };
