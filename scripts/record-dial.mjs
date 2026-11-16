/**
 * Deterministic 30 fps screen capture of the event dial, encoded to MP4.
 *
 * Why frames: headless Edge/WebGL cannot deliver MediaRecorder chunks here, so
 * each video frame is a real render of the engine after tick(1/30); the result
 * is a frame-accurate recording of the actual canvas (no post compositing).
 *
 * Timeline: READ → BASH (step) → BASH ×N (no step) → EDIT/WRITE/SEARCH →
 * 12 groups (one full 12-slot wrap) → READ. The readout never moves.
 *
 * Usage: npm run build && node scripts/record-dial.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launch } from './lib/browser.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'review', 'event-dial', 'recording');
const framesDir = path.join(out, 'frames');
fs.mkdirSync(framesDir, { recursive: true });
for (const f of fs.readdirSync(framesDir)) fs.rmSync(path.join(framesDir, f));

const FPS = 30;
const TOTAL = 330;

// frame → injected event (id increments automatically)
const events = [
  [5, 'Read', 'src/modes/loom/scene.ts · burst 1'],
  [45, 'Bash', 'npm test · 12/12 pass'],
  [90, 'Bash', 'npm test · 12/12 pass'],        // ×N, ring must not move
  [110, 'Bash', 'npm test · 12/12 pass'],
  [140, 'Edit', 'apply patch · eventDial.ts'],
  [165, 'Write', 'write · review.md'],
  [190, 'Search', 'grep · fixed readout'],
];
for (let i = 0; i < 12; i++) {
  events.push([215 + i * 3, i % 2 ? 'Edit' : 'Read', `wrap probe ${i + 1} · 12-slot ring`]);
}
events.push([292, 'Read', 'src/modes/loom/atelier/eventDial.ts · readout fixed']);

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const probe = spawnSync('python', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' });
  if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim();
  return 'ffmpeg';
}

const b = await launch({ root: path.join(root, 'dist'), httpPort: 4641, debugPort: 4741, width: 1472, height: 1008 });
try {
  await b.setViewport(1472, 1008, 1);
  await b.goto('?mode=loom&static=1&ui=0');
  let nextId = 1;
  const inject = (type, detail) => b.evaluate(
    `window.__engine.inject({id:${nextId++},type:${JSON.stringify(type)},detail:${JSON.stringify(detail)},at:0})`,
  );
  const tick = () => b.evaluate('window.__engine.tick(1/30)');
  const jpeg = async (file) => {
    const r = await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, captureBeyondViewport: false });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  };

  const queued = new Map(events.map(([frame, type, detail]) => [frame, () => inject(type, detail)]));
  for (let frame = 0; frame < TOTAL; frame++) {
    if (queued.has(frame)) await queued.get(frame)();
    await tick();
    await jpeg(path.join(framesDir, `frame_${String(frame).padStart(4, '0')}.jpg`));
    if (frame % 30 === 0) process.stdout.write(`\rframe ${frame}/${TOTAL}`);
  }
  process.stdout.write('\n');

  const ffmpeg = ffmpegPath();
  const mp4 = path.join(out, 'dial-readout-fixed.mp4');
  const encode = spawnSync(ffmpeg, [
    '-y', '-framerate', String(FPS), '-i', path.join(framesDir, 'frame_%04d.jpg'),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', mp4,
  ], { encoding: 'utf8' });
  if (encode.status !== 0) {
    console.error(encode.stderr?.slice(-2000));
    throw new Error('ffmpeg encode failed');
  }
  console.log('saved', mp4, (fs.statSync(mp4).size / 1024 / 1024).toFixed(2), 'MB');

  // stills for delivery (same deterministic state as the end of the clip)
  await b.setViewport(1472, 1008, 2);
  await b.screenshot(path.join(out, 'static-full-2x.png'));
  await b.screenshot(path.join(out, 'static-dial-2x.png'), { clip: { x: 0, y: 0, width: 460, height: 460, scale: 1 } });
  const dial = await b.evaluate('window.__engine.getModeTelemetry().dial');
  fs.writeFileSync(path.join(out, 'recording-telemetry.json'), JSON.stringify({ fps: FPS, frames: TOTAL, final: dial }, null, 2));
  console.log('final dial', JSON.stringify(dial));
} finally {
  await b.close();
}
