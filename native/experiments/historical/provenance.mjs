// Verification of historical evidence is deliberately separate from current-source checks.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('./sources.json',import.meta.url)));
const sha=x=>createHash('sha256').update(x).digest('hex');
export function verifyHistoricalSource(file,expected){
 const pinned=manifest.sources[file];
 if(pinned){
  assert.equal(expected,pinned.sha256,`Unknown historical source pin: ${file}`);
  assert.equal(sha(fs.readFileSync(new URL(pinned.file,import.meta.url))),expected,`Archived source changed: ${file}`);
  return {file,sha256:expected,source:'archive',commit:manifest.commit};
 }
 assert.equal(sha(fs.readFileSync(new URL(file,root))),expected,`Unarchived source changed: ${file}`);
 return {file,sha256:expected,source:'working-tree'};
}
export function assertReplayOnly(mode){
 if(!['status','replay'].includes(mode))throw Error('Historical experiment is replay-only; create a new competition plan using the production referee');
}
