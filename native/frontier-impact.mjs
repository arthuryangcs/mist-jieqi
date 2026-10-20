// Biased post-hoc diagnosis of already completed games. Never replaces a result.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {initial,publicState,move,positionKey} from '../engine.js';
import {seeded} from '../ai.js';import {Native,fixture,observationSeed} from './bridge.mjs';
import {compileFocus,sha} from './focus-variants.mjs';
const dir='benchmarks/frontier';fs.mkdirSync(dir,{recursive:true});
const file=`${dir}/prior-impact.json`;assert(!fs.existsSync(file),'Preserve previous diagnosis');
const inputs=['benchmarks/focus/matches-both-screen-production.json','benchmarks/focus/pika-both.json'];
const r={startedAt:new Date().toISOString(),inputHashes:Object.fromEntries(inputs.map(p=>[p,sha(fs.readFileSync(p))])),selection:'All trial losses; at most3 distinct positions per game: first focused turn, largest subsequent own-score decline, last focused turn. Post-hoc biased diagnostic, not an error-rate estimate.',budgetPerReferenceMs:5000,capMoves:[],rows:[],games:[],passed:false};
const b=compileFocus('tacticalCanonical',{audit:true});r.build=b;let n;
try{
 n=new Native({binary:b.binary});await n.ready;
 for(const input of inputs){const data=JSON.parse(fs.readFileSync(input));
  const games=data.games.filter(g=>input.includes('pika-')?g.engine==='trial':true);
  for(const g of games){const side=g.trialSide??g.candidateSide,isLoss=g.result.status==='decided'&&!g.result.technicalForfeit&&g.result.winner!==side;
   let s=initial(seeded(g.seed));s.positions=[positionKey(s)];const candidates=[];
   for(const row of g.log){const own=row.side===side,focused=row.searchScope==='focused-root';
    if(own&&row.depth===8&&row.elapsedMs<data.budgetMs*.85)r.capMoves.push({input,seed:g.seed,side,ply:row.ply,elapsedMs:row.elapsedMs,budgetMs:data.budgetMs,rootCount:row.rootCount,comparedCount:row.comparedCount,isLoss});
    if(own&&focused&&row.depth)candidates.push({row,view:publicState(s,s.turn)});s=move(s,row.move);
   }
   r.games.push({input,seed:g.seed,side,isLoss,focused:candidates.length,result:g.result});if(!isLoss||!candidates.length)continue;
   const ranked=candidates.slice(0,-1).map((c,i)=>({...c,drop:c.row.score-candidates[i+1].row.score})).sort((a,b)=>b.drop-a.drop);
   const selected=[candidates[0],ranked[0],candidates.at(-1)].filter(Boolean),seen=new Set();
   for(const c of selected){if(seen.has(c.row.ply))continue;seen.add(c.row.ply);assert.equal(sha(JSON.stringify(c.view)),c.row.viewSha256);
    const f=fixture(c.view,{seed:observationSeed(c.view),samples:8}),full=await n.request(f,{mode:'PLAY',depth:c.row.depth,budget:r.budgetPerReferenceMs});
    const complete=full.depth===c.row.depth&&full.comparedCount===full.rootCount,chosen=complete?full.allCandidates.find(m=>m.from===c.row.move.from&&m.to===c.row.move.to):null;
    if(complete){assert(chosen);assert(Math.abs(chosen.score-c.row.score)<1e-7,'Same-depth recorded score mismatch');}
    const best=complete?full.allCandidates[0]:null,gap=complete?best.score-chosen.score:null;
    r.rows.push({input,seed:g.seed,side,ply:c.row.ply,view:c.view,recorded:c.row,worldHashes:f.worldHashes,reference:full,complete,chosen,gap,omittedHigherCandidate:complete?gap>1e-7:null});
    fs.writeFileSync(file,JSON.stringify(r)+'\n');console.log(JSON.stringify({seed:g.seed,side,ply:c.row.ply,depth:c.row.depth,complete,gap}));
   }
  }
 }
 r.passed=true;
}catch(e){r.error=e.stack;throw e;}finally{if(n){await n.close();r.stderr=n.stderr;if(n.stderr)r.passed=false;}r.finishedAt=new Date().toISOString();r.summary={games:r.games.length,losses:r.games.filter(g=>g.isLoss).length,diagnoses:r.rows.length,complete:r.rows.filter(x=>x.complete).length,omittedHigher:r.rows.filter(x=>x.omittedHigherCandidate).length,incompleteUnknown:r.rows.filter(x=>!x.complete).length,capEarlyReturns:r.capMoves.length,capEarlyReturnsInLosses:r.capMoves.filter(x=>x.isLoss).length};r.limitations='Same-depth gaps expose omitted model preferences, not proof of a lost-game cause or a saved alternative. Cross-turn scores only select examples. Reference budget exhaustion remains unknown. Cap exposure counts are descriptive, not causal.';fs.writeFileSync(file,JSON.stringify(r)+'\n');console.log(JSON.stringify({passed:r.passed,...r.summary}));}
