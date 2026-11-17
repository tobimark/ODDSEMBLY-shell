import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {launch} from './lib/browser.mjs';
const start=Number(process.argv[2] || 0), end=Number(process.argv[3] || 240);
const out=path.resolve('review/oddsembly-final');
const frames=path.resolve('.tmp/oddsembly-frames');fs.mkdirSync(frames,{recursive:true});
const events=new Map([[5,'Read'],[45,'Bash'],[80,'Bash'],[120,'Edit'],[165,'Search']]);
async function run(root,record){
 const b=await launch({root:path.resolve(root),httpPort:4663,debugPort:4763,swiftshader:true});const states=[];
 try{
 await b.goto('?mode=loom&static=1&ui=0');let id=0;
 for(let i=0;i<240;i++){
 if(events.has(i))await b.evaluate(`window.__engine.inject(${JSON.stringify({id:++id,type:events.get(i),detail:'visual acceptance',at:0})})`);
 await b.evaluate('window.__engine.tick(1/30)');
 if([25,65,100,145,185,239].includes(i))states.push(await b.evaluate('window.__engine.getModeTelemetry()'));
 if(record && i>=start && i<end){
 const data=await b.evaluate("document.querySelector('canvas').toDataURL('image/jpeg',.94).split(',')[1]"); const shot={data};
 fs.writeFileSync(path.join(frames,`${String(i).padStart(4,'0')}.jpg`),Buffer.from(shot.data,'base64'));

 }
 }
 assert.equal(b.errorsSince().total,0);
 if(record){
 const invariant=await b.evaluate(`(()=>{const d=window.__engine.getModeInstance('loom').scene.dial;return {rotation:d.front.rotation,readoutRotation:d.readout.rotation,parentIsFront:d.readout.parent===d.front}})()`);
 assert.deepEqual(invariant,{rotation:0,readoutRotation:0,parentIsFront:true});

 }
 return states;
 }finally{await b.close()}
}
const before=await run('.tmp/dist-oddsembly-baseline',false);const after=await run('dist',true);assert.deepEqual(after,before);
fs.writeFileSync(path.join(out,'regression.json'),JSON.stringify({pass:true,checks:['six snapshots identical to V6','reader fixed outside rotor','zero browser errors'],before,after},null,2));
const probe=spawnSync('python',['-c','import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8'});
const encoded=spawnSync(probe.stdout.trim(),['-y','-framerate','30','-i',path.join(frames,'%04d.jpg'),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'READ-BASH-BASH2-EDIT-SEARCH.mp4')],{encoding:'utf8'});assert.equal(encoded.status,0,encoded.stderr);
console.log('PASS: exact V6 event and mechanism parity, fixed reader, recorded segment and event parity.');


