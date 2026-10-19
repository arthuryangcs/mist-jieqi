import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='benchmarks/quiet-checks',read=n=>JSON.parse(fs.readFileSync(`${dir}/${n}.json`));
const p=read('assessment'),m=read('matches'),v=read('match-verification'),c=read('check'),s=read('check-sanitized');
const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
const percentile=(a,q)=>a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.ceil(a.length*q)-1)];
assert(p.passed&&v.passed&&c.passed&&s.passed);
assert.equal(v.matchSha256,sha(`${dir}/matches.json`));
for(const b of m.builds){assert.equal(b.sourceSha256,p.builds.find(x=>x.name===b.name).sourceSha256);assert.equal(b.binarySha256,p.builds.find(x=>x.name===b.name).binarySha256);}
const fixed=p.positions.map(pos=>{
  const rows=p.rows.filter(r=>r.kind==='fixed'&&r.position===pos.name),medians=Object.fromEntries(['baseline','qbright','qall'].map(n=>[n,median(rows.map(r=>r.results[n].elapsedMs))]));
  assert.equal(rows.length,3);
  for(const n of ['baseline','qbright','qall'])for(const r of rows.slice(1)){
    const pick=v=>({depth:v.depth,nodes:v.nodes,score:v.score,move:v.move,allCandidates:v.allCandidates});
    assert.deepEqual(pick(r.results[n]),pick(rows[0].results[n]),`${pos.name}/${n} fixed repeat differs`);
  }
  return {position:pos.name,depth:pos.depth,mediansMs:medians,relativeQall:medians.qall/medians.baseline};
});
const timed=[];
for(const pos of p.positions)for(const budget of [1000,6000]){
  const rows=p.rows.filter(r=>r.kind==='timed'&&r.position===pos.name&&r.budget===budget);if(!rows.length)continue;
  timed.push({position:pos.name,budget,variants:Object.fromEntries(['baseline','qbright','qall'].map(n=>[n,{
    completeDepths:rows.map(r=>r.results[n].depth),medianWallMs:median(rows.map(r=>r.results[n].wallMs)),
    moves:rows.map(r=>r.results[n].move),allNodes:rows.map(r=>r.results[n].nodes)
  }]))});
}
const timing={};
for(const name of ['baseline','trial']){
  const rows=m.games.flatMap(g=>g.log).filter(r=>r.engine===name),times=rows.map(r=>r.elapsedMs);
  timing[name]={attempts:rows.length,medianMs:median(times),p95Ms:percentile(times,.95),maxMs:Math.max(...times),overGrace:times.filter(t=>t>m.budgetMs+m.graceMs).length,
    deadlineStops:rows.filter(r=>r.deadlineStop).length,fallbacks:rows.filter(r=>r.fallbackUsed).length};
}
const points=m.summary.wins+.5*m.summary.draws,passesMatchGate=points>=6&&!m.summary.unresolved&&!m.summary.technical.length;
const result={passed:true,generatedAt:new Date().toISOString(),productionUnchanged:sha('native/search.cpp')===sha(`${dir}/baseline.cpp`),productionSourceSha256:sha('native/search.cpp'),
  builds:p.builds,fixed,timed,match:{...m.summary,gameCount:m.summary.games,points,passesMatchGate,played:v.played,darkCaptures:v.darkCaptures,timing,
    games:m.games.map(g=>({seed:g.seed,trialSide:g.trialSide,plies:g.finalState.ply,...g.result}))},
  checks:{ruleViewVariants:c.cases.length,quietChecksCompared:c.checks,transitions:c.transitions,tacticalSearches:c.tactics.length,informationIsolation:c.informationIsolation,sanitizerPassed:s.passed},
  artifacts:Object.fromEntries(['assessment','matches','match-verification','check','check-sanitized','diagnostic','check-initial','check-stalemate-criterion'].map(n=>[n,sha(`${dir}/${n}.json`)])),
  limits:['Four paired layouts at400ms; small correlated sample, not Elo or population win rate.','Fixed-depth timing repeated3 times;6s repeated once. Native SEARCH timing is distinct from end-to-end match STREAM timing.','Initial check-only win criterion wrongly excluded Xiangqi stalemates; failed attempts preserved and final predicate follows referee rules.','No broader evaluation changes were mixed into the trial.']};
fs.writeFileSync(`${dir}/summary.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.match));
