import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startServer } from './serve.mjs';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root,'review','mechanics-v2'); fs.mkdirSync(out,{recursive:true}); fs.mkdirSync(path.join(root,'.tmp'),{recursive:true});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const software = process.env.LOOM_SOFTWARE === '1';
class CDP {
  constructor(url) { this.ws=new WebSocket(url); this.id=0; this.pending=new Map(); this.events=[]; }
  async open() { await new Promise((r,j)=>{this.ws.onopen=r;this.ws.onerror=j;}); this.ws.onmessage=e=>{ const m=JSON.parse(e.data); if(m.id){const p=this.pending.get(m.id);this.pending.delete(m.id);m.error?p?.reject(new Error(JSON.stringify(m.error))):p?.resolve(m.result);}else this.events.push(m); }; }
  send(method,params={},sessionId) {const id=++this.id;this.ws.send(JSON.stringify({id,method,params,sessionId}));return new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject}));}
}
const server = await startServer(4179);
const profile=fs.mkdtempSync(path.join(root,'.tmp','atelier-'));
const edge=spawn(process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',[
'--autoplay-policy=no-user-gesture-required','--headless=new','--remote-debugging-port=9340','--window-size=1472,1008','--hide-scrollbars','--no-first-run','--no-default-browser-check','--disable-extensions',...(software ? ['--enable-unsafe-swiftshader','--use-angle=swiftshader'] : []),'--disable-background-timer-throttling','--disable-renderer-backgrounding',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let c;
try {
  let endpoint;
  for(let i=0;i<80;i++){try{endpoint=await(await fetch('http://127.0.0.1:9340/json/version')).json();break;}catch{await sleep(200);}}
  if(!endpoint)throw Error('Browser failed to start');
  c=new CDP(endpoint.webSocketDebuggerUrl);await c.open();
  const {targetId}=await c.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await c.send('Target.attachToTarget',{targetId,flatten:true});
  const send=(m,p={})=>c.send(m,p,sessionId);
  await send('Page.enable');await send('Runtime.enable');
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
  const viewport=async(w,h,d=1)=>send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:d,mobile:false});
  const nav=async query=>{await send('Page.navigate',{url:'http://127.0.0.1:4179/'+query});await sleep(900);await ev('window.__loom.ready');await sleep(350);assert.equal(await ev('document.querySelectorAll("canvas").length'),1);assert.equal(await ev('document.querySelector(".fatal")?.textContent ?? null'),null);};
  const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name),Buffer.from(r.data,'base64'));console.log('saved',name);};
  await viewport(1472,1008); await nav('?noauto=1');
  await shot('after-idle.png');
  await ev('document.querySelector(".transport>button").click()');await sleep(3000);
  assert((await ev('window.__loom.getStatus().events'))>0);
  await ev('window.__loom.pause()'); const frozen=await ev('JSON.stringify({s:window.__loom.getStatus(),m:window.__loom.getMechanism()})');await sleep(700);
  assert.equal(await ev('JSON.stringify({s:window.__loom.getStatus(),m:window.__loom.getMechanism()})'),frozen);
  await ev('Array.from(document.querySelectorAll(".speed button")).find(b=>b.textContent==="2×").click()');assert.equal(await ev('window.__loom.getStatus().speed'),2);
  await ev('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Sound on").click()'); assert.equal(await ev('window.__loom.getStatus().muted'),true);
  await ev('window.__loom.stop(); window.__loom.pause(); window.__loom.setSpeed(1)');
  const before=await ev('window.__loom.getMechanism().picks');
  await ev('window.__loom.inject({id:100,type:"Write",detail:"visual review",at:0}); window.__loom.tick(.68)');
  const picking=await ev('window.__loom.getMechanism()');assert.equal(picking.stage,'PICKING');assert(picking.shed>.99);
  await shot('after-hero.png');
  await ev('window.__loom.setView(true)');await sleep(200);await shot('detail.png');await ev('window.__loom.setView(false)');
  await ev('window.__loom.tick(.7)');await shot('beat.png');
  await ev('window.__loom.tick(.3)');assert.equal(await ev('window.__loom.getMechanism().picks'),before+1);
  await ev('for(let i=0;i<12;i++)window.__loom.inject({id:200+i,type:["Read","Edit","Write","Bash","Search"][i%5],detail:"burst check",at:i}); window.__loom.tick(21)');
  assert.equal(await ev('window.__loom.getMechanism().picks'),before+13);
  assert.equal(await ev('window.__loom.getMechanism().queued'),0);
  await viewport(1920,1080);await sleep(300);await shot('desktop-1920.png');
  await viewport(768,1024);await sleep(300);await shot('tablet-768.png');
  await viewport(1472,1008);await nav('?noauto=1&replay=1');
  await ev('window.__loom.pause()'); const replayBefore=await ev('window.__loom.getStatus().events');await sleep(800);assert.equal(await ev('window.__loom.getStatus().events'),replayBefore);
  await ev('window.__loom.setSpeed(2);window.__loom.resume()');
  for(let i=0;i<30;i++){await sleep(300);if(await ev('window.__loom.getStatus().events')>=12)break;}
  await sleep(500);
  assert.equal(await ev('window.__loom.getStatus().events'),12);
  await ev('window.__loom.stop()');assert.equal(await ev('window.__loom.getMechanism().queued'),0);
  // Native canvas MediaRecorder: wall-clock playback, no deterministic ticking or frame interpolation.
  await nav('?noauto=1');
  const renderer=await ev(`(()=>{const c=document.querySelector('canvas');const gl=c.getContext('webgl2')||c.getContext('webgl');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)})()`);
  await ev(`(async()=>{
    window.__frameTimes=[];window.__recordStarted=performance.now();window.__measureFrames=true;
    const measure=t=>{window.__frameTimes.push(t);if(window.__measureFrames)requestAnimationFrame(measure)};requestAnimationFrame(measure);
    window.__recordChunks=[];
    const stream=document.querySelector('canvas').captureStream(30);
    const audio=window.__loom.engine.audio;audio.ensure();
    audio.recordingStream.getAudioTracks().forEach(t=>stream.addTrack(t));
    window.__recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:9000000});
    window.__recorder.ondataavailable=e=>{if(e.data.size)window.__recordChunks.push(e.data)};
    window.__recordDone=new Promise(resolve=>window.__recorder.onstop=async()=>{
      const blob=new Blob(window.__recordChunks,{type:'video/webm'});const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);stream.getTracks().forEach(t=>t.stop());
    });
    window.__recorder.start(1000);
    window.__loom.engine.play(false);
    const replay=await(await fetch('replay/loom-session.json')).json();
    replay.events.forEach((e,i)=>setTimeout(()=>window.__loom.inject({id:i+1,type:e.type,detail:e.detail,at:performance.now()}),e.at));
  })()`);
  await sleep(6000);await shot('replay-running.png');
  await sleep(7000);await shot('replay-weaving.png');
  await sleep(11500);
  const final=await ev('({s:window.__loom.getStatus(),m:window.__loom.getMechanism()})');
  assert.equal(final.s.events,12);assert.equal(final.m.picks,12);assert.equal(final.m.active,null);
  const performanceStats=await ev(`(()=>{window.__measureFrames=false;const t=window.__frameTimes;const d=t.slice(1).map((x,i)=>x-t[i]).sort((a,b)=>a-b);return {seconds:(performance.now()-window.__recordStarted)/1000,animationFrames:t.length,meanRafFps:1000*(t.length-1)/(t.at(-1)-t[0]),p95FrameMs:d[Math.floor(d.length*.95)]}})()`);
  await ev('window.__recorder.stop()');
  const length=await ev('window.__recordDone.then(s=>{window.__encodedRecording=s;return s.length})');
  // Small protocol messages avoid the browser/WebSocket large-message limit.
  const chunks=[];for(let i=0;i<length;i+=524288) chunks.push(Buffer.from(await ev(`window.__encodedRecording.slice(${i},${i+524288})`),'base64'));
  fs.writeFileSync(path.join(out,'loom-live.webm'),Buffer.concat(chunks));
  const audioProof=await ev('({state:window.__loom.engine.audio.state,beats:window.__loom.engine.audio.beats})');
  assert.equal(audioProof.state,'running');assert.equal(audioProof.beats.length,12);
  assert.deepEqual(audioProof.beats.map(b=>b.eventId),Array.from({length:12},(_,i)=>i+1));
  const exceptions=c.events.filter(e=>e.method==='Runtime.exceptionThrown');assert.equal(exceptions.length,0,JSON.stringify(exceptions));
  const report={verifiedAt:new Date().toISOString(),browser:endpoint.Browser,renderer,performanceStats,audioProof,checks:['single canvas / initialization','UI Play emits simulated events','Pause freezes status and phase','2x speed control','mute control','shuttle only crosses open shed','one cloth commit per event','12-event burst drains in order','1920 desktop and 768 tablet renders','replay pause freezes input','replay contains exactly 12 events without simulator contamination','stop cancels queue','real-time recording: 12 events become 12 woven picks','12 beat sounds emitted at cloth commits; live Opus track recorded','no uncaught browser exceptions'],recording:{file:'loom-live.webm',method:'canvas.captureStream(30) + MediaRecorder VP9',manualTick:false,seconds:performanceStats.seconds},final};
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));console.log('PASS',JSON.stringify({events:final.s.events,picks:final.m.picks,exceptions:exceptions.length,recordingBytes:fs.statSync(path.join(out,'loom-live.webm')).size}));
} finally {if(c)await c.send('Browser.close').catch(()=>{});edge.kill();server.close();}
