/** Programmatic material art for the Westworld plant. All baked once. */
import { Sprite, Texture } from 'pixi.js';
import {
  C, bolt, cachedTexture, circle, dotField, ellipse, hatch, label, line, metal,
  paper, paperCard, pipePath, plate, poly, rect, ring, serif, shadow, sheetMarks, flange,
  surface, tickRing, tracked, valveWheel, washi,
} from '../../core/drawing';
import { DIAL, PLANT, SIDE, PIPE_PATHS } from './layout';
import type { ToolName } from '../../core/types';
import { FAMILY_SPEC } from './machine';

const W = 1472;
const H = 1008;

/** Exhibition sheet for plant KH-03. */
export function backdrop(): Sprite {
  return surface(W, H, (g) => {
    paper(g, W, H, { dots: true, dotGap: 16, vignette: true, seed: 57 });
    // enormous faint circle behind the pressure dial
    for (const r of [DIAL.r + 20, DIAL.r + 34, DIAL.r + 62]) {
      g.save(); g.beginPath(); g.arc(DIAL.cx, DIAL.cy, r, 0, Math.PI * 2);
      g.strokeStyle = '#8C91843A'; g.lineWidth = 0.8; g.stroke(); g.restore();
    }
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const major = i % 8 === 0;
      line(g, [DIAL.cx + Math.cos(a) * (DIAL.r + 34), DIAL.cy + Math.sin(a) * (DIAL.r + 34),
        DIAL.cx + Math.cos(a) * (DIAL.r + (major ? 46 : 40)), DIAL.cy + Math.sin(a) * (DIAL.r + (major ? 46 : 40))],
      '#8C918433', major ? 0.9 : 0.5);
    }
    // reference ticks on the plant plate's right edge
    sheetMarks(g, W, H, { label: 'FIG. 03', sub: 'THE CALL BECOMES PRESSURE.', right: 'EVENT-DRIVEN / SERIES 03' });
    // bottom rail
    const ry = 926;
    line(g, [40, ry, W - 40, ry], '#9AA09A66', 0.8);
    for (let x = 40, i = 0; x <= W - 40; x += 12, i++) {
      line(g, [x, ry, x, ry + (i % 5 === 0 ? 7 : 3.5)], '#9AA09A66', i % 5 === 0 ? 0.9 : 0.55);
    }
    for (let i = 0, x = 40; x <= W - 40; x += 120, i++) label(g, String(i).padStart(2, '0'), x, ry + 17, 6, '#9AA09A');
    // margin annotations
    label(g, 'WESTWORLD / A PLANT FOR TOOL CALLS', 42, 158, 9, '#8B9398');
    line(g, [40, 166, 194, 166], '#AAB1B251', 0.7);
    g.save(); g.translate(58, 540); g.rotate(-Math.PI / 2);
    tracked(g, '03 / WESTWORLD · THE CALL BECOMES PRESSURE', 0, 0, 7.5, '#9AA09A99', 3.2, 'left');
    g.restore();
    line(g, [76, 250, 76, 430], '#AAB1B244', 0.7);
    // soft shadow under plant plate
    shadow(g, PLANT.x + 10, PLANT.y + 14, PLANT.w, PLANT.h, 20, '#2A241816', 22);
  });
}

/** Riveted plant plate that groups tanks, pipes and valves. */
export function plantPlate(): Sprite {
  const { w, h } = PLANT;
  return surface(w, h, (g) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#F4EEE1'); grd.addColorStop(0.55, '#EFE7D8'); grd.addColorStop(1, '#E7DDCA');
    rect(g, 0, 0, w, h, grd, 14, '#A79F8B');
    rect(g, 10, 10, w - 20, h - 20, '#00000000', 10, '#C6BCA5');
    // hatched corners
    for (const [x, y] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]] as const) {
      g.save(); g.translate(x, y); if (x > w / 2) g.scale(-1, 1); if (y > h / 2) g.scale(1, -1);
      hatch(g, 0, 0, 30, 30, '#B3A99266', 5, 0.5, -45);
      line(g, [0, 0, 30, 0, 0, 30, 0, 0], '#B3A99266', 0.6);
      g.restore();
      bolt(g, x + (x > w / 2 ? -8 : 8), y + (y > h / 2 ? -8 : 8), 3);
    }
    tracked(g, 'PRESSURE PLANT', 26, 30, 9, '#6F6A5B', 3.2);
    label(g, 'KH-03 / 昆仑机械', 26, 44, 6.5, '#8C8676');
    label(g, 'SERIES 03', w - 26, 30, 6.5, '#9B9585', 'right');
    line(g, [22, 54, w - 22, 54], '#B7AE99', 0.7);
  });
}

