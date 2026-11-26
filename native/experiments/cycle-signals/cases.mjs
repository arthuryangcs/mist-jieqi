import fs from'node:fs';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{initial,positionKey,move,other,readPositionKey}from'../../../engine.js';import{seeded}from'../../../ai.js';
import{observation}from'../jqe-retest/audit.mjs';
export const ledger='benchmarks/rule-priority-2026-11-25/matches.json';
export const sha=x=>createHash('sha256').update(x).digest('hex');
export function cases(){const d=JSON.parse(fs.readFileSync(ledger)),out=[];
 for(const index of[3,4,6]){const g=d.games.find(g=>g.index===index);let s=initial(seeded(g.seed));s.positions=[positionKey(s)];
  for(const row of g.log){const n=move(s,row.move),v=observation(s,s.turn);assert.equal(sha(JSON.stringify(v)),row.viewSha256);
   if((index===3?[106,190]:index===4?[98,112,116,158,172,176]:[42,44,148,150]).includes(row.ply))out.push({game:index,ply:row.ply,played:row.move,before:v,after:observation(n,n.turn),recordedResult:g.result});s=n;
  }
 }
 return out;
}
export function mirror(view){const n=structuredClone(view),flip=s=>{s.board.reverse();for(const p of s.board)if(p)p.side=other(p.side);s.turn=other(s.turn);return s;};flip(n);n.viewer=view.viewer?other(view.viewer):null;for(const p of n.captured){p.side=other(p.side);if(p.capturedBy)p.capturedBy=other(p.capturedBy);}n.positions=n.positions.map(k=>positionKey(flip(readPositionKey(k))));return n;}
