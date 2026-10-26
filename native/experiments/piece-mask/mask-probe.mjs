import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {cache,dir,compile,hash,sourceOf} from './build.mjs';import {encode} from '../../bridge.mjs';
const positions=JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions,input=positions.map(p=>encode(p.fixture,{mode:'VERIFY',depth:1})).join('');const rows=[];
for(const sanitize of [false,true]){
 const core=sourceOf(),end=core.indexOf('\nint main() {');assert(end>0);const source=path.resolve(cache+'/mask-probe.cpp'),binary=path.resolve(cache+'/mask-probe'+(sanitize?'-sanitized':''));
 fs.writeFileSync(source,'#ifndef MIST_VERIFY_RESTORE\n#define MIST_VERIFY_RESTORE 1\n#endif\n'+core.slice(0,end)+'\n'+fs.readFileSync(new URL('./mask-probe.cpp',import.meta.url),'utf8'));
 const compiler=compile(source,binary,{sanitize}),r=spawnSync(binary,[],{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);assert(!r.stderr.trim(),r.stderr);rows.push({sanitize,sourceSha256:hash(source),binarySha256:hash(binary),...compiler,...JSON.parse(r.stdout)});
}fs.writeFileSync(dir+'/mask-probe.json',JSON.stringify({passed:true,rows},null,2)+'\n');console.log(JSON.stringify(rows.map(({sanitize,bitCases,worlds,transitions,reveals,darkCaptures,crossWordMoves,legalComparisons})=>({sanitize,bitCases,worlds,transitions,reveals,darkCaptures,crossWordMoves,legalComparisons}))));
