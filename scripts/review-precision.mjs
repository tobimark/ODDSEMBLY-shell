import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { launch, sleep } from './lib/browser.mjs';
const root=path.resolve(import.meta.dirname,'..');
const baseline=process.argv.find(a=>a.startsWith('--baseline='))?.slice(11) ?? '.tmp/dist-precision-baseline';
assert.ok(fs.existsSync(path.resolve(root,baseline,'index.html')),`Build c6d93db first; pass its dist directory with --baseline=PATH (see DELIVERY.md).`);
const out=path.join(root,'review/precision-flat');fs.mkdirSync(out,{recursive:true});
const events=Array.from({length:12},(_,i)=>({id:i+1,type:['Read','Edit','Write','Bash','Search'][i%5],detail:`precision review ${i+1}`,at:i*120}));
const marks=[0,.4,.7,1.4,2.1,8,21];
async function run(kind,dir,port){
 const b=await launch({root:path.resolve(root,dir),httpPort:port,debugPort:port+100});
 const result={states:{},errors:null};
 try{
  await b.goto('?mode=loom&static=1&ui=0');
  let t=0;
  for(const mark of marks){
   if(mark===.4)await b.evaluate(`(${JSON.stringify(events)}).forEach(e=>window.__engine.inject(e))`);
   const n=Math.round((mark-t)*60);await b.evaluate(`(()=>{for(let i=0;i<${n};i++)window.__engine.tick(1/60)})()`);t=mark;
   result.states[mark]=await b.evaluate(`(()=>{const s=window.__engine.getModeInstance('loom').scene;return {mechanism:s.telemetry,rows:s.textile.rows,picks:s.textile.picks,shafts:[s.shaftA.y,s.shaftB.y],reed:s.reed.y,shuttle:[s.shuttle.x,s.shuttle.y]}})()`);
   await b.screenshot(path.join(out,`${kind}-${String(mark).replace('.','_')}s.png`));
   if(kind==='after' && mark===.7){
    await b.setViewport(1472,1008,2);await b.goto('?mode=loom&static=1&ui=0');
    await b.evaluate(`(()=>{${JSON.stringify(events)}.forEach(e=>window.__engine.inject(e));for(let i=0;i<42;i++)window.__engine.tick(1/60)})()`);
    await b.screenshot(path.join(out,'connection-detail-2x.png'),{clip:{x:185,y:440,width:435,height:445,scale:1}});
    await b.screenshot(path.join(out,'loom-detail-2x.png'),{clip:{x:495,y:240,width:410,height:440,scale:1}});
    await b.setViewport(1472,1008,1);await b.goto('?mode=loom&static=1&ui=0');
    await b.evaluate(`(()=>{${JSON.stringify(events)}.forEach(e=>window.__engine.inject(e));for(let i=0;i<42;i++)window.__engine.tick(1/60)})()`);
    const dial=await b.evaluate(`(()=>{const d=window.__engine.getModeTelemetry().dial;return {phase:d.phase,read:d.type,count:'×'+d.count,step:d.slot,angle:d.angleDeg,queue:d.queue}})()`);
    assert.equal(dial.count,'×1');assert.equal(dial.read,'Edit');assert.equal(dial.step,12);assert.equal(dial.angle,360);assert.equal(Number(dial.queue),result.states[mark].mechanism.queued); result.dial=dial;
   }
  }
  assert.equal(result.states[21].mechanism.picks,12);
  if(kind==='after'){
   await b.evaluate('window.__engine.pause()');const paused=await b.evaluate('JSON.stringify(window.__engine.getTelemetry())');await sleep(350);assert.equal(await b.evaluate('JSON.stringify(window.__engine.getTelemetry())'),paused);
   await b.evaluate('window.__engine.reset()');assert.equal(await b.evaluate('window.__engine.getModeTelemetry().picks'),0);
   await b.goto('?mode=loom&noauto=1');await b.screenshot(path.join(out,'after-with-ui.png'));
   await b.setViewport(960,900);await sleep(300);await b.screenshot(path.join(out,'panel-960.png'));
  }
  result.errors=b.errorsSince();assert.equal(result.errors.total,0,JSON.stringify(result.errors));
 }finally{await b.close();}
 return result;
}
const before=await run('before',baseline,4610);
const after=await run('after','dist',4620);
assert.deepEqual(after.states,before.states);
const report={baseline:'c6d93db',viewport:[1472,1008],events,marks,pass:true,checks:['exact mechanism telemetry parity','exact textile rows parity','same shaft/reed/shuttle coordinates','12 events / 12 picks','dial reads real inputs and queue','pause freezes clock','reset clears picks','no browser errors'],before,after};
fs.writeFileSync(path.join(out,'regression.json'),JSON.stringify(report,null,2));
console.log('PASS: visual change preserves all mechanical poses, cloth rows and queue results at seven deterministic marks.');
