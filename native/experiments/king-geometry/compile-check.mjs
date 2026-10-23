// Audit a flag discrepancy without replacing either frozen match binary.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {cache,dir,hash,stableBinary} from './build.mjs';
const stable=JSON.parse(fs.readFileSync('.cache/native/build.json')),trial=JSON.parse(fs.readFileSync(cache+'/build.json'));
assert.equal(stable.binarySha256,stableBinary);assert.deepEqual(stable.flags.filter(x=>x!=='-DNDEBUG'),trial.flags);
assert.equal(hash(cache+'/search.cpp'),trial.sourceSha256);
const out=path.resolve(cache+'/ndebug-check/mist-geometry');fs.mkdirSync(path.dirname(out),{recursive:true});
const r=spawnSync('clang++',[...stable.flags,path.resolve(cache+'/search.cpp'),'-o',out],{encoding:'utf8',timeout:60000});if(r.status!==0)throw Error(r.stderr);
const original=fs.readFileSync(cache+'/mist-geometry'),compiled=fs.readFileSync(out);
const record={trialFlags:trial.flags,stableFlags:stable.flags,sourceSha256:trial.sourceSha256,trialBinarySha256:hash(cache+'/mist-geometry'),ndebugBinarySha256:hash(out),sameOutputBasename:true,byteIdentical:original.equals(compiled),warnings:r.stderr};
fs.writeFileSync(dir+'/compile-equivalence.json',JSON.stringify(record,null,2)+'\n');assert(record.byteIdentical,'Flag difference changes this build; stop new games and rebase the experiment');console.log(JSON.stringify({byteIdentical:true,binarySha256:record.trialBinarySha256}));
