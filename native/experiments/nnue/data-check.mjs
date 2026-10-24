import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {initial,publicState,positionKey,move,legalMoves} from '../../../engine.js';import {seeded} from '../../../ai.js';import {featureIndices,redBase,D} from './features.mjs';import {loadModel} from './reference.mjs';import {modelFile} from './build.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),manifest=JSON.parse(fs.readFileSync('benchmarks/nnue/data-manifest.json')),plan=JSON.parse(fs.readFileSync(new URL('./plan.json',import.meta.url))),bytes=fs.readFileSync('.cache/nnue/data.json'),data=JSON.parse(bytes),training=JSON.parse(fs.readFileSync('benchmarks/nnue/training.json')),model=loadModel(modelFile);
const record={passed:false,games:0,plies:0,observations:0,splitDisjoint:false,allowedTrainerFields:['features','base','target','weight'],metrics:{},testMetricUsedForEpochSelection:false};
try{
 assert.equal(hash(bytes),manifest.dataSha256);assert.equal(hash(fs.readFileSync(new URL('./plan.json',import.meta.url))),manifest.planSha256);assert.equal(hash(fs.readFileSync(modelFile)),training.modelSha256);
 const layoutToSplit=new Map();for(const [name,s]of Object.entries(manifest.splits))for(const id of s.layoutHashes){assert(!layoutToSplit.has(id));layoutToSplit.set(id,name);}assert.equal(layoutToSplit.size,8);record.splitDisjoint=true;
 const grouped=new Map();for(const source of manifest.sources){const bytes=fs.readFileSync(source.file);assert.equal(hash(bytes),source.sha256);const r=JSON.parse(bytes);
  for(const g of r.games){if(!g.result||g.result.technicalForfeit||g.result.status==='unresolved')continue;let s=initial(seeded(g.seed));const id=hash(JSON.stringify(s.board));s.positions=[positionKey(s)];const rows=[];
   for(const row of g.log){assert(row.applied);assert(legalMoves(s).some(m=>m.from===row.move.from&&m.to===row.move.to));if(!s.result&&s.ply>=plan.data.firstPly&&s.ply%plan.data.stride===0)for(const viewer of plan.data.viewers){const v=publicState(s,viewer);rows.push({features:featureIndices(v),base:redBase(v),target:g.result.winner==='r'?1:g.result.winner==='b'?0:.5});}s=move(s,row.move);record.plies++;}
   assert.deepEqual(s,g.finalState);if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(rows);record.games++;
  }
 }
 for(const [name,split]of Object.entries(manifest.splits)){
  const expected=[];for(const id of split.layoutHashes){const games=grouped.get(id);for(const rows of games)for(const r of rows)expected.push({...r,weight:1/(split.layoutHashes.length*games.length*rows.length)});}assert.deepEqual(data.splits[name],expected);
  let total=0,bce=0,brier=0;for(const row of data.splits[name]){
   assert.deepEqual(Object.keys(row).sort(),record.allowedTrainerFields.slice().sort());for(const ids of row.features)assert(ids.every(i=>Number.isInteger(i)&&i>=0&&i<D));
   const z=row.features.map(ids=>{const a=[...model.bias];for(const id of ids)for(let h=0;h<a.length;h++)a[h]+=model.weight[id][h];return a.reduce((n,x,h)=>n+Math.max(0,Math.min(1,x))*model.output[h],model.outputBias);});
   const correction=model.cap*.5*(Math.tanh(z[0])-Math.tanh(z[1])),l=(row.base+correction)/model.scale,p=1/(1+Math.exp(-l));
   bce+=row.weight*(Math.max(0,l)+Math.log1p(Math.exp(-Math.abs(l)))-row.target*l);brier+=row.weight*(p-row.target)**2;total+=row.weight;record.observations++;
  }assert(Math.abs(total-1)<1e-12);assert(Math.abs(bce-training.frozenModel[name].weightedBCE)<1e-12);assert(Math.abs(brier-training.frozenModel[name].weightedBrier)<1e-12);record.metrics[name]={bce,brier,observations:expected.length};
 }
 record.passed=true;
}catch(e){record.error=e.stack.replaceAll(process.cwd(),'<project>');throw e;}finally{fs.writeFileSync('benchmarks/nnue/data-check.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));}
