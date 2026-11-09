// Publish only completed, byte-identical synthetic evidence, never machine binaries.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from '../jqe-current/build.mjs';
import {results} from './matches.mjs';
const cache='.cache/jqe-retest',dir='benchmarks/jqe-retest-2026-11-09';
const raw=fs.readFileSync(cache+'/matches.json'),r=JSON.parse(raw),replay=JSON.parse(fs.readFileSync(cache+'/replay.json')),audit=JSON.parse(fs.readFileSync(cache+'/audit.json')),analysis=JSON.parse(fs.readFileSync(cache+'/analysis.json'));
assert(r.completedAt&&r.games.length===144&&r.games.every(g=>g.result));
assert(replay.passed&&replay.complete&&replay.matchesSha256===hash(cache+'/matches.json'));
assert(audit.passed&&audit.complete&&audit.inputSha256===hash(cache+'/matches.json'));
for(const[p,h]of Object.entries(r.hashes))assert.equal(hash(p),h,p);
assert.deepEqual(r.summary,results(r.games));
const forbidden=/\/Users\/|\/home\/|github_pat_|gh[pousr]_[A-Za-z0-9_]{20,}|BEGIN [A-Z ]*PRIVATE KEY/;
for(const name of ['matches','replay','audit','analysis']){
 const input=fs.readFileSync(cache+'/'+name+'.json');assert(!forbidden.test(input.toString()),name+' privacy scan');
 const dest=dir+'/'+name+'.json';if(fs.existsSync(dest))assert.equal(hash(dest),hash(cache+'/'+name+'.json'),'Never overwrite different public evidence');else fs.writeFileSync(dest,input);
}
const quantile=(a,p)=>{a=a.toSorted((a,b)=>a-b);return a[Math.max(0,Math.ceil(a.length*p)-1)]??null;};
const arms={};for(const g of r.games)for(const row of g.log){const arm=row.engine==='candidate'?g.candidateName:g.kind==='pika'?'pika':'control';(arms[arm]??=[]).push(row);}
const timing=Object.fromEntries(Object.entries(arms).map(([arm,rows])=>[arm,{requests:rows.length,fallbacks:rows.filter(x=>x.fallbackUsed).length,hostStops:rows.filter(x=>x.deadlineStop).length,aboveBudget:rows.filter(x=>x.elapsedMs>2000).length,aboveGrace:rows.filter(x=>x.elapsedMs>2060).length,elapsedMs:{median:quantile(rows.map(x=>x.elapsedMs),.5),p95:quantile(rows.map(x=>x.elapsedMs),.95),max:Math.max(...rows.map(x=>x.elapsedMs))},medianCompletedDepth:quantile(rows.map(x=>x.completedDepth).filter(x=>x!==null),.5),observedThreads:[...new Set(rows.map(x=>x.threads))],samples:[...new Set(rows.map(x=>x.samples))]}]));
const scores=Object.fromEntries(Object.entries(r.summary).map(([group,s])=>[group,{...s,knownPoints:s.wins+.5*s.draws,scoreInterval:[(s.wins+.5*s.draws)/s.finished,(s.wins+.5*s.draws+s.unresolved)/s.finished],note:'Unresolved games have no awarded result. Interval is possible score range, not a confidence interval.'}]));
const repetitions=audit.games.filter(g=>g.repetition).map(g=>({index:g.index,group:g.group,candidateSide:g.candidateSide,result:g.result,...g.repetition}));
const stats={matchesSha256:hash(dir+'/matches.json'),planSha256:r.planSha256,createdAt:r.createdAt,completedAt:r.completedAt,durationHours:(Date.parse(r.completedAt)-Date.parse(r.createdAt))/3600000,independentLayouts:24,games:144,plies:replay.moves,technicalFailures:r.games.filter(g=>g.result.technicalForfeit).length,cleanupFailures:r.games.reduce((a,g)=>a+(g.cleanupErrors?.length??0),0),summary:scores,timing,adoption:analysis,auditCategories:audit.categories,reviewRequiredPositions:audit.reviewRequiredCount,repetitions,sourceHashes:Object.fromEntries(['audit.mjs','audit.test.mjs','analysis.mjs','export.mjs'].map(n=>['native/experiments/jqe-retest/'+n,hash('native/experiments/jqe-retest/'+n)])),limitations:['Synthetic sampled layouts only; color pairs are correlated. No population Elo or human-game superiority claim.','Only demonstrated single-side long checking is automated. Long chase/threat/mutual responsibility and change procedures remain incomplete; unresolved is not draw.','400-ply runner cap is unresolved. Core root 400-ply handling still uses its program limit; deep cycles are heuristic cutoffs, not full adjudication.','Equal 2000 ms, at most four search workers and 64 MiB TT, not equal total RSS or equal TT entries. Warm readiness excluded; observation/sampling/IPC/search/reaping included.','Historical mover-loss results are not pooled. No parameter changes, result-based replacement or default activation.']};
assert(!forbidden.test(JSON.stringify(stats)));fs.writeFileSync(dir+'/match-statistics.json',JSON.stringify(stats,null,2)+'\n');
console.log(JSON.stringify({exported:true,games:144,plies:replay.moves,scoreSummary:scores,adoption:analysis.statisticalGate}));
