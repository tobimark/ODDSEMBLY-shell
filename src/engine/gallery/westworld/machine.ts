/**
 * Westworld plant — pure deterministic state machine.
 *
 * Every agent tool call is routed to one physical subsystem: Read feeds the
 * intake, Edit trims the regulator, Write fills the reservoir, Bash fires the
 * combustion cylinder (pressure + heat), Search sweeps the relay scanner.
 * Every 5 calls the relief valve blows and a punch-card ticket is printed;
 * every 20 calls the plant purges. No randomness, no wall clock: same event
 * stream => same pressures, same releases, same animations.
 */
import type { ToolEvent, ToolName } from '../../core/types';
import { clamp } from '../../core/spring';

export type Channel = 'INTAKE' | 'REGULATOR' | 'RESERVOIR' | 'COMBUSTION' | 'SCANNER';

export interface FamilySpec {
  channel: Channel;
  label: string;
  cn: string;
  pressure: number;
  heat: number;
  level: number;
  valve: number;
  scan: number;
  duration: number;
  tint: string;
}

export const FAMILY_SPEC: Record<ToolName, FamilySpec> = {
  Read: { channel: 'INTAKE', label: 'INTAKE', cn: '进料', pressure: 0.07, heat: 0, level: 0.0, valve: 0.5, scan: 0.15, duration: 0.52, tint: '#425679' },
  Edit: { channel: 'REGULATOR', label: 'REGULATOR', cn: '调压', pressure: 0.1, heat: 0.02, level: 0.13, valve: 0.75, scan: 0, duration: 0.6, tint: '#171C60' },
  Write: { channel: 'RESERVOIR', label: 'RESERVOIR', cn: '蓄能', pressure: 0.13, heat: 0, level: 0.18, valve: 0.65, scan: 0, duration: 0.66, tint: '#1F8F92' },
  Bash: { channel: 'COMBUSTION', label: 'COMBUSTION', cn: '燃烧', pressure: 0.22, heat: 0.26, level: 0, valve: 0.95, scan: 0, duration: 0.56, tint: '#A6513F' },
  Search: { channel: 'SCANNER', label: 'SCANNER', cn: '扫描', pressure: 0.06, heat: 0.01, level: 0.0, valve: 0.4, scan: 1, duration: 0.46, tint: '#5F7A6B' },
};

export const RELEASE_EVERY = 5;
export const PURGE_EVERY = 20;

export interface MachineFx {
  kind: 'actuate' | 'release' | 'purge';
  family?: ToolName;
  index: number;
}

export interface ReleaseRecord {
  index: number;
  families: ToolName[];
  ticket: string;
}

export interface MachineSnapshot {
  pressure: number;
  heat: number;
  charge: number;
  total: number;
  releases: number;
  purges: number;
  levels: { intake: number; regulator: number; reservoir: number };
  valves: Record<ToolName, number>;
  scan: number;
  drive: number;
  activeFamily: ToolName | null;
  progress: number;
  queued: number;
  stage: string;
  lastRelease: ReleaseRecord | null;
  lastPurge: number;
  settled: number;
}

const BASE_PRESSURE = 0.16;
const BASE_LEVELS = { intake: 0.12, regulator: 0.16, reservoir: 0.1 };

export class WestworldMachine {
  pressure = BASE_PRESSURE;
  heat = 0.06;
  total = 0;
  releases = 0;
  purges = 0;
  settled = 0;
  drive = 0;
  scan = 0;
  levels = { ...BASE_LEVELS };
  valves: Record<ToolName, number> = { Read: 0, Edit: 0, Write: 0, Bash: 0, Search: 0 };
  activeFamily: ToolName | null = null;
  progress = 0;
  lastRelease: ReleaseRecord | null = null;
  lastPurge = 0;
  readonly tickets: ReleaseRecord[] = [];
  private queue: ToolEvent[] = [];
  private active: ToolEvent | null = null;
  private fx: MachineFx[] = [];
  private settleOrder: ToolName[] = [];

  trigger(event: ToolEvent): void {
    this.queue.push(event);
    if (!this.active) this.startNext();
  }

  private startNext(): void {
    const next = this.queue.shift();
    if (!next) { this.active = null; this.activeFamily = null; this.progress = 0; return; }
    this.active = next;
    this.activeFamily = next.type;
    this.progress = 0;
    const spec = FAMILY_SPEC[next.type];
    this.valves[next.type] = Math.min(1.6, this.valves[next.type] + spec.valve);
    this.fx.push({ kind: 'actuate', family: next.type, index: this.total });
  }