/** Big pressure dial face with engraved 340→020 scale. */
export function dialFaceArt(): Sprite {
  const size = DIAL.r * 2 + 10;
  return surface(size, size, (g) => {
    const c = size / 2;
    // bezel
    circle(g, c, c, DIAL.r + 3, '#B08A5B', '#7E5E35', 1.2);
    circle(g, c, c, DIAL.r - 4, '#D9BD8C', '#8A6A3F', 0.9);
    circle(g, c, c, DIAL.r - 12, '#FCF8EE', '#A79F8B', 1);
    // face
    const face = g.createRadialGradient(c - 60, c - 80, 40, c, c, DIAL.face);
    face.addColorStop(0, '#FEFBF2'); face.addColorStop(0.72, '#F8F2E5'); face.addColorStop(1, '#EFE6D3');
    circle(g, c, c, DIAL.r - 14, face);
    // concentric engraving
    for (const r of [DIAL.r - 26, DIAL.r - 88, 118]) { g.save(); g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.strokeStyle = '#171C6014'; g.lineWidth = 0.8; g.stroke(); g.restore(); }
    // tick ring in the 260° sweep
    const ticks = 130;
    for (let i = 0; i <= ticks; i++) {
      const t = i / ticks;
      const a = DIAL.start + t * DIAL.sweep;
      const major = i % 13 === 0;
      const mid = i % 13 === 6 || i % 13 === 3 || i % 13 === 9;
      const r0 = DIAL.r - (major ? 46 : mid ? 36 : 30);
      const r1 = DIAL.r - 18;
      line(g, [c + Math.cos(a) * r0, c + Math.sin(a) * r0, c + Math.cos(a) * r1, c + Math.sin(a) * r1],
        major ? '#171C60AA' : '#171C6055', major ? 1.6 : mid ? 0.9 : 0.55);
    }
    // numerals
    const marks = ['340', '345', '350', '355', '000', '005', '010', '015', '020'];
    marks.forEach((m, i) => {
      const a = DIAL.start + (i / (marks.length - 1)) * DIAL.sweep;
      const r = DIAL.r - 78;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      serif(g, m, x, y + 8, 19, '#171C60', 'center');
      circle(g, c + Math.cos(a) * (DIAL.r - 52), c + Math.sin(a) * (DIAL.r - 52), 2.2, '#B28D5E');
    });
    // inner red band for the danger sector (last 18%)
    const a0 = DIAL.start + DIAL.sweep * 0.82;
    const a1 = DIAL.start + DIAL.sweep;
    g.save(); g.beginPath(); g.arc(c, c, DIAL.r - 24, a0, a1); g.arc(c, c, DIAL.r - 40, a1, a0, true); g.closePath();
    g.fillStyle = '#A6513F22'; g.fill(); g.strokeStyle = '#A6513F55'; g.lineWidth = 0.8; g.stroke(); g.restore();
    // dial lettering
    const topY = c - 118;
    tracked(g, 'PRESSURE', c, topY, 11, '#6F6A5B', 4.4, 'center');
    label(g, '主压 · MPa', c, topY + 16, 7, '#9B9585', 'center');
    tracked(g, 'KUNLUNMETA', c, c + 112, 12, '#171C6033', 5.2, 'center');
    label(g, 'PLANT KH-03 · SERIAL 03-112', c, c + 130, 6.6, '#9B9585', 'center');
    label(g, 'HYDRAULIC · SERVO · EVENT-DRIVEN', c, c - 142, 6.4, '#9B9585', 'center');
    // small sub-arcs
    for (const [dx, dy, r] of [[-150, 118, 46], [150, 118, 46]] as const) {
      g.save(); g.beginPath(); g.arc(c + dx, c + dy, r, Math.PI * 0.15, Math.PI * 0.85);
      g.strokeStyle = '#171C6033'; g.lineWidth = 1; g.stroke(); g.restore();
    }
    // counter windows on the lower face
    const win = (x: number, y: number, w: number, h: number, title: string) => {
      rect(g, x, y, w, h, '#E8E1D1', 5, '#A79E88');
      rect(g, x + 3, y + 3, w - 6, h - 6, '#2B2620', 3, '#171C60');
      label(g, title, x + 5, y + h + 11, 6, '#837C6A');
    };
    win(c - 176, c + 196, 148, 40, 'RELIEVES / 释放');
    win(c + 28, c + 196, 148, 40, 'CHARGE / 充能');
    label(g, 'RELIEF SET 5 · PURGE 20', c, c + 186, 5.6, '#A39C89', 'center');
    // bezel bolts
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      bolt(g, c + Math.cos(a) * (DIAL.r - 4), c + Math.sin(a) * (DIAL.r - 4), 3.4);
    }
  });
}

