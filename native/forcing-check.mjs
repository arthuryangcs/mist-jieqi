// An independent full legal-move oracle: no native geometry prefilter is reused.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initial, publicState, legalMoves, move, inCheck, other, TYPES} from '../engine.js';
import {seeded} from '../ai.js';
import {Native, fixture, encode} from './bridge.mjs';
import {compileForcing} from './forcing-variants.mjs';

const sanitize=process.argv.includes('--sanitize');
const output=`benchmarks/quiet-checks/check${sanitize?'-sanitized':''}.json`;
const record={startedAt:new Date().toISOString(),sanitize,builds:[],cases:[],tactics:[],checks:0,transitions:0,passed:false};
const clients={};
const piece=(side,type,hidden=false,role=type)=>({side,type,role,hidden});
function sparse(name,placements,{turn='r',block=true}={}) {
  const s={...initial(),board:Array(90).fill(null),captured:[],turn};
  s.board[85]=piece('r','K');s.board[4]=piece('b','K');if(block)s.board[49]=piece('r','P');
  for(const [i,side,type,hidden=false,role=type] of placements)s.board[i]=piece(side,type,hidden,role);
  for(const side of ['r','b']) {
    const bag=[...TYPES];for(const p of s.board)if(p?.side===side&&p.type!=='K'){const i=bag.indexOf(p.type);assert(i>=0);bag.splice(i,1);}
    for(const type of bag)s.captured.push(piece(side,type));
  }
  return {name,state:s};
}
const cases=[
  sparse('rook-quiet-mate',[[12,'r','R'],[18,'r','R'],[72,'b','P']]),
  sparse('rook-discovered',[[40,'r','R'],[22,'r','N']]),
  sparse('cannon-screen',[[40,'r','C'],[13,'r','N']]),
  sparse('cannon-screen-removal',[[40,'r','C'],[13,'r','N'],[22,'b','P']]),
  sparse('horse-leg',[[23,'r','N'],[14,'r','P']]),
  sparse('elephant-eye',[[24,'r','B'],[14,'r','N']]),
  sparse('revealed-advisor',[[23,'r','A']]),
  sparse('reveal-rook',[[22,'r','R',true,'N']]),
  sparse('reveal-cannon',[[22,'r','C',true,'N'],[13,'r','P']]),
  sparse('counter-check-own-king',[[76,'b','R'],[67,'r','R']]),
  sparse('flying-kings-blocker',[[49,'r','R']],{block:false}),
  sparse('enemy-already-checked',[[40,'r','R'],[72,'r','N']]),
  sparse('quiet-mate-color-swapped',[[77,'b','R'],[71,'b','R']],{turn:'b'})
];
for(const seed of [9301,9311,9323,9341,9371,9391]) {
  const rng=seeded(seed);let s=initial(rng);
  cases.push({name:`reachable/${seed}/0`,state:structuredClone(s)});
  for(let ply=1;ply<=80&&!s.result;ply++){
    const ms=legalMoves(s);s=move(s,ms[Math.floor(rng()*ms.length)]);
    if(ply%8===0)cases.push({name:`reachable/${seed}/${ply}`,state:structuredClone(s)});
  }
}
function quietOracle(w,side,mode) {
  return legalMoves(w,side).filter(m=>!w.board[m.to]&&(mode===2||!w.board[m.from].hidden)).filter(m=>{
    const n=move({...w,turn:side},m,false);return inCheck(n.board,other(side));
  });
}
function forced(s,attacker,left) {
  // Jieqi/Xiangqi: stalemate is a loss too, not a draw.
  const ms=legalMoves(s);if(!ms.length)return s.turn!==attacker;
  if(left===0)return false;
  return s.turn===attacker?ms.some(m=>forced(move(s,m,false),attacker,left-1)):ms.every(m=>forced(move(s,m,false),attacker,left-1));
}
try {
  for(const name of ['baseline','qbright','qall']) {
    const b=compileForcing(name,{sanitize});clients[name]=new Native({binary:b.binary});delete b.binary;record.builds.push(b);await clients[name].ready;
  }
  for(const c of cases)for(const viewer of ['r','b',null]) {
    const f=fixture(publicState(c.state,viewer),{seed:9413,samples:4}),w={...f.view,...f.worlds[0]};
    for(const name of ['qbright','qall']) {
      const r=await clients[name].request(f,{mode:'VERIFY',depth:1});
      for(const [i,side] of ['r','b'].entries()) {
        const expected=quietOracle(w,side,name==='qbright'?1:2);
        assert.deepEqual(r.sides[i].quietChecks,expected,`${name}/${c.name}/${viewer}/${side}`);
        assert.deepEqual(r.sides[i].legal,legalMoves(w,side));record.checks+=expected.length;
      }
      for(const t of r.transitions){assert(t.restored);record.transitions++;}
      record.cases.push({name:c.name,viewer,variant:name,passed:true});
    }
  }
  // Held-out full-information 3-ply wins, independently proved with every reply.
  const tactics=JSON.parse(fs.readFileSync('benchmarks/tactical-positions.json'));
  for(const t of tactics) {
    const s=t.state,winning=legalMoves(s).filter(m=>forced(move(s,m,false),s.turn,2));
    assert(winning.length>0);const f=fixture(publicState(s,s.turn));
    for(const depth of [2,3])for(const name of ['baseline','qbright','qall']) {
      const r=await clients[name].request(f,{depth,budget:60000});
      const won=winning.some(m=>m.from===r.move.from&&m.to===r.move.to);
      assert(won,`${name}/${t.name}/requestedDepth=${depth}`);
      record.tactics.push({name:t.name,variant:name,depth:r.depth,requestedDepth:depth,winning:won,move:r.move,nodes:r.nodes});
    }
  }
  // Here success is unambiguous: the selected move itself must checkmate.
  // A spare defending pawn avoids equally winning stalemates in the red fixture.
  for(const base of [cases[0],cases.at(12)])for(const reflect of [false,true]) {
    const s=structuredClone(base.state);if(reflect)s.board=Array.from({length:90},(_,i)=>base.state.board[Math.floor(i/9)*9+8-i%9]);
    const mates=legalMoves(s).filter(m=>{const n=move(s,m,false);return !s.board[m.to]&&inCheck(n.board,n.turn)&&legalMoves(n).length===0;});
    assert(mates.length>0);
    for(const name of ['baseline','qbright','qall']) {
      const r=await clients[name].request(fixture(publicState(s,s.turn)),{depth:1,budget:60000});
      assert(mates.some(m=>m.from===r.move.from&&m.to===r.move.to),`${name}/${base.name}/mirror=${reflect}`);
      record.tactics.push({name:base.name,reflect,variant:name,depth:r.depth,immediateQuietMate:true,move:r.move});
    }
  }
  const a=publicState(initial(seeded(1)),'r'),b=publicState(initial(seeded(999)),'r');
  assert.equal(encode(fixture(a)),encode(fixture(b)));record.informationIsolation=true;
  // Timeout unwinding and bounded cycle handling are checked by sanitizer builds.
  for(const name of ['qbright','qall']) {
    const f=fixture(a);for(const nodeLimit of [1000,10000]) {
      const r=await clients[name].request(f,{depth:8,nodeLimit,budget:60000});assert(r.interruptedDepth>0);
    }
    await clients[name].request(f,{depth:8,budget:20});
  }
  record.passed=true;
} catch(e){record.error=e.stack;throw e;}
finally {
  for(const c of Object.values(clients))await c.close();
  record.stderr=Object.fromEntries(Object.entries(clients).map(([n,c])=>[n,c.stderr]));
  if(Object.values(record.stderr).some(Boolean)){record.passed=false;process.exitCode=1;}
  record.finishedAt=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify({passed:record.passed,cases:record.cases.length,quietChecks:record.checks,transitions:record.transitions,tactics:record.tactics.length,error:record.error}));
}
