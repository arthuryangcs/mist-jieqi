// Sequential validation and exploratory screen; never changes the default core.
import fs from 'node:fs';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
import {dir,sha}from'./defense-variants.mjs';
const s=JSON.parse(fs.readFileSync(`${dir}/selection.json`));for(const[p,h]of Object.entries(s.sourceHashes))assert.equal(sha(fs.readFileSync(p)),h);
for(const [file,args]of [
 ['native/defense-check.mjs',['--lazy']],
 ['native/defense-check.mjs',['--lazy','--asan']],
 ['native/defense-reference-check.mjs',[]],
 ['native/defense-match.mjs',['screen']],
 ['native/defense-match-verify.mjs',['screen']],
]){
 const r=spawnSync(process.execPath,[file,...args],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);
}