/** Glass tank with brass caps and engraved scale (liquid is drawn live). */
export function tankArt(family: ToolName, r: number, h: number): Sprite {
  const spec = FAMILY_SPEC[family];
  const w = r * 2 + 40; const hh = h + 52;
  return surface(w, hh, (g) => {
    const cx = w / 2;
    // feet
    rect(g, cx - r - 8, hh - 26, (r + 8) * 2, 18, '#C7A878', 5, '#7E5E35');
    rect(g, cx - r - 4, hh - 22, (r + 4) * 2, 10, '#E7D2A8', 4, '#F4E6C8');
    // glass body
    shadow(g, cx - r + 4, 20, r * 2 - 6, hh - 40, 14, '#2A241814', 10);
    const glass = g.createLinearGradient(cx - r, 0, cx + r, 0);
    glass.addColorStop(0, 'rgba(223,229,224,0.42)'); glass.addColorStop(0.18, 'rgba(247,250,246,0.22)');
    glass.addColorStop(0.5, 'rgba(255,255,255,0.14)');
    glass.addColorStop(0.82, 'rgba(242,246,241,0.2)'); glass.addColorStop(1, 'rgba(215,222,216,0.4)');
    rect(g, cx - r, 24, r * 2, h, glass, 8, '#8E9A90');
    rect(g, cx - r + 4, 28, r * 2 - 8, h - 8, 'rgba(255,255,255,0.18)', 6, 'rgba(255,255,255,0.55)');
    // glass highlight
    line(g, [cx - r + 10, 40, cx - r + 10, 24 + h - 20], '#FFFFFFCC', 2);
    line(g, [cx - r + 16, 48, cx - r + 16, 24 + h - 40], '#FFFFFF88', 1);
    // scale ticks on the left
    for (let i = 0; i <= 10; i++) {
      const y = 24 + 10 + (h - 20) * (i / 10);
      const major = i % 5 === 0;
      line(g, [cx - r + 2, y, cx - r + (major ? 20 : 12), y], '#5C6670AA', major ? 1 : 0.6);
      if (major) label(g, String(i * 10).padStart(2, '0'), cx - r - 4, y, 5.4, '#8C8676', 'right');
    }
    // brass caps
    rect(g, cx - r - 6, 10, (r + 6) * 2, 18, '#B08A5B', 5, '#7E5E35');
    rect(g, cx - r - 2, 13, (r + 2) * 2, 11, '#E2C896', 4, '#F4E6C8');
    rect(g, cx - r - 6, 24 + h - 12, (r + 6) * 2, 16, '#B08A5B', 5, '#7E5E35');
    // pipe stubs
    rect(g, cx - 8, 0, 16, 12, '#C7A878', 3, '#7E5E35');
    rect(g, cx - 6, 2, 12, 8, '#3B4A44', 2, '#5A6B63');
    // label plate
    rect(g, cx - r - 4, 24 + h + 2, (r + 4) * 2, 18, '#FCF8EE', 4, '#A79E88');
    label(g, spec.label, cx - r, 24 + h + 8, 6.4, '#4E4A3E');
    label(g, `${spec.cn} · ${family.toUpperCase()}`, cx + r + 4, 24 + h + 8, 5.2, '#8C8676', 'right');
    // family tint tag
    circle(g, cx - r - 2, 24 + h + 11, 3.2, spec.tint, '#FFFFFF66');
    bolt(g, cx - r - 6, 18, 2.2); bolt(g, cx + r + 6, 18, 2.2);
  });
}

