// Bounded, synthetic CN2020 root adjudication parity. No running service is used.
import assert from 'node:assert/strict';
import {Game,TYPES,positionKey,publicState,rootRules} from '../engine.js';
import {Native,fixture,javascript,compare} from './bridge.mjs';
import {binary} from './build.mjs';
function game(placements,turn='r'){
 const g=new Game(),s={board:Array(90).fill(null),captured:[],turn,ply:60,quiet:0,result:null,positions:[]};
 for(const[i,side,type]of placements)s.board[i]={side,type,role:type,hidden:false};
 for(const side of['r','b']){const bag=[...TYPES];for(const p of s.board)if(p?.side===side&&p.type!=='K'){const i=bag.indexOf(p.type);assert(i>=0);bag.splice(i,1);}for(const type of bag)s.captured.push({side,type,role:type,hidden:false});}
 s.positions=[positionKey(s)];g.state=s;g.history=[];return g;
}
const scenarios=[
 {name:'red-checker-loses',placements:[[85,'r','K'],[3,'b','K'],[49,'r','P'],[13,'r','R']],cycle:[[13,12],[3,4],[12,13],[4,3]],turn:'r',field:'loss'},
 {name:'black-defender-wins',placements:[[85,'r','K'],[4,'b','K'],[49,'r','P'],[13,'r','R']],cycle:[[4,3],[13,12],[3,4],[12,13]],turn:'b',field:'win'},
 {name:'allowed-cycle-draw',placements:[[85,'r','K'],[4,'b','K'],[49,'r','P']],cycle:[[85,84],[4,5],[84,85],[5,4]],turn:'r',field:'draw'},
 {name:'quiet-elephant-cycle-draw',placements:[[85,'r','K'],[4,'b','K'],[49,'r','P'],[0,'b','B']],cycle:[[85,84],[0,20],[84,85],[20,0]],turn:'r',field:'draw'},
 {name:'chaser-not-defender-loses',placements:[[85,'r','K'],[4,'b','K'],[76,'r','P'],[18,'r','R'],[41,'b','N']],cycle:[[18,36],[41,22],[36,18],[22,41]],turn:'r',field:'loss'}
];
const core=new Native({binary:process.env.MIST_RULE_BINARY||binary}),results=[];
try{
 for(const c of scenarios){const g=game(c.placements,c.turn);let target;
  for(let i=0;i<24;i++){const[from,to]=c.cycle[i%4],m={from,to},rule=rootRules(publicState(g.state,g.state.turn),m);if(rule[c.field]){target={m,rule};break;}assert(g.play(m));assert(!g.state.result);}
  assert(target,c.name);const f=fixture(publicState(g.state,g.state.turn),{samples:1}),a=await javascript(f,{depth:1,budget:3000}),b=await core.request(f,{depth:1,budget:3000});compare(a,b);
  const row=b.allCandidates.find(m=>m.from===target.m.from&&m.to===target.m.to);assert(row);assert.equal(row.score,c.field==='loss'?-98999:c.field==='win'?98999:0);assert.equal(Boolean(row.repetitionLoss),c.field==='loss');assert.equal(Boolean(row.repetitionWin),c.field==='win');assert.equal(Boolean(row.draw),c.field==='draw');
  assert(g.play(target.m));assert.deepEqual(g.state.result,target.rule.repetition.result);results.push({name:c.name,score:row.score,plies:g.history.length,result:g.state.result,passed:true});
 }
 assert.equal(core.stderr,'');console.log(JSON.stringify({passed:true,policy:'cn2020-evidence-v1',cases:results},null,2));
}finally{await core.close();}
