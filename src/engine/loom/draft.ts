import { Container, Graphics, Text } from 'pixi.js';
import { FONT, T, EVENT_COLORS } from '../theme';

/** Weaving draft / peg plan inset — procedural pattern grid tied to tool events. */
export class DraftPanel extends Container {
  private grid = new Graphics();
  private rows = 10;
  private cols = 14;
  private marks: number[][] = [];
  private t = 0;

  constructor() {
    super();
    const x = 96, y = 556, w = 196, h = 168;
    const g = new Graphics();
    g.roundRect(x, y, w, h, 4).fill({ color: 0xf7f2e9, alpha: 0.85 }).stroke({ width: 0.7, color: T.navy, alpha: 0.35 });
    g.moveTo(x + 10, y + 26).lineTo(x + w - 10, y + 26).stroke({ width: 0.4, color: T.navy, alpha: 0.2 });
    this.addChild(g);
    const title = new Text({ text: 'DRAFT / PEG PLAN', style: { fontFamily: FONT.mono, fontSize: 7, fill: T.navy, letterSpacing: 1.3 } });
    title.position.set(x + 10, y + 9); title.alpha = 0.55; this.addChild(title);
    for (let r = 0; r < this.rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < this.cols; c++) row.push(((r * 3 + c * 5 + 2) % 11 < 4) ? 1 : 0);
      this.marks.push(row);
    }
    this.addChild(this.grid);
  }

  addEvent(): void {
    this.marks.shift();
    const row: number[] = [];
    for (let c = 0; c < this.cols; c++) row.push((Math.sin(this.t * 3 + c) + 1) / 2 > 0.55 ? 1 : 0);
    this.marks.push(row);
  }

  update(dt: number): void {
    this.t += dt;
    const g = this.grid;
    g.clear();
    const x = 106, y = 588, cw = 12, ch = 12;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const on = this.marks[r][c] > 0.5;
        g.rect(x + c * cw, y + r * ch, cw - 1, ch - 1)
          .fill({ color: on ? T.teal : T.navy, alpha: on ? 0.16 : 0.04 })
          .stroke({ width: 0.3, color: T.navy, alpha: 0.12 });
      }
    }
    // highlight current row
    g.rect(x - 2, y + (this.rows - 1) * ch, this.cols * cw + 2, ch - 1).stroke({ width: 0.6, color: T.teal, alpha: 0.5 });
  }
}
