// Diagnostic-only instrumentation: expose where the existing TIMEOUT catch exits.
// No production source, deadline, ordering, evaluation or node limit is changed.
import fs from 'node:fs';import{createHash}from'node:crypto';import{NodeSearchEngine}from'./node-search-engine.js';
const file=new URL('../ai.js',import.meta.url),source=fs.readFileSync(file,'utf8'),sourceSha256=createHash('sha256').update(source).digest('hex');
const patches=[['let nodes=0;','let nodes=0,interruptedDepth=null;'],['catch(e){if(e!==TIMEOUT)throw e;break;}','catch(e){if(e!==TIMEOUT)throw e;interruptedDepth=depth;break;}'],['return {...result,nodes,elapsedMs:Math.round(performance.now()-start)};','return {...result,nodes,interruptedDepth,elapsedMs:Math.round(performance.now()-start)};']];
let instrumented=source;for(const [from,to]of patches){if(instrumented.split(from).length!==2)throw Error('诊断补丁不唯一，停止而不修改源码');instrumented=instrumented.replace(from,to);}
instrumented=instrumented.replace("'./engine.js'",JSON.stringify(new URL('../engine.js',import.meta.url).href));
const engine=new NodeSearchEngine({moduleUrl:'data:text/javascript;base64,'+Buffer.from(instrumented).toString('base64')}),rows=[];
try{await engine.ready();for(const p of JSON.parse(fs.readFileSync(new URL('../benchmarks/depth-current.json',import.meta.url))).positions){const r=await engine.search(p.view,1000);rows.push({position:p.name,budgetMs:1000,depth:r.depth,interruptedDepth:r.interruptedDepth??null,samples:r.samples,nodes:r.nodes,elapsedMs:r.elapsedMs,deadlineStop:r.deadlineStop,fallback:r.fallbackUsed});}}finally{await engine.close();}
if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==sourceSha256)throw Error('测试期间生产源码改变');
const result={sourceSha256,protocol:'仅对既有TIMEOUT catch增加记录变量；模块在内存生成，不覆盖生产源码。每类局面额外1次1秒探针；其余预算没有中断轮次观测，不据此回填。',rows};fs.writeFileSync(process.env.JIEQI_DEPTH_INCOMPLETE_OUTPUT||new URL('../benchmarks/depth-incomplete-replay.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(rows));
