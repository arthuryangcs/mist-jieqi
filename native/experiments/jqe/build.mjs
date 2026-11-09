// Isolated JQE evaluator. Production search/rules remain unchanged.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {sourceOf as normalizedControl,patch,hash,sha,stableSource,compile} from '../selfplay-value/build.mjs';
export {patch,hash,sha,stableSource,compile};
export const cache='.cache/jqe',dir='benchmarks/jqe';
export const modelFile=path.resolve('models/jqe/it014.jqn');
export const modelSha256='f90bd44e8ee244405eb08eb4f784e3f156900f0691f651b5124d50032f8ba160';
export const upstreamCommit='331a6e612a038c4a04cf980f7b9482910fd50078';
export function sourceOf({trial=true}={}){
 let s=normalizedControl({trial:false});if(!trial)return s;
 s='#include "nnue.hpp"\n'+s;
 s=patch(s,'Board board;int turn=0,viewer=-1,','mist_jqe::State neural;\n    Board board;int turn=0,viewer=-1,');
 s=patch(s,'for(int t:pool)s.poolValue[side]+=value[t];','for(int t:pool){s.poolValue[side]+=value[t];s.neural.stock[side][t-1]++;}');
 s=patch(s,'s.path.reserve(128);s.path.push_back(s.key());return s;','s.neural=mist_jqe::rebuilt(s.neural,s.board,s.turn,s.viewer);\n    s.path.reserve(128);s.path.push_back(s.key());return s;');
 s=patch(s,'double evaluate(const State& s,int side) {','double handEvaluate(const State& s,int side) {');
 s=patch(s,'struct Undo {Piece p,q;uint32_t h1,h2;};',`const bool jqeFull=std::getenv("MIST_JQE_FULL")&&std::string(std::getenv("MIST_JQE_FULL"))=="1";
double evaluate(const State& s,int side) {
    if(!mist_jqe::model.loaded())throw std::runtime_error("JQE evaluator not loaded");
    const auto& n=s.neural;
    const double raw=jqeFull?mist_jqe::correction(mist_jqe::rebuilt(n,s.board,s.turn,s.viewer),side):mist_jqe::correction(n,side);
    // Preserve the network's published logistic K=430 in Mist's existing K=600 aggregation.
    return raw*(600.0/430.0);
}
struct Undo {Piece p,q;uint32_t h1,h2;mist_jqe::State neural;};`);
 s=patch(s,'Undo old={p,q,s.h1,s.h2};',`Undo old={p,q,s.h1,s.h2,s.neural};
    mist_jqe::piece(s.neural,p,m.from,-1);mist_jqe::piece(s.neural,q,m.to,-1);
    Piece shown=p;shown.hidden=false;mist_jqe::piece(s.neural,shown,m.to,1);
    if(p.hidden)mist_jqe::changeStock(s.neural,p.side,p.type,-1);
    if(q.live()&&q.hidden&&p.side==s.viewer)mist_jqe::changeStock(s.neural,q.side,q.type,-1);
    mist_jqe::changeTurn(s.neural,s.turn,s.turn^1);`);
 s=patch(s,'Piece p=old.p,q=old.q;if(!p.hidden','s.neural=old.neural;\n    Piece p=old.p,q=old.q;if(!p.hidden');
 s=patch(s,'w.kings[1]==expected.kings[1]))throw','w.kings[1]==expected.kings[1]&&w.neural==expected.neural))throw');
 s=patch(s,'initialize();std::cout<<','initialize();mist_jqe::model.load(std::getenv("MIST_JQE_MODEL"),!(std::getenv("MIST_JQE_QUANT")&&std::string(std::getenv("MIST_JQE_QUANT"))=="0"));std::cout<<');
 s=patch(s,'const Board before=s.board;Key old=s.key();','const Board before=s.board;const auto neuralBefore=s.neural;Key old=s.key();');
 s=patch(s,'s.kings[1]==oldKings[1])?', 's.kings[1]==oldKings[1]&&s.neural==neuralBefore)?');
 // Startup failures are explicit errors, never an abort or silent HCE fallback.
 s=patch(s,'std::cout<<std::setprecision(17);initialize();','std::cout<<std::setprecision(17);try {initialize();');
 s=patch(s,'try {Packet packet;','Packet packet;');
 // Keep recursive neural snapshots off small std::async worker stacks. One
 // bounded vector per Search, allocated before search, no per-node allocation.
 s=patch(s,'struct Search {','struct Search {\n    std::vector<Undo> undoBuffers=std::vector<Undo>(MAX_SEARCH_PLY);');
 s=patch(s,'Undo push(State& s,Move m) {','void pushInto(State& s,Move m,Undo& old) {');
 s=patch(s,'Undo old={p,q,s.h1,s.h2,s.neural};','old={p,q,s.h1,s.h2,s.neural};');
 s=patch(s,'s.turn^=1;return old;','s.turn^=1;');
 s=patch(s,'void pop(State& s,Move m,const Undo& old) {','Undo push(State& s,Move m){Undo old;pushInto(s,m,old);return old;}\nvoid pop(State& s,Move m,const Undo& old) {');
 s=patch(s,'Undo old=push(s,m);double v;','Undo& old=undoBuffers.at(ply);pushInto(s,m,old);double v;');
 // Neural inputs depend on typed inventory, not only the HCE count/value totals.
 s=patch(s,'uint32_t h1,h2;int turn,c0,v0,c1,v1,extensions;','uint32_t h1,h2;int turn,c0,v0,c1,v1,extensions;std::array<std::array<int,6>,2> inventory;');
 s=patch(s,'extensions==k.extensions;}','extensions==k.extensions&&inventory==k.inventory;}');
 s=patch(s,'return size_t(h);','for(const auto& row:k.inventory)for(int x:row)h^=uint64_t(uint32_t(x))+0x9e3779b97f4a7c15ULL+(h<<6)+(h>>2);\n    return size_t(h);');
 s=patch(s,'return {h1,h2,turn,poolCount[0],poolValue[0],poolCount[1],poolValue[1],ext};','return {h1,h2,turn,poolCount[0],poolValue[0],poolCount[1],poolValue[1],ext,neural.stock};');
 return s;
}
export function build({trial=true,sanitize=false}={}){
 if(hash(modelFile)!==modelSha256)throw Error('Pinned JQE model hash mismatch');
 fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});
 const name=(trial?'candidate':'control')+(sanitize?'-sanitized':''),source=path.resolve(cache+'/'+name+'.cpp'),binary=path.resolve(cache+'/'+name);
 if(trial)fs.copyFileSync('native/experiments/jqe/nnue.hpp',cache+'/nnue.hpp');
 fs.writeFileSync(source,sourceOf({trial}));const compiler=compile(source,binary,{sanitize});
 const r={trial,sanitize,stableSourceSha256:stableSource,sourceSha256:hash(source),binarySha256:hash(binary),headerSha256:trial?hash('native/experiments/jqe/nnue.hpp'):null,modelSha256,upstreamCommit,...compiler};
 fs.writeFileSync(cache+'/'+name+'-build.json',JSON.stringify(r,null,2)+'\n');return{binary,...r};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({trial:!process.argv.includes('--control'),sanitize:process.argv.includes('--sanitize')})));
