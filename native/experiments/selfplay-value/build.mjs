// Historical 9602155 HCE control and learned residual. Never modifies production.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const cache='.cache/selfplay-value',dir='benchmarks/selfplay-value';
export const modelFile=path.resolve('models/experimental/selfplay-value-v1.bin');
export const stableSource='3fa98d62f3c1636b831680fcd5dcbf88f9339e966ed1b8e2f8a170b83afcbfb0';
export const sha=x=>createHash('sha256').update(x).digest('hex'),hash=p=>sha(fs.readFileSync(p));
export function patch(s,a,b){if(s.split(a).length!==2)throw Error('Ambiguous selfplay-value patch: '+a.slice(0,90));return s.replace(a,b);}
export function sourceOf({trial=true}={}){
 let s=fs.readFileSync(new URL('../historical/search-9602155.cpp',import.meta.url),'utf8');if(sha(s)!==stableSource)throw Error('Archived HCE hash mismatch');
 // Same 64 MiB arena in both arms, including map buckets and entries.
 s='#include <new>\n'+s;
 s=patch(s,'struct State {',fs.readFileSync('native/experiments/cluster-tt/table.hpp','utf8')+'\nstruct State {');
 s=patch(s,'std::unordered_map<Key,Entry,KeyHash> table;','TTTable table;');
 s=patch(s,'auto i=s.table.find(key);if(i!=s.table.end()){entry=i->second;','const Entry* i=s.table.probe(key);if(i){entry=*i;');
 s=patch(s,'if(hasKey&&cycleStart==s.cycles&&(s.table.size()<90000||s.table.find(key)!=s.table.end()))s.table[key]={depth,flag,score>98000?score+ply:score< -98000?score-ply:score,m};','if(hasKey&&cycleStart==s.cycles)s.table.store(key,{depth,flag,score>98000?score+ply:score< -98000?score-ply:score,m});');
 s=patch(s,'Search s;s.start=std::chrono::steady_clock::now();','TTArena arena;TTScope scope(arena);Search s;s.start=std::chrono::steady_clock::now();');
 s=patch(s,'std::vector<Iteration> iterations;','for(auto& w:s.worlds)w.table.configure(s.worlds.size());\n    std::vector<Iteration> iterations;');
 s=patch(s,'std::cout<<",\\\"mainDepth\\\":"<<currentDepth','std::cout<<",\\\"ttBudgetBytes\\\":"<<TTArena::budget<<",\\\"ttAllocatedBytes\\\":"<<arena.used.load()<<",\\\"ttDenied\\\":"<<arena.denied.load();std::cout<<",\\\"mainDepth\\\":"<<currentDepth');
 if(!trial)return s;
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
 s=patch(s,'Piece p=old.p,q=old.q;if(!p.hidden','s.neural=old.neural;\n    Piece p=old.p,q=old.q;if(!p.hidden');
 s=patch(s,'w.kings[1]==expected.kings[1]))throw','w.kings[1]==expected.kings[1]&&w.neural==expected.neural))throw');
 s=patch(s,'initialize();std::cout<<','initialize();observation_nnue::model.load(std::getenv("MIST_NNUE_MODEL"));std::cout<<');
 // Neural inputs depend on typed inventory, not only the HCE count/value totals.
 s=patch(s,'uint32_t h1,h2;int turn,c0,v0,c1,v1,extensions;','uint32_t h1,h2;int turn,c0,v0,c1,v1,extensions;std::array<std::array<int,6>,2> inventory;');
 s=patch(s,'extensions==k.extensions;}','extensions==k.extensions&&inventory==k.inventory;}');
 s=patch(s,'return size_t(h);','for(const auto& row:k.inventory)for(int x:row)h^=uint64_t(uint32_t(x))+0x9e3779b97f4a7c15ULL+(h<<6)+(h>>2);\n    return size_t(h);');
 s=patch(s,'return {h1,h2,turn,poolCount[0],poolValue[0],poolCount[1],poolValue[1],ext};','return {h1,h2,turn,poolCount[0],poolValue[0],poolCount[1],poolValue[1],ext,neural.stock};');
 return s;
}
export function compile(source,binary,{sanitize=false}={}){
 const flags=['-std=c++17','-ffp-contract=off',...(sanitize?['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']:['-O3','-DNDEBUG'])];
 if(process.platform==='darwin'){const r=spawnSync('xcrun',['--show-sdk-path'],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);flags.push('-isystem',path.join(r.stdout.trim(),'usr/include/c++/v1'));}else flags.push('-pthread');
 const compiler=process.env.CXX||'clang++',v=spawnSync(compiler,['--version'],{encoding:'utf8'}),r=spawnSync(compiler,[...flags,source,'-o',binary],{encoding:'utf8',timeout:120000});if(r.status!==0)throw Error(r.stderr||String(r.error));return{compiler:compiler,compilerVersion:v.stdout.trim().split('\n').filter(l=>!l.startsWith('InstalledDir:')).join('\n'),flags:flags.map(f=>path.isAbsolute(f)?'<system-c++-include>':f),warnings:r.stderr.trim()};
}
export function build({trial=true,sanitize=false}={}){
 fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});const name=(trial?'candidate':'control')+(sanitize?'-sanitized':''),source=path.resolve(cache+'/'+name+'.cpp'),binary=path.resolve(cache+'/'+name);
 fs.copyFileSync(new URL('../nnue/nnue.hpp',import.meta.url),cache+'/nnue.hpp');fs.writeFileSync(source,sourceOf({trial}));const compiler=compile(source,binary,{sanitize});
 const r={trial,sanitize,stableSourceSha256:stableSource,sourceSha256:hash(source),binarySha256:hash(binary),headerSha256:hash(cache+'/nnue.hpp'),...compiler};fs.writeFileSync(cache+'/'+name+'-build.json',JSON.stringify(r,null,2)+'\n');return{binary,...r};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({trial:!process.argv.includes('--control'),sanitize:process.argv.includes('--sanitize')})));
