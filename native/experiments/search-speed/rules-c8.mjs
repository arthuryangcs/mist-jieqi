import {targeted} from './targeted.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {spawnSync} from 'node:child_process';
import {initial,publicState,move,legalMoves,inCheck,TYPES} from '../../../engine.js';
import {seeded,evaluate,remaining,values} from '../../../ai.js';

import {Native,fixture,encode} from './bridge.mjs';
import {buildC8 as build,cache} from './build-c8.mjs';

const sanitize=process.argv.includes('--sanitize'),threadSanitize=process.argv.includes('--tsan'),output=cache+'/rules'+(threadSanitize?'-tsan':sanitize?'-sanitized':'')+'.json';
const built=build({sanitize,threadSanitize}),native=new Native({binary:built.binary}),start=performance.now(),record={sourceSha256:built.sourceSha256,binarySha256:built.binarySha256,sanitize,threadSanitize,ruleCases:[],transitionCount:0,passed:false};
const piece=(side,type,hidden=false,role=type)=>({side,type,hidden,role});
function sparse(name,placements,{turn='r',removeBlock=false}={}){
 const s={...initial(),board:Array(90).fill(null),captured:[],turn};s.board[85]=piece('r','K');s.board[4]=piece('b','K');if(!removeBlock)s.board[49]=piece('r','P');
 for(const [i,side,type,hidden=false,role=type]of placements)s.board[i]=piece(side,type,hidden,role);
 for(const side of['r','b']){const bag=[...TYPES];for(const p of s.board)if(p?.side===side&&p.type!=='K'){const i=bag.indexOf(p.type);if(i>=0)bag.splice(i,1);}for(const type of bag)s.captured.push(piece(side,type));}
 return{name,state:s};
}
const cases=[
 {name:'初始全暗',state:initial(seeded(17))},
 sparse('蹩马腿',[[76,'r','N'],[67,'r','P']]),
 sparse('塞象眼',[[67,'r','B'],[57,'r','P']]),
 sparse('炮隔一子',[[64,'r','C'],[28,'b','P'],[1,'b','R']]),
 sparse('将帅照面',[],{removeBlock:true}),
 sparse('困毙',[[12,'r','R'],[14,'r','R']],{turn:'b'}),
 sparse('将死',[[12,'r','R'],[14,'r','R'],[13,'r','P']],{turn:'b'})
];
cases.push(...targeted);for(const seed of[72131,72143,72161,72173,72189,72203]){const rng=seeded(seed);let s=initial(rng);for(let ply=1;ply<=64&&!s.result;ply++){const ms=legalMoves(s);s=move(s,ms[Math.floor(rng()*ms.length)]);if(ply%4===0)cases.push({name:'danger reachable '+seed+'/'+ply,state:structuredClone(s)});}}
let capture=initial(seeded(37));for(const [i,m]of[{from:64,to:1},{from:25,to:88}].entries()){assert(legalMoves(capture).some(x=>x.from===m.from&&x.to===m.to));capture=move(capture,m);cases.push({name:'私人暗俘第'+(i+1)+'步',state:structuredClone(capture)});}
for(const seed of[7013,7027,7043]){const rng=seeded(seed);let s=initial(rng);for(let ply=1;ply<=40&&!s.result;ply++){const ms=legalMoves(s);s=move(s,ms[Math.floor(rng()*ms.length)]);if(ply%8===0)cases.push({name:`可达${seed}/${ply}`,state:structuredClone(s)});}}
try {
 for(const c of cases)for(const viewer of['r','b',null]){
  const f=fixture(publicState(c.state,viewer),{seed:7103,samples:4}),r=await native.request(f,{mode:'VERIFY_LAZYLEGAL',depth:1});const w={...f.view,...f.worlds[0]},observed=publicState(w,viewer);
  for(const [i,side]of['r','b'].entries()){assert.equal(r.sides[i].check,inCheck(w.board,side),c.name);assert(Math.abs(r.sides[i].score-evaluate(observed,side))<1e-7,c.name+'eval');assert.deepEqual(r.sides[i].legal,legalMoves(w,side),c.name+'legal');assert.deepEqual(r.sides[i].captures,legalMoves(w,side,{capturesOnly:true}),c.name+'captures');}
  const ms=legalMoves(w);assert.equal(r.transitions.length,ms.length);
  for(const row of r.transitions){const m={from:row.from,to:row.to},next=move(w,m,false),v=publicState(next,viewer);assert.equal(row.type,'KRNBCAP'.indexOf(next.board[m.to].type));assert(Math.abs(row.score-evaluate(v,w.turn))<1e-7,c.name+'transition eval');assert.deepEqual(row.reply,legalMoves(next));assert.equal(row.restored,true);assert.deepEqual(row.poolCount,['r','b'].map(s=>remaining(v,s).length));assert.deepEqual(row.poolValue,['r','b'].map(s=>remaining(v,s).reduce((a,t)=>a+values[t],0)));record.transitionCount++;}
  record.ruleCases.push({name:c.name,viewer,legalMoves:ms.length,passed:true});
 }
 record.passed=true;
}catch(error){record.error=error.stack;throw error;}finally{record.elapsedMs=performance.now()-start;await native.close();record.runtimeStderr=native.stderr;if(native.stderr.trim()){record.passed=false;record.error='原生运行报告stderr诊断';}fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({passed:record.passed,ruleCases:record.ruleCases.length,transitions:record.transitionCount,elapsedMs:record.elapsedMs}));if(native.stderr.trim())throw Error('原生运行报告stderr诊断');}
