// Opt-in preview: reuse current production transport without changing its files.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../../',import.meta.url));
export const modelFile=path.join(root,'models/jqe/it014.jqn');
export const previewRoot=path.join(root,'.cache/jqe-current/web');
function replaceOnce(source,from,to){
 if(source.split(from).length!==2)throw Error('JQE preview source contract changed: '+from);
 return source.replace(from,to);
}
function moduleURL(source,url){
 source=source.replace(/(from\s*)(['"])(\.{1,2}\/[^'"]+)\2/g,(_,prefix,q,spec)=>prefix+JSON.stringify(new URL(spec,url).href));
 source=source.replaceAll('import.meta.url',JSON.stringify(url.href));
 return 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
}
export function writePreview(){
 fs.mkdirSync(previewRoot,{recursive:true});
 for(const name of ['index.html','style.css','board.svg','app.js','engine.js','ai.js','editor.js','worker.js','deadline-search.js','native-client.js','search-metrics.js'])fs.copyFileSync(path.join(root,name),path.join(previewRoot,name));
 let html=fs.readFileSync(path.join(previewRoot,'index.html'),'utf8');
 html=replaceOnce(html,'<header>','<section class="card" aria-label="JQE 实验说明"><strong>JQE 评估网络实验 · 尚未默认启用</strong><p>仅替换局面评估，沿用本项目搜索。棋力收益尚待验证；选择 JS 回退时不使用 JQE。</p><a href="http://127.0.0.1:8766/">退出实验，返回稳定版</a><p>也可直接关闭此标签页；终端 Ctrl+C 停止实验服务。稳定版须单独启动。</p></section><header>');
 html=replaceOnce(html,'<title>雾里见招 · 揭棋</title>','<title>JQE 实验 · 雾里见招</title>');
 fs.writeFileSync(path.join(previewRoot,'index.html'),html);
 return previewRoot;
}
export async function previewModule({quantized=process.env.MIST_JQE_QUANT!=='0'}={}){
 // Capture at startup. Neither a request nor later process.env mutations can
 // redirect subsequent child processes to a different network or quantizer.
 const settings=Object.freeze({MIST_JQE_MODEL:modelFile,MIST_JQE_QUANT:quantized?'1':'0',MIST_JQE_FULL:'0'});
 const environment={...process.env,...settings};
 const bridgeURL=new URL('../../bridge.mjs',import.meta.url);
 let bridge=fs.readFileSync(bridgeURL,'utf8');
 bridge=replaceOnce(bridge,"cwd:root}","cwd:root,env:{...process.env,..."+JSON.stringify(settings)+"}}");
 const bridgeModule=moduleURL(bridge,bridgeURL);
 const serverURL=new URL('../../server.mjs',import.meta.url);
 let source=fs.readFileSync(serverURL,'utf8');
 const entry='\nif(process.argv[1]===fileURLToPath(import.meta.url))';
 if(!source.includes(entry))throw Error('JQE preview server entry contract changed');
 source=source.slice(0,source.indexOf(entry));
 source=replaceOnce(source,"from './bridge.mjs'",'from '+JSON.stringify(bridgeModule));
 source=replaceOnce(source,'maxSearches=2}={})','maxSearches=2,staticRoot=root}={})');
 source=replaceOnce(source,'fs.readFileSync(path.join(root,file))','fs.readFileSync(path.join(staticRoot,file))');
 const mod=await import(moduleURL(source,serverURL));
 return {...mod,quantized,probeBuild(built){
  const result=spawnSync(built.binary,[],{cwd:root,env:environment,input:'',encoding:'utf8',timeout:10000});
  if(result.status!==0||result.stderr.trim())throw Error(result.stderr||'JQE core startup failed');
  const c=JSON.parse(result.stdout.trim());
  if(!c.ready||c.protocol!==2||!c.streaming||!c.unlimitedDepth)throw Error('JQE core protocol mismatch');
  return {...built,threads:c.threads,independentWorldSearch:c.independentWorldSearch===true,unlimitedDepth:c.unlimitedDepth===true,depthMetrics:c.depthMetrics===true,safetyMaxPly:c.safetyMaxPly};
 }};
}
