import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build,compile,output,sha,root} from './build.mjs';
import {Native,fixture,encode} from '../../bridge.mjs';
import {initial,publicState,move,legalMoves} from '../../../engine.js';
import {seeded} from '../../../ai.js';

const sanitize=process.argv.includes('--sanitize'),record={sanitize,passed:false,cases:[]};
const core=path.join(root,'.cache/native/mist-core'),before=sha(core);let baseline,trial;
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
try{
 const built=build({sanitize});record.build=built;
 const unit=path.join(output,'unit.cpp'),unitBinary=path.join(output,'unit'+(sanitize?'-sanitized':''));
 fs.writeFileSync(unit,`#include ${JSON.stringify(fileURLToPath(new URL('./policy.hpp',import.meta.url)))}
#include <cassert>
struct Row {double baseScore,tailLoss,score=0,riskPenalty=0,riskWeight=0;};
int main(){using namespace mist_risk;
 assert(lowerTailLoss({100,500,5000,99000})==0);
 assert(lowerTailLoss({-900,0,0,0})==450);
 assert(lowerTailLoss({-900,0,0,0,0,0,0,0})==225);
 assert(std::abs(lowerTailLoss({-900,0,0,0,0})-360)<1e-10);
 assert(lowerTailLoss({-99000,0,0,0,0,0,0,0})==1575);
 assert(weight(-1000)<weight(0)&&weight(0)<weight(1000));
 std::vector<Row> rows={{100,1575},{0,0}};rank(rows,true);assert(rows[0].score<rows[1].score);
 std::vector<Row> bright={{99000,3150},{0,0}};rank(bright,false);assert(bright[0].score==99000);
 std::vector<Row> good={{100,0},{200,0}};rank(good,true);assert(good[1].score==200);
 bool bad=false;try{lowerTailLoss({});}catch(const std::invalid_argument&){bad=true;}assert(bad);
}
`);
 compile(unit,unitBinary,{sanitize});const u=spawnSync(unitBinary,[],{encoding:'utf8',timeout:5000});assert.equal(u.status,0,u.stderr);record.policyAssertions=10;
 baseline=new Native({binary:core});trial=new Native({binary:built.binary});await Promise.all([baseline.ready,trial.ready]);
 const tactical=JSON.parse(fs.readFileSync(path.join(root,'benchmarks/tactical-positions.json')));
 let captures=initial(seeded(17));captures=move(captures,{from:64,to:1});captures=move(captures,{from:25,to:88});
 const cases=[{name:'初始暗局',view:publicState(initial(seeded(17)),'r')},{name:'双向暗俘/红',view:publicState(captures,'r')},{name:'双向暗俘/黑',view:publicState(captures,'b')},...tactical.map(x=>({name:x.name,view:publicState(x.state,x.state.turn)}))];
 for(const c of cases){
  const f=fixture(c.view,{seed:6101,samples:8}),a=await baseline.request(f,{depth:2,budget:3000}),b=await trial.request(f,{depth:2,budget:3000});assert.equal(a.depth,2);assert.equal(b.depth,2);
  assert.equal(a.allCandidates.length,b.allCandidates.length);const map=new Map(a.allCandidates.map(r=>[r.from*90+r.to,r]));const uncertain=c.view.board.some(p=>p?.hidden);
  const advantage=Math.max(...b.allCandidates.map(r=>r.baseScore)),weight=uncertain?.3+.2*Math.max(-1,Math.min(1,advantage/600)):0;
  for(const r of b.allCandidates){const old=map.get(r.from*90+r.to);assert(old);close(r.baseScore,old.score);close(r.riskWeight,weight);
   const values=[...r.worldScores].sort((a,b)=>a-b),mass=values.length/4;let left=mass,total=0;
   for(const v of values){const take=Math.min(1,left);total+=take*Math.max(0,-Math.max(-3600,Math.min(3600,v))-450);left-=take;if(left<=1e-12)break;}
   close(r.tailLoss,uncertain?total/mass:0);close(r.riskPenalty,weight*r.tailLoss);close(r.score,r.baseScore-r.riskPenalty);
  }
  assert(legalMoves(c.view).some(m=>m.from===b.move.from&&m.to===b.move.to));
  record.cases.push({name:c.name,candidates:b.allCandidates.length,depth:b.depth,samples:b.samples,before:a.move,after:b.move,changed:JSON.stringify(a.move)!==JSON.stringify(b.move),coreMs:b.elapsedMs,baseCoreMs:a.elapsedMs,penalized:b.allCandidates.filter(r=>r.riskPenalty>0).length});
 }
 const one=fixture(publicState(initial(seeded(1)),'r')),two=fixture(publicState(initial(seeded(999)),'r'));assert.equal(encode(one),encode(two));
 const a=await trial.request(one,{depth:1,budget:1000}),b=await trial.request(two,{depth:1,budget:1000});assert.deepEqual(a.allCandidates,b.allCandidates);record.hiddenLayoutIsolation=true;
 const tainted=publicState(captures,'b');tainted.captured.find(p=>p.hidden).type='R';assert.throws(()=>fixture(tainted),/不可见暗俘/);record.hiddenCaptureRejected=true;
 assert.equal(trial.stderr.trim(),'','experimental core diagnostics');assert.equal(baseline.stderr.trim(),'','stable core diagnostics');record.coreDiagnosticsEmpty=true;record.stableBinaryUnchanged=sha(core)===before;assert(record.stableBinaryUnchanged);record.passed=true;
}catch(error){record.error=error.stack;process.exitCode=1;}finally{
 if(baseline)await baseline.close();if(trial)await trial.close();
 const file=process.env.JIEQI_RISK_CHECK_OUTPUT||path.join(root,'benchmarks/downside-risk/check'+(sanitize?'-sanitized':'')+'-replay.json');fs.mkdirSync(path.dirname(file),{recursive:true});
 // Portable evidence omits host paths and local SDK locations.
 if(record.build){delete record.build.binary;record.build.flags=record.build.flags.filter((v,i,a)=>v!=='-isystem'&&a[i-1]!=='-isystem');}
 fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record,null,2));
}
