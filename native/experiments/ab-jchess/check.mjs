import assert from 'node:assert/strict';import fs from 'node:fs';
import {initial,publicState,legalMoves,move,positionKey,other} from '../../../engine.js';import {seeded} from '../../../ai.js';
import {ABClient,fen,observationToken,assertObservation} from './adapter.mjs';import {safeRoots} from '../coverage-validation/common.mjs';import {hash} from './build.mjs';
const out={passed:false,startedAt:new Date().toISOString(),tokens:[],positionChecks:0,legalSetChecks:0,privateCaptures:0,quietDifferences:0,seeds:[2026102807,2026102811]};
const keys=ms=>ms.map(m=>m.from*90+m.to).sort((a,b)=>a-b),client=new ABClient();
try{
 const first=initial(seeded(out.seeds[0]));out.initialization=await client.init(publicState(first,'r'));
 const leaked=structuredClone(publicState(first,'r'));leaked.board[0].type='R';assert.throws(()=>assertObservation(leaked));
 // Different referee assignments produce identical legal observations and initial FENs.
 assert.equal(fen(publicState(first,'r')),fen(publicState(initial(seeded(98421)),'r')));
 for(const seed of out.seeds)for(const viewer of ['r','b']){
  let s=initial(seeded(seed));s.positions=[positionKey(s)];const start=fen(publicState(s,viewer)),journal=[],rng=seeded(seed+31);
  for(let i=0;i<80&&!s.result;i++){
   const v=publicState(s,viewer),p=await client.position(start,journal,v);out.positionChecks++;if(p.abQuiet!==p.mistQuiet)out.quietDifferences++;
   if(i%8===0){assert.deepEqual(keys(await client.legal(v)),keys(legalMoves(v)));out.legalSetChecks++;}
   const ms=legalMoves(s),captures=ms.filter(m=>s.board[m.to]),m=(captures.length?captures:ms)[Math.floor(rng()*(captures.length||ms.length))],n=move(s,m),after=publicState(n,viewer),token=observationToken(v,m,after,viewer);
   assert.equal(token.includes('X'),false);out.tokens.push(token.length);
   const q=s.board[m.to];if(q?.hidden){out.privateCaptures++;const otherView=publicState(n,other(s.turn));assert(!('type' in otherView.captured.at(-1)));const changed=structuredClone(n);changed.captured.at(-1).type=q.type==='R'?'P':'R';assert.deepEqual(publicState(changed,other(s.turn)),otherView);assert.equal(observationToken(publicState(s,other(s.turn)),m,otherView,other(s.turn)),observationToken(publicState(s,other(s.turn)),m,publicState(changed,other(s.turn)),other(s.turn)));}
   journal.push(token);s=n;
  }
  await client.position(start,journal,publicState(s,viewer));out.positionChecks++;
 }
 // Explicit repeat cycle. The external arbiter and root whitelist prevent an immediate third repetition.
 let s=initial(seeded(17));for(const[index,side]of [[82,'r'],[1,'b']]){const j=s.board.findIndex((p,i)=>i!==index&&p?.side===side&&p.type==='N');if(s.board[index].type!=='N')[s.board[index].type,s.board[j].type]=[s.board[j].type,s.board[index].type];}s.positions=[positionKey(s)];const start=fen(publicState(s,'b')),journal=[];
 for(const m of [{from:82,to:63},{from:1,to:18},{from:63,to:82},{from:18,to:1},{from:82,to:63},{from:1,to:18},{from:63,to:82},{from:18,to:1},{from:82,to:63}]){const n=move(s,m);journal.push(observationToken(publicState(s,'b'),m,publicState(n,'b'),'b'));s=n;}
 const v=publicState(s,'b'),roots=safeRoots(v);assert.equal(roots.excluded,1);const losing=move(s,{from:1,to:18});assert.equal(losing.result.winner,'r');assert(losing.result.text.includes('重复'));
 const x=await client.search(start,journal,v,200,{searchMoves:roots.moves});assert(roots.moves.some(m=>m.from===x.move?.from&&m.to===x.move?.to));assert.notDeepEqual(x.move,{from:1,to:18});out.repeatProbe={excluded:roots.excluded,returned:x.move,elapsedMs:x.elapsedMs};
 out.tokenLengths=Object.fromEntries([...new Set(out.tokens)].map(n=>[n,out.tokens.filter(x=>x===n).length]));delete out.tokens;assert(out.privateCaptures>0);assert(out.tokenLengths[4]&&out.tokenLengths[5]&&out.tokenLengths[6]);out.passed=true;
}catch(e){out.error=e.stack.replaceAll(process.cwd(),'<project>');throw e;}finally{await client.close();out.stderr=client.stderr;out.sourceSha256=hash('native/experiments/ab-jchess/check.mjs');fs.writeFileSync('benchmarks/ab-jchess/check.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({...out,initialization:undefined}));}
