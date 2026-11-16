import { Sprite, Texture } from 'pixi.js';

export const C = { paper: '#FBF9F6', navy: '#171C60', teal: '#33CBCC', ink: '#323953', steel: '#919B9F', pale: '#E4E5E0', warm: '#C6B79D', dark: '#31364A' };
export type Pen = CanvasRenderingContext2D;
export function surface(w: number, h: number, draw: (g: Pen) => void, res = 2): Sprite {
  const c = document.createElement('canvas'); c.width = Math.ceil(w * res); c.height = Math.ceil(h * res);
  const g = c.getContext('2d')!; g.scale(res, res); draw(g);
  const s = new Sprite(Texture.from(c)); s.width = w; s.height = h; return s;
}
export function line(g: Pen, pts: number[], color = C.ink, width = 1) {
  g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.strokeStyle = color; g.lineWidth = width; g.stroke();
}
export function poly(g: Pen, pts: number[], fill: string, stroke?: string, width = 1) {
  g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath();
  g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
}
export function rect(g: Pen, x: number, y: number, w: number, h: number, fill: string | CanvasGradient, r = 0, stroke?: string) {
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = .7; g.stroke(); }
}
export function circle(g: Pen, x: number, y: number, r: number, fill: string, stroke?: string, width = 1) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
}
export function label(g: Pen, text: string, x: number, y: number, size = 9, color = C.ink, align: CanvasTextAlign = 'left') {
  g.font = `${size}px Consolas, monospace`; g.textAlign = align; g.fillStyle = color; g.fillText(text, x, y); g.textAlign = 'left';
}
export function metal(g: Pen, x: number, y: number, w: number, h: number, vertical = false) {
  const grad = g.createLinearGradient(x, y, x + (vertical ? w : 0), y + (vertical ? 0 : h));
  [[0, '#737E87'], [.12, '#D3D6D4'], [.29, '#FCFCF6'], [.46, '#E4E6E1'], [.78, '#A9B0AE'], [1, '#636D7C']].forEach(([s, c]) => grad.addColorStop(s as number, c as string));
  rect(g, x, y, w, h, grad, Math.min(3, h / 2), '#7D8691');
  line(g, [x + 1, y + 1, x + w - 1, y + 1], '#FFFFFF', .65);
}
export function bolt(g: Pen, x: number, y: number, r = 3.3) {
  circle(g, x + .6, y + 1.1, r + 1, '#6D768850'); circle(g, x, y, r + .8, '#E7E6DF', '#92999D', .5);
  const pts: number[] = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  poly(g, pts, '#D1D5D3', '#65717E', .65); line(g, [x - r * .45, y + r * .3, x + r * .45, y - r * .3], '#555F70', .8);
  line(g, [x - r * .5, y - r * .65, x + r * .4, y - r * .65], '#FFFFFF', .7);
}
/** Cast face, inset gasket, return face, and machined fastening land. */
export function plate(g: Pen, x: number, y: number, w: number, h: number, dark = false, screws = true) {
  rect(g, x + 4, y + 8, w + 2, h + 2, '#171C6019', 7);
  poly(g, [x + w, y, x + w + 8, y - 7, x + w + 8, y + h - 7, x + w, y + h], dark ? '#11183D' : '#929A9F');
  poly(g, [x, y, x + 8, y - 7, x + w + 8, y - 7, x + w, y], dark ? '#545D81' : '#FFFFFF');
  rect(g, x, y, w, h, dark ? C.navy : '#E9E9E2', 5, dark ? '#11183D' : '#7C858D');
  rect(g, x + 3, y + 3, w - 6, h - 6, dark ? '#242C66' : '#F6F5EF', 3, dark ? '#6C7795' : '#FFFFFF');
  if (screws) for (const a of [x + 9, x + w - 9]) for (const b of [y + 9, y + h - 9]) bolt(g, a, b, 2.6);
}
export function bearing(g: Pen, x: number, y: number, r = 18) {
  plate(g, x - r - 5, y - r - 5, r * 2 + 10, r * 2 + 10, false, false);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) bolt(g, x + sx * r, y + sy * r, 2.4);
  circle(g, x, y, r - 1, '#8D969C', '#626B79'); circle(g, x, y - .7, r - 4, '#EFF0EA', '#FFFFFF');
  circle(g, x, y, r - 8, '#485266', '#808C94'); circle(g, x, y, r - 10, '#C2C9C7'); bolt(g, x, y, 3.5);
}
export function gearSprite(radius: number, teeth: number, dark = false): Sprite {
  const b = radius + 10;
  const s = surface(b * 2, b * 2, g => {
    g.translate(b, b); const pts: number[] = [];
    for (let i = 0; i < teeth * 4; i++) { const a = i / (teeth * 4) * Math.PI * 2; const r = radius - ((i % 4 === 0 || i % 4 === 3) ? 4 : 0); pts.push(Math.cos(a) * r, Math.sin(a) * r); }
    g.save(); g.translate(1.5, 3); poly(g, pts, '#3A4255'); g.restore();
    poly(g, pts, dark ? '#46526C' : '#BCC4C3', '#596478'); circle(g, 0, 0, radius - 9, dark ? '#333F60' : '#E5E7E0', '#F8F9F2');
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; circle(g, Math.cos(a) * radius * .57, Math.sin(a) * radius * .57, radius * .15, '#4A5365', '#FFFFFF70'); }
    circle(g, 0, 0, radius * .28, '#F1F0E8', '#747D8B'); circle(g, 0, 0, radius * .18, '#89959C'); bolt(g, 0, 0, 5);
  }); s.anchor.set(.5); return s;
}
export function flywheelSprite(): Sprite {
  const s = surface(234, 234, g => {
    g.translate(117, 117);
    circle(g, 3, 5, 109, '#171C601C');
    circle(g, 0, 0, 108, '#636F7B', '#1A2446', 1.3); circle(g, 0, 0, 102, '#DBDFD9', '#FFFFFF', 1.5);
    circle(g, 0, 0, 96, C.navy);
    g.globalCompositeOperation = 'destination-out'; circle(g, 0, 0, 83, '#000000'); g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 6; i++) {
      g.save(); g.rotate(i * Math.PI / 3);
      poly(g, [8, -11, 84, -7, 89, 2, 80, 11, 9, 14], '#8994A3', '#586578');
      poly(g, [8, -12, 82, -9, 86, -2, 79, 5, 9, 8], '#F2F1E9', '#FFFFFF');
      bolt(g, 90, 0, 2.8); g.restore();
    }
    circle(g, 0, 0, 28, '#B3BDC0', '#FFFFFF'); circle(g, 0, 0, 21, C.navy, '#5D6D86'); bolt(g, 0, 0, 7);
    circle(g, 66, 0, 9, '#66798C', '#FFFFFF'); circle(g, 66, 0, 5, C.teal, '#1F727B');
    for (let i = 0; i < 120; i++) { const a = i * Math.PI / 60; const r = i % 5 ? 104 : 100; line(g, [Math.cos(a) * r, Math.sin(a) * r, Math.cos(a) * 107, Math.sin(a) * 107], '#F6F4EB', .6); }
  }); s.anchor.set(.5); return s;
}
