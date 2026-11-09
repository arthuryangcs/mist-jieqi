import {verifyHistoricalSource} from '../historical/provenance.mjs';
// Portable evidence audit. Reconstructs rows from committed synthetic journals.
// Compiler-specific recorded binaries are provenance, not assumed reproducible.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,gameFile,plan,planSha256,sha,hashFile,validateRun,replayGame,assertTrainerRows,splitNames} from './data.mjs';
import {sourceOf} from './build.mjs';import {loadModel} from '../nnue/reference.mjs';
const bytes=fs.readFileSync(gameFile),run=JSON.parse(bytes),manifestBytes=fs.readFileSync(path.join(root,'benchmarks/selfplay-value/data-manifest.json')),manifest=JSON.parse(manifestBytes),training=JSON.parse(fs.readFileSync(path.join(root,'benchmarks/selfplay-value/training.json')));
validateRun(run,{verifySources:false});assert.equal(manifest.gamesSha256,sha(bytes));assert.equal(manifest.planSha256,planSha256);assert.equal(training.planSha256,planSha256);assert.equal(training.dataManifestSha256,sha(manifestBytes));
const skipped=[];for(const [file,expected]of Object.entries(run.sourceHashes)){if(file.startsWith('.cache/')){skipped.push(file);continue;}verifyHistoricalSource(file,expected);}
assert.equal(sha(sourceOf({trial:false})),run.control.sourceSha256,'Generated control source');
assert.equal(hashFile(plan.training.model),training.modelSha256);const model=loadModel(path.join(root,plan.training.model));
assert.equal(run.games.length,run.tasks.length);const groups=new Map();let plies=0,eligibleGames=0;
for(const game of [...run.games].sort((a,b)=>a.index-b.index)){const r=replayGame(game,{isolation:true});plies+=game.log.length;if(r.eligible&&r.rows.length){if(!groups.has(game.layoutSha256))groups.set(game.layoutSha256,[]);groups.get(game.layoutSha256).push(r.rows);eligibleGames++;}}
const metrics={};for(const name of splitNames){
 const ids=run.layouts.filter(x=>x.split===name).map(x=>x.layoutSha256).filter(id=>groups.has(id)),rows=[];
 for(const id of ids){const games=groups.get(id);for(const game of games)for(const row of game)rows.push({...row,weight:1/(ids.length*games.length*game.length)});}
 assert.deepEqual(ids,manifest.splits[name].layoutHashes);assert.equal(rows.length,manifest.splits[name].observations);assertTrainerRows(rows);const content=JSON.stringify({planSha256,rows})+'\n';assert.equal(sha(content),manifest.files[name].sha256);
 if(process.argv.includes('--materialize')){const target=path.join(root,manifest.files[name].file);fs.mkdirSync(path.dirname(target),{recursive:true});if(fs.existsSync(target))assert.equal(hashFile(target),manifest.files[name].sha256);else fs.writeFileSync(target,content,{flag:'wx'});}
 let bce=0,brier=0;for(const row of rows){const z=row.features.map(ids=>{const acc=[...model.bias];for(const id of ids)for(let h=0;h<acc.length;h++)acc[h]+=model.weight[id][h];return acc.reduce((sum,v,h)=>sum+Math.max(0,Math.min(1,v))*model.output[h],model.outputBias);});const correction=model.cap*.5*(Math.tanh(z[0])-Math.tanh(z[1])),logit=(row.base+correction)/model.scale,p=1/(1+Math.exp(-logit));bce+=row.weight*(Math.max(0,logit)+Math.log1p(Math.exp(-Math.abs(logit)))-row.target*logit);brier+=row.weight*(p-row.target)**2;}
 assert(Math.abs(bce-training.frozenModel[name].weightedBCE)<1e-11);assert(Math.abs(brier-training.frozenModel[name].weightedBrier)<1e-11);metrics[name]={layouts:ids.length,observations:rows.length,weightedBCE:bce,weightedBrier:brier};
}
console.log(JSON.stringify({passed:true,games:run.games.length,plies,eligibleGames,modelSha256:training.modelSha256,metrics,platformSpecificRuntimeFilesNotCompared:skipped,scope:'Pinned historical sources (archived when production changed), regenerated historical control source, all journal legality/privacy/results, exact split bytes, weights and frozen-model loss audited. Original recorded Mac executable bytes are not reproduced by this portable check.'}));
