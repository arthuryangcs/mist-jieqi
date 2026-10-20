import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {initial,publicState,move} from '../../../engine.js';
import {evaluate,seeded} from '../../../ai.js';
import {Native,fixture,encode} from '../../bridge.mjs';
import {informationBonus,points,limit} from './policy.mjs';
import {build,sha,root} from './build.mjs';
const sanitize=process.argv.includes('--sanitize'),core=path.join(root,'.cache/native/mist-core'),before=sha(core),record={points,perSideLimit:points*limit,defaultEnabled:false,sanitize,units:0,cases:[],passed:false};let baseline,trial;
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
try{
 const base=publicState(initial(seeded(17)),'r');assert.equal(informationBonus(base,'r'),0);record.units++;
 assert.equal(encode(fixture(publicState(initial(seeded(1)),'r'))),encode(fixture(publicState(initial(seeded(999)),'r'))));record.units++;
 const shown=structuredClone(base);shown.board[54]={side:'r',type:'R',hidden:false,role:'P'};assert.equal(informationBonus(shown,'r'),8);assert.equal(informationBonus(shown,'b'),-8);record.units++;
 const secrets=structuredClone(shown);for(const p of secrets.board)if(p?.hidden)p.type='R';assert.equal(informationBonus(secrets,'r'),informationBonus(shown,'r'));record.units++;
 shown.captured=[{side:'b',type:'R',hidden:false,wasHidden:true,capturedBy:'r'}];assert.equal(informationBonus(shown,'r'),8);record.units++;
 const capped={board:Array(90).fill(null)};for(let i=0;i<15;i++)capped.board[i]={side:'r',type:'P',hidden:false};assert.equal(informationBonus(capped,'r'),64);record.units++;
 for(let i=20;i<35;i++)capped.board[i]={side:'b',type:'P',hidden:false};assert.equal(informationBonus(capped,'r'),0);record.units++;
 const built=build({sanitize});record.build={...built};delete record.build.binary;baseline=new Native({binary:core});trial=new Native({binary:built.binary});
 let captures=initial(seeded(17));captures=move(captures,{from:64,to:1});captures=move(captures,{from:25,to:88});
 const tactics=JSON.parse(fs.readFileSync(path.join(root,'benchmarks/tactical-positions.json')));
 const allKnown=initial(seeded(17));allKnown.board=allKnown.board.map(p=>p?.side==='r'?{...p,type:p.role,hidden:false}:p);
 const cases=[{name:'初始全暗',view:base,depth:1},{name:'红方全明/黑方全暗（上限）',view:publicState(allKnown,'r'),depth:1},{name:'暗俘后/红',view:publicState(captures,'r'),depth:1},{name:'暗俘后/黑',view:publicState(captures,'b'),depth:1},...tactics.map(t=>({name:t.name,view:publicState(t.state,t.state.turn),depth:2,winningMoves:t.winningMoves}))];
 for(const c of cases){
  const f=fixture(c.view,{seed:6101,samples:4}),verified=await trial.request(f,{mode:'VERIFY',depth:1,budget:2000}),w={...f.view,...f.worlds[0]};
  for(const [i,side]of ['r','b'].entries())close(verified.sides[i].score,evaluate(w,side)+informationBonus(w,side));
  for(const row of verified.transitions){const next=move(w,{from:row.from,to:row.to},false),delta=informationBonus(next,w.turn);assert(Math.abs(delta)<=64);close(row.score,evaluate(publicState(next,w.viewer),w.turn)+delta);assert(row.restored);}
  const a=await baseline.request(f,{depth:c.depth,budget:2000}),b=await trial.request(f,{depth:c.depth,budget:2000});assert.equal(a.depth,c.depth);assert.equal(b.depth,c.depth);
  if(c.winningMoves)assert(c.winningMoves.some(m=>m.from===b.move.from&&m.to===b.move.to));
  const changed=JSON.stringify(a.move)!==JSON.stringify(b.move);record.cases.push({name:c.name,depth:c.depth,samples:f.samples,transitions:verified.transitions.length,baselineMove:a.move,trialMove:b.move,recommendationChanged:changed,baselineScore:a.score,trialScore:b.score,tacticalPassed:!!c.winningMoves,passed:true});
 }
 record.passed=true;
}finally{await baseline?.close();await trial?.close();assert.equal(baseline?.stderr||'','');assert.equal(trial?.stderr||'','');record.defaultBinaryUnchanged=before===sha(core);assert(record.defaultBinaryUnchanged);record.defaultSourceSha256=sha(path.join(root,'native/search.cpp'));fs.writeFileSync(path.join(root,'benchmarks/information-value',sanitize?'check-sanitized.json':'check.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({passed:record.passed,units:record.units,cases:record.cases.length,changed:record.cases.filter(c=>c.recommendationChanged).length,defaultBinaryUnchanged:record.defaultBinaryUnchanged,sanitize}));}
