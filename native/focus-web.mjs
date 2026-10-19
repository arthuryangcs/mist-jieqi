// Build a loopback-only experimental UI without changing the playable files.
import fs from'node:fs';import path from'node:path';import{patch}from'./focus-variants.mjs';
export function clientSource(){let s=fs.readFileSync('native-client.js','utf8');
 s=patch(s,'constructor({fetcher=globalThis.fetch.bind(globalThis)}={})','constructor({fetcher=globalThis.fetch.bind(globalThis),purpose=\'analysis\'}={})');
 s=patch(s,'this.fetcher=fetcher;','this.purpose=purpose;this.fetcher=fetcher;');
 s=patch(s,'view:data.view,timeMs:data.timeMs','view:data.view,timeMs:data.timeMs,purpose:this.purpose');
 s=patch(s,"if(!item.progress)complete=true;",`if(item.result?.searchScope==='focused-root'&&item.result.depth>0){const r=item.result;if(!Number.isInteger(r.rootCount)||r.rootCount<1||!Number.isInteger(r.fullRootDepth)||r.fullRootDepth<0||!Number.isInteger(r.comparedCount)||r.comparedCount<Math.min(2,r.rootCount)||r.comparedCount>r.rootCount||r.comparisonDepth!==r.depth||r.fullRootDepth>r.depth)throw Error('候选比较范围无效，已停止');}if(!item.progress)complete=true;`);
 return s;}
export function appSource(){let s=fs.readFileSync('app.js','utf8');
 const helper="const depthDescription=r=>r.searchScope==='focused-root'?`候选主深度 ${r.depth}（精算 ${r.comparedCount}/${r.rootCount} 着，全候选 ${r.fullRootDepth} 层）`:`全候选主深度 ${r.depth}`;\n";
 s=patch(s,'function showEngine(r){',helper+'function showEngine(r){');
 s=patch(s,"engineNote+=r.depth?' · 完整深度 '+r.depth:'';","engineNote+=r.depth?' · '+depthDescription(r):'';");
 s=patch(s,'深度 ${r.depth} · ${r.samples}','${depthDescription(r)} · ${r.samples}');
 s=patch(s,"+'@'+engineChoice(),cached=","+'@'+engineChoice()+'@'+(auto?'play':'analysis'),cached=");
 s=patch(s,'new NativeWorker()','new NativeWorker({purpose:auto?\'play\':\'analysis\'})');
 s=patch(s,'if(result.depth){analysisCache.set','if(result.depth&&!auto){analysisCache.set');
 s=s.replaceAll('时限前最后完整搜索结果','时限前可比较的搜索结果').replaceAll('显示最后完整搜索结果','显示最后可比较的搜索结果');return s;
}
export function serverSource(){let s=fs.readFileSync('native/server.mjs','utf8');
 s=s.slice(0,s.indexOf('\nif(process.argv[1]===fileURLToPath(import.meta.url))'));
 s=patch(s,"!['token','timeMs','view'].includes(k)","!['token','timeMs','view','purpose'].includes(k)");
 s=patch(s," const v=input.view;"," if(input.purpose!==undefined&&!['play','analysis'].includes(input.purpose))invalid('无效搜索用途');\n const v=input.view;");
 s=patch(s,'return{token:input.token,timeMs:input.timeMs,view:','return{token:input.token,timeMs:input.timeMs,purpose:input.purpose??\'analysis\',view:');
 s=patch(s,'maxSearches=2}={})','maxSearches=2,staticRoot=root}={})');
 s=patch(s,"transport:'loopback-http',protocol:2","transport:'loopback-http',protocol:2,focusedPlay:buildInfo.focusedPlay===true,rootBudget:buildInfo.rootBudget===true,criticalTactics:buildInfo.criticalTactics===true");
 s=patch(s,"const remaining=Math.max(0,input.timeMs-(performance.now()-started)-15);","if(input.purpose==='play'&&native.capabilities.focusedPlay!==true)throw Error('本机核心尚不支持实战用途，请重启升级服务');\n     const remaining=Math.max(0,input.timeMs-(performance.now()-started)-15);");
 s=patch(s,"{mode:'STREAM',depth:8,budget:remaining","{mode:input.purpose==='play'?'STREAM_PLAY':'STREAM',depth:8,budget:remaining");
 s=patch(s,'fs.readFileSync(path.join(root,file))','fs.readFileSync(path.join(staticRoot,file))');return s;
}
export function writePreview({experimental=true}={}){
 const root=path.resolve('.cache/focus-web');fs.mkdirSync(root,{recursive:true});
 for(const f of['index.html','style.css','board.svg','engine.js','ai.js','editor.js','worker.js','deadline-search.js'])fs.copyFileSync(f,path.join(root,f));
 fs.writeFileSync(path.join(root,'app.js'),appSource());fs.writeFileSync(path.join(root,'native-client.js'),clientSource());
 let html=fs.readFileSync(path.join(root,'index.html'),'utf8');html=patch(html,'<footer>',`<details class="card"><summary>C++实战与分析范围</summary><p>实战可集中计算部分候选，显示精算候选数和主深度；没有显示的走法不代表已被排除。点击“分析当前局面”仍搜索全候选。更深的局部结果不保证比全候选搜索更强。</p></details><footer>${experimental?'实验页面 · 尚未作为默认启用 · ':''}`);fs.writeFileSync(path.join(root,'index.html'),html);return root;
}
export async function previewModule(){let s=serverSource();for(const f of['./build.mjs','./bridge.mjs','../engine.js','../editor.js'])s=s.replaceAll(`'${f}'`,JSON.stringify(new URL(f,import.meta.url).href));return import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));}
