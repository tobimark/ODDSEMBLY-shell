import { Sprite, Texture } from 'pixi.js';
import { FINISH as F } from './finish';

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
  // Micro-labels below 8 design px collapse at 730px; keep them as quiet texture.
  const quiet = size < 8;
  if (quiet) g.globalAlpha = .58;
  g.font = `${size}px Consolas, monospace`; g.textAlign = align; g.fillStyle = color; g.fillText(text, x, y); g.textAlign = 'left';
  if (quiet) g.globalAlpha = 1;
}
/** Machined rail: flat web, narrow recessed return and one edge reflection. */
export function metal(g: Pen, x: number, y: number, w: number, h: number, vertical = false) {
  rect(g, x, y, w, h, F.steel, Math.min(2,h/2), F.edge);
  if (vertical) {
    rect(g,x+w-2,y+1,1,h-2,F.recess); line(g,[x+1.5,y+2,x+1.5,y+h-2],F.highlight,.6);
    if(w>8) line(g,[x+w*.45,y+2,x+w*.45,y+h-2],F.fine,.4);
  } else {
    rect(g,x+1,y+h-2,w-2,1,F.recess); line(g,[x+2,y+1.5,x+w-2,y+1.5],F.highlight,.6);
    if(h>8) line(g,[x+2,y+h*.6,x+w-2,y+h*.6],F.fine,.4);
  }
}
export function bolt(g: Pen, x: number, y: number, r = 3.3) {
  // At 0.5x the hex kerf disappears; keep a quiet, readable fastener dot.
  circle(g,x,y,r*.72,F.steel,F.edge,.45);
  circle(g,x,y,r*.28,F.recess);
}
/** Folded enamel shell, 1.2px seam; no extruded perspective faces. */
export function plate(g: Pen, x: number, y: number, w: number, h: number, structural = false, screws = true) {
  rect(g,x+1.2,y+1.8,w,h,F.shadow,3);
  rect(g,x,y,w,h,F.enamel,3,structural ? F.muted : F.edge);
  if (structural) { g.beginPath(); g.roundRect(x,y,w,h,3); g.strokeStyle = F.muted; g.lineWidth = 1.5; g.stroke(); }
  rect(g,x+3,y+3,w-6,h-6,F.paper,1.5,F.fine);
  if(structural) {
    if(h>w) { line(g,[x+5,y+17,x+5,y+h-17],F.ink,1.1); line(g,[x+w-5,y+17,x+w-5,y+h-17],F.fine,.6); }
    else line(g,[x+17,y+h-4,x+w-17,y+h-4],F.ink,.9);
  }
  if(screws) for(const a of [x+9,x+w-9])for(const b of [y+9,y+h-9])bolt(g,a,b,2.6);
}
export function bearing(g: Pen, x: number, y: number, r=18) {
  plate(g,x-r-5,y-r-5,r*2+10,r*2+10,false,false);
  for(const sx of [-1,1])for(const sy of [-1,1])bolt(g,x+sx*r,y+sy*r,2.4);
  circle(g,x,y,r-1,F.steel,F.edge,.75);
  circle(g,x,y,r-4,F.paper,F.muted,.6);
  circle(g,x,y,r-7,F.enamel,F.fine,.5);
  circle(g,x,y,r-10,F.steel,F.muted,.65);
  bolt(g,x,y,3.2);
}
export function gearSprite(radius:number,teeth:number,dark=false):Sprite {
  const b=radius+10;
  const s=surface(b*2,b*2,g=>{
    g.translate(b,b);const pts:number[]=[];
    for(let i=0;i<teeth*4;i++){const a=i/(teeth*4)*Math.PI*2;const r=radius-((i%4===0||i%4===3)?4:0);pts.push(Math.cos(a)*r,Math.sin(a)*r);}
    poly(g,pts,F.steel,F.muted,.8);
    circle(g,0,0,radius-8,F.enamel,F.fine,.55);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;const x=Math.cos(a)*radius*.57,y=Math.sin(a)*radius*.57;
      g.globalCompositeOperation='destination-out';circle(g,x,y,radius*.14,'#000');g.globalCompositeOperation='source-over';
      g.beginPath();g.arc(x,y,radius*.14,0,Math.PI*2);g.strokeStyle=F.edge;g.lineWidth=.6;g.stroke();}
    circle(g,0,0,radius*.28,F.paper,F.muted,.65);bolt(g,0,0,4);
    if(dark) line(g,[0,-radius*.33,0,-radius*.46],F.ink,1.2);
  });s.anchor.set(.5);return s;
}
export function flywheelSprite():Sprite {
  const s=surface(234,234,g=>{
    g.translate(117,117);
    circle(g,0,0,108,F.enamel,F.muted,.9);
    circle(g,0,0,104,F.paper,F.fine,.6);
    circle(g,0,0,98,F.steel,F.ink,1);
    g.globalCompositeOperation='destination-out';circle(g,0,0,86,'#000');g.globalCompositeOperation='source-over';
    for(let i=0;i<6;i++){
      g.save();g.rotate(i*Math.PI/3);
      poly(g,[16,-5,87,-7,92,0,87,7,16,5],F.enamel,F.edge,.7);
      line(g,[28,0,79,0],F.fine,.5);bolt(g,92,0,2.4);g.restore();
    }
    circle(g,0,0,26,F.enamel,F.muted,.8);circle(g,0,0,19,F.paper,F.fine,.6);bolt(g,0,0,5);
    circle(g,66,0,6,F.paper,F.muted,.7);circle(g,66,0,2.8,C.teal);
    for(let i=0;i<120;i++){const a=i*Math.PI/60;line(g,[Math.cos(a)*(i%5?105:102),Math.sin(a)*(i%5?105:102),Math.cos(a)*107,Math.sin(a)*107],F.muted,.45);}
  });s.anchor.set(.5);return s;
}
