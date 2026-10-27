// Independent exact cycle-scan experiment. Stable engine remains read-only.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {compile,patch,hash,sha,stableSource,stableBinary,baseline} from '../standpat/build.mjs';
export {compile,patch,hash,sha,stableSource,stableBinary,baseline};
export const cache='.cache/cycle-parity',dir='benchmarks/cycle-parity';
export function sourceOf(){
 const original=fs.readFileSync('native/search.cpp','utf8');if(sha(original)!==stableSource)throw Error('Review changed stable source first');
 const helper=fs.readFileSync(new URL('./cycle.hpp',import.meta.url),'utf8');
 let s=patch(original,'struct Search {',helper+'\nstruct Search {');
 return patch(s,'std::find(s.path.begin(),s.path.end(),path)!=s.path.end()','sameTurnCycle(s.path,path)');
}
export function build({sanitize=false}={}){
 if(hash(baseline)!==stableBinary)throw Error('Stable binary changed');fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});
 const source=path.resolve(cache+'/search.cpp'),binary=path.resolve(cache+'/mist-cycle'+(sanitize?'-sanitized':''));fs.writeFileSync(source,sourceOf());
 const compiler=compile(source,binary,{sanitize}),record={stableSourceSha256:stableSource,stableBinarySha256:stableBinary,sourceSha256:hash(source),helperSha256:hash(new URL('./cycle.hpp',import.meta.url)),binarySha256:hash(binary),sanitize,...compiler};
 fs.writeFileSync(cache+'/build'+(sanitize?'-sanitized':'')+'.json',JSON.stringify(record,null,2)+'\n');return {binary,...record};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize')}),null,2));