/** Handwheel for one tool family (rotates live). */
export function valveWheelArt(family: ToolName, r: number): Sprite {
  const size = r * 2 + 16;
  const spec = FAMILY_SPEC[family];
  return surface(size, size, (g) => {
    const c = size / 2;
    circle(g, c, c + 2, r + 2, '#2A241814');
    valveWheel(g, c, c, r, 0, '#5C6670');
    circle(g, c, c, r * 0.22, spec.tint, '#171C60', 0.8);
    label(g, family.slice(0, 2).toUpperCase(), c, c + 2, 5.4, '#F6EFDF', 'center');
  });
}

/** Spring-loaded relief valve on the reservoir dome. */
export function reliefValveArt(): Sprite {
  const { w, h } = PLANT.relief;
  return surface(w, h, (g) => {
    shadow(g, 6, h - 26, w - 12, 22, 8, '#2A241814', 6);
    // body
    rect(g, 10, 30, w - 20, 26, '#C7A878', 6, '#7E5E35');
    rect(g, 14, 33, w - 28, 20, '#E7D2A8', 4, '#F4E6C8');
    rect(g, 22, 54, w - 44, 34, '#B08A5B', 5, '#7E5E35');
    rect(g, 26, 57, w - 52, 28, '#D9BD8C', 4, '#F4E6C8');
    // spring coils
    for (let i = 0; i < 6; i++) line(g, [26, 12 + i * 7, w - 26, 14 + i * 7], '#6F7C7C', 1.4);
    // stem and lever
    rect(g, w / 2 - 3, 0, 6, 20, '#8E9A90', 2, '#5C6670');
    g.save(); g.translate(w / 2, 22); g.rotate(-0.22);
    poly(g, [-24, -3, 26, -3, 26, 4, -24, 4], '#B08A5B', '#7E5E35');
    circle(g, 28, 0, 5, '#E2C896', '#7E5E35');
    g.restore();
    // nozzle
    poly(g, [w - 18, 88, w - 4, 96, w - 18, 104], '#8E9A90', '#5C6670');
    label(g, 'RELIEF 5', w / 2, h - 6, 5.4, '#6F6A5B', 'center');
    bolt(g, 12, 42, 2); bolt(g, w - 12, 42, 2);
  });
}

/** Relay / scanner panel for Search calls. */
export function relayPanelArt(): Sprite {
  const { w, h } = PLANT.relay;
  return surface(w, h, (g) => {
    paperCard(g, 0, 0, w, h, { r: 8, fill: '#F7F1E5', stroke: '#A79E88', ticks: true, shadowBlur: 10 });
    label(g, 'SCANNER RELAY', 12, 18, 6.4, '#6F6A5B');
    label(g, '扫描继电器', w - 12, 18, 5.6, '#9B9585', 'right');
    // rotor
    circle(g, 42, 74, 25, '#E9E1CF', '#8F836C', 1);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      line(g, [42, 74, 42 + Math.cos(a) * 22, 74 + Math.sin(a) * 22], '#5C6670', 1.2);
      circle(g, 42 + Math.cos(a) * 22, 74 + Math.sin(a) * 22, 3, '#B08A5B');
    }
    circle(g, 42, 74, 6, '#171C60');
    // five relay cells
    for (let i = 0; i < 5; i++) {
      const x = 84 + i * 22;
      rect(g, x, 46, 17, 58, '#EFE7D6', 3, '#B3A992');
      circle(g, x + 8, 58, 4, '#C9C2AE', '#A79E88', 0.7);
      rect(g, x + 4, 68, 9, 26, '#D6CBB4', 2, '#A79E88');
      line(g, [x + 8, 72, x + 8, 92], '#8F836C', 0.8);
    }
    label(g, '5 CELLS · ROTARY', w - 12, h - 12, 5.4, '#9B9585', 'right');
  });
}

