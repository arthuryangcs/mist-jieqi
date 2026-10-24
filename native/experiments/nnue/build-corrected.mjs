// Correctness-only successor. Original frozen pilot builder is retained unchanged.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {sourceOf as pilotSource,hash,sha,patch,stableSource,stableBinary,baseline,modelFile} from './build.mjs';import {compile} from '../standpat/build.mjs';
export {hash,sha,patch,stableSource,stableBinary,baseline,modelFile};
export const cache='.cache/nnue-corrected',dir='benchmarks/nnue/corrected';
export function sourceOf(){
 let s=pilotSource();
 s=patch(s,'uint32_t h1,h2;int turn,c0,v0,c1,v1,extensions;','uint32_t h1,h2;int turn,c0,v0,c1,v1,extensions;std::array<std::array<int,6>,2> inventory;');
 s=patch(s,'extensions==k.extensions;}','extensions==k.extensions&&inventory==k.inventory;}');
 s=patch(s,'return size_t(h);','for(const auto& row:k.inventory)for(int x:row)h^=uint64_t(uint32_t(x))+0x9e3779b97f4a7c15ULL+(h<<6)+(h>>2);\n    return size_t(h);');
 s=patch(s,'return {h1,h2,turn,poolCount[0],poolValue[0],poolCount[1],poolValue[1],ext};','return {h1,h2,turn,poolCount[0],poolValue[0],poolCount[1],poolValue[1],ext,neural.stock};');
 return s;
}
export function build({sanitize=false}={}){
 if(hash(baseline)!==stableBinary)throw Error('Stable binary changed');fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});
 fs.copyFileSync(new URL('./nnue.hpp',import.meta.url),cache+'/nnue.hpp');const source=path.resolve(cache+'/search.cpp'),binary=path.resolve(cache+'/mist-nnue'+(sanitize?'-sanitized':''));fs.writeFileSync(source,sourceOf());
 const compiler=compile(source,binary,{sanitize}),record={stableSourceSha256:stableSource,stableBinarySha256:stableBinary,sourceSha256:hash(source),headerSha256:hash(cache+'/nnue.hpp'),modelSha256:hash(modelFile),binarySha256:hash(binary),sanitize,correctedInventoryKey:true,...compiler};
 fs.writeFileSync(cache+`/build${sanitize?'-sanitized':''}.json`,JSON.stringify(record,null,2)+'\n');return{binary,...record};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize')}),null,2));
