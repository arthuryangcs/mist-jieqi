import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {cache,dir} from './build.mjs';
const code=`
#define main engine_entry
#include "SOURCE"
#undef main
int main(){using namespace mist;TTArena arena;TTScope scope(arena);Board board{};
board[85]={0,K,K,false};board[3]={1,K,K,false};board[72]={0,R,R,false};board[64]={0,C,C,false};board[83]={0,N,N,false};board[8]={1,R,R,false};board[19]={1,C,C,false};board[10]={1,N,N,false};
State s=stateOf(board,{},0,0);s.table.configure(1);auto eligible=[&](int depth,double beta,bool check,size_t moves,bool allow,int virtuals){return nullEligible(s,depth,beta,check,moves,allow,virtuals);};
if(!eligible(4,-90000,false,10,true,0)||eligible(2,-90000,false,10,true,0)||eligible(4,-90000,true,10,true,0)||eligible(4,-90000,false,1,true,0)||eligible(4,-90000,false,10,false,0)||eligible(4,-90000,false,10,true,1)||eligible(4,98000,false,10,true,0)||eligible(4,inf,false,10,true,0))return 1;
for(int i:{72,64,83})s.board[i].hidden=true;if(eligible(4,-90000,false,10,true,0))return 2;for(int i:{72,64,83})s.board[i].hidden=false;
s.board[64]=Piece{};s.board[83]=Piece{};if(eligible(4,-90000,false,10,true,0))return 3;s=stateOf(board,{},0,0);s.table.configure(1);
Search q;q.start=std::chrono::steady_clock::now();q.limit=60000;q.nodeLimit=1;const Board before=s.board;const Key old=s.key();const auto oldPath=s.path;const int oldTurn=s.turn;bool timed=false;
try{q.node(s,4,-90001,-90000,1,3,2,true,0);}catch(const Timeout&){timed=true;}
if(!timed||q.nullSearches!=1||s.turn!=oldTurn||!(s.key()==old)||!(s.board==before)||s.path!=oldPath)return 4;
q.nodeLimit=0;q.nodes=0;q.selDepth=0;const double cut=q.node(s,4,-90001,-90000,1,3,2,true,0);if(cut!=-90000||q.nullCutoffs==0||q.nullVerifications==0)return 7;q.selDepth=0;s.table.store(s.key(2),{20,0,123456,{0,1}});const auto entries=s.table.map.size(),bytes=arena.used.load();const double v=q.search(s,1,-inf,inf,7,0,2,false,1);
if(q.selDepth<6||q.selDepth>20||s.table.map.size()!=entries||arena.used.load()!=bytes||s.table.probe(s.key(2))->score!=123456||std::abs(v)>98000||s.path!=oldPath||!(s.key()==old))return 5;
Board terminal{};terminal[3]={1,K,K,false};State t=stateOf(terminal,{},0,0);Search m;m.start=std::chrono::steady_clock::now();m.limit=60000;const double loss=m.search(t,1,-inf,inf,7,0,2,false,1);if(loss!=-mate+6||m.selDepth!=6)return 6;
std::cout<<"ok guards,timeout restore,synthetic TT isolation,mate distance,actual plies\\n";return 0;}
`;
const r={passed:false,cases:[]};for(const sanitize of [false,true]){const source=path.resolve(cache+'/trial.cpp'),file=path.resolve(cache+'/null-check'+(sanitize?'-asan':'')+'.cpp'),binary=file.slice(0,-4);fs.writeFileSync(file,code.replace('SOURCE',source));const ref=JSON.parse(fs.readFileSync('.cache/time-search/functional/build.json')),flags=ref.flags.filter(x=>!['-O3','-DNDEBUG'].includes(x)).concat(sanitize?['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer']:['-O2']),c=spawnSync('clang++',[...flags,file,'-o',binary],{encoding:'utf8',timeout:60000});assert.equal(c.status,0,c.stderr);const x=spawnSync(binary,[],{encoding:'utf8',timeout:15000});assert.equal(x.status,0,x.stderr+' '+x.stdout);assert.equal(x.stderr,'');r.cases.push({sanitize,output:x.stdout.trim()});}r.passed=true;fs.writeFileSync(dir+'/null-check.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