/** Combustion cylinder with fins (piston rod drawn live). */
export function cylinderArt(w: number, h: number): Sprite {
  return surface(w, h, (g) => {
    metal(g, 0, 0, w, h);
    for (let i = 0; i < 7; i++) rect(g, 8 + i * ((w - 16) / 7), 4, 5, h - 8, '#C9C2AE', 1, '#8F8674');
    rect(g, 0, 0, w, 7, '#B08A5B', 2, '#7E5E35');
    rect(g, 0, h - 7, w, 7, '#B08A5B', 2, '#7E5E35');
    label(g, 'COMBUSTION', w / 2, h / 2 + 3, 4.8, '#5C6670', 'center');
  });
}

/** Flywheel disc (rotates live). */
export function flywheelArt(r: number): Sprite {
  const size = r * 2 + 12;
  return surface(size, size, (g) => {
    const c = size / 2;
    circle(g, c, c, r + 2, '#D9BD8C', '#7E5E35', 1.1);
    circle(g, c, c, r - 3, '#E9D5AB', '#8A6A3F', 0.8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      line(g, [c, c, c + Math.cos(a) * (r - 8), c + Math.sin(a) * (r - 8)], '#8A6A3F', 4);
      circle(g, c + Math.cos(a) * (r - 8), c + Math.sin(a) * (r - 8), 4, '#B08A5B', '#7E5E35');
    }
    circle(g, c, c, 10, '#C7A878', '#7E5E35', 1);
    circle(g, c, c, 3.4, '#171C60');
  });
}

/** Small heat gauge face. */
export function heatGaugeArt(r: number): Sprite {
  const size = r * 2 + 10;
  return surface(size, size, (g) => {
    const c = size / 2;
    circle(g, c, c, r + 3, '#B08A5B', '#7E5E35', 1);
    circle(g, c, c, r - 2, '#FCF8EE', '#A79E88', 0.9);
    g.save(); g.beginPath(); g.arc(c, c, r - 8, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.2);
    g.strokeStyle = '#A6513F88'; g.lineWidth = 4; g.stroke(); g.restore();
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.2;
      line(g, [c + Math.cos(a) * (r - 18), c + Math.sin(a) * (r - 18), c + Math.cos(a) * (r - 10), c + Math.sin(a) * (r - 10)], '#5C6670AA', 0.8);
    }
    label(g, 'HEAT', c, c + r - 4, 5, '#837C6A', 'center');
  });
}

/** Sponsor / voucher slot (same catalogue language as Chips). */
export function sponsorArt(): Sprite {
  const { w, h } = SIDE.sponsor;
  return surface(w, h, (g) => {
    paperCard(g, 0, 0, w, h, { r: 10, fill: '#FCF8EE', stroke: '#A79E88', ticks: true, shadowBlur: 14 });
    label(g, 'SPONSOR / 赞助席', 14, 22, 6.4, '#837C6A');
    label(g, 'SERIES 03', w - 14, 22, 5.8, '#A39C89', 'right');
    line(g, [12, 30, w - 12, 30], '#B7AE99', 0.7);
    washi(g, 14, 40, w - 28, 128, 5, '#6F6858', 0.1, 13);
    tracked(g, '虚位以待', w / 2, 108, 15, '#6F685888', 5, 'center');
    circle(g, w - 32, 190, 15, '#2C9E5E', '#1D7A45', 1.2);
    circle(g, w - 32, 190, 11.5, '#3DBB72', '#FFFFFF66', 0.7);
    label(g, '$', w - 32, 195, 12, '#EEFBF2', 'center');
    line(g, [14, 182, w - 58, 182], '#C9C1AE', 0.7);
    label(g, 'UNLOCK AT RELEASE', 14, 194, 5.2, '#9A937F');
    for (let i = 0; i < 4; i++) circle(g, 20 + i * 13, 208, 3.2, '#EFE8D8', '#A79E88', 0.7);
  });
}

