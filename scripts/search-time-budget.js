import fs from'node:fs';import{createHash}from'node:crypto';
import{initial,publicState}from'../engine.js';import{seeded}from'../ai.js';import{NodeSearchEngine}from'./node-search-engine.js';
const budgets=(process.env.JIEQI_COMPARE_BUDGETS||'2000,15000').split(',').map(Number),output=process.env.JIEQI_COMPARE_OUTPUT||'benchmarks/search-time-budget-replay.json';
if(budgets.some(x=>!Number.isFinite(x)||x<50||x>15000))throw Error('时间预算超出范围');
const view=publicState(initial(seeded(17)),'r'),engines={baseline:new NodeSearchEngine({moduleUrl:new URL('../benchmarks/search-speed-baseline-ai.js',import.meta.url).href}),candidate:new NodeSearchEngine()},rows=[];
try{
 for(const e of Object.values(engines)){await e.ready();await e.search(view,500);}
 for(const [i,budget]of budgets.entries())for(const name of i%2?['candidate','baseline']:['baseline','candidate']){const r=await engines[name].search(view,budget);rows.push({name,budgetMs:budget,depth:r.depth,samples:r.samples,seed:r.seed,nodes:r.nodes,elapsedMs:r.elapsedMs,searchElapsedMs:r.searchElapsedMs,move:r.move,deadlineStop:r.deadlineStop,fallback:r.fallbackUsed});console.log(JSON.stringify(rows.at(-1)));}
}finally{for(const e of Object.values(engines))await e.close();}
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');const result={protocol:'相同公开初始局面、默认可见信息哈希种子和8样本、共同宿主时限控制器；每版本预热500ms，排除线程初始化，按预算轮换版本先后。各档每版本1次，只记录最后完整深度，不保证重复时层数相同。',runtime:process.version,sourceHashes:Object.fromEntries(['ai.js','engine.js','benchmarks/search-speed-baseline-ai.js','benchmarks/search-speed-baseline-engine.js'].map(p=>[p,sha(p)])),rows};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
