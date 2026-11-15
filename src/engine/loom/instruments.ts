import { Container, Graphics, Text } from 'pixi.js';
import { PANEL } from '../layout';
import { EVENT_COLORS, FONT, T } from '../theme';
import type { EngineStatus, ToolEvent, ToolName } from '../events/types';
import { Spring } from '../anim/spring';

const TOOLS: ToolName[] = ['Read', 'Edit', 'Write', 'Bash', 'Search'];

class Gauge extends Container {
  readonly needle = new Graphics();
  private labelText: Text;
  private spring = new Spring(0.5, { stiffness: 90, damping: 12 });

  constructor(title: string, private readonly unit: string) {
    super();
    const R = 33;
    const g = new Graphics();
    g.circle(0, 0, R).fill({ color: 0xf7f2e9, alpha: 0.95 }).stroke({ width: 0.9, color: T.navy, alpha: 0.55 });
    g.circle(0, 0, R - 5).stroke({ width: 0.4, color: T.navy, alpha: 0.22 });
    // tick arc from -210° to 30°
    for (let i = 0; i <= 24; i++) {
      const a = (-210 + (i / 24) * 240) * (Math.PI / 180);
      const major = i % 6 === 0;
      const r0 = R - (major ? 9 : 5);
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0).lineTo(Math.cos(a) * (R - 2), Math.sin(a) * (R - 2));
      g.stroke({ width: major ? 0.8 : 0.4, color: T.navy, alpha: major ? 0.6 : 0.35 });
    }
    // teal working zone
    g.moveTo(Math.cos((-40 * Math.PI) / 180) * (R - 14), Math.sin((-40 * Math.PI) / 180) * (R - 14));
    g.arc(0, 0, R - 14, (-40 * Math.PI) / 180, (10 * Math.PI) / 180);
    g.stroke({ width: 1.6, color: T.teal, alpha: 0.35 });
    g.circle(0, 0, 3.2).fill({ color: T.navy, alpha: 0.6 });
    this.addChild(g, this.needle);

    const t = new Text({ text: title, style: { fontFamily: FONT.mono, fontSize: 7.5, fill: T.navy, letterSpacing: 1.2 } });
    t.anchor.set(0.5); t.position.set(0, R + 14); t.alpha = 0.6; this.addChild(t);
    this.labelText = new Text({ text: '—', style: { fontFamily: FONT.mono, fontSize: 8, fill: T.navy, letterSpacing: 0.6 } });
    this.labelText.anchor.set(0.5); this.labelText.position.set(0, R + 26); this.labelText.alpha = 0.5; this.addChild(this.labelText);
  }

  setTarget(v: number, label?: string): void {
    this.spring.target = Math.max(0, Math.min(1, v));
    if (label !== undefined) this.labelText.text = `${label} ${this.unit}`;
  }

  update(dt: number): void {
    this.spring.step(dt);
    const a = (-210 + this.spring.value * 240) * (Math.PI / 180);
    this.needle.clear();
    this.needle.moveTo(0, 0).lineTo(Math.cos(a) * 26, Math.sin(a) * 26).stroke({ width: 1.3, color: T.navy, alpha: 0.75 });
    this.needle.circle(Math.cos(a) * 26, Math.sin(a) * 26, 1.6).fill({ color: T.teal, alpha: 0.9 });
  }
}

/** Right-hand telemetry panel: gauges, counters, tool mix, event ledger. */
export class Instruments extends Container {
  private gauges: Gauge[] = [];
  private countText: Text;
  private toolCounts: Text[] = [];
  private toolBars: Graphics[] = [];
  private ledgerNames: Text[] = [];
  private ledgerDetails: Text[] = [];
  private ledgerDots: Graphics[] = [];
  private led = new Graphics();
  private stateText: Text;
  private t = 0;
  private rateG = new Graphics();
  private rateVal = 0;

  constructor() {
    super();
    this.buildPanel();
    this.buildGauges();
    this.buildCounters();
    this.buildLedger();
    this.countText = this.buildCounterText();
    this.stateText = this.buildState();
    this.buildRate();
    this.addChild(this.rateG);
  }