/** Release ticket printer. */
export function printerArt(): Sprite {
  const { w, h } = SIDE.printer;
  return surface(w, h, (g) => {
    paperCard(g, 0, 0, w, h, { r: 10, fill: '#F7F1E5', stroke: '#A79E88', ticks: false, shadowBlur: 12 });
    label(g, 'RELEASE TICKET / 释放票据', 12, 20, 6.2, '#837C6A');
    line(g, [10, 28, w - 10, 28], '#B7AE99', 0.7);
    rect(g, 10, 34, w - 20, 44, '#C7A878', 5, '#7E5E35');
    rect(g, 14, 38, w - 28, 36, '#E9D5AB', 4, '#F6E8CA');
    rect(g, 26, 48, w - 52, 6, '#171C60', 3, '#0C1036');
    circle(g, 24, 70, 4.6, '#D9D3C2', '#7D7460', 0.9);
    circle(g, w - 24, 70, 4.6, '#D9D3C2', '#7D7460', 0.9);
    // paper
    rect(g, 18, 84, w - 36, h - 100, '#FDFBF4', 3, '#B9B09A');
    for (let x = 22; x < w - 20; x += 6) circle(g, x, 89, 0.8, '#B9B09C');
    line(g, [24, h - 26, w - 24, h - 26], '#DED7C6', 0.6);
    label(g, 'PLANT KH-03 · NO CASH VALUE', w / 2, h - 12, 4.6, '#B0A995', 'center');
  });
}

/** Brass mechanical counter plate (charge / releases / purges). */
export function counterArt(): Sprite {
  const { w, h } = SIDE.counter;
  return surface(w, h, (g) => {
    paperCard(g, 0, 0, w, h, { r: 10, fill: '#F7F1E5', stroke: '#A79E88', ticks: false, shadowBlur: 12 });
    label(g, 'MECHANICAL COUNTER / 记数', 12, 20, 6.2, '#837C6A');
    line(g, [10, 28, w - 10, 28], '#B7AE99', 0.7);
    rect(g, 12, 36, w - 24, 52, '#C7A878', 5, '#7E5E35');
    rect(g, 16, 40, w - 32, 44, '#2B2620', 4, '#171C60');
    const win = (x: number, ww: number, title: string) => {
      rect(g, x, 70, ww, 34, '#EFE7D6', 3, '#A79E88');
      label(g, title, x + ww / 2, 96, 4.8, '#8C8676', 'center');
    };
    win(12, 68, 'CHARGE');
    win(84, 68, 'RELEASES');
    win(156, 68, 'PURGES');
    for (let i = 0; i < 3; i++) { circle(g, 22 + i * 8, 30, 1.6, '#D9BD8C'); }
    bolt(g, 8, 8, 2); bolt(g, w - 8, 8, 2); bolt(g, 8, h - 8, 2); bolt(g, w - 8, h - 8, 2);
  });
}

/** Plant nameplate under the right column. */
export function namePlateArt(): Sprite {
  const { w, h } = SIDE.plate;
  return surface(w, h, (g) => {
    plate(g, 0, 0, w, h, true, true);
    tracked(g, 'KUNLUNMETA', w / 2, 24, 8, '#E9D5AB', 3.2, 'center');
    label(g, 'PRESSURE PLANT · KH-03', w / 2, 40, 6, '#D9BD8C', 'center');
    label(g, 'EVENT-DRIVEN / SERIES 03', w / 2, 52, 5, '#B08A5B', 'center');
  });
}

