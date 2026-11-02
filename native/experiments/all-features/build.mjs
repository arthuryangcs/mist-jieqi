import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {compose} from './compose.mjs';import {optimize} from './optimize.mjs';import {sourceOf as arenaSource,patch,hash,sha,baseline} from '../cluster-tt/build.mjs';
export {patch,hash,sha,baseline};export const cache='.cache/all-features',dir='benchmarks/all-features',model='models/experimental/observation-nnue-v1.bin';
const read=n=>fs.readFileSync(new URL(n,import.meta.url),'utf8');
export function rootSource(){
 let s=read('../../frontier-policy.inc');s=s.replace('void runFocused(','void runCombo(').replaceAll('s.tacticalQuietChecks','s.quietSearched');
 s=patch(s,'Search s;s.start=', 'TTArena arena;TTScope arenaScope(arena);Search s;s.start=');
 s=patch(s,'Board rootBoard=p.view;',`const bool focusRootEnabled=p.mode=="PLAY"||p.mode=="STREAM_PLAY";constexpr bool coverageRepairEnabled=true,capRepairEnabled=true;
    Board rootBoard=p.view;`);
 const a=s.indexOf('    s.tacticalFocus='),b=s.indexOf('    std::vector<Iteration> iterations;',a);if(a<0||b<a)throw Error('Root session anchors');
 s=s.slice(0,a)+`    RootSession session(p,s);const size_t lanes=session.lanes;
    auto scoreRoot=[&](Move m,int depth){return session.score(m,depth,uncertain);};
`+s.slice(b);
 s=patch(s,'int acceptedDepth=0,','int currentDepth=0;bool finalized=false;double lastTelemetry=-100;uint64_t completedCohorts=0;\n    int acceptedDepth=0,');
 s=patch(s,'auto writeScope=[&]',`auto telemetry=[&](){if(p.mode!="STREAM"&&p.mode!="STREAM_PLAY")return;if(s.elapsed()-lastTelemetry<50)return;lastTelemetry=s.elapsed();const auto seen=session.observed();std::cout<<"{\\\"telemetry\\\":{\\\"mainDepth\\\":"<<currentDepth<<",\\\"selDepth\\\":"<<seen.second<<",\\\"completedDepth\\\":"<<fullDepth<<",\\\"visitedNodes\\\":"<<seen.first<<",\\\"elapsedMs\\\":"<<s.elapsed()<<",\\\"statsExact\\\":false,\\\"searchStatus\\\":\\\"searching\\\"}}\\n"<<std::flush;};
    session.poll=telemetry;if(!session.parallel)s.poll=telemetry;
    auto writeScope=[&]`);
 s=patch(s,'<<capFillRoots;',`<<capFillRoots;
        std::cout<<",\\\"mainDepth\\\":"<<currentDepth<<",\\\"completedDepth\\\":"<<fullDepth<<",\\\"selDepth\\\":"<<s.selDepth<<",\\\"visitedNodes\\\":"<<s.nodes<<",\\\"statsExact\\\":true,\\\"searchStatus\\\":\\\""<<(finalized?(interrupted||s.elapsed()>s.limit?"time-budget":"completed"):"searching")<<"\\\",\\\"safetyCutoffs\\\":"<<s.safetyCutoffs<<",\\\"completedCohorts\\\":"<<completedCohorts<<",\\\"ttBudgetBytes\\\":"<<TTArena::budget<<",\\\"ttAllocatedBytes\\\":"<<arena.used.load()<<",\\\"ttDenied\\\":"<<arena.denied.load();session.writeFeatures();`);
 s=patch(s,'accepted=rows;std::stable_sort','accepted=rows;mist_risk::rank(accepted,uncertain);std::stable_sort');
 s=patch(s,'if(p.mode=="STREAM_PLAY"){','if(p.mode=="STREAM_PLAY"||p.mode=="STREAM"){');
 s=patch(s,'const int anchor=focusRootEnabled?(p.budget>=700?3:2):p.depth;',`const int anchor=focusRootEnabled?1:p.depth;
    const bool allKnown=std::all_of(root.begin(),root.end(),[&](Move m){return p.outcomes[m.index()]!=0;});`);
 s=patch(s,'for(int depth=1;depth<=p.depth;depth++) {','for(int depth=1;p.depth==0||depth<=p.depth;depth++) {currentDepth=depth;telemetry();if(depth==std::numeric_limits<int>::max()-1){s.safetyCutoffs++;break;}');
 s=patch(s,'int minDepth=100;','int minDepth=std::numeric_limits<int>::max();');
 s=patch(s,'accept(depth,rows,int(cohort.size()),true);iterations.push_back({depth,s.nodes,s.elapsed(),accepted});previous=accepted;','accept(depth,rows,int(cohort.size()),true);completedCohorts++;iterations.push_back({depth,s.nodes,s.elapsed(),accepted});if(iterations.size()>64)iterations.erase(iterations.begin());previous=accepted;');
 s=patch(s,'iterations.push_back({depth,s.nodes,s.elapsed(),accepted});}break;','iterations.push_back({depth,s.nodes,s.elapsed(),accepted});if(iterations.size()>64)iterations.erase(iterations.begin());}break;');
 s=patch(s,'if((!uncertain&&std::abs(accepted[0].score)>98000)||s.elapsed()>s.limit)break;','if(allKnown||s.safetyCutoffs||(!uncertain&&std::abs(accepted[0].score)>98000)||s.elapsed()>s.limit)break;');
 s=patch(s,'    #ifdef MIST_VERIFY_RESTORE','    session.pool.reset();session.update();finalized=true;\n    #ifdef MIST_VERIFY_RESTORE');
 s=patch(s,'w.kings[1]==expected.kings[1]))throw','w.kings[1]==expected.kings[1]&&w.neural==expected.neural&&w.occupied==expected.occupied))throw');
 s=patch(s,'if(p.mode!="STREAM_PLAY")for','if(p.mode!="STREAM_PLAY"&&p.mode!="STREAM")for');
 return s;
}
export function sourceOf({trial=true}={}){
 if(!trial)return arenaSource({trial:false,trace:false});
 let s=optimize(compose());s=patch(s,'void writeMove(',read('roots.hpp')+'\nvoid writeMove(');
 const a=s.indexOf('void run(const Packet& p) {'),b=s.indexOf('void verify(const Packet& p)',a);if(a<0||b<a)throw Error('Run anchors');s=s.slice(0,a)+rootSource()+'\n'+s.slice(b);
 s=patch(s,'p.mode!="SEARCH"&&p.mode!="STREAM"&&p.mode!="VERIFY"','p.mode!="SEARCH"&&p.mode!="STREAM"&&p.mode!="VERIFY"&&p.mode!="PLAY"&&p.mode!="STREAM_PLAY"');
 s=patch(s,'else run(packet);','else runCombo(packet);');
 s=patch(s,'initialize();std::cout<<','initialize();observation_nnue::model.load(std::getenv("MIST_NNUE_MODEL"));if(observation_nnue::model.full)throw std::runtime_error("bundle requires incremental NNUE");std::cout<<');
 s=patch(s,'\\\"independentWorldSearch\\\":true}',`\\\"independentWorldSearch\\\":true,\\\"allFeatures\\\":true,\\\"nnue\\\":true,\\\"nnueModelSha256\\\":\\\"${hash(model)}\\\",\\\"ttSlotBytes\\\":128,\\\"focusedPlay\\\":true}`);
 return s;
}
export function build({trial=true,sanitize=false}={}){fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(new URL('../nnue/nnue.hpp',import.meta.url),cache+'/nnue.hpp');const name=(trial?'trial':'control')+(sanitize?'-sanitized':''),source=path.resolve(cache+'/'+name+'.cpp'),binary=path.resolve(cache+'/'+name);fs.writeFileSync(source,sourceOf({trial}));const ref=JSON.parse(fs.readFileSync('.cache/time-search/functional/build.json')),flags=sanitize?ref.flags.filter(x=>!['-O3','-DNDEBUG'].includes(x)).concat(['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']):ref.flags,r=spawnSync(process.env.CXX||'clang++',[...flags,source,'-o',binary],{encoding:'utf8',timeout:60000});if(r.status!==0)throw Error(r.stderr||String(r.error));const record={trial,sanitize,baselineSourceSha256:ref.sourceSha256,baselineBinarySha256:hash(baseline),sourceSha256:hash(source),binarySha256:hash(binary),modelSha256:trial?hash(model):null,modelHeaderSha256:trial?hash(cache+'/nnue.hpp'):null,flags,compiler:ref.compiler,warnings:r.stderr.trim()};fs.writeFileSync(dir+'/'+name+'-build.json',JSON.stringify(record,null,2)+'\n');return {binary,...record};}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({trial:!process.argv.includes('--control'),sanitize:process.argv.includes('--sanitize')})));
