import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const dir='benchmarks/defense';
export const sha=v=>createHash('sha256').update(v).digest('hex');
export function patch(s,from,to){if(s.split(from).length!==2)throw Error('Unique patch missing: '+from.slice(0,100));return s.replace(from,to);}
export function freeze(){
 fs.mkdirSync(dir,{recursive:true});
 for(const [src,name] of [['native/search.cpp','baseline.cpp'],['ai.js','baseline-ai.js'],['.cache/native/build.json','baseline-build.json']]){
  const dst=`${dir}/${name}`;if(!fs.existsSync(dst))fs.copyFileSync(src,dst);
 }
 const source=fs.readFileSync(`${dir}/baseline.cpp`,'utf8');
 if(sha(source)!=='73de0d5768fbedd97d46305891a0513f95c7a856aa5aba8edff8a92e2d1798d0')throw Error('Unexpected frozen baseline');
 return source;
}
export function defenseSource(name,{audit=false}={}) {
 let s=freeze();if(!['baseline','threats','king','both','hanging','kingFast','combinedFast','kingCached','kingLazy'].includes(name))throw Error('Unknown variant');
 if(name==='kingCached'){
  s=patch(s,'struct State {','struct PressureCacheEntry {uint32_t h1=0,h2=0;double red=0;bool valid=false;};\nstruct State {\n    mutable std::array<PressureCacheEntry,2048> pressureCache{};\n    mutable uint64_t pressureHits=0,pressureMisses=0;');
  s=patch(s,'std::cout<<",\\"threads\\":"<<lanes;',`uint64_t hits=0,misses=0;for(const auto& w:s.worlds){hits+=w.pressureHits;misses+=w.pressureMisses;}std::cout<<",\\"pressureCacheHits\\":"<<hits<<",\\"pressureCacheMisses\\":"<<misses;std::cout<<",\\"threads\\":"<<lanes;`);
 }
 if(name!=='baseline'||audit){
  s=patch(s,'bool pseudo(const Board& b,int f,int t) {','bool pseudo(const Board& b,int f,int t,bool friendly=false) {');
  s=patch(s,'if(!p.live()||q.side==p.side)return false;','if(!p.live()||(!friendly&&q.side==p.side))return false;');
  const flags=`#define MIST_DEFENSE_THREATS ${Number(['threats','both','hanging','combinedFast'].includes(name))}\n#define MIST_DEFENSE_KING ${Number(['king','both','kingFast','combinedFast','kingCached','kingLazy'].includes(name))}\n#define MIST_DEFENSE_CACHE ${Number(name==='kingCached')}\n`;
  s=patch(s,'double evaluate(const State& s,int side) {',flags+fs.readFileSync('native/defense-eval.inc','utf8')+'\ndouble evaluate(const State& s,int side) {');
  if(name==='kingLazy'){
   s=patch(s,'double evaluate(const State& s,int side) {','double evaluateBase(const State& s,int side) {');
   s=patch(s,'struct Undo {Piece p,q;uint32_t h1,h2;};','double evaluate(const State& s,int side){return evaluateBase(s,side)+fastDefenseDelta(s,side);}\nstruct Undo {Piece p,q;uint32_t h1,h2;};');
   // Each king term is in[0,104]:20 check+4*12 controls+2*18 lack
   // of safe adjacent squares. Their signed difference is in[-104,104].
   // Omit the expensive term only when that entire interval proves a bound.
   s=patch(s,'if(quiet){double stand=evaluate(s,s.turn);','if(quiet){const double base=evaluateBase(s,s.turn);if(base-104>=beta)return base-104;double stand=base+104<=alpha?alpha:base+fastDefenseDelta(s,s.turn);');
  }else if(name!=='baseline')s=patch(s,'}return total;',`}return total+${['hanging','kingFast','combinedFast','kingCached'].includes(name)?'fastDefenseDelta':'defenseDelta'}(s,side);`);
  if(audit){
   s=patch(s,'std::cout<<"],\\"transitions\\":[";','std::cout<<"],\\"defense\\":";writeDefense(s);std::cout<<",\\"transitions\\":[";');
   s=patch(s,'Move move;double score=0,spread=0,winRate=0;','std::vector<double> sampleScores;Move move;double score=0,spread=0,winRate=0;');
   s=patch(s,'Row row;row.move=m;double probability=0,mean=0;','Row row;row.sampleScores=scores;row.move=m;double probability=0,mean=0;');
   s=patch(s,'if(r.draw)std::cout<<",\\"draw\\":true";std::cout<<\'}\';','std::cout<<",\\"sampleScores\\":[";for(size_t i=0;i<r.sampleScores.size();i++){if(i)std::cout<<\',\';std::cout<<r.sampleScores[i];}std::cout<<\']\';if(r.draw)std::cout<<",\\"draw\\":true";std::cout<<\'}\';');
  }
 }
 return s;
}
export function compileDefense(name,{audit=false,sanitizer=null}={}) {
 const cache='.cache/defense';fs.mkdirSync(cache,{recursive:true});
 const source=defenseSource(name,{audit}),file=`${cache}/${name}${audit?'-audit':''}${sanitizer?'-'+sanitizer:''}.cpp`,binary=path.resolve(file.slice(0,-4));fs.writeFileSync(file,source);
 fs.mkdirSync(`${dir}/sources`,{recursive:true});fs.writeFileSync(`${dir}/sources/${sha(source)}.cpp`,source);
 let flags=JSON.parse(fs.readFileSync(`${dir}/baseline-build.json`)).flags;
 if(sanitizer)flags=flags.filter(x=>!['-O3','-DNDEBUG'].includes(x)).concat(['-O1','-g',`-fsanitize=${sanitizer}`,'-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']);
 const compiler=process.env.CXX||'clang++',version=spawnSync(compiler,['--version'],{encoding:'utf8'});if(version.status!==0)throw Error(version.stderr);
 try {const b=JSON.parse(fs.readFileSync(binary+'.json'));if(b.sourceSha256===sha(source)&&b.binarySha256===sha(fs.readFileSync(binary))&&b.compiler===version.stdout.trim()&&JSON.stringify(b.flags)===JSON.stringify(flags))return b;}catch{}
 const r=spawnSync(compiler,[...flags,file,'-o',binary],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);
 const b={name,audit,sanitizer,binary,sourceSha256:sha(source),binarySha256:sha(fs.readFileSync(binary)),compiler:version.stdout.trim(),flags,warnings:r.stderr};
 fs.writeFileSync(binary+'.json',JSON.stringify(b,null,2)+'\n');return b;
}
