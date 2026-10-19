// Small paired, end-to-end trial against the frozen production baseline.
// This never starts an external engine or changes the playable server.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {initial,publicState,legalMoves,move,other,positionKey} from '../engine.js';
import {seeded} from '../ai.js';
import {Native} from './bridge.mjs';
import {CandidateEngine} from '../scripts/native-match-engine.mjs';

const file='benchmarks/quiet-checks/matches.json';
const sha=v=>createHash('sha256').update(v).digest('hex');
const hash=p=>sha(fs.readFileSync(p));
const files=['native/forcing-match.mjs','native/forcing-variants.mjs','native/bridge.mjs','scripts/native-match-engine.mjs','engine.js','ai.js'];
class TrialEngine extends CandidateEngine {
  constructor(binary){super();this.binary=binary;}
  async ready(){
    if(this.native)return;
    const n=new Native({binary:this.binary});n.exited=new Promise(resolve=>n.process.once('exit',resolve));
    this.native=n;await n.ready;this.initializations.push(n.initializationMs);
  }
}
function summary(games){
  const wins=games.filter(g=>g.result.winner===g.trialSide).length;
  const draws=games.filter(g=>g.result.status==='draw').length;
  const unresolved=games.filter(g=>g.result.status==='unresolved').length;
  const losses=games.length-wins-draws-unresolved;
  return {games:games.length,wins,draws,losses,unresolved,scoreRate:unresolved?null:(wins+.5*draws)/games.length,
    technical:games.filter(g=>g.result.technicalForfeit).map(g=>({seed:g.seed,trialSide:g.trialSide,...g.result}))};
}
if(!fs.existsSync(file)){
  const check=JSON.parse(fs.readFileSync('benchmarks/quiet-checks/check.json'));
  const perf=JSON.parse(fs.readFileSync('benchmarks/quiet-checks/assessment.json'));
  assert(check.passed&&perf.passed);
  const builds=perf.builds.filter(b=>['baseline','qall'].includes(b.name));
  for(const b of builds){assert.equal(hash(`.cache/quiet/${b.name}`),b.binarySha256);assert.equal(hash(`.cache/quiet/${b.name}.cpp`),b.sourceSha256);}
  const seeds=[9511,9533,9551,9571];
  const record={createdAt:new Date().toISOString(),trial:'qall',builds,budgetMs:400,graceMs:60,maxPlies:400,seeds,
    sourceHashes:Object.fromEntries(files.map(p=>[p,hash(p)])),
    initials:seeds.map(seed=>{const s=initial(seeded(seed));s.positions=[positionKey(s)];return {seed,board:s.board};}),
    config:{samples:8,maxDepth:8,maxThreads:4,singleBrightSample:true,ttEntryCapPerWorld:90000,
      promotionGate:'Set before games: at least6/8 points, zero technical failures, independent rule/tactical/sanitizer tests, and full production integration checks. Otherwise keep baseline. This is a conservative engineering gate, not a significance test.',
      clock:'Projection, sampling, IPC, native search, deadline stop and process exit included. Readiness excluded for both; no overlapping searches.',
      information:'Only current side publicState with its private captures; no real hidden allocation or setup seed sent to either engine.',
      draws:'Public-position threefold or120 quiet plies. 400 ply cap explicitly unresolved.',
      limits:'Four pairs at400ms, exploratory only; not an Elo estimate or replication of previous Pika matches.'},games:[]};
  fs.writeFileSync(file,JSON.stringify(record)+'\n');
}
const record=JSON.parse(fs.readFileSync(file));
const persist=()=>fs.writeFileSync(file,JSON.stringify(record)+'\n');
for(const [p,h] of Object.entries(record.sourceHashes))assert.equal(hash(p),h,'Frozen source changed: '+p);
for(const b of record.builds)assert.equal(hash(`.cache/quiet/${b.name}`),b.binarySha256);
for(const seed of record.seeds)for(const trialSide of ['r','b']) {
  if(record.games.some(g=>g.seed===seed&&g.trialSide===trialSide))continue;
  let state=initial(seeded(seed));state.positions=[positionKey(state)];assert.deepEqual(state.board,record.initials.find(x=>x.seed===seed).board);
  const engines={trial:new TrialEngine(fs.realpathSync('.cache/quiet/qall')),baseline:new TrialEngine(fs.realpathSync('.cache/quiet/baseline'))};
  const game={seed,trialSide,startedAt:new Date().toISOString(),log:[]};let active='trial';
  try {
    for(const name of ['trial','baseline']){active=name;await engines[name].ready();}
    while(!state.result&&state.ply<record.maxPlies) {
      active=state.turn===trialSide?'trial':'baseline';await engines[active].ready();
      const start=performance.now(),view=publicState(state,state.turn);
      for(const p of [...view.board,...view.captured])assert(!p?.hidden||!('type'in p));
      const prepMs=performance.now()-start;
      const r=await engines[active].search(view,Math.max(1,Math.floor(record.budgetMs-prepMs)));
      const elapsedMs=performance.now()-start,legal=legalMoves(view).some(m=>m.from===r.move?.from&&m.to===r.move?.to);
      const row={ply:state.ply+1,engine:active,side:state.turn,move:r.move,elapsedMs,depth:r.depth,nodes:r.nodes,score:r.score,
        threads:r.threads,deadlineStop:r.deadlineStop,fallbackUsed:r.fallbackUsed,viewSha256:sha(JSON.stringify(view))};
      if(!legal||elapsedMs>record.budgetMs+record.graceMs){
        game.log.push(row);game.result={status:'decided',winner:other(state.turn),technicalForfeit:true,offender:active,reason:!legal?'illegal-move':'technical-timeout'};break;
      }
      const p=state.board[r.move.from],q=state.board[r.move.to];state=move(state,r.move);
      game.log.push({...row,revealed:p.hidden?state.board[r.move.to].type:null,captured:q,afterSha256:sha(JSON.stringify(state.board))});
      fs.writeFileSync('benchmarks/quiet-checks/live.json',JSON.stringify({seed,trialSide,ply:state.ply,completed:record.games.length,last:row})+'\n');
    }
    if(!game.result){
      if(state.result?.winner)game.result={status:'decided',winner:state.result.winner,reason:state.result.text,technicalForfeit:false};
      else if(state.ply>=record.maxPlies)game.result={status:'unresolved',winner:null,reason:'400-ply-cap',technicalForfeit:false};
      else game.result={status:'draw',winner:null,reason:state.quiet>=120?'120-quiet-plies':'threefold-public-position',technicalForfeit:false};
    }
  }catch(e){game.result={status:'decided',winner:active==='trial'?other(trialSide):trialSide,reason:'process-or-protocol-failure',technicalForfeit:true,offender:active,error:e.stack};}
  finally{for(const e of Object.values(engines))await e.close();}
  game.initializations=Object.fromEntries(Object.entries(engines).map(([n,e])=>[n,e.initializations]));
  game.finalState=state;game.finishedAt=new Date().toISOString();record.games.push(game);record.summary=summary(record.games);persist();
  console.log(JSON.stringify({seed,trialSide,plies:state.ply,result:game.result,summary:record.summary}));
}
record.completedAt=new Date().toISOString();persist();
