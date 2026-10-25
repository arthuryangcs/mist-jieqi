// Independent exact-ordering experiment; never writes the stable binary.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {compile,patch,hash,sha,stableSource,stableBinary,baseline} from '../standpat/build.mjs';
export {compile,patch,hash,sha,stableSource,stableBinary,baseline};
export const cache='.cache/insertion-sort',dir='benchmarks/insertion-sort';
export function sourceOf(){
 const original=fs.readFileSync('native/search.cpp','utf8');if(sha(original)!==stableSource)throw Error('Review changed stable source first');
 let s=patch(original,'struct ScoredMove {Move move;double score;};',`struct ScoredMove {Move move;double score;};
// Strict comparison keeps original order for equal scores, including signed zero.
void stableMoveSort(std::vector<ScoredMove>& scored) {
    for(size_t i=1;i<scored.size();i++) {
        const ScoredMove item=scored[i];size_t j=i;
        while(j>0&&item.score>scored[j-1].score){scored[j]=scored[j-1];--j;}
        scored[j]=item;
    }
}`);
 return patch(s,'std::stable_sort(scored.begin(),scored.end(),[](const ScoredMove& a,const ScoredMove& b){return a.score>b.score;});','stableMoveSort(scored);');
}
export function build({sanitize=false}={}){
 if(hash(baseline)!==stableBinary)throw Error('Stable binary changed');fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});
 const source=path.resolve(cache+'/search.cpp'),binary=path.resolve(cache+'/mist-insertion'+(sanitize?'-sanitized':''));fs.writeFileSync(source,sourceOf());
 const compiler=compile(source,binary,{sanitize}),record={stableSourceSha256:stableSource,stableBinarySha256:stableBinary,sourceSha256:hash(source),binarySha256:hash(binary),sanitize,...compiler};
 fs.writeFileSync(cache+`/build${sanitize?'-sanitized':''}.json`,JSON.stringify(record,null,2)+'\n');return {binary,...record};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize')}),null,2));
