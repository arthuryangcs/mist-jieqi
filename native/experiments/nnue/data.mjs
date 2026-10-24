import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {initial,publicState,positionKey,move} from '../../../engine.js';import {seeded} from '../../../ai.js';import {featureIndices,redBase} from './features.mjs';
const plan=JSON.parse(fs.readFileSync(new URL('./plan.json',import.meta.url))),cache='.cache/nnue',dir='benchmarks/nnue',hash=x=>createHash('sha256').update(x).digest('hex');
fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});assert(!fs.existsSync(cache+'/data.json'),'Do not overwrite the frozen dataset');
const groups=new Map(),sources=[];
for(const file of plan.dataSources){const bytes=fs.readFileSync(file),r=JSON.parse(bytes);sources.push({file,sha256:hash(bytes)});assert(r.config.rule.includes('loses for mover'));
 for(const g of r.games){if(!g.result||g.result.technicalForfeit||g.result.status==='unresolved')continue;
  const original=initial(seeded(g.seed)),layout=hash(JSON.stringify(original.board));let group=groups.get(layout);if(!group){group={layout,games:[]};groups.set(layout,group);}let s=original;s.positions=[positionKey(s)];const rows=[];
  const add=()=>{if(s.result||s.ply<plan.data.firstPly||s.ply%plan.data.stride)return;for(const viewer of plan.data.viewers){const v=publicState(s,viewer);rows.push({features:featureIndices(v),base:redBase(v),target:g.result.winner==='r'?1:g.result.winner==='b'?0:.5});}};
  for(const row of g.log){assert(row.applied);add();s=move(s,row.move);}assert.deepEqual(s,g.finalState);
  if(rows.length)group.games.push({source:file,index:g.index,rows});
 }
}
const order=[...groups.keys()].sort(),rng=seeded(plan.data.splitSeed);for(let i=order.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
assert.equal(order.length,8);const split={train:order.slice(0,5),validation:order.slice(5,6),test:order.slice(6)};const output={planSha256:hash(fs.readFileSync(new URL('./plan.json',import.meta.url))),splits:{}};
for(const [name,ids]of Object.entries(split)){const rows=[];for(const id of ids){const g=groups.get(id);for(const game of g.games)for(const row of game.rows)rows.push({...row,weight:1/(ids.length*g.games.length*game.rows.length)});}output.splits[name]=rows;}
// The trainer sees only sparse observation features, base scores, labels and weights.
// Referee layouts/seeds and journals never enter this feature file.
const bytes=JSON.stringify(output);fs.writeFileSync(cache+'/data.json',bytes+'\n');
const manifest={planSha256:output.planSha256,dataSha256:hash(bytes+'\n'),sources,splits:Object.fromEntries(Object.entries(split).map(([name,ids])=>[name,{layoutHashes:ids,games:ids.reduce((n,id)=>n+groups.get(id).games.length,0),observations:output.splits[name].length}]))};
fs.writeFileSync(dir+'/data-manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
