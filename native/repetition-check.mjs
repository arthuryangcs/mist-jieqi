import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {initial,publicState,move,positionKey,legalMoves} from '../engine.js';
import {seeded} from '../ai.js';
import {build} from './build.mjs';
import {fixture,Native,javascript,compare,encode} from './bridge.mjs';
const output=process.env.JIEQI_REPETITION_OUTPUT||'benchmarks/assistant-workspace/repetition-native.json';
const built=build({sanitize:process.env.JIEQI_NATIVE_SANITIZE==='1'}),native=new Native({binary:built.binary}),record={build:built,cases:[],passed:false};
try{
 for(const turn of ['r','b'])for(const hidden of [false,true])for(const count of [1,2]){
  const s=initial(seeded(17));s.turn=turn;s.board=s.board.map(p=>p?{...p,type:p.role,hidden:false}:null);if(hidden)s.board[turn==='r'?54:27].hidden=true;
  const m=turn==='r'?{from:82,to:63}:{from:1,to:18};assert(legalMoves(s).some(x=>x.from===m.from&&x.to===m.to));s.positions=Array(count).fill(positionKey(move(s,m,false)));
  const f=fixture(publicState(s,turn),{samples:4,seed:8101}),a=await javascript(f,{depth:1}),progress=[],b=await native.request(f,{mode:'STREAM',depth:1,onProgress:r=>progress.push(r)});
  const same=compare(a,b,{requireNodes:!hidden}),row=b.allCandidates.find(x=>x.from===m.from&&x.to===m.to);assert.equal(!!row.repetitionLoss,count===2);assert(!row.draw);assert.equal(row.repetitionCount,count);assert.equal(progress.length,1);assert.deepEqual(progress[0].allCandidates,b.allCandidates);
  if(count===2){assert.equal(row.heuristicWinRate,0);assert.equal(row.sampleLosses,1);assert.notDeepEqual(b.move,m);assert.equal(move(s,m).result.winner,turn==='r'?'b':'r');}
  record.cases.push({turn,hidden,priorOccurrences:count,samples:f.samples,...same,repetitionLoss:!!row.repetitionLoss,score:row.score,move:b.move,passed:true});
 }
 const tokens=encode(fixture(publicState(initial(seeded(17)),'r'))).trim().split(' ');tokens[tokens.length-1]='3';const invalid=spawnSync(built.binary,[],{input:tokens.join(' ')+'\n',encoding:'utf8',timeout:3000});assert.equal(invalid.status,2);assert.equal(invalid.stderr.trim(),'native error: root metadata out of range');record.invalidOutcomeRejected=true;
 record.passed=true;
}finally{await native.close();record.runtimeStderr=native.stderr;assert.equal(native.stderr,'');delete record.build.binary;fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({passed:record.passed,cases:record.cases.length,sanitized:built.sanitize,output}));}
