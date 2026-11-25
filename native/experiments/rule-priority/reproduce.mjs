import fs from'node:fs';import assert from'node:assert/strict';
import{TrialEngine as OldTrial}from'../rule-reply/client.mjs';import{counterexample}from'./case.mjs';import{context,key,snapshot,selectResult}from'./selection.mjs';import{cache}from'./build.mjs';
const{view,row}=counterexample(),c=context(view),old=new OldTrial();
try{const x=await old.search(view,2000),corrected=selectResult(x,c),keys=['from','to','score','baseScore','riskPenalty','repetitionLoss','ruleReplyLoss'];
 assert(!c.losses.has(key(corrected.move)));for(const k of['samples','comparedCount','rootCount','completedDepth','fullRootDepth'])assert.equal(corrected[k],x[k]);
 const r={passed:true,synthetic:true,oldSavedRecord:snapshot(row),actualOld2s:snapshot(x),actualOldChoosesProvedLoss:c.losses.has(key(x.move)),scoredRoots:x.allCandidates.map(r=>Object.fromEntries(keys.filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]]))),sameTablePriorityReplay:snapshot(corrected),interpretation:'Only the actual returned common-depth cohort is replayed. Unproved legal alternatives are not guaranteed safe; no new score, root coverage or depth is fabricated.'};
 fs.writeFileSync(cache+'/old-table.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
}finally{await old.close();}
