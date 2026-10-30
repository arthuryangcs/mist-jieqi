import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {cache,dir} from './build.mjs';
const code=`
#define main engine_entry
#include "SOURCE"
#undef main
int main(){using namespace mist;TTArena arena;TTScope scope(arena);TTTable a,b;a.configure(1,2);b.configure(1,2);
Key k{1,2,0,15,4500,15,4500,2},other=k;other.c0--;Entry e{4,1,99003,{1,2}};
a.store(k,e);for(int field=0;field<8;field++){Key x=k;switch(field){case 0:x.h1++;break;case 1:x.h2++;break;case 2:x.turn++;break;case 3:x.c0++;break;case 4:x.v0++;break;case 5:x.c1++;break;case 6:x.v1++;break;case 7:x.extensions++;break;}if(a.probe(x))return 10;}if(!a.probe(k)||a.probe(k)->score!=99003||a.probe(other)||b.probe(k))return 1;
b.store(k,{3,2,-99004,{3,4}});if(a.probe(k)->score!=99003||b.probe(k)->score!=-99004)return 2;
a.store(k,{2,0,42,{4,5}});if(a.probe(k)->depth!=2||a.probe(k)->score!=42)return 3;
#ifdef MIST_CLUSTER_TT
a.store(other,{7,0,10,{5,6}});Key third=k;third.extensions--;a.store(third,{1,0,20,{6,7}});if(a.probe(third)||!a.probe(k)||!a.probe(other))return 4;
a.store(third,{9,0,30,{7,8}});if(a.probe(k)||!a.probe(other)||!a.probe(third)||a.replacements!=1)return 5;
#else
for(int i=0;i<100000;i++){Key x=k;x.h1=100+i;a.store(x,e);}if(a.map.size()!=90000||arena.denied.load()!=0)return 6;
a.store(k,{10,0,70,{8,9}});if(a.probe(k)->score!=70)return 7;
#endif
{Board board{};board[85]={0,K,K,false};board[3]={1,K,K,false};State st=stateOf(board,{},0,0);st.table.configure(1,2);Search search;Key key=st.key(2);st.table.store(key,{20,0,99003,{1,2}});if(search.node(st,10,-inf,inf,3,3,2)!=99000)return 11;st.table.store(key,{20,0,-99003,{1,2}});if(search.node(st,10,-inf,inf,3,3,2)!=-99000)return 12;st.table.store(key,{20,1,400,{1,2}});if(search.node(st,10,-100,300,3,3,2)!=400)return 13;st.table.store(key,{20,2,-400,{1,2}});if(search.node(st,10,-300,100,3,3,2)!=-400)return 14;}
 bool denied=false;try{arena.allocate(TTArena::budget+1,64);}catch(const std::bad_alloc&){denied=true;}if(!denied||arena.denied.load()!=1||arena.used.load()>TTArena::budget)return 8;
std::cout<<"ok "<<arena.used.load()<<" bytes\\n";return 0;}
`;
const r={passed:false,cases:[]};for(const kind of ['control','trial'])for(const sanitize of [false,true]){const source=path.resolve(cache+'/'+kind+'.cpp'),file=path.resolve(cache+'/table-'+kind+(sanitize?'-asan':'')+'.cpp'),binary=file.slice(0,-4);fs.writeFileSync(file,code.replace('SOURCE',source));const flags=JSON.parse(fs.readFileSync('.cache/time-search/functional/build.json')).flags.filter(x=>!['-O3','-DNDEBUG'].includes(x)).concat(sanitize?['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer']:['-O2']),c=spawnSync('clang++',[...flags,file,'-o',binary],{encoding:'utf8',timeout:60000});assert.equal(c.status,0,c.stderr);const x=spawnSync(binary,[],{encoding:'utf8',timeout:15000});assert.equal(x.status,0,x.stderr+' '+x.stdout);assert.equal(x.stderr,'');r.cases.push({kind,sanitize,output:x.stdout.trim()});}r.passed=true;fs.writeFileSync(dir+'/table-check.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
