import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir,cpus} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {initial,publicState,names} from '../engine.js';
import {seeded} from '../ai.js';
const require=createRequire(import.meta.url);let pw;for(const spec of['playwright-core',process.env.PLAYWRIGHT_CORE_PATH].filter(Boolean)){try{pw=require(spec);break;}catch{}}
if(!pw)throw Error('请通过PLAYWRIGHT_CORE_PATH指定已安装的playwright-core；不会自动安装');
const baseURL=process.env.JIEQI_URL||'http://127.0.0.1:8766/',output=process.env.JIEQI_CPP_BROWSER_OUTPUT||'browser-evidence-cpp-replay';await fs.mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'jieqi-cpp-ui-'));
const browser=await pw.chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,chromiumSandbox:true,ignoreDefaultArgs:true,args:['--headless','--remote-debugging-pipe','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`]});
const result={startedAt:new Date().toISOString(),browser:browser.version(),cpu:cpus()[0].model,architecture:process.arch,baseURL,tests:[],timings:[],errors:[],passed:false};
const page=await browser.newPage({viewport:{width:1280,height:1100}});
page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
const cell=i=>page.locator(`[data-index="${i}"]`),snapshot=()=>page.locator('.cell').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')).join('|'));
const status=()=>page.locator('#status').innerText(),passed=(name,detail={})=>{result.tests.push({name,passed:true,...detail});console.log('PASS '+name);};
async function idle(){await page.waitForFunction(()=>document.getElementById('stop').disabled,null,{timeout:20000});}
async function noProcess(){await page.waitForFunction(async()=>!(await(await fetch('/api/status')).json()).active,null,{timeout:3000});}
async function instrumentation(){await page.evaluate(async()=>{
 window.__engineChecks={requests:[],events:[]};
 const {NativeWorker}=await import('./native-client.js'),post=NativeWorker.prototype.postMessage;
 NativeWorker.prototype.postMessage=function(data){const start=performance.now(),index=window.__engineChecks.requests.push({engine:'cpp',start,view:data.view,timeMs:data.timeMs})-1,handler=this.onmessage;this.onmessage=e=>{window.__engineChecks.events.push({index,at:performance.now(),progress:!!e.data.progress,result:e.data.result});handler?.(e);};return post.call(this,data);};
 const WorkerOriginal=window.Worker;window.Worker=class extends WorkerOriginal{constructor(...args){super(...args);this.addEventListener('message',e=>{window.__engineChecks.events.push({index:this.__index,at:performance.now(),progress:!!e.data.progress,result:e.data.result});});}postMessage(data){this.__index=window.__engineChecks.requests.push({engine:'js',start:performance.now(),view:data.view,timeMs:data.timeMs})-1;super.postMessage(data);}};
 });}
async function fresh(){await page.goto(baseURL,{waitUntil:'networkidle'});await instrumentation();}
async function beginHuman(){await cell(54).click();await cell(45).click();await page.waitForFunction(()=>document.getElementById('status').textContent==='搜索中…');}
async function progressAfter(count){await page.waitForFunction(n=>window.__engineChecks.events.filter(x=>x.progress).length>n,count,{timeout:3000});}
async function edit(view){await page.locator('#editMode').click();await page.locator('#clear').click();await page.evaluate(({view,names})=>{
  const $=id=>document.getElementById(id),palette=label=>[...$('palette').children].find(e=>e.textContent===label);
  for(let i=0;i<90;i++){const p=view.board[i];if(!p)continue;palette((p.side==='r'?'红':'黑')+(p.hidden?'暗':names[p.side][p.type])).click();document.querySelector(`[data-index="${i}"]`).click();}
  for(const side of['r','b']){$(side==='r'?'deadRed':'deadBlack').value=view.captured.filter(p=>p.side===side&&!p.hidden).map(p=>p.type).join('');}
  $('turn').value=view.turn;$('turn').dispatchEvent(new Event('change'));
 },{view,names});assert.equal(await page.locator('#pool .error').count(),0);}
async function analyze(engine,budget){await page.selectOption('#engine',engine);await page.selectOption('#time',String(budget));await page.locator('#analyze').click();await idle();const checks=await page.evaluate(()=>window.__engineChecks),index=checks.requests.length-1,request=checks.requests[index],events=checks.events.filter(e=>e.index===index);assert.equal(request.engine,engine);const final=events.findLast(e=>!e.progress)?.result||events.findLast(e=>e.progress)?.result;assert(final?.depth>0);assert.equal(final.engine,engine==='cpp'?'cpp-native':'javascript');assert.equal(final.engineVerified,true);assert.match(await page.locator('#engineStatus').innerText(),engine==='cpp'?/C\+\+ 核心已确认/:/JavaScript Worker/);return{request,events,final};}
try{
 await fresh();assert.equal(await page.locator('#engine').inputValue(),'cpp');assert.equal(await page.locator('.cell').count(),90);assert.equal(await page.locator('.piece.hidden').count(),30);const startBoard=await snapshot();result.service=await(await fetch(baseURL+'api/status')).json();
 await page.selectOption('#time','1000');await beginHuman();await cell(56).click();await cell(47).click();await idle();assert.equal(await page.locator('#counter').innerText(),'第 2 回合');let checks=await page.evaluate(()=>window.__engineChecks);assert.equal(checks.requests.length,1);assert.equal(checks.requests[0].engine,'cpp');assert(checks.events.some(e=>e.progress&&e.result.engine==='cpp-native'));assert((await page.locator('#analysis').getAttribute('hidden'))!==null);await noProcess();await page.screenshot({path:join(output,'01-cpp-game.png'),fullPage:true});passed('默认C++人机对战、实际核心确认、重复点击、对手分析不外泄');
 await page.locator('#undo').click();assert.equal(await snapshot(),startBoard);await page.selectOption('#time','15000');let count=checks.events.filter(e=>e.progress).length;await beginHuman();await progressAfter(count);result.responsiveness={frameMs:await page.evaluate(async()=>{const t=performance.now();await new Promise(requestAnimationFrame);return performance.now()-t;})};const undoStarted=Date.now();await page.locator('#undo').click();result.responsiveness.undoClickMs=Date.now()-undoStarted;await noProcess();assert.equal(await snapshot(),startBoard);await page.waitForTimeout(150);assert.equal(await status(),'轮到你走');passed('C++思考中悔棋，终止子进程，无迟到落子');
 count=await page.evaluate(()=>window.__engineChecks.events.filter(e=>e.progress).length);await beginHuman();await progressAfter(count);await page.locator('#reset').click();await noProcess();assert.equal(await page.locator('.piece.hidden').count(),30);assert.equal(await status(),'轮到你走');passed('C++思考中重开取消进程并恢复30暗子');
 await page.locator('#editMode').click();const analysis=await analyze('cpp',1000);assert.equal(analysis.final.candidates.length,5);assert.equal(analysis.final.samples,8);assert(analysis.events.filter(e=>e.progress).every((e,i)=>e.result.depth===i+1));await page.screenshot({path:join(output,'02-cpp-analysis.png'),fullPage:true});const cacheCount=await page.evaluate(()=>window.__engineChecks.requests.length);await page.locator('#analyze').click();assert.equal(await page.evaluate(()=>window.__engineChecks.requests.length),cacheCount);assert.match(await page.locator('#message').innerText(),/复用/);await analyze('js',1000);assert.equal(await page.evaluate(()=>window.__engineChecks.requests.length),cacheCount+1);passed('流式完整层、五候选、分析缓存按引擎隔离、明确JavaScript回退');
 await page.selectOption('#engine','cpp');await page.locator('#reset').click();await page.locator('#autoMode').click();await page.selectOption('#time','1000');await page.locator('#autoToggle').click();await page.waitForFunction(()=>Number(document.getElementById('counter').textContent.match(/已走(\d+)步/)?.[1])>=4,null,{timeout:15000});await page.locator('#autoToggle').click();await noProcess();const paused=await snapshot(),counter=await page.locator('#counter').innerText();await page.waitForTimeout(600);assert.equal(await snapshot(),paused);checks=await page.evaluate(()=>window.__engineChecks);for(const request of checks.requests.filter(x=>x.engine==='cpp')){assert.equal(request.view.viewer,request.view.turn);assert(request.view.board.every(p=>!p?.hidden||!('type'in p)));assert(request.view.captured.every(p=>!p.hidden||!('type'in p)));}await page.locator('#autoStep').click();await idle();assert.notEqual(await page.locator('#counter').innerText(),counter);assert.match(await status(),/已暂停/);passed('C++双方自动对战至少4手、暂停、单步、双方私人观察隔离');
 await page.selectOption('#time','15000');count=await page.evaluate(()=>window.__engineChecks.events.filter(e=>e.progress).length);await page.locator('#autoToggle').click();await progressAfter(count);await page.locator('#undo').click();await noProcess();assert.match(await status(),/已暂停/);count=await page.evaluate(()=>window.__engineChecks.events.filter(e=>e.progress).length);await page.locator('#autoToggle').click();await progressAfter(count);await page.locator('#reset').click();await noProcess();assert.equal(await page.locator('#counter').innerText(),'第 1 回合 · 已走0步');passed('C++自动对战思考中悔棋/重开，停止循环及子进程');
 // Simulate a service fault only here: no automatic fallback and no unverified move.
 await page.route('**/api/search',route=>route.fulfill({status:200,headers:{'Content-Type':'application/x-ndjson','X-Engine':'cpp-native'},body:JSON.stringify({error:'测试注入：本机核心不可用'})+'\n'}));await page.locator('#autoStep').click();await idle();assert.match(await page.locator('#message').innerText(),/核心不可用/);assert.equal(await page.locator('#counter').innerText(),'第 1 回合 · 已走0步');assert.equal(await page.locator('#engine').inputValue(),'cpp');await page.unroute('**/api/search');passed('故障注入：C++服务出错明确停止，无暗中切换或落子');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(output,'03-cpp-mobile.png'),fullPage:true});await page.setViewportSize({width:1280,height:1100});passed('移动视口引擎选择与棋盘无横向溢出');
 // Actual browser end-to-end timings, cold search process/Worker every run.
 const mid=JSON.parse(await fs.readFile('benchmarks/strength-positions.json','utf8'))[1].view;
 const ending={...initial(),board:Array(90).fill(null),captured:[]};for(const[i,side,type]of[[85,'r','K'],[4,'b','K'],[49,'r','P'],[72,'r','R'],[65,'r','N'],[83,'r','B'],[17,'b','R'],[24,'b','N'],[40,'b','P'],[6,'b','B']])ending.board[i]={side,type,role:type,hidden:false};
 const positions=[{name:'开局',view:publicState(initial(seeded(17)),'r')},{name:'中局2111/20',view:mid},{name:'全明10子残局',view:publicState(ending,'r')}];
 // One unrecorded warm-up per implementation, then alternate order over two repeats.
 await fresh();await edit(positions[0].view);await analyze('cpp',1000);await analyze('js',1000);
 for(let repeat=0;repeat<2;repeat++)for(const [i,p]of positions.entries())for(const budget of(p.name==='开局'?[1000,6000]:[1000])){
  await fresh();await edit(p.view);let inputHash;
  for(const engine of((repeat+i)%2?['js','cpp']:['cpp','js'])){
   const {request,events,final}=await analyze(engine,budget),end=events.at(-1),progress=events.filter(x=>x.progress),observed=JSON.stringify(request.view),sha=createHash('sha256').update(observed).digest('hex');if(inputHash)assert.equal(sha,inputHash);else inputHash=sha;
   const row={position:p.name,repeat,engine,budgetMs:budget,depth:final.depth,samples:final.samples,nodes:final.nodes,seed:final.seed,move:final.move,score:final.score,sourceSha256:final.sourceSha256??null,observationSha256:sha,engineVerified:final.engineVerified,firstProgressMs:progress[0]?.at-request.start,endToEndMs:end.at-request.start,coreMs:final.elapsedMs,completeDepths:progress.map(x=>x.result.depth)};
   result.timings.push(row);console.log(JSON.stringify(row));await fs.writeFile(join(output,'results.json'),JSON.stringify(result,null,2)+'\n');await noProcess();
  }
 }
 passed('真实浏览器开局/中局/残局端到端计时：两次轮换、同公开输入/预算/样本');assert.deepEqual(result.errors,[]);result.passed=true;
}catch(error){result.failure=error.stack;console.error(error.stack);process.exitCode=1;await page.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});}
finally{result.finishedAt=new Date().toISOString();await fs.writeFile(join(output,'results.json'),JSON.stringify(result,null,2)+'\n');await browser.close();await fs.rm(profile,{recursive:true,force:true});}
