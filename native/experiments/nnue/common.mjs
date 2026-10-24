import fs from 'node:fs';import path from 'node:path';
import {cache,dir,baseline,stableSource,stableBinary,hash,sha,modelFile} from './build.mjs';
import {verifyBinaries as verifyFixed,pikaHash,safeRoots,summary} from '../coverage-validation/common.mjs';
export {cache,dir,stableSource,stableBinary,hash,sha,pikaHash,safeRoots,summary,modelFile};
export const binary=baseline,trialBinary=path.resolve(cache+'/mist-nnue');
process.env.MIST_NNUE_MODEL=modelFile;delete process.env.MIST_NNUE_FULL;
export function verifyBinaries(){const pika=verifyFixed(),build=JSON.parse(fs.readFileSync(cache+'/build.json')),training=JSON.parse(fs.readFileSync(dir+'/training.json'));if(hash(trialBinary)!==build.binarySha256||hash(cache+'/search.cpp')!==build.sourceSha256||hash(modelFile)!==build.modelSha256||hash(modelFile)!==training.modelSha256||hash('native/experiments/nnue/nnue.hpp')!==build.headerSha256)throw Error('NNUE build or weights changed');return pika;}
export function acquireLock(){fs.mkdirSync(cache,{recursive:true});const file=cache+'/run.lock',fd=fs.openSync(file,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));fs.closeSync(fd);const release=()=>{try{if(JSON.parse(fs.readFileSync(file)).pid===process.pid)fs.unlinkSync(file);}catch{}};process.once('exit',release);return release;}
