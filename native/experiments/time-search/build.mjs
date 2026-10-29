// Independent selective-search experiment; production remains the uncapped HCE.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
export const cache='.cache/time-search',dir='benchmarks/time-search',baseline=path.resolve(cache+'/functional/mist-core');
export const sha=x=>createHash('sha256').update(x).digest('hex'),hash=p=>sha(fs.readFileSync(p));
export function patch(s,a,b){if(s.split(a).length!==2)throw Error('Ambiguous time-search patch: '+a.slice(0,80));return s.replace(a,b);}
export function freezeFunctional(){fs.mkdirSync(cache+'/functional',{recursive:true});for(const n of ['mist-core','build.json'])fs.copyFileSync('.cache/native/'+n,cache+'/functional/'+n,fs.constants.COPYFILE_EXCL);fs.copyFileSync('native/search.cpp',cache+'/functional/search.cpp',fs.constants.COPYFILE_EXCL);}
export function sourceOf({lmr=true,trace=false}={}){
 const m=JSON.parse(fs.readFileSync(cache+'/functional/build.json'));let s=fs.readFileSync(cache+'/functional/search.cpp','utf8');if(sha(s)!==m.sourceSha256||hash(baseline)!==m.binarySha256)throw Error('Functional baseline changed');
 s=patch(s,'uint64_t nodes=0,nodeLimit=0;','uint64_t lmrSearches=0,lmrResearches=0;uint64_t nodes=0,nodeLimit=0;');
 s=patch(s,'Move best;bool first=true;','Move best;bool first=true;int moveCount=0;');
 s=patch(s,'bool capture=s.board[m.to].live();Undo old=push(s,m);double v;','bool capture=s.board[m.to].live();++moveCount;Undo old=push(s,m);double v;');
 const old='else {v=-search(s,depth-1,-alpha-1,-alpha,ply+1,quiet?qleft-1:qleft,extensions);if(v>alpha&&v<beta)v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft,extensions);}';
 const next=`else {
                    // Late quiet moves are speculative. Checks, captures, evasions,
                    // hash/killer/history-prioritised moves and mate windows stay full.
                    int reduction=0;
                    if(${lmr?'true':'false'}&&depth>=3&&!check&&!capture&&moveCount>=4&&std::abs(alpha)<97000&&history[hbase+m.index()]<400&&std::find(killers.at(ply).begin(),killers.at(ply).end(),m)==killers.at(ply).end()&&!inCheck(s.board,s.turn,s.kings[s.turn]))reduction=1+int(depth>=6&&moveCount>=8);
                    if(reduction){lmrSearches++;v=-search(s,depth-1-reduction,-alpha-1,-alpha,ply+1,qleft,extensions);if(v>alpha){lmrResearches++;v=-search(s,depth-1,-alpha-1,-alpha,ply+1,qleft,extensions);}}
                    else v=-search(s,depth-1,-alpha-1,-alpha,ply+1,quiet?qleft-1:qleft,extensions);
                    if(v>alpha&&v<beta)v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft,extensions);
                }`;
 s=patch(s,old,next);
 s=patch(s,'s.nodes=0;s.safetyCutoffs=0;','s.lmrSearches=0;s.lmrResearches=0;s.nodes=0;s.safetyCutoffs=0;');
 s=patch(s,'s.nodes+=worker.nodes;s.selDepth','s.lmrSearches+=worker.lmrSearches;s.lmrResearches+=worker.lmrResearches;s.nodes+=worker.nodes;s.selDepth');
 s=patch(s,'std::cout<<",\\\"mainDepth\\\":"<<currentDepth', 'std::cout<<",\\\"lmrSearches\\\":"<<s.lmrSearches<<",\\\"lmrResearches\\\":"<<s.lmrResearches;std::cout<<",\\\"mainDepth\\\":"<<currentDepth');
 if(trace){
  s=patch(s,'Move move;double score=0,spread=0,winRate=0;','Move move;std::vector<double> worldScores;double score=0,spread=0,winRate=0;');s=patch(s,'Row row;row.move=m;double probability=0,mean=0;','Row row;row.move=m;row.worldScores=scores;double probability=0,mean=0;');
  s=patch(s,'if(r.draw)std::cout',`std::cout<<",\\\"worldScores\\\":[";for(size_t i=0;i<r.worldScores.size();i++){if(i)std::cout<<',';std::cout<<r.worldScores[i];}std::cout<<']';if(r.draw)std::cout`);
 }
 return s;
}
export function build({sanitize=false,trace=false,lmr=true}={}){
 fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});const name=(lmr?'trial':'control')+(trace?'-trace':'')+(sanitize?'-sanitized':''),source=path.resolve(cache+'/'+name+'.cpp'),binary=path.resolve(cache+'/'+name);fs.writeFileSync(source,sourceOf({lmr,trace}));
 const m=JSON.parse(fs.readFileSync(cache+'/functional/build.json'));const flags=sanitize?m.flags.filter(x=>!['-O3','-DNDEBUG'].includes(x)).concat(['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']):m.flags;const compiler=process.env.CXX||'clang++';const result=spawnSync(compiler,[...flags,source,'-o',binary],{encoding:'utf8',timeout:60000});if(result.status!==0)throw Error(result.stderr||String(result.error));const record={lmr,trace,sanitize,functionalSourceSha256:m.sourceSha256,functionalBinarySha256:m.binarySha256,sourceSha256:hash(source),binarySha256:hash(binary),flags,compiler:m.compiler,warnings:result.stderr.trim()};fs.writeFileSync(dir+'/'+name+'-build.json',JSON.stringify(record,null,2)+'\n');return {binary,...record};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv.includes('--freeze'))freezeFunctional();console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize'),trace:process.argv.includes('--trace'),lmr:!process.argv.includes('--control')})));}
