import test from'node:test';import assert from'node:assert/strict';
import{Game,TYPES,positionKey,publicState,legalMoves,rootRules,move}from'../engine.js';
import{classifyCycle,repetitionPolicy}from'../repetition.js';
import{validateRequest}from'../native/server.mjs';
function game(placements,turn='r',ply=60){const g=new Game(),s={board:Array(90).fill(null),captured:[],turn,ply,quiet:0,result:null,positions:[]};for(const[i,side,type]of placements)s.board[i]={side,type,role:type,hidden:false};for(const side of['r','b']){const bag=[...TYPES];for(const p of s.board)if(p?.side===side&&p.type!=='K')bag.splice(bag.indexOf(p.type),1);for(const type of bag)s.captured.push({side,type,role:type,hidden:false});}s.positions=[positionKey(s)];g.state=s;g.history=[];return g;}
const peace=[[85,'r','K'],[4,'b','K'],[49,'r','P']],peaceCycle=[[85,84],[4,5],[84,85],[5,4]],check=[[85,'r','K'],[3,'b','K'],[49,'r','P'],[13,'r','R']],checkCycle=[[13,12],[3,4],[12,13],[4,3]],chase=[[85,'r','K'],[4,'b','K'],[76,'r','P'],[18,'r','R'],[41,'b','N']],chaseCycle=[[18,36],[41,22],[36,18],[22,41]];
function step(g,cycle,i){const[from,to]=cycle[i%cycle.length];assert(g.play({from,to}),`legal ${from}->${to}`);}
function run(g,cycle,max=24){let warning=null;for(let i=0;i<max&&!g.state.result;i++){step(g,cycle,i);if(g.state.repetition?.status==='warning'&&!warning)warning={at:i+1,state:structuredClone(g.state)};}return warning;}
test('third matching edited position does not invent an entering move or punish last mover',()=>{const g=game(peace);for(let i=0;i<8;i++)step(g,peaceCycle,i);assert.equal(g.state.result,null);assert.equal(g.state.repetition.status,'review');assert.equal(g.state.repetition.kind,'insufficient-entry');});
test('certified allowed cycle after25rounds warns then permits two moves per side before draw',()=>{const g=game(peace),w=run(g,peaceCycle);assert(w);assert.equal(w.state.result,null);assert.equal(w.state.repetition.liable,null);assert.equal(g.state.result.winner,null);assert.match(g.state.result.text,/提醒后两回合/);assert.equal(g.history.length-w.at,4);});
test('25round restriction assigns red, not whichever side moved last',()=>{const g=game(peace,'r',0),w=run(g,peaceCycle);assert(w);assert.equal(w.state.repetition.kind,'early-allowed-cycle');assert.equal(w.state.repetition.liable,'r');assert.equal(g.state.result.winner,'b');});
test('single perpetual checker is responsible across rotations of the same cycle',()=>{for(const rotated of[false,true]){const g=rotated?game([[85,'r','K'],[4,'b','K'],[49,'r','P'],[13,'r','R']],'b'):game(check),cycle=rotated?[[4,3],[13,12],[3,4],[12,13]]:checkCycle;let lastRules;for(let i=0;i<20&&!g.state.result;i++){const[from,to]=cycle[i%4];lastRules=rootRules(publicState(g.state,g.state.turn),{from,to});step(g,cycle,i);}assert.equal(g.state.result.winner,'b');assert.equal(g.state.repetition.liable,'r');assert.equal(lastRules.win,rotated);assert.equal(lastRules.loss,!rotated);}});
test('direct unprotected lone-piece chase warns the attacker and never the escaping defender',()=>{const g=game(chase),w=run(g,chaseCycle);assert(w);assert.equal(w.state.repetition.kind,'proven-direct-chase');assert.equal(w.state.repetition.liable,'r');assert.equal(g.state.result.winner,'b');assert.match(g.state.result.text,/两次行棋未变/);});
test('real variation exits warning, undo restores its exact opportunities',()=>{const g=game(chase);let i=0;for(;i<20;i++){step(g,chaseCycle,i);if(g.state.repetition?.status==='warning'){i++;break;}}const warned=structuredClone(g.state);step(g,chaseCycle,i++);assert.equal(g.state.turn,'r');assert(g.play({from:36,to:45}));assert.equal(g.state.result,null);assert.equal(g.state.repetition.status,'changed');assert(g.undo(true));assert(g.undo(true));assert.deepEqual(g.state.repetition,warned.repetition);});
test('mirror colours preserves responsibility rather than privileging red or black',()=>{const placements=check.map(([i,s,t])=>[89-i,s==='r'?'b':'r',t]),cycle=checkCycle.map(([f,t])=>[89-f,89-t]),g=game(placements,'b');run(g,cycle);assert.equal(g.state.result.winner,'r');assert.equal(g.state.repetition.liable,'b');});
test('missing or forged repeated keys cannot establish check/chase responsibility',()=>{const g=game(peace),m={from:85,to:84},key=positionKey(move(g.state,m,false));g.state.positions=[key,key];const r=rootRules(publicState(g.state,'r'),m);assert.equal(r.loss,false);assert.equal(r.win,false);assert.equal(r.draw,false);assert.equal(r.repetition.status,'review');});
test('protected/exchange/hidden/kill patterns stay reviewable without fabricated loss/draw',()=>{for(const kind of['unknown','chase']){const events=Array.from({length:8},(_,i)=>({side:i%2?'b':'r',kind:i%2?'unknown':kind}));const r=classifyCycle(events);assert.equal(r.kind,'manual-review');assert.equal(r.liable,undefined);assert.equal(r.draw,undefined);}});
test('both checking sides are not arbitrarily assigned a single culprit',()=>{const r=classifyCycle(Array.from({length:8},(_,i)=>({side:i%2?'b':'r',kind:'check'})));assert.equal(r.kind,'mutual-check');assert.equal(r.draw,true);assert.equal(r.liable,undefined);});
test('private hidden assignments cannot affect public responsibility',()=>{const a=new Game(),b=structuredClone(a.state);for(const p of b.board)if(p?.hidden)p.type='R';const m=legalMoves(a.state)[0];assert.deepEqual(rootRules(publicState(a.state,'r'),m),rootRules(publicState(b,'r'),m));});
test('25th-round inclusive boundary differs from the next half-move',()=>{for(const [ply,liable]of[[41,'r'],[42,null]]){const g=game(peace,'r',ply);for(let i=0;i<9;i++)step(g,peaceCycle,i);assert.equal(g.state.repetition.status,'warning');assert.equal(g.state.repetition.liable,liable);}});
test('capturing entering move is excluded rather than manufacturing the third cycle',()=>{
 const g=game([...peace,[84,'b','N']]);assert(g.play({from:85,to:84}));
 const cycle=[[4,5],[84,85],[5,4],[85,84]];for(let i=0;i<8;i++)step(g,cycle,i);
 assert.equal(g.state.result,null);assert.equal(g.state.repetition.status,'review');assert.equal(g.state.repetition.kind,'insufficient-entry');
});
test('new page explicitly negotiates rule version and rejects a mismatching backend contract',()=>{
 const view=publicState(new Game().state,'r'),input={token:'rule-version-test',timeMs:1000,view,repetitionPolicy};assert.deepEqual(validateRequest(input).view.board,view.board);
 assert.throws(()=>validateRequest({...input,repetitionPolicy:'third-last-mover-loses'}),/棋例版本不一致/);
});
test('both non-checking forbidden sides require 26.9 evidence, not last-mover assignment',()=>{
 const r=classifyCycle(Array.from({length:8},(_,i)=>({side:i%2?'b':'r',kind:'chase'})));assert.equal(r.kind,'manual-review');assert.equal(r.liable,undefined);assert.equal(r.draw,undefined);
});
test('protected victim, same-type exchange and hidden relations require review on real legal cycles',()=>{
 const cases=[
  {placements:[...chase,[5,'b','R'],[13,'b','R']],cycle:chaseCycle},
  {placements:[...chase.filter(([i])=>i!==41),[41,'b','R']],cycle:[[18,36],[41,23],[36,18],[23,41]]},
  {placements:[...chase,[0,'b','R']],cycle:chaseCycle,hidden:0}
 ];
 for(const c of cases){const g=game(c.placements);if(c.hidden!==undefined){g.state.board[c.hidden].hidden=true;g.state.positions=[positionKey(g.state)];}
  for(let i=0;i<13;i++){step(g,c.cycle,i);assert.equal(g.state.result,null);}
  assert.equal(g.state.repetition.status,'review');assert(!g.state.repetition.liable);
 }
});
test('quiet elephant cycling is certified by threats, not rejected solely by piece type',()=>{
 const g=game([...peace,[0,'b','B']]),cycle=[[85,84],[0,20],[84,85],[20,0]],w=run(g,cycle);
 assert(w);assert.equal(w.state.repetition.kind,'allowed-cycle');assert.equal(g.state.result.winner,null);
});
test('an incidental advisor/elephant chase cannot bypass the unimplemented 26.2 exception',()=>{
 const g=game([...chase.filter(([i])=>i!==41),[40,'b','B']]),cycle=[[18,36],[40,20],[36,18],[20,40]];
 for(let i=0;i<17;i++){step(g,cycle,i);assert.equal(g.state.result,null);}
 assert.equal(g.state.repetition.status,'review');assert(!g.state.repetition.liable);
});
