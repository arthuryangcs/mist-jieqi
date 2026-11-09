// No engine starts: paired-layout analysis with preregistered conservative bounds.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {seeded} from '../../../ai.js';
export function score(g,worst=0){return !g.result||g.result.status==='unresolved'?worst:g.result.winner===g.candidateSide?1:g.result.status==='draw'?.5:0;}
const mean=a=>a.reduce((a,b)=>a+b,0)/a.length;
export function lower(a,range=1){return mean(a)-range*Math.sqrt(Math.log(40)/(2*a.length));}
export function bootstrap(a,seed=2091162101){const rng=seeded(seed),v=[];for(let i=0;i<20000;i++)v.push(mean(a.map(()=>a[Math.floor(rng()*a.length)])));v.sort((a,b)=>a-b);return {low:v[499],high:v[19499],replicates:20000,seed,descriptiveOnly:true};}
export function analyze(r){
 const seeds=[...new Set(r.tasks.map(t=>t.seed))],rows=[];
 for(const seed of seeds){const groups={};for(const group of ['internal','candidatePika','controlPika']){const games=r.games.filter(g=>g.seed===seed&&g.group===group);assert.equal(games.length,2);assert(games.every(g=>g.result));assert.deepEqual(games.map(g=>g.candidateSide).sort(),['b','r']);groups[group]=mean(games.map(g=>score(g,group==='controlPika'?1:0)));}rows.push({seed,...groups,pikaDifference:groups.candidatePika-groups.controlPika});}
 const h=rows.map(x=>x.internal),p=rows.map(x=>x.pikaDifference),technical=r.games.filter(g=>g.result.technicalForfeit||g.cleanupErrors?.length).length;
 const internal={mean:mean(h),lower:lower(h),bootstrap:bootstrap(h)},pikaDifference={mean:mean(p),lower:lower(p,2),bootstrap:bootstrap(p)};
 const sufficientSample=seeds.length>=24&&r.games.length===r.tasks.length&&!!r.completedAt;
 return {layouts:seeds.length,games:r.games.length,technicalFailures:technical,internal,pikaDifference,rows,sufficientSample,statisticalGate:sufficientSample&&technical===0&&internal.lower>.5&&pikaDifference.lower>-.05,defaultEnable:false,requiresIndependentReplayAndRulePrivacyReview:true,note:'Failure to pass is insufficient evidence, not proof of no advantage. At 24 layouts the fixed bounds require internal mean >77.7% and Pika difference >50.4 percentage points. Bootstrap intervals are descriptive only; no early enable, no tuning.'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const file=process.argv[2]??'.cache/jqe-retest/matches.json';console.log(JSON.stringify(analyze(JSON.parse(fs.readFileSync(file))),null,2));}
