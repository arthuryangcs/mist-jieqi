import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {compile} from '../standpat/build.mjs';
import {hash,sha,patch,stableSource,stableBinary,baseline} from '../standpat/build.mjs';
export {hash,sha,patch,stableSource,stableBinary,baseline};
export const cache='.cache/nnue',dir='benchmarks/nnue',modelFile=path.resolve('models/experimental/observation-nnue-v1.bin');
export function sourceOf(){
 let s=fs.readFileSync('native/search.cpp','utf8');if(sha(s)!==stableSource)throw Error('Stable source changed');
 s='#include "nnue.hpp"\n'+s;
 s=patch(s,'Board board;int turn=0,viewer=-1,','observation_nnue::State neural;\n    Board board;int turn=0,viewer=-1,');
 s=patch(s,'for(int t:pool)s.poolValue[side]+=value[t];','for(int t:pool){s.poolValue[side]+=value[t];s.neural.stock[side][t-1]++;}');
 s=patch(s,'s.path.reserve(128);s.path.push_back(s.key());return s;','s.neural=observation_nnue::rebuilt(s.neural,s.board,s.turn,s.viewer);\n    s.path.reserve(128);s.path.push_back(s.key());return s;');
 s=patch(s,'double evaluate(const State& s,int side) {','double handEvaluate(const State& s,int side) {');
 s=patch(s,'struct Undo {Piece p,q;uint32_t h1,h2;};',`double evaluate(const State& s,int side) {
    const auto& n=s.neural;
    const double correction=observation_nnue::model.full?observation_nnue::correction(observation_nnue::rebuilt(n,s.board,s.turn,s.viewer)):observation_nnue::correction(n);
    return handEvaluate(s,side)+(side==0?correction:-correction);
}
struct Undo {Piece p,q;uint32_t h1,h2;observation_nnue::State neural;};`);
 s=patch(s,'Undo old={p,q,s.h1,s.h2};',`Undo old={p,q,s.h1,s.h2,s.neural};
    observation_nnue::piece(s.neural,p,m.from,-1);observation_nnue::piece(s.neural,q,m.to,-1);
    Piece shown=p;shown.hidden=false;observation_nnue::piece(s.neural,shown,m.to,1);
    if(p.hidden)observation_nnue::changeStock(s.neural,p.side,p.type,-1);
    if(q.live()&&q.hidden&&p.side==s.viewer)observation_nnue::changeStock(s.neural,q.side,q.type,-1);
    observation_nnue::changeTurn(s.neural,s.turn,s.turn^1);`);
 s=patch(s,'Piece p=old.p,q=old.q;if(!p.hidden', 's.neural=old.neural;\n    Piece p=old.p,q=old.q;if(!p.hidden');
 s=patch(s,'w.kings[1]==expected.kings[1]))throw', 'w.kings[1]==expected.kings[1]&&w.neural==expected.neural))throw');
 s=patch(s,'initialize();std::cout<<', 'initialize();observation_nnue::model.load(std::getenv("MIST_NNUE_MODEL"));std::cout<<');
 return s;
}
export function build({sanitize=false}={}){
 if(hash(baseline)!==stableBinary)throw Error('Stable binary changed');fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});
 fs.copyFileSync(new URL('./nnue.hpp',import.meta.url),cache+'/nnue.hpp');const source=path.resolve(cache+'/search.cpp'),binary=path.resolve(cache+'/mist-nnue'+(sanitize?'-sanitized':''));fs.writeFileSync(source,sourceOf());
 const compiler=compile(source,binary,{sanitize}),record={stableSourceSha256:stableSource,stableBinarySha256:stableBinary,sourceSha256:hash(source),headerSha256:hash(cache+'/nnue.hpp'),modelSha256:hash(modelFile),binarySha256:hash(binary),sanitize,...compiler};
 fs.writeFileSync(cache+`/build${sanitize?'-sanitized':''}.json`,JSON.stringify(record,null,2)+'\n');return{binary,...record};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize')}),null,2));
