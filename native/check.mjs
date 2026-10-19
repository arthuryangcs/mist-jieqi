import fs from 'node:fs';import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {spawnSync} from 'node:child_process';
import {initial,publicState,move,legalMoves,inCheck,TYPES} from '../engine.js';
import {seeded,evaluate,remaining,values} from '../ai.js';
import {build,binary} from './build.mjs';
import {Native,fixture,javascript,compare,encode} from './bridge.mjs';

const output=process.env.JIEQI_NATIVE_CHECK_OUTPUT||'benchmarks/native-check-replay.json';
const built=build({sanitize:process.env.JIEQI_NATIVE_SANITIZE==='1'}),native=new Native({binary:built.binary||binary}),start=performance.now(),record={build:{...built},ruleCases:[],searchCases:[],transitionCount:0,passed:false};delete record.build.binary;
const piece=(side,type,hidden=false,role=type)=>({side,type,hidden,role});
function sparse(name,placements,{turn='r',removeBlock=false}={}){
 const s={...initial(),board:Array(90).fill(null),captured:[],turn};s.board[85]=piece('r','K');s.board[4]=piece('b','K');if(!removeBlock)s.board[49]=piece('r','P');
 for(const [i,side,type,hidden=false,role=type]of placements)s.board[i]=piece(side,type,hidden,role);
 for(const side of['r','b']){const bag=[...TYPES];for(const p of s.board)if(p?.side===side&&p.type!=='K'){const i=bag.indexOf(p.type);if(i>=0)bag.splice(i,1);}for(const type of bag)s.captured.push(piece(side,type));}
 return{name,state:s};
}
const cases=[
 {name:'初始全暗',state:initial(seeded(17))},
 sparse('蹩马腿',[[76,'r','N'],[67,'r','P']]),
 sparse('塞象眼',[[67,'r','B'],[57,'r','P']]),
 sparse('炮隔一子',[[64,'r','C'],[28,'b','P'],[1,'b','R']]),
 sparse('将帅照面',[],{removeBlock:true}),
 sparse('困毙',[[12,'r','R'],[14,'r','R']],{turn:'b'}),
 sparse('将死',[[12,'r','R'],[14,'r','R'],[13,'r','P']],{turn:'b'})
];
let capture=initial(seeded(37));for(const [i,m]of[{from:64,to:1},{from:25,to:88}].entries()){assert(legalMoves(capture).some(x=>x.from===m.from&&x.to===m.to));capture=move(capture,m);cases.push({name:'私人暗俘第'+(i+1)+'步',state:structuredClone(capture)});}
for(const seed of[7013,7027,7043]){const rng=seeded(seed);let s=initial(rng);for(let ply=1;ply<=40&&!s.result;ply++){const ms=legalMoves(s);s=move(s,ms[Math.floor(rng()*ms.length)]);if(ply%8===0)cases.push({name:`可达${seed}/${ply}`,state:structuredClone(s)});}}
try {
 for(const c of cases)for(const viewer of['r','b',null]){
  const f=fixture(publicState(c.state,viewer),{seed:7103,samples:4}),r=await native.request(f,{mode:'VERIFY',depth:1});const w={...f.view,...f.worlds[0]},observed=publicState(w,viewer);
  for(const [i,side]of['r','b'].entries()){assert.equal(r.sides[i].check,inCheck(w.board,side),c.name);assert(Math.abs(r.sides[i].score-evaluate(observed,side))<1e-7,c.name+'eval');assert.deepEqual(r.sides[i].legal,legalMoves(w,side),c.name+'legal');assert.deepEqual(r.sides[i].captures,legalMoves(w,side,{capturesOnly:true}),c.name+'captures');}
  const ms=legalMoves(w);assert.equal(r.transitions.length,ms.length);
  for(const row of r.transitions){const m={from:row.from,to:row.to},next=move(w,m,false),v=publicState(next,viewer);assert.equal(row.type,'KRNBCAP'.indexOf(next.board[m.to].type));assert(Math.abs(row.score-evaluate(v,w.turn))<1e-7,c.name+'transition eval');assert.deepEqual(row.reply,legalMoves(next));assert.equal(row.restored,true);assert.deepEqual(row.poolCount,['r','b'].map(s=>remaining(v,s).length));assert.deepEqual(row.poolValue,['r','b'].map(s=>remaining(v,s).reduce((a,t)=>a+values[t],0)));record.transitionCount++;}
  record.ruleCases.push({name:c.name,viewer,legalMoves:ms.length,passed:true});
 }
 // Actual hidden-layout changes cannot affect exported observations/samples.
 const hiddenA=initial(seeded(1)),hiddenB=initial(seeded(999));assert.equal(encode(fixture(publicState(hiddenA,'r'))),encode(fixture(publicState(hiddenB,'r'))));
 const tactical=JSON.parse(fs.readFileSync('benchmarks/tactical-positions.json'));
 const searches=[...[6101,6143,6181].map(seed=>({name:'初始/'+seed,state:initial(seeded(17)),seed,samples:8,depth:3})),...tactical.map(f=>({name:f.name,state:f.state,seed:6101,samples:1,depth:2})),...cases.filter(c=>['困毙','将死','私人暗俘第2步'].includes(c.name)).map(c=>({...c,seed:6101,samples:4,depth:2}))];
 const mid=JSON.parse(fs.readFileSync('benchmarks/strength-positions.json'));for(const i of[1,2,4])searches.push({name:mid[i].name,state:mid[i].view,seed:7207,samples:4,depth:3});
 const draw=structuredClone(tactical[0].state);draw.quiet=119;draw.ply=399;searches.push({name:'根和棋规则',state:draw,seed:6101,samples:1,depth:2});
 for(const c of searches){const view=publicState(c.state,c.state.viewer??c.state.turn),f=fixture(view,c),a=await javascript(f,{depth:c.depth}),b=await native.request(f,{depth:c.depth}),same=compare(a,b,{requireNodes:!(native.capabilities.independentWorldSearch&&a.samples>1)});if(!b.terminal)assert.equal(b.threads,Math.min(a.samples,4));record.searchCases.push({name:c.name,depth:a.depth,samples:a.samples,nodes:a.nodes,nativeNodes:b.nodes,threads:b.threads,...same,passed:true});console.log(JSON.stringify(record.searchCases.at(-1)));}
 const limited=fixture(publicState(initial(seeded(17)),'r'));
 for(const nodeLimit of[1000,10000]){const a=await javascript(limited,{depth:3,nodeLimit}),b=await native.request(limited,{depth:3,nodeLimit});compare(a,b);assert.equal(b.threads,1);record.searchCases.push({name:'固定节点中断'+nodeLimit,depth:a.depth,nodes:a.nodes,passed:true});}
 const truncated=encode(limited).trim().split(' ');truncated.pop();const invalid=spawnSync(built.binary,[ ],{input:truncated.join(' ')+'\n',encoding:'utf8',timeout:3000});assert.equal(invalid.status,2);assert.equal(invalid.stderr.trim(),'native error: truncated root metadata');record.truncatedInputRejected=true;
 record.passed=true;
}catch(error){record.error=error.stack;throw error;}finally{record.elapsedMs=performance.now()-start;await native.close();record.runtimeStderr=native.stderr;if(native.stderr.trim()){record.passed=false;record.error='原生运行报告stderr诊断';}fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({passed:record.passed,ruleCases:record.ruleCases.length,transitions:record.transitionCount,searchCases:record.searchCases.length,elapsedMs:record.elapsedMs}));if(native.stderr.trim())throw Error('原生运行报告stderr诊断');}
