// Replay a failed clock observation with timestamps added only in memory.
// The frozen adapter, cores, budgets and original result are never modified.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {initial,publicState,move,positionKey}from'../engine.js';import{seeded}from'../ai.js';
import{Native}from'./bridge.mjs';import{dir,sha,patch}from'./defense-variants.mjs';
const r=JSON.parse(fs.readFileSync(`${dir}/matches-screen.json`));assert.equal(r.games.length,8);assert(r.completedAt);
const file=process.env.JIEQI_DEFENSE_DIAG_OUTPUT||`${dir}/timing-replay.json`;assert(!fs.existsSync(file),'Preserve existing diagnosis; choose a new output path to repeat');
const g=r.games.find(g=>g.result.reason==='technical-timeout');assert(g,'No timeout to diagnose');
let s=initial(seeded(g.seed));s.positions=[positionKey(s)];for(const row of g.log.slice(0,-1))s=move(s,row.move);
const original=g.log.at(-1),view=publicState(s,s.turn);assert.equal(sha(JSON.stringify(view)),original.viewSha256);
for(const p of [...view.board,...view.captured])assert(!p?.hidden||!('type'in p));
let source=fs.readFileSync('scripts/native-match-engine.mjs','utf8');assert.equal(sha(source),r.sourceHashes['scripts/native-match-engine.mjs']);
source=source.replaceAll("'../native/bridge.mjs'",JSON.stringify(new URL('./bridge.mjs',import.meta.url).href)).replaceAll("'../engine.js'",JSON.stringify(new URL('../engine.js',import.meta.url).href)).replaceAll("'./external-engine.js'",JSON.stringify(new URL('../scripts/external-engine.js',import.meta.url).href));
source=patch(source,'let latest=null,firstProgressMs=null;','let latest=null,firstProgressMs=null,timerAt=null,resolvedAt=null,reapedAt=null;');
source=patch(source,'resolve({...r,searchElapsedMs:r.elapsedMs,','resolvedAt=performance.now()-start;resolve({...r,searchElapsedMs:r.elapsedMs,');
source=patch(source,'timer=setTimeout(()=>{if(finished)return;this.native=null;','timer=setTimeout(()=>{if(finished)return;timerAt=performance.now()-start;this.native=null;');
source=patch(source,'if(result.deadlineStop)await n.exited;','if(result.deadlineStop){await n.exited;reapedAt=performance.now()-start;}');
source=patch(source,'return{...result,elapsedMs:performance.now()-start};','return{...result,elapsedMs:performance.now()-start,segments:{timerAt,resolvedAt,reapedAt}};');
const {CandidateEngine}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const build=r.builds.find(b=>b.name===(original.engine==='baseline'?'baseline':r.trial));assert(build);assert.equal(sha(fs.readFileSync(build.binary)),build.binarySha256);
class TimedEngine extends CandidateEngine {
 async ready(){if(this.native)return;const n=new Native({binary:build.binary});n.exited=new Promise(resolve=>n.process.once('exit',resolve));this.native=n;await n.ready;this.initializations.push(n.initializationMs);}
}
const out={startedAt:new Date().toISOString(),original:{seed:g.seed,trialSide:g.trialSide,result:g.result,row:original},viewSha256:sha(JSON.stringify(view)),adapterSha256:r.sourceHashes['scripts/native-match-engine.mjs'],instrumentedAdapterSha256:sha(source),build,budgetMs:r.budgetMs,graceMs:r.graceMs,rows:[],passed:false};
try {
 for(let repeat=0;repeat<6;repeat++){
  const engine=new TimedEngine();try{await engine.ready();const start=performance.now();const v=structuredClone(view);const result=await engine.search(v,Math.max(1,Math.floor(r.budgetMs-(performance.now()-start))));
   out.rows.push({repeat,elapsedMs:performance.now()-start,depth:result.depth,deadlineStop:result.deadlineStop,fallbackUsed:result.fallbackUsed,firstProgressMs:result.firstProgressMs,searchElapsedMs:result.searchElapsedMs,segments:result.segments,initializations:engine.initializations});
  }finally{await engine.close();}
 }
 out.overGrace=out.rows.filter(x=>x.elapsedMs>r.budgetMs+r.graceMs).length;out.passed=true;
}catch(e){out.error=e.stack;throw e;}finally{
 out.finishedAt=new Date().toISOString();out.limitation='Replays do not replace the original technical loss. The original log lacks callback/reap timestamps; exact historical cause remains unproved even if six replays succeed.';
 fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({passed:out.passed,overGrace:out.overGrace,rows:out.rows}));
}
