/**
 * Real-time recording harness: one live WebM (VP9 video + Opus audio) per mode,
 * driven by the real replay transport on the wall clock (no manual ticks), then
 * converted to MP4 with ffmpeg when an ffmpeg binary is available.
 *
 * FINAL DELIVERY SCOPE = Loom only (Chips/Westworld archived). Defaults to Loom.
 *
 *   node scripts/record-v2.mjs                        # Loom, dist/, ~25 s
 *   node scripts/record-v2.mjs --tail=18000           # shorter settle tail
 *   node scripts/record-v2.mjs --no-mp4
 *   node scripts/record-v2.mjs --modes=chips --root-chips=ARCHIVE_DIST  # archived replay
 *
 * Per mode: loads `?mode=<id>&noauto=1&ui=0`, starts
 * canvas.captureStream(30) + engine.audio.recordingStream audio track in
 * MediaRecorder, calls engine.startReplay() (wall-clock replay), records for
 * session length + tail, and collects:
 *   - audio beat ledger (eventId sequence)
 *   - requestAnimationFrame frame stats (count / mean fps / p95 frame interval)
 *   - replay cursor + mode telemetry + uncaught errors
 * Output: review/v2/recordings/<mode>-live.webm (+ -live.mp4) and recordings.json.
 *
 * ffmpeg is not installed system-wide in this workspace; FFMPEG_PATH is honoured
 * first and known local installs are auto-detected. If absent, MP4 conversion is
 * explicitly reported as skipped rather than faked.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch, fileHash, sleep } from './lib/browser.mjs';
import { LOOM_SESSION } from './lib/fixtures.mjs';

const root = path.resolve(import.meta.dirname, '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
}));
if (argv.help) {
  console.log('usage: node scripts/record-v2.mjs [--modes=loom,chips,westworld] [--root=dist] [--root-<mode>=DIR] [--port=4530] [--tail=20000] [--out=review/v2] [--no-mp4] [--strict]');
  process.exit(0);
}
const mainRoot = path.resolve(root, argv.root || 'dist');
const modes = String(argv.modes || (argv.archived ? 'loom,chips,westworld' : 'loom')).split(',').map((s) => s.trim()).filter(Boolean);
const loomOnly = modes.length === 1 && modes[0] === 'loom';
const outDir = path.resolve(argv.out || path.join(root, 'review', 'v2', loomOnly ? 'loom' : 'recordings'));
const basePort = Number(argv.port || 4530);
const tailMs = Number(argv.tail || 20000);
const fps = Number(argv.fps || 30);
const doMp4 = !argv['no-mp4'];
fs.mkdirSync(outDir, { recursive: true });

const FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH,
  argv.ffmpeg,
  // imageio-ffmpeg's bundled gyan.dev essentials build (libx264 + aac, vp9/opus decoders)
  'C:\\Users\\51159\\AppData\\Roaming\\Python\\Python312\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe',
  // bilibili's bundled ffmpeg (libx264 + aac, older 3.x)
  'C:\\Users\\51159\\AppData\\Roaming\\bilibili\\ffmpeg\\ffmpeg.exe',
  'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
  'C:\\ffmpeg\\bin\\ffmpeg.exe',
  'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
  'ffmpeg',
].filter(Boolean);
let ffmpegRejection = null;
function probeFfmpeg(command) {
  const run = (args) => spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  const version = run(['-version']);
  if (version.error || version.status !== 0) return null;
  const enc = run(['-hide_banner', '-encoders']);
  const dec = run(['-hide_banner', '-decoders']);
  const encoders = `${enc.stdout || ''}${enc.stderr || ''}`;
  const decoders = `${dec.stdout || ''}${dec.stderr || ''}`;
  const hasVideoEncoder = /libx264/.test(encoders);
  const hasAudioEncoder = /^ ?A[.A-Z]{5} aac /m.test(encoders);
  const hasVp9Decoder = /\bvp9\b/.test(decoders);
  const hasOpusDecoder = /\bopus\b/.test(decoders);
  if (!hasVideoEncoder || !hasAudioEncoder) {
    ffmpegRejection = { command, reason: 'build lacks libx264/aac encoders (stripped ffmpeg)', version: (version.stdout || '').split('\n')[0].trim() };
    return null;
  }
  return {
    command,
    version: (version.stdout || '').split('\n')[0].trim(),
    capabilities: { libx264: hasVideoEncoder, aac: hasAudioEncoder, vp9Decoder: hasVp9Decoder, opusDecoder: hasOpusDecoder },
  };
}
function findFfmpeg() {
  const capable = [];
  for (const cand of FFMPEG_CANDIDATES) {
    if (cand !== 'ffmpeg' && !fs.existsSync(cand)) continue;
    const probe = probeFfmpeg(cand);
    if (probe) capable.push(probe);
    if (probe?.capabilities?.vp9Decoder && probe?.capabilities?.opusDecoder) return probe;
  }
  return capable[0] ?? null;
}

let ffmpegCache = null;
let ffmpegProbed = false;
const getFfmpeg = () => { if (!ffmpegProbed) { ffmpegProbed = true; ffmpegCache = findFfmpeg(); } return ffmpegCache; };

const rootFor = (mode) => { const key = `root-${mode}`; return argv[key] ? path.resolve(root, argv[key]) : mainRoot; };
const rel = (p) => path.relative(root, p).replaceAll('\\', '/') || '.';

function sessionFor(rootDir, mode) {
  const perMode = path.join(rootDir, 'replay', `${mode}-session.json`);
  if (fs.existsSync(perMode)) {
    const file = JSON.parse(fs.readFileSync(perMode, 'utf8'));
    return { url: null, file: rel(perMode), lastAt: Math.max(0, ...file.events.map((e) => e.at)), modeSpecific: true, name: file.name };
  }
  const shared = path.join(rootDir, LOOM_SESSION);
  if (fs.existsSync(shared)) {
    const file = JSON.parse(fs.readFileSync(shared, 'utf8'));
    return { url: LOOM_SESSION, file: LOOM_SESSION, lastAt: Math.max(0, ...file.events.map((e) => e.at)), modeSpecific: false, name: file.name };
  }
  return null;
}

/** Set up canvas+audio recorder, rAF probe and start the wall-clock replay. */
async function startCapture(browser, session) {
  const setup = await browser.evaluate(`(async()=>{
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };
    const audio = window.__engine.audio;
    audio.ensure();
    const stream = canvas.captureStream(${fps});
    const audioStream = audio.recordingStream;
    const audioTracks = audioStream.getAudioTracks();
    audioTracks.forEach(t => stream.addTrack(t));
    const candidates = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
    const mimeType = candidates.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 9000000 } : { videoBitsPerSecond: 9000000 });
    window.__rec = { chunks: [], recorder: rec, measuring: true, frames: [] };
    rec.ondataavailable = e => { if (e.data.size) window.__rec.chunks.push(e.data); };
    window.__rec.done = new Promise(resolve => { rec.onstop = () => resolve(true); });
    const probe = t => { window.__rec.frames.push(t); if (window.__rec.measuring) requestAnimationFrame(probe); };
    requestAnimationFrame(probe);
    window.__rec.startedAt = performance.now();
    rec.start(1000);
    window.__engine.setSpeed(1);
    await window.__engine.startReplay(${session.url ? `{ url: ${JSON.stringify(session.url)} }` : ''});
    return {
      mime: window.__rec.mime || rec.mimeType,
      audioTracks: audioTracks.length,
      videoTracks: stream.getVideoTracks().length,
      audioState: audio.state,
      replay: window.__engine.getStatus().replay,
    };
  })()`);
  return setup;
}

