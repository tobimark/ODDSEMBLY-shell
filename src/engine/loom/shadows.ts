import { Container, Sprite, Texture } from 'pixi.js';

function radialShadow(w: number, h: number): Texture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
  g.addColorStop(0, 'rgba(74,62,48,0.30)');
  g.addColorStop(0.55, 'rgba(74,62,48,0.12)');
  g.addColorStop(1, 'rgba(74,62,48,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  return Texture.from(c);
}

function rectShadow(w: number, h: number): Texture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(74,62,48,0.22)');
  g.addColorStop(1, 'rgba(74,62,48,0.05)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // feather the edges
  const fade = x.createLinearGradient(0, 0, w, 0);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.12, 'rgba(0,0,0,0)');
  fade.addColorStop(0.88, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = fade;
  x.fillRect(0, 0, w, h);
  return Texture.from(c);
}

export class Shadows extends Container {
  constructor() {
    super();
    // loom body shadow on paper
    const body = new Sprite(radialShadow(640, 780));
    body.position.set(560, 150);
    body.width = 600; body.height = 780;
    this.addChild(body);
    // flywheel shadow
    const fly = new Sprite(radialShadow(280, 280));
    fly.position.set(320, 560); fly.width = 280; fly.height = 280;
    this.addChild(fly);
    // beam shadows
    for (const [x, y, w] of [[590, 730, 560], [300, 900, 900]] as const) {
      const s = new Sprite(rectShadow(w, 46));
      s.position.set(x, y); s.width = w; s.height = 46;
      this.addChild(s);
    }
  }
}
