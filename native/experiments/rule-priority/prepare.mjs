import fs from'node:fs';import assert from'node:assert/strict';
import{cache,hash}from'./build.mjs';import{counterexample}from'./case.mjs';import{snapshot,context}from'./selection.mjs';
fs.mkdirSync(cache,{recursive:true});assert(!fs.existsSync(cache+'/match.lock'));
fs.copyFileSync('benchmarks/rule-reply-2026-11-24/diagnosis.json',cache+'/diagnosis.json');
const {view,row}=counterexample(),c=context(view);
fs.writeFileSync(cache+'/counterexample.json',JSON.stringify({synthetic:true,sourceLedger:'benchmarks/rule-reply-2026-11-24/matches.json',sourceSha256:hash('benchmarks/rule-reply-2026-11-24/matches.json'),gameIndex:4,ply:185,view,original:snapshot(row),proofs:c.proofs,legalCount:c.legal.length,engineViewOnly:true},null,2)+'\n');
console.log(JSON.stringify({prepared:true,legalCount:c.legal.length,proofs:c.proofs.length}));