/** All pipes as one transparent overlay, including flanges and supports. */
export function pipesLayer(): Sprite {
  return surface(W, H, (g) => {
    const draw = (pts: Array<[number, number]>, width: number) => {
      pipePath(g, pts.flat(), width, { body: '#C9CFC9', edge: '#5C6670', inner: '#8E9A90', radius: 8 });
      // flanges at each elbow
      for (const [x, y] of pts.slice(1, -1)) flange(g, x, y, width * 0.75, true);
    };
    for (const path of PIPE_PATHS) draw(path.pts, path.id === 'relief' ? 9 : 11);
    // main manifold rail
    pipePath(g, [PLANT.manifoldX0, PLANT.manifoldY, PLANT.manifoldX1, PLANT.manifoldY], 16,
      { body: '#C9CFC9', edge: '#5C6670', inner: '#8E9A90', radius: 10 });
    for (let x = PLANT.manifoldX0; x <= PLANT.manifoldX1; x += 74) flange(g, x, PLANT.manifoldY, 10, false);
    // chimney from the relief valve: up, right along the header, then out of the sheet
    pipePath(g, [PLANT.relief.x, PLANT.relief.y, PLANT.relief.x, 320, 1120, 320, 1120, 118], 14,
      { body: '#C9CFC9', edge: '#5C6670', inner: '#8E9A90', radius: 9 });
    flange(g, PLANT.relief.x, 360, 8, false);
    flange(g, 1120, 320, 9, true);
    // chimney cap
    rect(g, 1100, 106, 40, 12, '#B08A5B', 3, '#7E5E35');
    rect(g, 1094, 118, 52, 10, '#C7A878', 3, '#7E5E35');
    for (let i = 0; i < 3; i++) line(g, [1106 + i * 14, 130, 1106 + i * 14, 146], '#8E9A90', 1.2);
    // steam header drum on the right
    const dx = 1064; const dy = 268;
    shadow(g, dx + 4, dy + 8, 112, 58, 10, '#2A241814', 8);
    rect(g, dx, dy, 112, 56, '#C7A878', 26, '#7E5E35');
    rect(g, dx + 4, dy + 4, 104, 48, '#E7D2A8', 22, '#F4E6C8');
    for (let i = 0; i < 5; i++) line(g, [dx + 14 + i * 20, dy + 10, dx + 14 + i * 20, dy + 46], '#B08A5B', 0.7);
    circle(g, dx + 56, dy + 28, 8, '#2B2620', '#7E5E35', 0.9);
    label(g, 'STEAM HEADER', dx + 56, dy + 64, 5, '#8C8676', 'center');
    // support brackets
    for (const [x, y] of [[800, 770], [946, 770], [1082, 770]] as const) {
      line(g, [x - 16, y + 18, x + 16, y + 18], '#5C6670', 2);
    }
    label(g, 'MAIN MANIFOLD / 主分配管', 952, PLANT.manifoldY + 26, 5.4, '#8C8676', 'center');
    label(g, 'FLYWHEEL · SLIDER-CRANK', 960, 918, 5.2, '#8C8676', 'center');
    label(g, 'RELIEF TRAIN', PLANT.relief.x + 52, 366, 5, '#8C8676');
    label(g, '5-CALL RELIEF · 20-CALL PURGE', 952, PLANT.manifoldY - 22, 4.8, '#A39C89', 'center');
    // small pressure tap into the dial
    pipePath(g, [706, 700, 706, 758, 764, 758], 8, { body: '#C9CFC9', edge: '#5C6670', inner: '#8E9A90', radius: 6 });
    flange(g, 706, 736, 6, false);
  });
}

/** Paper strip for the printed release ticket. */
export function ticketPaper(h = 96): Texture {
  return cachedTexture(`ww:ticket:${h}`, SIDE.printer.w - 44, h, (g) => {
    rect(g, 0, 0, SIDE.printer.w - 44, h, '#FDFBF4', 2, '#B9B09A');
    line(g, [6, 14, SIDE.printer.w - 50, 14], '#D8D1C0', 0.6);
  });
}

/** Valve wheel tint palette re-export for the plant. */
export const WW = { C, FAMILY_SPEC };
