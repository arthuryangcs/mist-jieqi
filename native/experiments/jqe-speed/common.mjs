import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {hash,sha,sourceOf,modelFile,modelSha256,compile as originalCompile} from '../jqe-current/build.mjs';
export {hash,sha,modelFile,modelSha256};
export const root='.cache/jqe-speed';
export function gate(){
 assert(!fs.existsSync('.cache/jqe-confirm/match.lock'),'Confirmation match.lock exists; refuse all runtime work');
 if(fs.existsSync('.cache/jqe-confirm/matches.json')){
  const confirmation=JSON.parse(fs.readFileSync('.cache/jqe-confirm/matches.json'));
  assert(confirmation.completedAt&&Array.isArray(confirmation.tasks)&&confirmation.tasks.length>0&&Array.isArray(confirmation.games)&&confirmation.games.length===confirmation.tasks.length&&confirmation.games.every(g=>g.result),'Confirmation batch not complete; refuse all runtime work');
  assert.equal(new Set(confirmation.games.map(g=>g.index)).size,confirmation.tasks.length,'Confirmation game indices are not unique');
 }
 assert(!fs.existsSync('.cache/jqe-retest/match.lock'),'Retest match.lock exists; refuse all runtime work');
 const r=JSON.parse(fs.readFileSync('.cache/jqe-retest/matches.json'));
 assert(r.completedAt&&r.tasks.length===144&&r.games.length===144&&r.games.every(g=>g.result),'144-game retest not complete');
 assert.equal(new Set(r.games.map(g=>g.index)).size,144);
 assert.equal(r.planSha256,hash('native/experiments/jqe-retest/plan.json'));
 for(const [file,digest]of Object.entries(r.hashes))assert.equal(hash(file),digest,'Frozen batch identity changed: '+file);
 const b=JSON.parse(fs.readFileSync('.cache/jqe-current/candidate-build.json'));
 assert.equal(hash('.cache/jqe-current/candidate'),b.binarySha256);
 assert.equal(sha(sourceOf()),b.sourceSha256);
 assert.equal(hash('native/experiments/jqe-current/nnue.hpp'),b.headerSha256);
 assert.equal(hash(modelFile),modelSha256);
 return b;
}
export function patch(s,a,b){assert.equal(s.split(a).length,2,'Patch anchor must occur once: '+a);return s.replace(a,b);}
export function variant(name){
 assert(['baseline','snapshot','integer','fma'].includes(name));
 let source=sourceOf(),header=fs.readFileSync('native/experiments/jqe-current/nnue.hpp','utf8');
 if(name==='snapshot'){
  header=patch(header,'inline int kingBucket',`// Copy only live lanes. Mode/dimensions are immutable after state creation.
inline void copyActive(State& dst,const State& src) {
 dst.stock=src.stock;dst.board=src.board;dst.bucket=src.bucket;
 for(int p=0;p<2;++p) {
  if(model.useQuantized)std::copy_n(src.quantizedAccumulator[p].begin(),model.ft+1,dst.quantizedAccumulator[p].begin());
  else std::copy_n(src.accumulator[p].begin(),model.ft+1,dst.accumulator[p].begin());
 }
}
inline int kingBucket`);
  source=patch(source,'old={p,q,s.h1,s.h2,s.neural};','old.p=p;old.q=q;old.h1=s.h1;old.h2=s.h2;mist_jqe::copyActive(old.neural,s.neural);');
  source=patch(source,'s.neural=old.neural;','mist_jqe::copyActive(s.neural,old.neural);');
 }
 if(name==='integer'){
  header=patch(header,'if(model.useQuantized) {\n        for(int half=0;half<2;++half)for(int i=0;i<F;++i)x[half*F+i]=float((std::clamp(int(state.quantizedAccumulator[side^half][i]),0,QF)+1)/2);','if(model.useQuantized) {\n        std::array<int16_t,2*MAX_FT> qx;\n        for(int half=0;half<2;++half)for(int i=0;i<F;++i)qx[half*F+i]=int16_t((std::clamp(int(state.quantizedAccumulator[side^half][i]),0,QF)+1)/2);');
  header=patch(header,'sum+=int(x[i])*int(model.l1q[o*2*F+i]);','sum+=int(qx[i])*int(model.l1q[o*2*F+i]);');
 }
 if(name==='fma')header=patch(header,'inline int correction(const State& state,int side) {','__attribute__((target("fma"))) inline int correction(const State& state,int side) {');
 return {source,header};
}
export function build(name,{sanitize=false}={}){
 const frozen=gate(),v=variant(name),dir=`${root}/${name}${sanitize?'-sanitized':''}`;
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(dir+'/nnue.hpp',v.header);fs.writeFileSync(dir+'/candidate.cpp',v.source);
 const binary=path.resolve(dir+'/candidate'),compiler=originalCompile(path.resolve(dir+'/candidate.cpp'),binary,{sanitize});
 const result={name,sanitize,binary,sourceSha256:sha(v.source),headerSha256:sha(v.header),binarySha256:hash(binary),frozenBinarySha256:frozen.binarySha256,modelSha256,...compiler};
 fs.writeFileSync(dir+'/build.json',JSON.stringify(result,null,2)+'\n');return result;
}
export function manifest(name,sanitize=false){gate();const dir=`${root}/${name}${sanitize?'-sanitized':''}`,r=JSON.parse(fs.readFileSync(dir+'/build.json'));assert.equal(hash(r.binary),r.binarySha256);assert.equal(hash(dir+'/nnue.hpp'),r.headerSha256);const v=variant(name);assert.equal(sha(v.source),r.sourceSha256);assert.equal(sha(v.header),r.headerSha256);return r;}
export function poses(){return JSON.parse(fs.readFileSync('benchmarks/native-benchmark.json')).positions;}
export function environment(quant=true){process.env.MIST_JQE_MODEL=modelFile;process.env.MIST_JQE_QUANT=quant?'1':'0';delete process.env.MIST_JQE_FULL;}
export function save(name,data){fs.mkdirSync(root,{recursive:true});fs.writeFileSync(root+'/'+name,JSON.stringify(data,(_k,v)=>typeof v==='string'?v.replaceAll(process.cwd(),'<repo>').replace(/\/Users\/[^/\s]+/g,'<home>'):v,2)+'\n');}
