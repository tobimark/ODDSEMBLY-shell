/** Build-time kinematic contract: no browser or snapshots required. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/engine/loom/atelier/mechanism.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { Mechanism } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
const event = i => ({ id: i, type: ['Read','Edit','Write','Bash','Search'][i%5], detail: 'test', at: i });
const a = new Mechanism(); const committed = []; a.onPick = e => committed.push(e.id);
for (let i=0;i<12;i++) a.push(event(i));
a.update(.3); assert(a.shed > .9); assert.equal(a.travel,0); assert.equal(a.picks,0);
a.update(.4); assert(a.travel > 0 && a.travel < 1); assert.equal(a.picks,0); assert.equal(a.beat,0);
a.update(.5); assert.equal(a.shed,0); assert.equal(a.travel,1); assert.equal(a.picks,0);
a.update(.25); assert.equal(a.picks,1); assert(a.beat > .8);
a.update(22); assert.equal(a.picks,12); assert.equal(a.active,null); assert.deepEqual(committed,Array.from({length:12},(_,i)=>i));
const b = new Mechanism(); for(let i=0;i<12;i++) b.push(event(i)); for(let i=0;i<2400;i++) b.update(.01);
assert.equal(b.picks,a.picks); assert(Math.abs(a.angle-b.angle)<1e-8);
a.push(event(99)); a.update(.4); a.stop(); a.update(10); assert.equal(a.picks,12); assert.equal(a.active,null); assert.equal(a.queue.length,0);
console.log('PASS: shed precedes shuttle; no early cloth; one commit per event; FIFO; frame-step independence; stop cancels queue.');
