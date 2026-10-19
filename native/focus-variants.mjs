import fs from'node:fs';import path from'node:path';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';
export const dir='benchmarks/focus',sha=x=>createHash('sha256').update(x).digest('hex');
export const patch=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Unique patch missing: '+a.slice(0,90));return s.replace(a,b);};
export function freeze(){fs.mkdirSync(dir,{recursive:true});for(const[a,b]of[['native/search.cpp','baseline.cpp'],['ai.js','baseline-ai.js'],['.cache/native/build.json','baseline-build.json']])if(!fs.existsSync(`${dir}/${b}`))fs.copyFileSync(a,`${dir}/${b}`);const s=fs.readFileSync(`${dir}/baseline.cpp`,'utf8');if(sha(s)!=='73de0d5768fbedd97d46305891a0513f95c7a856aa5aba8edff8a92e2d1798d0')throw Error('Unexpected baseline');return s;}
export function focusSource(name,{audit=false}={}){
 if(!['baseline','root','tactical','both','fullCanonical','tacticalCanonical'].includes(name))throw Error('Unknown variant');let s=freeze();
 s=patch(s,'namespace mist {',`namespace mist {\nconstexpr bool focusRootEnabled=${['root','both'].includes(name)},focusTacticsEnabled=${['tactical','both','tacticalCanonical'].includes(name)},canonicalRootsEnabled=${['root','both','fullCanonical','tacticalCanonical'].includes(name)};`);
 s=patch(s,'p.mode!="SEARCH"&&p.mode!="STREAM"&&p.mode!="VERIFY"','p.mode!="SEARCH"&&p.mode!="STREAM"&&p.mode!="VERIFY"&&p.mode!="PLAY"&&p.mode!="STREAM_PLAY"');
 s=patch(s,'double orderingValue(const State& s,Piece p)',fs.readFileSync('native/focus-tactics.inc','utf8')+'\ndouble orderingValue(const State& s,Piece p)');
 s=patch(s,'uint64_t nodes=0,nodeLimit=0;double limit=0;','bool tacticalFocus=false,strictDepth=false;uint64_t tacticalQuietChecks=0;\n    uint64_t nodes=0,nodeLimit=0;double limit=0;');
 s=patch(s,'if(entry.depth>=depth){','if(strictDepth?entry.depth==depth:entry.depth>=depth){');
 if(['tactical','both','tacticalCanonical'].includes(name)){
  s=patch(s,'if(qleft<=0||moves.empty())return alpha;','if(qleft<=0)return alpha;if(depth==0&&tacticalFocus)focusedQuietChecks(s,moves);if(moves.empty())return alpha;');
  s=patch(s,'bool capture=s.board[m.to].live();Undo old=push(s,m);double v;','bool capture=s.board[m.to].live();if(quiet&&!capture)tacticalQuietChecks++;Undo old=push(s,m);double v;');
 }
 s=patch(s,'void verify(const Packet& p) {',fs.readFileSync('native/focus-policy.inc','utf8')+'\nvoid verify(const Packet& p) {');
 s=patch(s,'else run(packet);','else if(packet.mode=="PLAY"||packet.mode=="STREAM_PLAY")runFocused(packet);else run(packet);');
 s=patch(s,'\\"independentWorldSearch\\":true}',`\\"independentWorldSearch\\":true,\\"focusedPlay\\":true,\\"rootBudget\\":${['root','both'].includes(name)},\\"criticalTactics\\":${['tactical','both','tacticalCanonical'].includes(name)}}`);
 s=patch(s,'State s=stateOf(p.worlds[0],p.captured,p.turn,p.viewer);std::cout<<"{\\"sides\\":[";','State s=stateOf(p.worlds[0],p.captured,p.turn,p.viewer);std::cout<<"{\\"criticalRoot\\":"<<((criticalKing(p.view,0)||criticalKing(p.view,1))?"true":"false")<<",\\"sides\\":[";');
 if(audit){
  s=patch(s,'Move move;double score=0,spread=0,winRate=0;','std::vector<double> sampleScores;Move move;double score=0,spread=0,winRate=0;');
  s=patch(s,'Row row;row.move=m;double probability=0,mean=0;','Row row;row.sampleScores=scores;row.move=m;double probability=0,mean=0;');
  s=patch(s,'if(r.draw)std::cout<<",\\"draw\\":true";std::cout<<\'}\';','std::cout<<",\\"sampleScores\\":[";for(size_t i=0;i<r.sampleScores.size();i++){if(i)std::cout<<\',\';std::cout<<r.sampleScores[i];}std::cout<<\']\';if(r.draw)std::cout<<",\\"draw\\":true";std::cout<<\'}\';');
  s=patch(s,'writeMoves(legal(s.board,side,true));std::cout<<\'}\';','writeMoves(legal(s.board,side,true));const int oldTurn=s.turn;s.turn=side;std::vector<Move> qs;focusedQuietChecks(s,qs);s.turn=oldTurn;std::cout<<",\\"quietChecks\\":";writeMoves(qs);std::cout<<\'}\';');
 }
 return s;
}
export function compileFocus(name,{audit=false,sanitizer=null}={}){
 const cache='.cache/focus';fs.mkdirSync(cache,{recursive:true});const source=focusSource(name,{audit}),file=`${cache}/${name}${audit?'-audit':''}${sanitizer?'-'+sanitizer:''}.cpp`,binary=path.resolve(file.slice(0,-4));fs.writeFileSync(file,source);fs.mkdirSync(`${dir}/sources`,{recursive:true});fs.writeFileSync(`${dir}/sources/${sha(source)}.cpp`,source);
 let flags=JSON.parse(fs.readFileSync(`${dir}/baseline-build.json`)).flags;if(sanitizer)flags=flags.filter(x=>!['-O3','-DNDEBUG'].includes(x)).concat(['-O1','-g',`-fsanitize=${sanitizer}`,'-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']);
 const compiler=process.env.CXX||'clang++',version=spawnSync(compiler,['--version'],{encoding:'utf8'});if(version.status!==0)throw Error(version.stderr);
 try{const b=JSON.parse(fs.readFileSync(binary+'.json'));if(b.sourceSha256===sha(source)&&b.binarySha256===sha(fs.readFileSync(binary))&&b.compiler===version.stdout.trim()&&JSON.stringify(b.flags)===JSON.stringify(flags))return b;}catch{}
 const r=spawnSync(compiler,[...flags,file,'-o',binary],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);
 const b={name,audit,sanitizer,binary,sourceSha256:sha(source),binarySha256:sha(fs.readFileSync(binary)),flags,compiler:version.stdout.trim(),warnings:r.stderr};fs.writeFileSync(binary+'.json',JSON.stringify(b,null,2)+'\n');return b;
}
// Performance and games use the unchanged, byte-identical playable baseline,
// not the larger prototype with its new profile branches merely switched off.
export function originalBuild(){
 const source=freeze(),info=JSON.parse(fs.readFileSync(`${dir}/baseline-build.json`)),current='.cache/native/mist-core',binary=path.resolve('.cache/focus/production-baseline');
 if(sha(source)!==info.sourceSha256)throw Error('Frozen baseline source mismatch');
 fs.mkdirSync('.cache/focus',{recursive:true});
 if(!fs.existsSync(binary)){if(sha(fs.readFileSync(current))!==info.binarySha256)throw Error('Playable binary differs from frozen baseline');fs.copyFileSync(current,binary);fs.chmodSync(binary,0o755);}
 if(sha(fs.readFileSync(binary))!==info.binarySha256)throw Error('Frozen production binary changed');
 fs.mkdirSync(`${dir}/sources`,{recursive:true});fs.writeFileSync(`${dir}/sources/${info.sourceSha256}.cpp`,source);
 const record={...info,name:'baseline',binary,audit:false,sanitizer:null,warnings:info.compilerWarnings||''};fs.writeFileSync(binary+'.json',JSON.stringify(record,null,2)+'\n');return record;
}
