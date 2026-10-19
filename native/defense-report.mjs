import fs from 'node:fs';import assert from 'node:assert/strict';import os from 'node:os';
import {dir,sha}from'./defense-variants.mjs';
const read=name=>JSON.parse(fs.readFileSync(`${dir}/${name}.json`)),med=a=>a.toSorted((x,y)=>x-y)[Math.floor(a.length/2)];
const fixed=read('fixed-lazy'),budgets=read('budgets-lazy'),matches=read('matches-screen'),verification=read('verification-screen'),selection=read('selection');
const checks=['check-release','check-fast-release','check-cached-release','check-lazy-release','check-lazy-asan','reference-check','unit','timing-replay'].map(name=>({name,...read(name)}));
for(const r of [...checks,fixed,budgets,verification])assert(r.passed,r.name||r.mode);
assert.equal(matches.games.length,8);assert.equal(selection.variant,'kingLazy');
const costs=fixed.positions.map(p=>{
 const xs=fixed.rows.filter(r=>r.position===p.name),ms=Object.fromEntries(['baseline','kingFast','kingLazy'].map(n=>[n,med(xs.map(r=>r.results[n].elapsedMs))]));
 return {position:p.name,depth:xs[0].depth,medianMs:ms,lazyOverBaseline:ms.kingLazy/ms.baseline,lazyOverExact:ms.kingLazy/ms.kingFast};
});
const depths=[...new Set(budgets.rows.map(r=>r.position))].flatMap(position=>[1000,6000].map(budget=>{
 const xs=budgets.rows.filter(r=>r.position===position&&r.budget===budget);
 return {position,budgetMs:budget,repeats:xs.length,depths:Object.fromEntries(['baseline','kingFast','kingLazy'].map(n=>[n,xs.map(r=>r.results[n].depth)])),median:Object.fromEntries(['baseline','kingFast','kingLazy'].map(n=>[n,med(xs.map(r=>r.results[n].depth))]))};
}));
const depthLosses=depths.filter(r=>r.budgetMs===1000&&r.median.kingLazy<=r.median.baseline-1).length;
const noTech=!matches.summary.technical.length&&!matches.summary.unresolved;
const gates={screenScore:matches.summary.scoreRate>=.625,technical:noTech,depth:depthLosses<2,confirmRequired:true};
const timing={};for(const engine of ['trial','baseline']){
 const xs=matches.games.flatMap(g=>g.log).filter(x=>x.engine===engine),ms=xs.map(x=>x.elapsedMs).sort((a,b)=>a-b);
 timing[engine]={attempts:xs.length,medianMs:(ms[(ms.length-1)>>1]+ms[ms.length>>1])/2,p95Ms:ms[Math.floor((ms.length-1)*.95)],maxMs:ms.at(-1),hostStops:xs.filter(x=>x.deadlineStop).length,fallbacks:xs.filter(x=>x.fallbackUsed).length,overGrace:ms.filter(x=>x>460).length};
}
const sources=['native/defense-eval.inc','native/defense-variants.mjs','native/defense-check.mjs','native/defense-benchmark.mjs','native/defense-match.mjs','native/defense-match-verify.mjs','native/defense-reference.mjs','native/defense-reference-check.mjs','native/defense-trial.mjs','native/defense-timing.mjs','native/defense-report.mjs','native/defense-verify.mjs','native/search.cpp','ai.js','native/server.mjs','native/bridge.mjs','engine.js'];
const artifacts=fs.readdirSync(dir).filter(f=>f.endsWith('.json')&&!['summary.json','final-verification.json'].includes(f));
const missing=[];let buildCount=0;for(const f of artifacts){const r=read(f.slice(0,-5));for(const b of [...(r.builds||[]),...(r.build?[r.build]:[])])if(b.sourceSha256){buildCount++;const p=`${dir}/sources/${b.sourceSha256}.cpp`;if(!fs.existsSync(p)||sha(fs.readFileSync(p))!==b.sourceSha256)missing.push([f,b.name,b.sourceSha256]);}}
assert(!missing.length,JSON.stringify(missing));
const unchanged=sha(fs.readFileSync('native/search.cpp'))===sha(fs.readFileSync(`${dir}/baseline.cpp`))&&sha(fs.readFileSync('ai.js'))===sha(fs.readFileSync(`${dir}/baseline-ai.js`));
assert(unchanged,'Rejected experiment must not alter the playable default');
const normalGames=matches.games.filter(g=>!g.result.technicalForfeit),normalWins=normalGames.filter(g=>g.result.winner===g.trialSide).length,normalDraws=normalGames.filter(g=>g.result.status==='draw').length;
const r={createdAt:new Date().toISOString(),baselineCommit:'553da77',variant:selection.variant,defaultUnchanged:unchanged,decision:gates.screenScore&&gates.technical&&gates.depth?'Screen eligible for confirm; not enabled without confirm/integration':'Rejected for default; preserve experiment only',gates,depthLossPositionsAt1s:depthLosses,costs,depths,summary:matches.summary,timing,verification,checks:checks.map(c=>({name:c.name,passed:c.passed,cases:c.cases?.length,rules:c.rules?.length,searches:c.searches?.length,rows:c.rows?.length})),archivedBuildReferences:buildCount,archivedSources:fs.readdirSync(`${dir}/sources`).length,
 sourceHashes:Object.fromEntries(sources.map(p=>[p,sha(fs.readFileSync(p))])),artifactHashes:Object.fromEntries(artifacts.map(p=>[p,sha(fs.readFileSync(`${dir}/${p}`))])),environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model},
 normalGames:{games:normalGames.length,wins:normalWins,draws:normalDraws,losses:normalGames.length-normalWins-normalDraws,scoreRate:(normalWins+normalDraws*.5)/normalGames.length},confirmationPlayed:false,pikaPlayed:false,
 limitations:['Four paired exploratory400ms layouts, not an Elo or stable strength estimate.','No Pika match in this round; do not combine with historical Pika scores.','King pressure is a pseudo-control heuristic; pinned attackers and occupancy changes need legal search.','Host scheduling/frequency not controlled; rotated repeats retain all measurements.','Original technical result is retained. Six instrumented replays cannot establish its historical cause.','Default source and playable server stay unchanged if rejected.']};
fs.writeFileSync(`${dir}/summary.json`,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({decision:r.decision,gates,summary:r.summary,defaultUnchanged:unchanged,archivedBuildReferences:buildCount}));
