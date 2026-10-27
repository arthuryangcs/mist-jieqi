import fs from 'node:fs';import path from 'node:path';
import {cache,dir,baseline,stableSource,stableBinary,hash,sha} from './build.mjs';
import {verifyBinaries as verifyFixed,pikaHash,safeRoots,summary} from '../coverage-validation/common.mjs';
export {cache,dir,stableSource,stableBinary,hash,sha,pikaHash,safeRoots,summary};
export const binary=baseline,trialBinary=path.resolve(cache+'/mist-cycle');
export function verifyBinaries(){const pika=verifyFixed(),build=JSON.parse(fs.readFileSync(cache+'/build.json'));if(hash(new URL('./cycle.hpp',import.meta.url))!==build.helperSha256)throw Error('Cycle helper changed');if(hash(trialBinary)!==build.binarySha256||hash(cache+'/search.cpp')!==build.sourceSha256)throw Error('Trial build changed');return pika;}
export function acquireLock(){fs.mkdirSync(cache,{recursive:true});const file=cache+'/run.lock',fd=fs.openSync(file,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));fs.closeSync(fd);const release=()=>{try{if(JSON.parse(fs.readFileSync(file)).pid===process.pid)fs.unlinkSync(file);}catch{}};process.once('exit',release);return release;}
