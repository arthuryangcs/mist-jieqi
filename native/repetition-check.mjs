import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {initial,publicState,move,positionKey,legalMoves,TYPES,other,rootRules} from '../engine.js';
import {seeded} from '../ai.js';
import {build} from './build.mjs';
import {fixture,Native,javascript,compare,encode} from './bridge.mjs';
const output=process.env.JIEQI_REPETITION_OUTPUT||'benchmarks/assistant-workspace/repetition-native.json';
const built=build({sanitize:process.env.JIEQI_NATIVE_SANITIZE==='1'}),native=new Native({binary:built.binary}),record={build:built,cases:[],passed:false};
const piece=(side,type,hidden=false,role=type)=>({side,type,hidden,role});
function longCheck(offender,closing,hidden=false,plies=11){
 const mirrored=offender==='b',index=i=>mirrored?89-i:i,side=s=>mirrored?other(s):s;
 let s={...initial(seeded(17)),board:Array(90).fill(null),captured:[],turn:side(closing==='offender'?'b':'r')};
 for(const [i,color,type]of [[85,'r','K'],[4,'b','K'],[49,'r','P'],[closing==='offender'?13:12,'r','R']])s.board[index(i)]=piece(side(color),type);
 if(hidden)s.board[index(54)]=piece(side('r'),'N',true,'P');
 for(const color of ['r','b']){const bag=[...TYPES];for(const p of s.board)if(p?.side===color&&p.type!=='K')bag.splice(bag.indexOf(p.type),1);s.captured.push(...bag.map(t=>piece(color,t)));}
 s.positions=[positionKey(s)];
 const pairs=closing==='offender'?[[4,3],[13,12],[3,4],[12,13]]:[[12,13],[4,3],[13,12],[3,4]];
 const cycle=pairs.map(([from,to])=>({from:index(from),to:index(to)}));
 for(let i=0;i<plies;i++){const m=cycle[i%4];assert(legalMoves(s).some(x=>x.from===m.from&&x.to===m.to));s=move(s,m);assert.equal(s.result,null,'must not adjudicate before three full cycles');}
 return{s,m:cycle[3]};
}
async function check(name,s,m,{loss=false,win=false,count}={}){
 const f=fixture(publicState(s,s.turn),{samples:4,seed:8101}),a=await javascript(f,{depth:2}),progress=[],b=await native.request(f,{mode:'STREAM',depth:2,onProgress:r=>progress.push(r)});
 const same=compare(a,b,{requireNodes:f.samples===1}),row=b.allCandidates.find(x=>x.from===m.from&&x.to===m.to);assert(row,name);assert.equal(!!row.repetitionLoss,loss,name);assert.equal(!!row.repetitionWin,win,name);assert(!row.draw,name);if(count!==undefined)assert.equal(row.repetitionCount,count,name);assert.equal(progress.length,b.depth);assert.deepEqual(progress.at(-1).allCandidates,b.allCandidates);
 if(loss||win){assert.equal(row.heuristicWinRate,win?100:0);assert.equal(win?row.sampleWins:row.sampleLosses,1);assert.equal(move(s,m).result.winner,win?s.turn:other(s.turn));}
 record.cases.push({name,samples:f.samples,...same,repetitionLoss:!!row.repetitionLoss,repetitionWin:!!row.repetitionWin,score:row.score,passed:true});
}
try{
 for(const offender of ['r','b'])for(const closing of ['offender','evader'])for(const hidden of [false,true]){
  const {s,m}=longCheck(offender,closing,hidden);await check(`${offender}/${closing}/hidden=${hidden}`,s,m,{loss:closing==='offender',win:closing==='evader',count:3});
  if(hidden){const t=structuredClone(s),h=t.board.find(p=>p?.hidden);h.type='C';assert.deepEqual(rootRules(s,m),rootRules(t,m));assert.equal(encode(fixture(publicState(s,s.turn))),encode(fixture(publicState(t,t.turn))));}
 }
 for(const offender of ['r','b']){const {s,m}=longCheck(offender,'evader',false,7);await check(`insufficient-cycles/${offender}`,s,m,{count:2});assert.equal(move(s,m).result,null);}
 for(const turn of ['r','b'])for(const count of [1,2,8]){
  const s=initial(seeded(17));s.turn=turn;s.board=s.board.map(p=>p?{...p,type:p.role,hidden:false}:null);
  const m=turn==='r'?{from:82,to:63}:{from:1,to:18};s.positions=Array(count).fill(positionKey(move(s,m,false)));
  await check(`forged-duplicates/${turn}/${count}`,s,m,{count:0});assert.equal(move(s,m).result,null);
 }
 for(const mates of [false,true]){
  const s={...initial(seeded(17)),board:Array(90).fill(null),captured:[],ply:399};
  for(const [i,color,type]of [[85,'r','K'],[4,'b','K'],[49,'r','P'],...(mates?[[12,'r','R'],[14,'r','R']]:[])])s.board[i]=piece(color,type);
  const m=mates?{from:22,to:13}:{from:54,to:45};s.board[m.from]=piece('r','P',true,'P');
  for(const color of ['r','b']){const bag=[...TYPES];for(const p of s.board)if(p?.side===color&&p.type!=='K')bag.splice(bag.indexOf(p.type),1);s.captured.push(...bag.map(t=>piece(color,t)));}
  const view=publicState(s,'r'),before=structuredClone(view),f=fixture(view,{samples:4,seed:8101}),a=await javascript(f,{depth:2}),b=await native.request(f,{depth:2}),same=compare(a,b,{requireNodes:false});
  const row=b.allCandidates.find(x=>x.from===m.from&&x.to===m.to);assert(row);assert.equal(!!row.draw,!mates);assert.equal(row.sampleWins,mates?f.samples:0);assert.equal(row.heuristicWinRate,mates?100:50);assert.equal(move(s,m).result.winner,mates?'r':null);assert.deepEqual(view,before);
  const altered=structuredClone(s);altered.board[m.from].type='N';assert.equal(encode(f),encode(fixture(publicState(altered,'r'),{samples:4,seed:8101})));
  record.cases.push({name:mates?'hidden-cap-mate-precedence':'hidden-cap-legal-continuation',samples:f.samples,...same,passed:true});
 }
 for(const turn of ['r','b']){
  const s={...initial(seeded(17)),board:Array(90).fill(null),captured:[],ply:399};
  for(const [i,color,type]of [[85,'r','K'],[4,'b','K'],[30,'r','C'],[21,'r','B'],[32,'r','R']])s.board[i]=piece(color,type);
  const m={from:58,to:49};s.board[58]=piece('r','R',true,'P');
  for(const color of ['r','b']){const bag=[...TYPES];for(const p of s.board)if(p?.side===color&&p.type!=='K')bag.splice(bag.indexOf(p.type),1);if(color==='r'){bag.splice(bag.indexOf('N'),1);s.captured.push({...piece('r','N',true),capturedBy:'b'});}s.captured.push(...bag.map(t=>piece(color,t)));}
  if(turn==='b'){s.turn='b';s.board.reverse();for(const p of [...s.board,...s.captured])if(p){p.side=other(p.side);if(p.capturedBy)p.capturedBy=other(p.capturedBy);}m.from=89-m.from;m.to=89-m.to;}
  const view=publicState(s,turn),before=structuredClone(view),f=fixture(view,{samples:2,seed:8101}),a=await javascript(f,{depth:2}),b=await native.request(f,{depth:2}),same=compare(a,b,{requireNodes:false});
  const row=b.allCandidates.find(x=>x.from===m.from&&x.to===m.to);assert(row);assert(!row.draw);assert.equal(row.sampleWins,1);assert.equal(row.sampleLosses,0);assert.equal(row.heuristicWinRate,75);assert.deepEqual(view,before);
  const altered=structuredClone(s);altered.board[m.from].type='N';altered.captured.find(p=>p.hidden).type='R';assert.equal(encode(f),encode(fixture(publicState(altered,turn),{samples:2,seed:8101})));
  assert.equal(move(s,m).result.winner,turn);assert.equal(move(altered,m).result.winner,null);
  record.cases.push({name:`hidden-cap-mixed-mate-and-draw/${turn}`,samples:f.samples,...same,passed:true});
 }
 const tokens=encode(fixture(publicState(initial(seeded(17)),'r'))).trim().split(' ');tokens[tokens.length-1]='5';const invalid=spawnSync(built.binary,[],{input:tokens.join(' ')+'\n',encoding:'utf8',timeout:3000});assert.equal(invalid.status,2);assert.equal(invalid.stderr.trim(),'native error: root metadata out of range');record.invalidOutcomeRejected=true;
 record.passed=true;
}finally{await native.close();record.runtimeStderr=native.stderr;assert.equal(native.stderr,'');delete record.build.binary;fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({passed:record.passed,cases:record.cases.length,sanitized:built.sanitize,output}));}