  private buildPanel(): void {
    const g = new Graphics();
    g.roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 6).fill({ color: 0xf6f0e7, alpha: 0.92 }).stroke({ width: 0.9, color: T.navy, alpha: 0.5 });
    g.roundRect(PANEL.x + 5, PANEL.y + 5, PANEL.w - 10, PANEL.h - 10, 4).stroke({ width: 0.4, color: T.navy, alpha: 0.2 });
    // header
    g.moveTo(PANEL.x + 10, PANEL.y + 30).lineTo(PANEL.x + PANEL.w - 10, PANEL.y + 30).stroke({ width: 0.5, color: T.navy, alpha: 0.3 });
    // screws
    for (const [x, y] of [[PANEL.x + 9, PANEL.y + 9], [PANEL.x + PANEL.w - 9, PANEL.y + 9], [PANEL.x + 9, PANEL.y + PANEL.h - 9], [PANEL.x + PANEL.w - 9, PANEL.y + PANEL.h - 9]] as const) {
      g.circle(x, y, 3).stroke({ width: 0.5, color: T.navy, alpha: 0.4 });
      g.moveTo(x - 2, y).lineTo(x + 2, y).stroke({ width: 0.4, color: T.navy, alpha: 0.35 });
    }
    this.addChild(g);

    const title = new Text({ text: 'TELEMETRY / LOOM-01', style: { fontFamily: FONT.mono, fontSize: 8.5, fill: T.navy, letterSpacing: 1.6 } });
    title.position.set(PANEL.x + 12, PANEL.y + 11); title.alpha = 0.7;
    this.addChild(title);
    const sub = new Text({ text: 'MECHANICAL STATE', style: { fontFamily: FONT.mono, fontSize: 6.8, fill: T.navy, letterSpacing: 1.2 } });
    sub.position.set(PANEL.x + 12, PANEL.y + 20); sub.alpha = 0.4;
    this.addChild(sub);
  }

  private buildGauges(): void {
    const labels = ['RPM', 'TENSION', 'DENSITY'];
    labels.forEach((l, i) => {
      const gauge = new Gauge(l, i === 0 ? 'rpm' : '%');
      gauge.position.set(PANEL.x + PANEL.w / 2, PANEL.y + 82 + i * 96);
      this.gauges.push(gauge);
      this.addChild(gauge);
    });
  }

  private buildCounters(): void {
    const y = PANEL.y + 372;
    const title = new Text({ text: 'TOOL CALLS / TOTAL', style: { fontFamily: FONT.mono, fontSize: 7, fill: T.navy, letterSpacing: 1.4 } });
    title.position.set(PANEL.x + 14, y); title.alpha = 0.55; this.addChild(title);

    // tool mix rows
    const my = y + 66;
    TOOLS.forEach((tool, i) => {
      const yy = my + i * 22;
      const dot = new Graphics();
      dot.circle(PANEL.x + 18, yy + 5, 3).fill({ color: EVENT_COLORS[tool], alpha: 0.9 });
      this.addChild(dot);
      const name = new Text({ text: tool.toUpperCase(), style: { fontFamily: FONT.mono, fontSize: 7.5, fill: T.navy, letterSpacing: 1 } });
      name.position.set(PANEL.x + 27, yy); name.alpha = 0.65; this.addChild(name);
      const bar = new Graphics();
      this.addChild(bar);
      this.toolBars.push(bar);
      const cnt = new Text({ text: '0', style: { fontFamily: FONT.mono, fontSize: 8, fill: T.navy } });
      cnt.anchor.set(1, 0); cnt.position.set(PANEL.x + PANEL.w - 14, yy); cnt.alpha = 0.6;
      this.addChild(cnt);
      this.toolCounts.push(cnt);
    });
  }

  private buildCounterText(): Text {
    const t = new Text({ text: '000', style: { fontFamily: FONT.mono, fontSize: 30, fill: T.navy, letterSpacing: 2 } });
    t.position.set(PANEL.x + 14, PANEL.y + 390);
    this.addChild(t);
    return t;
  }

  private buildLedger(): void {
    const y0 = PANEL.y + 594;
    const title = new Text({ text: 'EVENT LEDGER', style: { fontFamily: FONT.mono, fontSize: 7, fill: T.navy, letterSpacing: 1.5 } });
    title.position.set(PANEL.x + 14, y0); title.alpha = 0.55; this.addChild(title);
    for (let i = 0; i < 3; i++) {
      const y = y0 + 16 + i * 26;
      const dot = new Graphics();
      dot.circle(PANEL.x + 17, y + 6, 2.6).fill({ color: T.navy, alpha: 0.25 });
      this.addChild(dot);
      this.ledgerDots.push(dot);
      const name = new Text({ text: '—', style: { fontFamily: FONT.mono, fontSize: 8, fill: T.navy, letterSpacing: 0.8 } });
      name.position.set(PANEL.x + 25, y); name.alpha = 0.72; this.addChild(name);
      this.ledgerNames.push(name);
      const detail = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 6.8, fill: T.navy } });
      detail.position.set(PANEL.x + 25, y + 11); detail.alpha = 0.45; this.addChild(detail);
      this.ledgerDetails.push(detail);
      if (i < 2) {
        const line = new Graphics();
        line.moveTo(PANEL.x + 14, y + 28).lineTo(PANEL.x + PANEL.w - 14, y + 28).stroke({ width: 0.35, color: T.navy, alpha: 0.12 });
        this.addChild(line);
      }
    }
  }

  private buildRate(): void {
    const x = PANEL.x + 14, y = PANEL.y + 548;
    const title = new Text({ text: 'EVENT RATE / 15S', style: { fontFamily: FONT.mono, fontSize: 6.8, fill: T.navy, letterSpacing: 1.3 } });
    title.position.set(x, y); title.alpha = 0.55; this.addChild(title);
  }

  private drawRate(rate: number): void {
    const g = this.rateG;
    g.clear();
    const x0 = PANEL.x + 14, y0 = PANEL.y + 562, w = PANEL.w - 28, h = 18;
    for (let i = 0; i < 15; i++) {
      const filled = i < Math.min(15, rate);
      const bh = filled ? Math.max(3, h * (0.35 + 0.65 * Math.min(1, rate / 15))) : 3;
      g.roundRect(x0 + i * (w / 15) + 1, y0 + h - bh, w / 15 - 3, bh, 1).fill({ color: filled ? T.teal : T.navy, alpha: filled ? 0.55 : 0.08 });
    }
    g.moveTo(x0, y0 + h + 1).lineTo(x0 + w, y0 + h + 1).stroke({ width: 0.4, color: T.navy, alpha: 0.2 });
  }

  private buildState(): Text {
    const y = PANEL.y + PANEL.h - 20;
    const t = new Text({ text: 'IDLE', style: { fontFamily: FONT.mono, fontSize: 8, fill: T.teal, letterSpacing: 2 } });
    t.position.set(PANEL.x + 30, y);
    this.addChild(t);
    this.led.circle(PANEL.x + 20, y + 5, 3.4).fill({ color: T.teal, alpha: 0.9 });
    this.addChild(this.led);
    return t;
  }

  setStatus(s: EngineStatus): void {
    this.countText.text = String(s.events).padStart(3, '0');
    TOOLS.forEach((tool, i) => {
      const c = s.counts[tool];
      this.toolCounts[i].text = String(c);
      const w = Math.min(96, c * 9);
      const bar = this.toolBars[i];
      bar.clear();
      const by = PANEL.y + 372 + 66 + i * 22 - 2;
      bar.roundRect(PANEL.x + 86, by, 96, 5, 2).stroke({ width: 0.35, color: T.navy, alpha: 0.18 });
      bar.roundRect(PANEL.x + 86, by, Math.max(2, w), 5, 2).fill({ color: EVENT_COLORS[tool], alpha: 0.55 });
    });
    this.rateVal += (s.rate15s - this.rateVal) * 0.2;
    this.drawRate(Math.round(this.rateVal));
    this.stateText.text = s.state.toUpperCase();
    this.stateText.style.fill = s.state === 'running' ? T.teal : s.state === 'paused' ? T.brass : T.navySoft;
    s.recent.slice(0, 4).forEach((e: ToolEvent, i) => {
      this.ledgerNames[i].text = e.type.toUpperCase();
      this.ledgerNames[i].style.fill = EVENT_COLORS[e.type];
      this.ledgerDetails[i].text = e.detail.slice(0, 30);
      const dot = this.ledgerDots[i];
      dot.clear(); dot.circle(PANEL.x + 17, PANEL.y + 570 + 20 + i * 38 + 6, 2.6).fill({ color: EVENT_COLORS[e.type], alpha: 0.85 });
    });
  }

  setGaugeValue(i: number, v: number, label?: string): void {
    this.gauges[i]?.setTarget(v, label);
  }

  update(dt: number, rpm: number, t: number): void {
    this.t += dt;
    for (const g of this.gauges) g.update(dt);
    const pulse = 0.55 + 0.45 * Math.sin(t * 3.2);
    this.led.alpha = 0.4 + pulse * 0.6;
  }
}

