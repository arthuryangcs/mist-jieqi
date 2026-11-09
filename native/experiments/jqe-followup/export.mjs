// Export the completed prospective batch without changing any game or old result.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {hash,sha,sourceOf} from '../jqe/build.mjs';
import {results,tasksForPlan} from './matches.mjs';
const cache='.cache/jqe-followup-2026-11-09';
const dir='benchmarks/jqe-followup-2026-11-09';
const plan=JSON.parse(fs.readFileSync('native/experiments/jqe-followup/plan.json'));
const raw=JSON.parse(fs.readFileSync(cache+'/matches.json'));
assert(raw.completedAt&&raw.games.length===plan.matches.totalGames&&raw.games.every(g=>g.result));
assert.deepEqual(raw.tasks,tasksForPlan());
for(const [p,h]of Object.entries(raw.hashes))assert.equal(hash(p),h,p);
assert.equal(sha(sourceOf()),raw.builds.candidate.sourceSha256);
assert.equal(sha(sourceOf({trial:false})),raw.builds.control.sourceSha256);
assert.equal(hash('benchmarks/jqe/matches.json'),plan.previousLedgerSha256);
const text=JSON.stringify(raw,null,2)+'\n';
assert(!/\/Users\/|\/home\/|BEGIN [A-Z ]*PRIVATE KEY|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_|sk-[A-Za-z0-9_-]{20,}/.test(text),'Potential personal path or secret in export');
const output=dir+'/matches.json';
assert(!fs.existsSync(output),'Public ledger exists; inspect rather than replacing');
fs.writeFileSync(output,text);
const replay=spawnSync(process.execPath,['native/experiments/jqe-followup/matches.mjs','replay',output],{encoding:'utf8',timeout:120000});
assert.equal(replay.status,0,replay.stderr);
const checked=JSON.parse(replay.stdout);assert(checked.passed&&checked.games===24);
fs.writeFileSync(dir+'/replay.json',JSON.stringify(checked,null,2)+'\n');
const quantile=(a,p)=>{const b=a.slice().sort((x,y)=>x-y);return b.length?b[Math.min(b.length-1,Math.ceil(p*b.length)-1)]:null;};
const arms={};
for(const g of raw.games)for(const row of g.log){
 const key=row.engine==='candidate'?g.candidateName:g.kind==='pika'?'pika':'control';
 (arms[key]??=[]).push(row);
}
const timing=Object.fromEntries(Object.entries(arms).map(([arm,rows])=>[arm,{
 requests:rows.length,applied:rows.filter(x=>x.applied).length,
 hostStops:rows.filter(x=>x.deadlineStop).length,fallbacks:rows.filter(x=>x.fallbackUsed).length,
 aboveBudget:rows.filter(x=>x.elapsedMs>plan.matches.budgetMs).length,
 aboveTechnicalLimit:rows.filter(x=>x.elapsedMs>plan.matches.budgetMs+plan.matches.graceMs).length,
 elapsedMs:{p50:quantile(rows.map(x=>x.elapsedMs),.5),p95:quantile(rows.map(x=>x.elapsedMs),.95),max:Math.max(...rows.map(x=>x.elapsedMs))},
 depthMedian:quantile(rows.map(x=>x.completedDepth).filter(x=>x!==null),.5),
 observedThreads:[...new Set(rows.map(x=>x.threads))],sampleCounts:[...new Set(rows.map(x=>x.samples))]
}]));
const previous=JSON.parse(fs.readFileSync('benchmarks/jqe/matches.json'));
const statistics={
 matchesSha256:hash(output),planSha256:raw.planSha256,summary:raw.summary,timing,
 technicalEvents:raw.games.filter(g=>g.result.technicalForfeit||g.cleanupErrors?.length).map(g=>({index:g.index,result:g.result,cleanupErrors:g.cleanupErrors??[]})),
 byLayout:raw.initials.map(x=>({...x,summary:results(raw.games.filter(g=>g.seed===x.seed))})),
 games:raw.games.map(g=>({index:g.index,group:g.group,seed:g.seed,side:g.candidateSide,plies:g.plies,result:g.result})),
 previousRound:{matchesSha256:hash('benchmarks/jqe/matches.json'),independentLayouts:2,games:12,summary:previous.summary},
 pooledDescriptiveOnly:{independentLayouts:6,games:36,summary:results([...previous.games,...raw.games])},
 limitations:[
  'This prospective follow-up has four independent layouts per comparison and eight color-paired games. Paired colors are correlated, not eight independent samples.',
  'The original two layouts and twelve games remain separate; pooled six-layout results are descriptive only, not statistical evidence of superiority.',
  'Nominal 2000 ms per move, at most four search threads and 64 MiB TT. Total RSS, effective TT entries, implementation and reserve time differ.',
  'Control is the frozen stable search/HCE with the existing bounded map arena, not the byte-identical unbounded production binary.',
  'Third identical public board plus side-to-move loses for its mover, with mate/stalemate priority. This is not complete competition long-check/long-chase adjudication.',
  'Mist internal cycle-draw approximation and Pika internal repetition rules still differ. No alternate-rule winner is inferred from these records.',
  'All technical failures and unresolved games are retained. No tuning, result-dependent replacement, default promotion or trial-server restart.'
 ]
};
fs.writeFileSync(dir+'/match-statistics.json',JSON.stringify(statistics,null,2)+'\n');
console.log(JSON.stringify({exported:true,games:checked.games,moves:checked.moves,summary:raw.summary,pooledDescriptiveOnly:statistics.pooledDescriptiveOnly}));