  update(dt: number): void {
    // mechanical relaxation
    this.pressure += (BASE_PRESSURE + this.levels.reservoir * 0.18 + this.levels.intake * 0.08 - this.pressure) * Math.min(1, dt * 0.5);
    this.heat = Math.max(0.04, this.heat - this.heat * dt * 0.42 + 0.002 * dt);
    this.scan = Math.max(0, this.scan - dt * 1.6);
    for (const f of Object.keys(this.valves) as ToolName[]) this.valves[f] = Math.max(0, this.valves[f] - dt * 0.9);
    this.drive += dt * (0.35 + this.pressure * 2.4 + this.heat * 1.2);
    this.levels.intake = Math.max(BASE_LEVELS.intake, this.levels.intake - dt * 0.006);
    this.levels.regulator = Math.max(BASE_LEVELS.regulator, this.levels.regulator - dt * 0.004);
    this.levels.reservoir = Math.max(BASE_LEVELS.reservoir, this.levels.reservoir - dt * 0.005);

    if (!this.active) {
      if (this.queue.length) this.startNext();
      return;
    }
    const spec = FAMILY_SPEC[this.active.type];
    this.progress += dt / spec.duration;
    if (this.progress < 1) return;

    // ---- one call completes: apply its mechanical effect deterministically
    const family = this.active.type;
    this.total += 1;
    this.settled += 1;
    this.settleOrder.push(family);
    this.pressure = clamp(this.pressure + spec.pressure, 0, 1);
    this.heat = clamp(this.heat + spec.heat, 0, 1);
    this.scan = clamp(this.scan + spec.scan, 0, 1);
    if (family === 'Read') this.levels.intake = clamp(this.levels.intake + spec.level + 0.16, 0, 1);
    if (family === 'Edit') this.levels.regulator = clamp(this.levels.regulator + spec.level + 0.14, 0, 1);
    if (family === 'Write') this.levels.reservoir = clamp(this.levels.reservoir + spec.level + 0.1, 0, 1);
    this.active = null;
    this.progress = 0;

    if (this.total % RELEASE_EVERY === 0) this.fireRelease();
    else if (this.total % PURGE_EVERY === 0) this.firePurge();

    if (this.queue.length) this.startNext();
    else { this.activeFamily = null; }
  }

  private fireRelease(): void {
    this.releases += 1;
    const families = this.settleOrder.slice(-RELEASE_EVERY);
    const ticket = families.map((f) => FAMILY_SPEC[f].label.slice(0, 4)).join(' · ');
    const record: ReleaseRecord = { index: this.releases, families, ticket };
    this.lastRelease = record;
    this.tickets.push(record);
    if (this.tickets.length > 6) this.tickets.shift();
    this.pressure = clamp(this.pressure - 0.34, 0.08, 1);
    this.levels.intake = clamp(this.levels.intake - 0.12, BASE_LEVELS.intake, 1);
    this.levels.reservoir = clamp(this.levels.reservoir - 0.1, BASE_LEVELS.reservoir, 1);
    this.levels.regulator = clamp(this.levels.regulator - 0.08, BASE_LEVELS.regulator, 1);
    this.fx.push({ kind: 'release', index: this.releases });
    // purge check happens on its own count
    if (this.total % PURGE_EVERY === 0) this.firePurge();
  }

  private firePurge(): void {
    this.purges += 1;
    this.lastPurge = this.purges;
    this.pressure = clamp(this.pressure - 0.2, 0.05, 1);
    this.heat = 0.04;
    this.levels = { intake: BASE_LEVELS.intake, regulator: BASE_LEVELS.regulator, reservoir: BASE_LEVELS.reservoir };
    this.fx.push({ kind: 'purge', index: this.purges });
  }

  takeFx(): MachineFx[] {
    const out = this.fx;
    this.fx = [];
    return out;
  }

  /** stop(): drop queued calls but let the currently actuating one finish */
  clearQueue(): void {
    this.queue = [];
    if (!this.active) this.activeFamily = null;
  }

  snapshot(): MachineSnapshot {
    return {
      pressure: this.pressure,
      heat: this.heat,
      charge: this.total,
      total: this.total,
      releases: this.releases,
      purges: this.purges,
      levels: { ...this.levels },
      valves: { ...this.valves },
      scan: this.scan,
      drive: this.drive,
      activeFamily: this.activeFamily,
      progress: this.progress,
      queued: this.queue.length + (this.active ? 1 : 0),
      stage: this.active ? 'ACTUATING' : this.queue.length ? 'QUEUED' : this.releases > 0 ? 'STABLE' : 'IDLE',
      lastRelease: this.lastRelease,
      lastPurge: this.lastPurge,
      settled: this.settled,
    };
  }

  reset(): void {
    this.pressure = BASE_PRESSURE;
    this.heat = 0.06;
    this.total = 0; this.releases = 0; this.purges = 0; this.settled = 0; this.drive = 0; this.scan = 0;
    this.levels = { ...BASE_LEVELS };
    this.valves = { Read: 0, Edit: 0, Write: 0, Bash: 0, Search: 0 };
    this.active = null; this.activeFamily = null; this.progress = 0;
    this.queue = []; this.fx = []; this.settleOrder = []; this.tickets.length = 0;
    this.lastRelease = null; this.lastPurge = 0;
  }
}
