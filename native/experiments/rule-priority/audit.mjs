import fs from'node:fs';import assert from'node:assert/strict';
import{initial,positionKey,move}from'../../../engine.js';import{seeded}from'../../../ai.js';
import{audit,observation,cycleEvidence}from'../jqe-retest/audit.mjs';
import{shared}from'../rule-reply/policy.mjs';import{context,key}from'./selection.mjs';import{hash,cache}from'./build.mjs';
const input=process.argv[2]??cache+'/matches.json',output=process.argv[3]??cache+'/audit.json',d=JSON.parse(fs.readFileSync(input)),base=audit(d);assert(base.passed);
let checks=0;const events=[],allProved=[];
for(const g of d.games){let s=initial(seeded(g.seed));s.positions=[positionKey(s)];
 for(const row of g.log){if(row.engine==='candidate'){
  const v=observation(s,s.turn),c=context(v),unproved=c.legal.filter(m=>!c.losses.has(key(m))),bad=c.losses.has(key(row.move)),metrics=row.selectionMetrics;
  assert.deepEqual(row.ruleReplyProofs,c.proofs);assert(metrics);assert.deepEqual(metrics.move,row.move);
  assert.equal(metrics.fields.selectedProvenRuleLoss,bad);assert(!unproved.length||!bad,'Chosen proved loss while an unproved legal root exists');
  for(const k of['samples','comparedCount','rootCount','completedDepth','fullRootDepth'])if(Object.hasOwn(metrics.fields,k))assert.deepEqual(metrics.fields[k],row[k]);
  if(metrics.fields.selectedHasSameDepthScore){assert(Number.isFinite(metrics.fields.score));assert.equal(metrics.fields.selectedScoreDepth,metrics.fields.comparisonDepth??metrics.fields.depth);}
  else{assert.equal(metrics.fields.selectedScoreDepth,null);assert.equal(metrics.fields.score,null);}
  for(const p of c.proofs){const end=move(move(shared(v),p),p.reply);assert.equal(cycleEvidence(end).loser,v.turn);assert.equal(end.result.winner,p.winner);}
  checks++;if(c.losses.size)events.push({gameIndex:g.index,ply:row.ply,knownLossRoots:c.losses.size,proofs:c.proofs,unprovedLegalCount:unproved.length,chosenProvedLoss:bad,selectionMetrics:metrics});
  if(!unproved.length)allProved.push({gameIndex:g.index,ply:row.ply,move:row.move});
 }if(row.applied)s=move(s,row.move);}
}
const r={...base,inputSha256:hash(input),priorityAudit:{passed:true,decisions:checks,events,allProved,chosenProvedWithUnprovedAlternative:0,limitation:'Unproved does not mean safe. This checks public supported rule proofs, not complete competition chase liability or unrecorded process memory.'}};
fs.writeFileSync(output,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({passed:r.passed,complete:r.complete,games:r.auditedGames,categories:r.categories,priorityDecisions:checks,priorityEvents:events.length,allProved:allProved.length}));