/** Left console: tension dial and manual lever. */
export class Console extends Container {
  private needle = new Graphics();
  private spring = new Spring(0.35, { stiffness: 70, damping: 10 });
  private t = 0;
  private rateG = new Graphics();
  private rateVal = 0;

  constructor() {
    super();
    const x = 64, y = 768, w = 236, h = 112;
    const g = new Graphics();
    g.roundRect(x, y, w, h, 5).fill({ color: 0xf6f0e7, alpha: 0.9 }).stroke({ width: 0.85, color: T.navy, alpha: 0.45 });
    g.roundRect(x + 5, y + 5, w - 10, h - 10, 3).stroke({ width: 0.35, color: T.navy, alpha: 0.18 });
    // tension arc
    const cx = x + 54, cy = y + h - 26, R = 42;
    g.moveTo(cx + Math.cos((-210 * Math.PI) / 180) * R, cy + Math.sin((-210 * Math.PI) / 180) * R);
    g.arc(cx, cy, R, (-210 * Math.PI) / 180, (30 * Math.PI) / 180);
    g.stroke({ width: 0.5, color: T.navy, alpha: 0.3 });
    for (let i = 0; i <= 20; i++) {
      const a = (-210 + (i / 20) * 240) * (Math.PI / 180);
      const major = i % 5 === 0;
      g.moveTo(cx + Math.cos(a) * (R - (major ? 8 : 4)), cy + Math.sin(a) * (R - (major ? 8 : 4)));
      g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.stroke({ width: major ? 0.7 : 0.4, color: T.navy, alpha: major ? 0.55 : 0.3 });
    }
    g.circle(cx, cy, 3).fill({ color: T.navy, alpha: 0.55 });
    // tension bar
    g.roundRect(x + 130, y + 26, 12, 60, 5).stroke({ width: 0.6, color: T.navy, alpha: 0.35 });
    g.roundRect(x + 132, y + 28, 8, 56, 4).fill({ color: 0xffffff, alpha: 0.4 });
    // lever
    g.circle(x + 200, y + 56, 16).stroke({ width: 0.8, color: T.navy, alpha: 0.45 });
    g.circle(x + 200, y + 56, 4).fill({ color: T.navy, alpha: 0.45 });
    g.moveTo(x + 200, y + 56).lineTo(x + 216, y + 38).stroke({ width: 1.4, color: T.navy, alpha: 0.6 });
    this.addChild(g);
    this.needle.circle(0, 0, 1.8).fill({ color: T.teal, alpha: 0.95 });
    this.addChild(this.needle);
    this.needle.position.set(cx, cy);

    const title = new Text({ text: 'TENSION CONTROL', style: { fontFamily: FONT.mono, fontSize: 7.5, fill: T.navy, letterSpacing: 1.3 } });
    title.position.set(x + 12, y + 10); title.alpha = 0.55; this.addChild(title);
    const val = new Text({ text: '0.35', style: { fontFamily: FONT.mono, fontSize: 8, fill: T.navy } });
    val.position.set(x + 150, y + 92); val.alpha = 0.5; val.name = 'value'; this.addChild(val);
  }

  setTension(v: number): void { this.spring.target = Math.max(0, Math.min(1, v)); }

  update(dt: number): void {
    this.spring.step(dt);
    const a = (-210 + this.spring.value * 240) * (Math.PI / 180);
    this.needle.rotation = a + Math.PI / 2;
    const v = this.children.find((c) => c.name === 'value') as Text | undefined;
    if (v) v.text = this.spring.value.toFixed(2);
    // marker on bar
    this.t += dt;
  }
}