async function recordMode(mode, port) {
  const rootDir = rootFor(mode);
  const result = {
    mode,
    root: rel(rootDir),
    status: 'skipped',
    session: null,
    capture: null,
    facts: null,
    raf: null,
    beats: null,
    recording: null,
    checks: [],
    errors: null,
    notes: [],
  };
  if (!fs.existsSync(rootDir)) { result.notes.push(`build root not found: ${rootDir} — skipped`); return result; }
  const session = sessionFor(rootDir, mode);
  if (!session) { result.notes.push(`no replay session found in ${rootDir}/replay/ — skipped`); return result; }
  result.session = { file: session.file, name: session.name, lastAt: session.lastAt, modeSpecific: session.modeSpecific };
  if (!session.modeSpecific) result.notes.push(`no replay/${mode}-session.json; used shared ${LOOM_SESSION} via explicit startReplay URL`);
  const durationMs = session.lastAt + tailMs;
  result.notes.push(`recording duration = last event ${session.lastAt} ms + tail ${tailMs} ms = ${durationMs} ms`);

  const checks = [];
  const add = (id, ok, detail = '') => checks.push({ id, ok: !!ok, detail: String(detail) });
  let browser;
  try {
    browser = await launch({ root: rootDir, httpPort: port, debugPort: port + 100, width: 1472, height: 1008 });
    await browser.setViewport(1472, 1008);
    await browser.goto(`?mode=${mode}&noauto=1&ui=0`, { settle: 500 });
    const mark = browser.mark();
    result.environment = { renderer: await browser.renderer() };

    const setup = await startCapture(browser, session);
    result.capture = setup;
    add('recorder started (video+audio track)', !!setup && !setup.error && setup.audioTracks === 1 && setup.videoTracks >= 1, JSON.stringify(setup));
    add('replay transport running', setup?.replay?.loaded === true && setup?.replay?.total === 12, JSON.stringify(setup?.replay));

    // wall-clock recording window; sample the replay cursor while it runs
    const samples = [];
    const started = Date.now();
    while (Date.now() - started < durationMs) {
      await sleep(2000);
      samples.push(JSON.parse(await browser.evaluate(`JSON.stringify({ elapsed: (performance.now()-window.__rec.startedAt)/1000, cursor: window.__engine.getStatus().replay?.cursor ?? 0, events: window.__engine.getStatus().events, state: window.__engine.getStatus().state })`)));
    }
    result.samples = samples;

    const facts = JSON.parse(await browser.evaluate(`JSON.stringify({
      status: window.__engine.getStatus(),
      telemetry: window.__engine.getTelemetry(),
      modeTelemetry: window.__engine.getModeTelemetry(${JSON.stringify(mode)}),
      beats: window.__engine.audio.beats,
      audioState: window.__engine.audio.state ?? null,
      raf: (()=>{window.__rec.measuring=false;const t=window.__rec.frames;const d=t.slice(1).map((x,i)=>x-t[i]).sort((a,b)=>a-b);return {frames:t.length,seconds:(performance.now()-window.__rec.startedAt)/1000,meanFps:t.length>1?1000*(t.length-1)/(t.at(-1)-t[0]):0,p95FrameMs:d.length?d[Math.floor(d.length*0.95)]:0,maxFrameMs:d.length?d[d.length-1]:0};})(),
      mime: window.__rec.recorder.mimeType,
      audioTracks: window.__rec.recorder.stream.getAudioTracks().length,
    })`));
    result.facts = {
      state: facts.status.state,
      events: facts.status.events,
      replay: facts.status.replay,
      engineTime: facts.telemetry.time,
      modeTelemetry: facts.modeTelemetry,
      audioState: facts.audioState,
      beatCount: facts.beats.length,
      beatEventIds: facts.beats.map((b) => b.eventId),
      stub: facts.modeTelemetry?.stub === true,
    };
    result.raf = facts.raf;
    result.beats = { count: facts.beats.length, eventIds: facts.beats.map((b) => b.eventId), kinds: facts.beats.map((b) => b.kind) };
    add('12 replay events delivered', facts.status.events === 12, `events=${facts.status.events}`);
    add('replay cursor reached 12/12', facts.status.replay?.cursor === 12 && facts.status.replay?.done === true, JSON.stringify(facts.status.replay));
    add('AudioContext running during capture', facts.audioState === 'running', `state=${facts.audioState}`);
    if (facts.modeTelemetry?.stub === true) {
      result.notes.push('mode telemetry reports stub:true — recorded page has no world visuals; beat mode-specific checks SKIPPED');
    } else {
      const events = facts.beats.map((b) => b.eventId);
      const realEvents = events.filter((id) => id >= 1 && id <= 12);
      const unique = [...new Set(realEvents)].sort((a, b) => a - b);
      add('audio beats cover eventIds 1..12', unique.length >= 12 && unique.slice(0, 12).join(',') === Array.from({ length: 12 }, (_, i) => i + 1).join(','), `${JSON.stringify(unique)} (bookkeeping marks: ${JSON.stringify(events.filter((id) => id > 12))})`);
      if (mode === 'loom') {
        add('Loom: 12 picks woven on the wall clock', facts.modeTelemetry?.picks === 12, `picks=${facts.modeTelemetry?.picks}`);
        add('Loom: exactly 12 beat marks', facts.beats.length === 12, `beats=${facts.beats.length}`);
      }
    }
    add('rAF mean fps >= 20 (headless)', facts.raf.meanFps >= 20, `meanFps=${facts.raf.meanFps.toFixed(1)} p95=${facts.raf.p95FrameMs.toFixed(1)}ms frames=${facts.raf.frames}`);
    add('canvas stream audio track present', facts.audioTracks === 1, `audioTracks=${facts.audioTracks}`);

    // stop the recorder, wait for the final blob, then transfer it in bounded chunks
    const encodedLength = await browser.evaluate(`(async()=>{
      window.__rec.recorder.stop();
      await window.__rec.done;
      const blob = new Blob(window.__rec.chunks, { type: 'video/webm' });
      window.__encoded = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = reject; r.readAsDataURL(blob); });
      window.__rec.recorder.stream.getTracks().forEach(t => t.stop());
      return window.__encoded.length;
    })()`);
    const chunks = [];
    for (let i = 0; i < encodedLength; i += 524288) {
      chunks.push(Buffer.from(await browser.evaluate(`window.__encoded.slice(${i},${i + 524288})`), 'base64'));
    }
    const webm = Buffer.concat(chunks);
    const base = loomOnly ? 'live' : `${mode}-live`;
    const webmFile = path.join(outDir, `${base}.webm`);
    fs.writeFileSync(webmFile, webm);
    result.recording = { webm: rel(webmFile), webmBytes: webm.length, webmSha256: await fileHash(webmFile), mime: facts.mime, mp4: null, ffmpeg: null };
    add('WebM recording produced', webm.length > 10 * 1024, `${(webm.length / 1024).toFixed(0)} KB`);
    if (facts.modeTelemetry?.stub === true) {
      result.notes.push(`stub world is static: ${(webm.length / 1024).toFixed(0)} KB WebM is small by construction (no animation yet)`);
    } else {
      add('recording has real motion (> 100 KB readback)', webm.length > 100 * 1024, `${(webm.length / 1024).toFixed(0)} KB`);
    }

    // Representative still extracted from the recording, plus MP4 conversion.
    const ffmpeg = getFfmpeg();
    if (ffmpeg) {
      const frameAt = Math.max(0.5, Math.min(durationMs - 1500, session.lastAt + tailMs * 0.75)) / 1000;
      const frameFile = path.join(outDir, `${base}-frame.png`);
      const grab = spawnSync(ffmpeg.command, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(frameAt.toFixed(2)), '-i', webmFile, '-frames:v', '1', frameFile], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
      if (grab.status === 0 && fs.existsSync(frameFile)) {
        result.recording.frame = { file: rel(frameFile), atSeconds: Number(frameAt.toFixed(2)), sha256: await fileHash(frameFile) };
        add('representative frame extracted from recording', true, `${result.recording.frame.file} @ ${frameAt.toFixed(1)}s`);
      } else {
        add('representative frame extracted from recording', false, (grab.stderr || '').slice(-300));
      }
    }
    if (doMp4) {
      if (!ffmpeg) {
        result.recording.ffmpeg = { found: false, reason: 'ffmpeg not found on PATH or known local candidates', rejected: ffmpegRejection };
        add('MP4 conversion skipped (ffmpeg unavailable)', true, 'explicitly skipped, not faked');
        result.notes.push('ffmpeg unavailable: review/v2/recordings/<mode>-live.webm only; set FFMPEG_PATH to enable MP4');
      } else {
        const mp4File = path.join(outDir, `${base}.mp4`);
        const conv = spawnSync(ffmpeg.command, ['-y', '-i', webmFile, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '22', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4File], { encoding: 'utf8', windowsHide: true, timeout: 300000 });
        const ok = conv.status === 0 && fs.existsSync(mp4File) && fs.statSync(mp4File).size > 1024;
        if (ok) {
          result.recording.mp4 = rel(mp4File);
          result.recording.mp4Bytes = fs.statSync(mp4File).size;
          result.recording.mp4Sha256 = await fileHash(mp4File);
        }
        result.recording.ffmpeg = { found: true, command: ffmpeg.command, version: ffmpeg.version, capabilities: ffmpeg.capabilities, exitCode: conv.status, stderrTail: ok ? null : (conv.stderr || '').split('\n').slice(-6).join('\n') };
        add('MP4 conversion', ok, ok ? `${(result.recording.mp4Bytes / 1024).toFixed(0)} KB via ${path.basename(ffmpeg.command)}` : (conv.stderr || '').slice(-300));
      }
    }

    const errors = browser.errorsSince(mark);
    result.errors = errors;
    add('zero uncaught exceptions during recording', errors.exceptions.length === 0, JSON.stringify(errors.exceptions.slice(0, 3)));
    result.checks = checks;
    const failed = checks.filter((c) => !c.ok);
    result.status = factStub(result.facts) ? (failed.length ? 'fail' : 'partial') : failed.length ? 'fail' : 'pass';
  } catch (err) {
    checks.push({ id: 'recording harness completed', ok: false, detail: String(err?.stack || err).slice(0, 800) });
    result.status = 'fail';
    result.notes.push('harness error: ' + String(err?.message || err));
    result.checks = checks;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  return result;
}
const factStub = (facts) => !!facts?.stub;

/* ------------------------------------------------------------------ main */
const startedAt = new Date();
const report = {
  schema: 'kunlunmeta-v2-recordings/1',
  generatedAt: startedAt.toISOString(),
  command: `node scripts/record-v2.mjs ${process.argv.slice(2).join(' ')}`.trim(),
  method: `canvas.captureStream(${fps}) + AudioEngine.recordingStream audio track, MediaRecorder VP9/Opus, wall-clock engine.startReplay(), ffmpeg MP4 when available`,
  ffmpeg: null,
  modes: {},
  summary: null,
  limitations: [],
};
report.ffmpeg = getFfmpeg();
if (!report.ffmpeg) report.ffmpegRejection = ffmpegRejection;

let port = basePort;
for (const mode of modes) {
  console.log(`[record-v2] ${mode}: recording…`);
  const r = await recordMode(mode, port);
  port += 2;
  report.modes[mode] = r;
  const saved = r.recording?.webm ? `webm=${(r.recording.webmBytes / 1024).toFixed(0)}KB mp4=${r.recording.mp4 ? (r.recording.mp4Bytes / 1024).toFixed(0) + 'KB' : 'none'}` : 'none';
  console.log(`[record-v2]   -> ${r.status.toUpperCase()} (${(r.checks || []).filter((c) => c.ok).length}/${(r.checks || []).length} checks, ${saved})`);
}
const allChecks = Object.values(report.modes).flatMap((m) => m.checks ?? []);
const failures = allChecks.filter((c) => !c.ok);
report.summary = {
  statuses: Object.fromEntries(Object.entries(report.modes).map(([k, v]) => [k, v.status])),
  checks: allChecks.length,
  failures: failures.length,
  failureIds: failures.map((f) => f.id),
  pass: failures.length === 0 && !Object.values(report.modes).some((m) => m.status === 'fail'),
  partial: Object.values(report.modes).some((m) => m.status === 'partial'),
  recordings: Object.fromEntries(Object.entries(report.modes).map(([k, v]) => [k, { webm: v.recording?.webm ?? null, mp4: v.recording?.mp4 ?? null }])),
  finishedAt: new Date().toISOString(),
  durationSeconds: (Date.now() - startedAt.getTime()) / 1000,
};
if (report.summary.partial) report.limitations.push('Stub modes record an empty world canvas: recordings exist and prove the pipeline, but mode-specific beat/visual checks are SKIPPED.');
if (!report.ffmpeg) report.limitations.push('ffmpeg unavailable on this machine: only WebM files are produced (MP4 conversion explicitly skipped).');
fs.mkdirSync(outDir, { recursive: true });
const reportDir = argv.out ? outDir : path.join(root, 'review', 'v2', 'recordings');
fs.mkdirSync(reportDir, { recursive: true });
const file = path.join(reportDir, 'recordings.json');
fs.writeFileSync(file, JSON.stringify(report, null, 2));
console.log('\n=== record-v2 summary ===');
console.log(JSON.stringify(report.summary, null, 2));
console.log(`report: ${rel(file)}`);
process.exit(report.summary.failures ? 1 : 0);
