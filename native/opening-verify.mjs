// Re-check persisted data without rerunning expensive searches.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash}from'node:crypto';import{execFileSync}from'node:child_process';
import{fixture}from'./bridge.mjs';import{TYPES,legalMoves}from'../engine.js';
const dir='benchmarks/opening-depth-cpp',summary=JSON.parse(fs.readFileSync(dir+'/summary.json')),expected=[[6101,8,6],[6143,8,6],[6181,8,6],[6101,15,5],[6143,15,5],[6229,8,5]],sha=x=>createHash('sha256').update(x).digest('hex');
assert.equal(summary.records.length,expected.length);let rounds=0,rows=0,priorRounds=0;const records=[];
for(const[seed,samples,depth]of expected){const r=JSON.parse(fs.readFileSync(`${dir}/${seed}-s${samples}-d${depth}.json`));assert(r.passed&&r.completedTarget);assert.equal(r.stderr,'');assert.equal(r.final.depth,depth);assert.equal(r.final.interruptedDepth,0);assert.equal(r.iterations.length,depth);
 for(const[p,h]of Object.entries(r.sourceHashes)){assert.equal(sha(fs.readFileSync(p)),h);assert.equal(sha(execFileSync('git',['show','13cd1a6:'+p])),h);}
 assert.equal(sha(fs.readFileSync(new URL('./opening-depth.mjs',import.meta.url))),r.experimentSha256);
 const f=fixture(r.fixture.view,{seed,samples});assert.deepEqual(f.worldHashes,r.fixture.worldHashes);assert.equal(f.observationHash,r.fixture.observationHash);assert.deepEqual(f.worlds,r.fixture.worlds);assert.equal(legalMoves(f.view).length,44);assert(f.view.board.every(p=>!p?.hidden||!('type'in p)));
 if(samples===15)for(const[i,p]of f.view.board.entries())if(p?.hidden){const actual=f.worlds.map(w=>w.board[i].type).sort(),expected=[...TYPES].sort();assert.deepEqual(actual,expected);}
 for(const[d,it]of r.iterations.entries()){assert.equal(it.depth,d+1);assert.equal(it.candidates.length,44);assert.equal(it.pawns.length,5);assert.equal(new Set(it.candidates.map(m=>m.from*90+m.to)).size,44);assert(it.candidates.every(m=>Number.isFinite(m.score)&&Number.isFinite(m.gapToBestNonPawn)));rounds++;rows+=it.candidates.length;}
 priorRounds+=r.priorComparisons.length;assert(r.priorComparisons.every(x=>x.nodesEqual&&x.candidates===44&&x.maxDifference<1e-7));records.push(r);
}
assert.equal(rounds,33);assert.equal(rows,1452);assert.equal(priorRounds,10);assert(summary.totalCoreSearchMs<600000);
for(const seed of[6101,6143]){const a=records.find(x=>x.seed===seed&&x.samples===8),b=records.find(x=>x.seed===seed&&x.samples===15);assert.deepEqual(a.fixture.worldHashes,b.fixture.worldHashes.slice(0,8));}
const source=fs.readFileSync('native/search.cpp','utf8');assert.equal(source.split('v=-s.search(w,depth-1,-inf,inf,1);').length,2);
const proof={passed:true,records:6,completedRounds:rounds,rootRows:rows,allRootMoves:44,priorRoundsCompared:priorRounds,completedSixPlySeeds:[6101,6143,6181],fifteenSampleCompleteMarginal:true,nestedEightSamplePrefix:true,frozenProductionSources:true,rootFullWindow:true,gameValueBoundsCertified:false,totalCoreSearchMs:summary.totalCoreSearchMs};fs.writeFileSync(dir+'/verification.json',JSON.stringify(proof,null,2)+'\n');console.log(proof);
