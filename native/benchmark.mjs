import fs from 'node:fs';import os from 'node:os';import {createHash} from 'node:crypto';
import {initial,publicState,TYPES,inCheck} from '../engine.js';import {seeded} from '../ai.js';
import {build} from './build.mjs';import {Native,fixture,javascript,compare} from './bridge.mjs';
const output=process.env.JIEQI_NATIVE_BENCH_OUTPUT||'benchmarks/native-benchmark-replay.json',repeats=Number(process.env.JIEQI_NATIVE_REPEATS||5);
if(!Number.isInteger(repeats)||repeats<1||repeats>10)throw Error('重复次数应为1至10');
const {binary,...buildInfo}=build(),native=new Native({binary}),positions=[];
positions.push({name:'初始全暗',depth:3,f:fixture(publicState(initial(seeded(17)),'r'),{seed:6101,samples:8})});
const mids=JSON.parse(fs.readFileSync('benchmarks/strength-positions.json'));for(const i of[1,2,4])positions.push({name:mids[i].name,depth:3,f:fixture(mids[i].view,{seed:7207,samples:8})});
const board=Array(90).fill(null);for(const [i,side,type]of[[85,'r','K'],[4,'b','K'],[49,'r','P'],[72,'r','R'],[65,'r','N'],[83,'r','B'],[17,'b','R'],[24,'b','N'],[40,'b','P'],[6,'b','B']])board[i]={side,type,role:type,hidden:false};
const end={board,turn:'r',captured:[],ply:0,quiet:0,positions:[],result:null};assertNoCheck();function assertNoCheck(){if(inCheck(board,'b'))throw Error('残局非行棋方被将军');}
for(const side of['r','b']){const bag=[...TYPES];for(const p of board)if(p?.side===side&&p.type!=='K')bag.splice(bag.indexOf(p.type),1);for(const type of bag)end.captured.push({side,type,role:type,hidden:false});}
positions.push({name:'全明10子残局',depth:4,f:fixture(publicState(end,'r'),{seed:6101,samples:8})});
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const result={baselineCommit:'aa7644cbed3ef635e9f0424e00241e42d96d98f2',runtime:process.version,architecture:process.arch,cpu:os.cpus()[0].model,build:buildInfo,repeats,sourceHashes:Object.fromEntries(['ai.js','engine.js','native/search.cpp','native/bridge.mjs'].map(p=>[p,sha(p)])),protocol:'预热后轮换执行顺序；两实现共用导出的完全相同无放回样本。核对所有候选评分、推荐、完整深度和节点；C++ core不含协议解析/序列化，wall含每次编码/IPC/解析；进程启动不含在稳态时间内。语言与数据结构变化合并计量，搜索树不变。',positions:positions.map(p=>({name:p.name,depth:p.depth,fixture:p.f})),rows:[],budgets:[]};
const persist=()=>fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');persist();
try{
 await native.ready;if(native.capabilities.independentWorldSearch)throw Error('此脚本要求历史单线程同树核心；当前核心按布局独立排序。请使用 node native/window-benchmark.mjs parallel-fixed 做冻结基线对照。');result.nativeInitializationMs=native.initializationMs;
 for(const p of positions){await javascript(p.f,{depth:2});await native.request(p.f,{depth:2});}
 for(let repeat=0;repeat<repeats;repeat++)for(const [i,p]of positions.entries()){
  const pair={};for(const language of(repeat+i)%2?['cpp','javascript']:['javascript','cpp'])pair[language]=language==='cpp'?await native.request(p.f,{depth:p.depth}):await javascript(p.f,{depth:p.depth});
  if(pair.javascript.depth!==p.depth||pair.cpp.depth!==p.depth)throw Error('未完成指定固定主深度，拒绝发布等深度提速');
  const aligned=compare(pair.javascript,pair.cpp);
  const row={repeat,position:p.name,samples:p.f.samples,seed:p.f.seed,depth:p.depth,nodes:pair.cpp.nodes,rootCandidates:aligned.candidates,maxScoreDifference:aligned.maxDifference,javascriptMs:pair.javascript.elapsedMs,cppCoreMs:pair.cpp.elapsedMs,cppWallMs:pair.cpp.wallMs,javascriptNps:pair.javascript.nodes*1000/pair.javascript.elapsedMs,cppNps:pair.cpp.nodes*1000/pair.cpp.elapsedMs,move:pair.cpp.move};result.rows.push(row);persist();console.log(JSON.stringify(row));
 }
 const median=a=>{a.sort((x,y)=>x-y);return(a[(a.length-1)>>1]+a[a.length>>1])/2;};
 result.summary=positions.map(p=>{const xs=result.rows.filter(r=>r.position===p.name),js=median(xs.map(r=>r.javascriptMs)),cpp=median(xs.map(r=>r.cppCoreMs)),wall=median(xs.map(r=>r.cppWallMs));return{position:p.name,depth:p.depth,samples:p.f.samples,javascriptMedianMs:js,cppCoreMedianMs:cpp,cppWallMedianMs:wall,coreSpeedup:js/cpp,wallSpeedup:js/wall,javascriptMedianNps:median(xs.map(r=>r.javascriptNps)),cppMedianNps:median(xs.map(r=>r.cppNps)),nodes:xs[0].nodes,identicalTree:true};});persist();console.log('FIXED_DEPTH '+JSON.stringify(result.summary));
 if(process.env.JIEQI_NATIVE_SKIP_BUDGETS!=='1')for(const [i,budget]of[1000,6000].entries()){
  const p=positions[0];for(const language of i%2?['cpp','javascript']:['javascript','cpp']){const r=language==='cpp'?await native.request(p.f,{depth:8,budget}):await javascript(p.f,{depth:8,budget});const row={language,budgetMs:budget,samples:r.samples,depth:r.depth,nodes:r.nodes,coreElapsedMs:r.elapsedMs,wallMs:r.wallMs??r.elapsedMs,move:r.move,interruptedDepth:r.interruptedDepth??null,completedRootCandidates:r.allCandidates?.length??0};result.budgets.push(row);persist();console.log('BUDGET '+JSON.stringify(row));}
 }
 result.passed=true;
}catch(error){result.error=error.stack;throw error;}finally{await native.close();persist();}
