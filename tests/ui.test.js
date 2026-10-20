import test from 'node:test';import assert from 'node:assert/strict';
class Element{constructor(){this.children=[];this.value='';this.disabled=false;this.hidden=false;this.checked=false;this.style={};this.offsetWidth=280;this.offsetHeight=280;this.textContent='';this.className='';this.dataset={};this.classList={toggle:()=>{},add:()=>{},remove:()=>{}};}append(...e){this.children.push(...e);}replaceChildren(...e){this.children=e;}setAttribute(k,v){this[k]=v;}getBoundingClientRect(){if(this.bounds)return this.bounds;if(this.dataset.index!==undefined){const i=Number(this.dataset.index);return {left:i%9*60,top:Math.floor(i/9)*60,width:60,height:60};}return {left:0,top:0,width:600,height:666};}querySelectorAll(){return this.children;}}
let cleanupPrevious=null;
async function setup(){cleanupPrevious?.();const elements=new Map();globalThis.document={getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:()=>new Element()};let workers=[];globalThis.Worker=class{constructor(){workers.push(this);}postMessage(data){this.data=data;}terminate(){this.terminated=true;}};await import('../app.js?test='+Math.random());let $=id=>document.getElementById(id);$('time').value='6000';cleanupPrevious=()=>{if(!$('stop').disabled)$('stop').onclick();};return {$,workers,click:i=>$('board').children[i].onclick()};}
test('连续重复点击在思考期间不会重复走子，发往Worker的身份已脱敏',async()=>{let {$,workers,click}=await setup();click(54);click(45);assert.equal(workers.length,1);for(let p of workers[0].data.view.board)if(p?.hidden)assert(!('type'in p));click(56);click(47);assert.equal(workers.length,1);assert.equal($('counter').textContent,'第 1 回合');assert.equal($('status').textContent,'搜索中…');});
test('思考中重开会终止线程，旧响应无法污染新局',async()=>{let {$,workers,click}=await setup();click(54);click(45);let w=workers[0];$('reset').onclick();assert(w.terminated);w.onmessage({data:{id:w.data.id,result:{move:{from:0,to:9}}}});assert.equal($('status').textContent,'轮到你走');assert.equal($('board').children[54].children[0].textContent,'');assert.equal($('board').children[45].children.length,0);});
test('思考中悔棋会恢复暗子且丢弃过期进度',async()=>{let {$,workers,click}=await setup();click(54);click(45);let w=workers[0];$('undo').onclick();assert(w.terminated);w.onmessage({data:{id:w.data.id,progress:true,result:{}}});assert.equal($('status').textContent,'轮到你走');assert.equal($('board').children[54].children[0].textContent,'');assert($('analysis').hidden);});
test('分析结果展示评分和候选着法；切换模式中止分析',async()=>{let {$,workers}=await setup();$('editMode').onclick();$('turn').value='r';$('analyze').onclick();let w=workers[0];assert(w.data.view.board.every(p=>!p?.hidden||!('type'in p)));w.onmessage({data:{id:w.data.id,result:{move:{from:54,to:45},candidates:[{from:54,to:45,score:30,spread:90}],score:30,depth:2,samples:4,nodes:1000,elapsedMs:1000}}});assert(!$('analysis').hidden);assert.match($('report').children[0].textContent,/红方 \+30/);assert.match($('report').children[1].textContent,/启发式胜率/);assert(!$('apply').disabled);$('apply').onclick();assert.match($('message').textContent,/实际揭开的身份/);$('playMode').onclick();assert($('analysis').hidden);});
test('编辑器可清空、放置明暗棋，非法局面不启动搜索',async()=>{let {$,workers,click}=await setup();$('editMode').onclick();$('clear').onclick();$('analyze').onclick();assert.equal(workers.length,0);click(85);let redKing=$('palette').children.find(b=>b['aria-label']==='红帅');redKing.onclick();click(54);let dark=$('palette').children.find(b=>b['aria-label']==='红暗');dark.onclick();assert.equal($('board').children[54].children[0].textContent,'');click(40);dark.onclick();assert.match($('paintError').textContent,/原位/);$('cancelPaint').onclick();});

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function reply(worker,chosen){const {legalMoves}=await import('../engine.js');let move=chosen||legalMoves(worker.data.view)[0];worker.onmessage({data:{id:worker.data.id,result:{move,candidates:[],score:0,depth:1,samples:4,nodes:100,elapsedMs:20}}});}
test('机器单步仅走当前一方，不启动循环，双方快照均无暗子真身',async()=>{let {$,workers}=await setup();$('autoMode').onclick();assert.match($('status').textContent,/红方待走.*已暂停/);$('autoStep').onclick();assert.equal(workers[0].data.view.turn,'r');await reply(workers[0],{from:54,to:45});assert.match($('status').textContent,/黑方待走.*已暂停/);await delay(350);assert.equal(workers.length,1);$('autoStep').onclick();assert.equal(workers[1].data.view.turn,'b');for(let p of workers[1].data.view.board)if(p?.hidden)assert(!('type'in p));$('stop').onclick();});
test('机器循环交替红黑；间歇暂停取消下一步且保留棋盘；继续从当前方搜索',async()=>{let {$,workers}=await setup();$('autoMode').onclick();$('autoToggle').onclick();await reply(workers[0],{from:54,to:45});await delay(350);assert.equal(workers.length,2);assert.equal(workers[1].data.view.turn,'b');await reply(workers[1]);let counter=$('counter').textContent;$('autoToggle').onclick();await delay(350);assert.equal(workers.length,2);assert.equal($('counter').textContent,counter);assert.match($('status').textContent,/红方待走.*已暂停/);$('autoToggle').onclick();assert.equal(workers.length,3);assert.equal(workers[2].data.view.turn,'r');$('stop').onclick();assert.equal($('counter').textContent,counter);assert(workers[2].terminated);});
test('自动对战思考中重开保留观战模式并暂停，旧结果不能落子',async()=>{let {$,workers}=await setup();$('autoMode').onclick();$('autoToggle').onclick();let w=workers[0];$('reset').onclick();assert(w.terminated);await reply(w,{from:54,to:45});assert.match($('status').textContent,/红方待走.*已暂停/);assert.equal($('counter').textContent,'第 1 回合 · 已走0步');assert.equal($('board').children[54].children[0].textContent,'');});
test('自动对战悔棋只退一步，暂停后从黑方继续',async()=>{let {$,workers}=await setup();$('autoMode').onclick();$('autoStep').onclick();await reply(workers[0],{from:54,to:45});$('autoStep').onclick();await reply(workers[1]);$('undo').onclick();assert.equal($('counter').textContent,'第 1 回合 · 已走1步');assert.match($('status').textContent,/黑方待走.*已暂停/);$('autoToggle').onclick();assert.equal(workers[2].data.view.turn,'b');$('stop').onclick();});
test('自动对战切换编辑模式取消下一步定时器，计算失败也会停止循环',async()=>{let {$,workers}=await setup();$('autoMode').onclick();$('autoToggle').onclick();await reply(workers[0],{from:54,to:45});$('editMode').onclick();await delay(350);assert.equal(workers.length,1);assert.match($('status').textContent,/对局辅助/);$('autoMode').onclick();$('autoToggle').onclick();let w=workers[1];w.onmessage({data:{id:w.data.id,error:'模拟搜索失败'}});assert.match($('message').textContent,/线程异常/);assert.equal($('autoToggle').textContent,'开始自动对战');await delay(350);assert.equal(workers.length,2);});
test('暗子棋面留白，同时保留阵营、首步角色的可访问标签',async()=>{let {$}=await setup();let dark=$('board').children[54],king=$('board').children[85];assert.equal(dark.children[0].textContent,'');assert.match(dark['aria-label'],/红暗子，首步按兵/);assert.equal(king.children[0].textContent,'帅');$('editMode').onclick();assert.equal($('board').children[54].children[0].textContent,'');});
test('相同公开局面与预算的完整分析复用缓存，不重启Worker',async()=>{let {$,workers}=await setup();$('analyze').onclick();let w=workers[0];w.onmessage({data:{id:w.data.id,result:{move:{from:54,to:45},candidates:[],score:10,depth:2,samples:8,nodes:1000,elapsedMs:600}}});$('analyze').onclick();assert.equal(workers.length,1);assert.match($('message').textContent,/复用相同公开局面/);$('time').value='15000';$('analyze').onclick();assert.equal(workers.length,2);$('stop').onclick();});
test('人机暗俘显示只用红方信息，黑方Worker不收到其被吃暗子真身',async()=>{const {$,workers,click}=await setup();click(64);click(1);const black=workers[0];assert.equal(black.data.view.viewer,'b');assert.equal(black.data.view.captured[0].hidden,true);assert(!('type'in black.data.view.captured[0]));assert.match($('captured').textContent,/暗俘，仅吃子方可见/);black.onmessage({data:{id:black.data.id,progress:true,result:{score:987,depth:1,candidates:[],samples:1,nodes:1,elapsedMs:1}}});assert($('analysis').hidden,'不得展示对手私人信息产生的搜索分析');await reply(black,{from:25,to:88});assert.match($('captured').textContent,/红暗子（身份未知）/);assert($('viewSide').disabled);$('analyze').onclick();const red=workers.at(-1);assert.equal(red.data.view.viewer,'r');assert(red.data.view.captured[0].type);assert(!('type'in red.data.view.captured[1]));$('stop').onclick();$('undo').onclick();assert.equal($('captured').textContent,'暂无');});
test('观战切换视角只改变显示，不改变正在搜索一方的信息；编辑沿用所选视角',async()=>{const {$,workers}=await setup();$('autoMode').onclick();$('autoStep').onclick();await reply(workers[0],{from:64,to:1});$('autoStep').onclick();await reply(workers[1],{from:25,to:88});$('viewSide').value='r';$('viewSide').onchange();assert.match($('captured').textContent,/红暗子（身份未知）/);$('autoStep').onclick();const current=workers.at(-1),payload=structuredClone(current.data.view);$('viewSide').value='b';$('viewSide').onchange();assert.deepEqual(current.data.view,payload);assert.equal(current.data.view.viewer,'r');assert.match($('captured').textContent,/黑暗子（身份未知）/);assert(!/红暗子（身份未知）/.test($('captured').textContent));$('stop').onclick();$('editMode').onclick();assert($('deadRed').value);assert.equal($('deadBlack').value,'');$('turn').value='b';$('analyze').onclick();assert.equal(workers.at(-1).data.view.viewer,'b');assert(workers.at(-1).data.view.captured.some(p=>p.side==='r'&&p.type));$('stop').onclick();});
test('C++连接失败明确停止，手动选择JavaScript才恢复黑方搜索',async()=>{
 const {$,workers,click}=await setup();$('engine').value='cpp';click(54);click(45);await delay(30);
 assert.equal(workers.length,0,'连接失败不得暗中启动JavaScript搜索');assert.match($('message').textContent,/搜索线程异常/);assert.match($('engineStatus').textContent,/C\+\+.*失败/);assert.equal($('status').textContent,'轮到电脑');
 $('engine').value='js';$('engine').onchange();assert.equal(workers.length,1);assert.equal(workers[0].data.view.turn,'b');await reply(workers[0]);assert.equal($('status').textContent,'轮到你走');
});
test('自动对战逐层显示当前方推荐，落子后明确标记，下一方搜索前清除旧层',async()=>{
 const {$,workers}=await setup();$('autoMode').onclick();$('autoToggle').onclick();const w=workers[0];
 assert(!$('analysis').hidden);assert.match($('report').children[0].textContent,/等待第一层/);
 w.onmessage({data:{id:w.data.id,progress:true,result:{move:{from:54,to:45},candidates:[{from:54,to:45,score:30,spread:2}],score:30,depth:2,samples:8,nodes:500,elapsedMs:100}}});
 assert.match($('report').children[2].textContent,/推荐：暗兵.*→/);assert.match($('report').children[1].textContent,/深度 2.*搜索中/);assert($('apply').disabled);
 await reply(w,{from:54,to:45});assert.match($('analysisTitle').textContent,/红方.*已落子/);
 await delay(350);assert.equal(workers.length,2);assert.equal($('viewSide').value,'b');assert.match($('report').children[0].textContent,/黑方.*等待第一层/);
 $('reset').onclick();assert($('analysis').hidden);assert.equal($('report').children.length,0);
});
test('自动搜索不会跨信息视角显示，旧进度不能污染重开或悔棋',async()=>{
 const {$,workers}=await setup();$('autoMode').onclick();$('autoStep').onclick();const w=workers[0];
 $('viewSide').value='b';$('viewSide').onchange();
 const progress={id:w.data.id,progress:true,result:{move:{from:54,to:45},candidates:[],score:1,depth:1,samples:8,nodes:10,elapsedMs:5}};
 w.onmessage({data:progress});assert($('analysis').hidden);$('reset').onclick();w.onmessage({data:progress});assert($('analysis').hidden);
});
test('辅助盘可以应用暗子推荐，补录揭子后同步、撤回、重开不改原游戏',async()=>{
 const {$,workers}=await setup();$('editMode').onclick();$('analyze').onclick();const w=workers[0];
 await reply(w,{from:54,to:45});assert(!$('apply').disabled);$('apply').onclick();assert(!$('syncPrompt').hidden);
 $('confirmSync').onclick();assert.match($('syncError').textContent,/实际揭开/);assert.equal($('board').children[45].children.length,0);
 $('revealType').value='R';$('confirmSync').onclick();$('confirmSync').onclick();assert($('syncPrompt').hidden);assert.equal($('board').children[45].children[0].textContent,'车');assert.equal($('turn').value,'b');assert.match($('counter').textContent,/已同步 1 步/);
 $('undo').onclick();assert.equal($('board').children[54].children[0].textContent,'');assert.equal($('board').children[45].children.length,0);assert.equal($('turn').value,'r');
 $('playMode').onclick();assert.equal($('board').children[45].children.length,0);
});
test('辅助盘按走法点击双方、补录己方暗俘，搜索输入保留正确私有可见性',async()=>{
 const {$,workers,click}=await setup();$('editMode').onclick();click(64);click(1);assert(!$('captureLabel').hidden);assert(!$('revealLabel').hidden);
 $('revealType').value='C';$('captureType').value='N';$('confirmSync').onclick();click(25);click(88);assert($('captureLabel').hidden);
 $('revealType').value='R';$('confirmSync').onclick();$('analyze').onclick();const view=workers.at(-1).data.view;
 assert.equal(view.viewer,'r');assert.equal(view.captured[0].type,'N');assert.equal(view.captured[0].wasHidden,true);assert.equal(view.captured[1].hidden,true);assert(!('type'in view.captured[1]));assert.equal(view.ply,2);$('stop').onclick();
});
test('普通分析完成后可直接将推荐送入辅助盘，黑方执棋可翻转与标准开局',async()=>{
 const {$,workers}=await setup();$('analyze').onclick();await reply(workers[0],{from:54,to:45});assert(!$('apply').disabled);$('apply').onclick();assert(!$('syncPrompt').hidden);
 $('cancelSync').onclick();$('assistSide').value='b';$('assistSide').onchange();$('freshDraft').onclick();assert.match($('counter').textContent,/你执黑/);assert.equal($('turn').value,'r');$('flipBoard').onclick();
});
test('辅助盘摆放修正不把私有暗俘变成公开身份，重置会取消待补录并可撤回',async()=>{
 const {$,workers,click}=await setup();$('editMode').onclick();click(64);click(1);$('revealType').value='C';$('captureType').value='N';$('confirmSync').onclick();
 $('inputMethod').value='paint';$('inputMethod').onchange();click(27);$('assistSide').value='b';$('assistSide').onchange();$('analyze').onclick();
 const view=workers.at(-1).data.view;assert(view.captured.filter(p=>p.side==='b').every(p=>p.hidden&&!('type'in p)));$('stop').onclick();
 $('freshDraft').onclick();$('inputMethod').value='sync';click(54);click(45);assert(!$('syncPrompt').hidden);$('reset').onclick();assert($('syncPrompt').hidden);assert.equal($('board').children[45].children.length,0);assert.match($('status').textContent,/对局辅助/);$('confirmSync').onclick();assert.equal($('board').children[45].children.length,0);$('undo').onclick();assert.match($('status').textContent,/对局辅助/);
});
test('辅助盘开启自动分析后进入即搜索，完成后仅推荐而不自动落子或循环',async()=>{
 const {$,workers}=await setup();$('autoAnalyze').checked=true;$('editMode').onclick();
 assert.equal(workers.length,0);assert(!$('stop').disabled);await delay(350);assert.equal(workers.length,1);
 await reply(workers[0],{from:54,to:45});assert.match($('counter').textContent,/已同步 0 步/);assert(!$('apply').disabled);
 await delay(350);assert.equal(workers.length,1);$('autoAnalyze').checked=false;$('autoAnalyze').onchange();
});
test('自动分析等待揭子和暗俘补录完成，只搜索新的脱敏观察',async()=>{
 const {$,workers,click}=await setup();$('editMode').onclick();click(64);click(1);
 $('autoAnalyze').checked=true;$('autoAnalyze').onchange();await delay(350);assert.equal(workers.length,0);
 $('confirmSync').onclick();await delay(350);assert.equal(workers.length,0);
 $('revealType').value='C';$('captureType').value='N';$('confirmSync').onclick();await delay(350);assert.equal(workers.length,1);
 const view=workers[0].data.view;assert.equal(view.turn,'b');assert.equal(view.viewer,'r');assert.equal(view.captured[0].type,'N');assert(view.board.every(p=>!p?.hidden||!('type'in p)));
 $('stop').onclick();assert.equal($('autoAnalyze').checked,false);assert(workers[0].terminated);
});
test('连续修改防抖只启动最新预算，修改后丢弃旧结果，非法局面不启动',async()=>{
 const {$,workers}=await setup();$('autoAnalyze').checked=true;$('editMode').onclick();
 for(const value of ['1000','2000','15000']){$('time').value=value;$('time').onchange();}
 await delay(350);assert.equal(workers.length,1);assert.equal(workers[0].data.timeMs,15000);const old=workers[0];
 $('time').value='6000';$('time').onchange();assert(old.terminated);await reply(old,{from:54,to:45});assert($('analysis').hidden);
 await delay(350);assert.equal(workers.length,2);assert.equal(workers[1].data.timeMs,6000);
 $('deadRed').value='X';$('deadRed').onchange();assert(workers[1].terminated);await delay(350);assert.equal(workers.length,2);assert($('analysis').hidden);
 $('stop').onclick();
});
test('自动分析可在等待期关闭；切换模式或停止不会迟到启动',async()=>{
 const {$,workers}=await setup();$('autoAnalyze').checked=true;$('editMode').onclick();$('stop').onclick();
 await delay(350);assert.equal(workers.length,0);assert.equal($('autoAnalyze').checked,false);
 $('autoAnalyze').checked=true;$('autoAnalyze').onchange();$('playMode').onclick();await delay(350);assert.equal(workers.length,0);
 $('editMode').onclick();await delay(350);assert.equal(workers.length,1);$('autoAnalyze').checked=false;$('autoAnalyze').onchange();assert(workers[0].terminated);
 await reply(workers[0]);assert($('analysis').hidden);await delay(350);assert.equal(workers.length,1);
});
test('撤回与重置会取消旧自动搜索并更新局面，暂停后不再自动恢复',async()=>{
 const {$,workers,click}=await setup();$('editMode').onclick();click(54);click(45);$('revealType').value='R';$('confirmSync').onclick();
 $('autoAnalyze').checked=true;$('autoAnalyze').onchange();await delay(350);assert.equal(workers.length,1);assert.equal(workers[0].data.view.ply,1);
 $('undo').onclick();assert(workers[0].terminated);await delay(350);assert.equal(workers.length,2);assert.equal(workers[1].data.view.ply,0);
 $('reset').onclick();assert(workers[1].terminated);await reply(workers[1]);assert($('analysis').hidden);await delay(350);assert.equal(workers.length,3);
 $('stop').onclick();$('reset').onclick();await delay(350);assert.equal(workers.length,3);
});
test('同步推荐时棋盘用箭头标出起点与落点，补录期间保留，确认后消失',async()=>{
 const {$,workers}=await setup();$('editMode').onclick();$('analyze').onclick();await reply(workers[0],{from:54,to:45});$('apply').onclick();
 assert.match($('board').children[54].className,/move-from/);assert.equal($('board').children[54].dataset.moveLabel,'起点');
 assert.match($('board').children[45].className,/move-to/);assert.equal($('board').children[45].dataset.moveLabel,'落点');
 assert.match($('moveHint').textContent,/待同步：红暗兵.*1列7行 → 1列6行/);assert(!$('moveHint').hidden);
 assert(!$('moveArrowLayer').hidden);assert($('moveArrow').y1>$('moveArrow').y2);$('revealType').value='R';$('confirmSync').onclick();assert($('moveHint').hidden);assert($('moveArrowLayer').hidden);assert(!/move-from|move-to/.test($('board').children[54].className));
 $('undo').onclick();assert($('moveHint').hidden);assert(!/move-from|move-to/.test($('board').children[54].className));
});
test('取消待同步推荐与重置会清除标记，翻转棋盘不改变起终点',async()=>{
 const {$,workers}=await setup();$('editMode').onclick();$('analyze').onclick();await reply(workers[0],{from:54,to:45});$('apply').onclick();
 const hint=$('moveHint').textContent;const x=$('moveArrow').x1,y=$('moveArrow').y1;$('flipBoard').onclick();assert.equal($('moveArrow').x1,x);assert.equal($('moveArrow').y1,y);assert.equal($('moveHint').textContent,hint);assert.match($('board').children[54].className,/move-from/);
 $('cancelSync').onclick();assert($('moveHint').hidden);assert($('moveArrowLayer').hidden);assert.equal($('board').children[54].children[0].textContent,'');
 $('reset').onclick();assert($('moveHint').hidden);
});
test('明子推荐也先展示箭头等待确认，确认后清除并自动分析新局面',async()=>{
 const {$,workers,click}=await setup();$('editMode').onclick();click(54);click(45);$('revealType').value='R';$('confirmSync').onclick();
 click(27);click(36);$('revealType').value='P';$('confirmSync').onclick();$('analyze').onclick();await reply(workers[0],{from:45,to:46});
 $('autoAnalyze').checked=true;$('autoAnalyze').onchange();$('apply').onclick();assert(!$('moveArrowLayer').hidden);assert($('revealLabel').hidden);assert($('captureLabel').hidden);
 assert($('moveArrow').x1<$('moveArrow').x2);assert.equal($('moveArrow').y1,$('moveArrow').y2);await delay(350);assert.equal(workers.length,1);assert.equal($('board').children[45].children[0].textContent,'车');
 $('confirmSync').onclick();assert($('moveArrowLayer').hidden);assert($('moveHint').hidden);assert.equal($('board').children[46].children[0].textContent,'车');await delay(350);assert.equal(workers.length,2);assert.equal(workers[1].data.view.board[46].type,'R');$('stop').onclick();
});
test('搜索箭头随完整层推荐更新，结束后保留，确认同步后立即清除',async()=>{
 const {$,workers}=await setup();$('editMode').onclick();$('analyze').onclick();const w=workers[0];assert($('moveArrowLayer').hidden);
 const send=(depth,move,progress=true)=>w.onmessage({data:{id:w.data.id,...(progress?{progress:true}:{}),result:{move,candidates:[],score:depth,depth,samples:8,nodes:100*depth,elapsedMs:10*depth}}});
 send(1,{from:54,to:45});assert(!$('moveArrowLayer').hidden);assert.equal($('moveArrowLayer').dataset.phase,'searching');const first=$('moveArrow').x1;assert.match($('moveHint').textContent,/搜索推荐：红暗兵.*1列7行 → 1列6行/);assert.match($('counter').textContent,/已同步 0 步/);
 send(2,{from:56,to:47});assert($('moveArrow').x1>first);assert.match($('board').children[56].className,/move-from/);assert(!/move-from/.test($('board').children[54].className));
 send(3,{from:58,to:49},false);assert.match($('moveHint').textContent,/^推荐：.*5列7行 → 5列6行/);assert(!$('moveArrowLayer').hidden);assert.equal($('moveArrowLayer').dataset.phase,'ready');$('apply').onclick();assert.match($('moveHint').textContent,/待同步/);assert.equal($('moveArrowLayer').dataset.phase,'confirm');
 $('revealType').value='R';$('confirmSync').onclick();assert($('moveArrowLayer').hidden);assert($('moveHint').hidden);
});
test('新搜索、重置与过期进度不保留旧推荐箭头',async()=>{
 const {$,workers}=await setup();$('editMode').onclick();$('analyze').onclick();const old=workers[0];
 const message={id:old.data.id,progress:true,result:{move:{from:54,to:45},candidates:[],score:0,depth:1,samples:8,nodes:100,elapsedMs:10}};old.onmessage({data:message});assert(!$('moveArrowLayer').hidden);
 $('stop').onclick();$('time').value='2000';$('time').onchange();$('analyze').onclick();assert($('moveArrowLayer').hidden);old.onmessage({data:message});assert($('moveArrowLayer').hidden);
 const current=workers.at(-1);current.onmessage({data:{...message,id:current.data.id}});assert(!$('moveArrowLayer').hidden);$('reset').onclick();assert($('moveArrowLayer').hidden);current.onmessage({data:{...message,id:current.data.id}});assert($('moveArrowLayer').hidden);
});
test('自动对战仅显示当前信息视角的搜索箭头，落子后清除',async()=>{
 const {$,workers}=await setup();$('autoMode').onclick();$('autoStep').onclick();const w=workers[0],message={id:w.data.id,progress:true,result:{move:{from:54,to:45},candidates:[],score:0,depth:1,samples:8,nodes:100,elapsedMs:10}};
 w.onmessage({data:message});assert(!$('moveArrowLayer').hidden);$('viewSide').value='b';$('viewSide').onchange();assert($('moveArrowLayer').hidden);w.onmessage({data:message});assert($('moveArrowLayer').hidden);
 $('viewSide').value='r';$('viewSide').onchange();w.onmessage({data:message});assert(!$('moveArrowLayer').hidden);await reply(w,{from:54,to:45});assert($('moveArrowLayer').hidden);
});
test('补录只填写移动子即可确认，省略的暗俘保持未知并进入自动搜索',async()=>{
 const {$,workers,click}=await setup();$('editMode').onclick();click(64);click(1);$('autoAnalyze').checked=true;$('autoAnalyze').onchange();
 $('confirmSync').onclick();assert.match($('syncError').textContent,/实际揭开/);assert(!$('syncPrompt').hidden);
 $('revealType').value='C';$('confirmSync').onclick();assert($('syncPrompt').hidden);assert($('moveArrowLayer').hidden);assert.match($('captured').textContent,/黑暗子（身份未知）/);
 await delay(350);assert.equal(workers.length,1);const view=workers[0].data.view;assert.equal(view.board[1].type,'C');assert.equal(view.captured[0].hidden,true);assert(!('type'in view.captured[0]));$('stop').onclick();
});
test('补录浮层随推荐落点调整，不再固定在棋盘下方',async()=>{
 const {$,workers}=await setup();$('editMode').onclick();$('analyze').onclick();await reply(workers[0],{from:54,to:45});$('apply').onclick();
 const firstLeft=parseFloat($('syncPrompt').style.left);assert(firstLeft>=12);assert(parseFloat($('syncPrompt').style.top)>=12);$('cancelSync').onclick();
 $('time').value='2000';$('analyze').onclick();await reply(workers[1],{from:62,to:53});$('apply').onclick();assert(parseFloat($('syncPrompt').style.left)>firstLeft);assert(parseFloat($('syncPrompt').style.left)+280<=588);
 $('revealType').value='R';$('confirmSync').onclick();assert($('syncPrompt').hidden);assert($('moveArrowLayer').hidden);
});
test('补录浮层在窄屏和已滚动棋盘中限制宽高并保持在可视区域',async()=>{
 const previousWidth=globalThis.innerWidth,previousHeight=globalThis.innerHeight;
 try{
  globalThis.innerWidth=320;globalThis.innerHeight=360;const {$,workers}=await setup();$('board').bounds={left:10,top:-200,width:300,height:333};$('editMode').onclick();$('analyze').onclick();await reply(workers[0],{from:54,to:45});$('apply').onclick();
  const box=$('syncPrompt'),left=parseFloat(box.style.left)+10,top=parseFloat(box.style.top)-200;assert(left>=12);assert(left+parseFloat(box.style.maxWidth)<=308);assert(top>=12);assert(top+280<=348);assert(parseFloat(box.style.maxHeight)<=336);
  $('reset').onclick();assert(box.hidden);
 }finally{if(previousWidth===undefined)delete globalThis.innerWidth;else globalThis.innerWidth=previousWidth;if(previousHeight===undefined)delete globalThis.innerHeight;else globalThis.innerHeight=previousHeight;}
});
test('摆放模式点棋子即删除，点空位弹出图标添加，可逐次撤回',async()=>{
 const {$,click}=await setup();$('editMode').onclick();$('inputMethod').value='paint';$('inputMethod').onchange();click(54);assert.equal($('board').children[54].children.length,0);
 click(54);assert(!$('piecePicker').hidden);assert($('analyze').disabled);$('palette').children.find(b=>b['aria-label']==='红车').onclick();assert($('piecePicker').hidden);assert.equal($('board').children[54].children[0].textContent,'车');
 click(54);assert.equal($('board').children[54].children.length,0);$('undo').onclick();assert.equal($('board').children[54].children[0].textContent,'车');$('undo').onclick();assert.equal($('board').children[54].children.length,0);$('undo').onclick();assert.equal($('board').children[54].children[0].textContent,'');
});
test('添加暗子校验原位，选择过程中暂停自动分析，添加后仅传公开身份',async()=>{
 const {$,workers,click}=await setup();$('editMode').onclick();$('inputMethod').value='paint';$('inputMethod').onchange();click(54);click(40);$('autoAnalyze').checked=true;$('autoAnalyze').onchange();
 const dark=$('palette').children.find(b=>b['aria-label']==='红暗');dark.onclick();assert.match($('paintError').textContent,/原位/);assert(!$('piecePicker').hidden);await delay(350);assert.equal(workers.length,0);
 click(54);dark.onclick();assert($('piecePicker').hidden);assert.match($('board').children[54]['aria-label'],/首步按兵/);await delay(350);assert.equal(workers.length,1);assert(!('type'in workers[0].data.view.board[54]));$('stop').onclick();
});
test('取消添加不改变局面或撤回记录，重置后旧图标点击不能误加',async()=>{
 const {$,click}=await setup();$('editMode').onclick();$('inputMethod').value='paint';$('inputMethod').onchange();assert($('undo').disabled);click(40);assert(!$('piecePicker').hidden);$('cancelPaint').onclick();assert($('undo').disabled);assert.equal($('board').children[40].children.length,0);
 click(40);const stale=$('palette').children.find(b=>b['aria-label']==='红车');$('reset').onclick();assert($('piecePicker').hidden);stale.onclick();assert.equal($('board').children[40].children.length,0);
});
test('补录通过单击图标选身份，移动子必选，被吃子可切回未知',async()=>{
 const {$,click}=await setup();$('editMode').onclick();click(64);click(1);assert.equal($('revealChoices').children.length,6);assert.equal($('captureChoices').children.length,7);
 $('confirmSync').onclick();assert.match($('syncError').textContent,/实际揭开/);
 const r=$('revealChoices').children.find(b=>b.dataset.type==='R'),c=$('revealChoices').children.find(b=>b.dataset.type==='C');r.onclick();assert.equal($('revealType').value,'R');c.onclick();assert.equal(r['aria-pressed'],'false');assert.equal(c['aria-pressed'],'true');
 const n=$('captureChoices').children.find(b=>b.dataset.type==='N');n.onclick();assert.equal($('captureType').value,'N');n.onclick();assert.equal($('captureType').value,'');assert.equal($('captureChoices').children[0]['aria-pressed'],'true');
 $('confirmSync').onclick();assert($('syncPrompt').hidden);assert.equal($('board').children[1].children[0].textContent,'炮');assert.match($('captured').textContent,/黑暗子（身份未知）/);
});
test('辅助盘直接点击红黑与录入方式按钮切换，不依赖下拉菜单',async()=>{
 const {$,click}=await setup();$('editMode').onclick();assert.equal($('methodSync')['aria-pressed'],'true');$('methodPaint').onclick();assert.equal($('inputMethod').value,'paint');assert.equal($('methodSync')['aria-pressed'],'false');click(40);assert(!$('piecePicker').hidden);$('cancelPaint').onclick();
 $('methodSync').onclick();assert.equal($('inputMethod').value,'sync');$('turnBlack').onclick();assert.equal($('turn').value,'b');assert.equal($('turnBlack')['aria-pressed'],'true');assert.equal($('turnRed')['aria-pressed'],'false');
 $('assistBlack').onclick();assert.equal($('assistSide').value,'b');assert.equal($('viewSide').value,'b');assert.equal($('assistBlack')['aria-pressed'],'true');assert.match($('counter').textContent,/你执黑/);
});
test('按钮切换会更新自动分析视角，重复点当前选项不重启搜索',async()=>{
 const {$,workers}=await setup();$('autoAnalyze').checked=true;$('editMode').onclick();await delay(350);assert.equal(workers.length,1);$('turnRed').onclick();assert(!workers[0].terminated);
 $('turnBlack').onclick();assert(workers[0].terminated);await delay(350);assert.equal(workers.length,2);assert.equal(workers[1].data.view.turn,'b');assert.equal(workers[1].data.view.viewer,'r');
 $('assistBlack').onclick();assert(workers[1].terminated);await delay(350);assert.equal(workers.length,3);assert.equal(workers[2].data.view.viewer,'b');$('stop').onclick();
});
test('棋盘上下按吃子方展示图标，未知暗俘不泄露身份',async()=>{
 const {$,click}=await setup();assert.equal($('capturedTopPieces').children[0].textContent,'—');assert.equal($('capturedBottomPieces').children[0].textContent,'—');
 $('editMode').onclick();click(64);click(1);$('revealChoices').children.find(b=>b.dataset.type==='C').onclick();$('captureChoices').children.find(b=>b.dataset.type==='N').onclick();$('confirmSync').onclick();
 assert.equal($('capturedBottomLabel').textContent,'红方已吃');assert.equal($('capturedBottomPieces').children[0].textContent,'馬');assert.match($('capturedBottomPieces').children[0].className,/black dark-capture/);
 click(25);click(88);$('revealChoices').children.find(b=>b.dataset.type==='R').onclick();$('confirmSync').onclick();const hidden=$('capturedTopPieces').children[0];assert.equal($('capturedTopLabel').textContent,'黑方已吃');assert.equal(hidden.textContent,'?');assert.match(hidden.className,/dark-capture unknown/);assert.match(hidden['aria-label'],/身份未知/);assert(!/兵|车|炮|马|相|仕/.test(hidden.title));
});
test('翻转棋盘同步交换吃子区，撤回和重置恢复图标数量',async()=>{
 const {$,click}=await setup();$('editMode').onclick();click(64);click(1);$('revealType').value='C';$('captureType').value='N';$('confirmSync').onclick();
 $('flipBoard').onclick();assert.equal($('capturedTopLabel').textContent,'红方已吃');assert.equal($('capturedTopPieces').children[0].textContent,'馬');assert.equal($('capturedBottomLabel').textContent,'黑方已吃');$('undo').onclick();assert.equal($('capturedTopPieces').children[0].textContent,'—');
 $('reset').onclick();assert.equal($('capturedBottomPieces').children[0].textContent,'—');
});
test('吃子区跟随观战信息视角，只改变显示不改变搜索输入',async()=>{
 const {$,workers}=await setup();$('autoMode').onclick();$('autoStep').onclick();await reply(workers[0],{from:64,to:1});const known=$('capturedBottomPieces').children[0].textContent;assert.notEqual(known,'?');
 $('autoStep').onclick();const payload=structuredClone(workers[1].data.view);assert.equal($('capturedBottomPieces').children[0].textContent,'?');$('viewSide').value='r';$('viewSide').onchange();assert.equal($('capturedBottomPieces').children[0].textContent,known);assert.deepEqual(workers[1].data.view,payload);$('stop').onclick();
});
test('搜索结束后显示编号灰色候选，搜索中只显示主推荐，待确认时隐藏其他走法',async()=>{
 const {$,workers}=await setup();$('editMode').onclick();$('analyze').onclick();const w=workers[0],candidates=[54,56,58,60,62].map((from,i)=>({from,to:from-9,score:50-i,spread:0})),result={move:{from:54,to:45},candidates,score:50,depth:2,samples:8,nodes:100,elapsedMs:10};
 w.onmessage({data:{id:w.data.id,progress:true,result}});assert.equal($('alternativeMove2').style.display,'none');assert.equal($('moveArrowNumber').style.display,'none');
 w.onmessage({data:{id:w.data.id,result}});assert.equal($('moveArrowNumber').textContent,'1');assert.equal($('moveArrowNumber').style.display,'');for(let rank=2;rank<=5;rank++){assert.equal($('alternativeMove'+rank).style.display,'');assert.equal($('alternativeNumber'+rank).textContent,String(rank));assert.equal(Number($('alternativeArrow'+rank).x1),candidates[rank-1].from%9+.5);}
 $('apply').onclick();assert.equal($('alternativeMove2').style.display,'none');assert.equal($('moveArrowNumber').style.display,'none');$('cancelSync').onclick();assert($('moveArrowLayer').hidden);
});
test('候选箭头不重复主推荐，不残留旧数量，翻转时数字保持正向',async()=>{
 const {$,workers}=await setup();$('editMode').onclick();$('analyze').onclick();const w=workers[0],result={move:{from:54,to:45},candidates:[{from:54,to:45,score:1,spread:0},{from:56,to:47,score:0,spread:0}],score:1,depth:1,samples:8,nodes:1,elapsedMs:1};w.onmessage({data:{id:w.data.id,result}});
 assert.equal($('alternativeMove2').style.display,'');assert.equal($('alternativeMove3').style.display,'none');$('flipBoard').onclick();assert.match($('alternativeNumber2').transform,/^rotate\(180 /);assert.match($('moveArrowNumber').transform,/^rotate\(180 /);$('reset').onclick();assert($('moveArrowLayer').hidden);assert.equal($('alternativeMove2').style.display,'none');
});
test('对手私人搜索完成后不会向玩家展示候选箭头',async()=>{
 const {$,workers,click}=await setup();click(54);click(45);const w=workers[0];w.onmessage({data:{id:w.data.id,result:{move:{from:27,to:36},candidates:[{from:27,to:36,score:1,spread:0},{from:29,to:38,score:0,spread:0}],score:1,depth:1,samples:8,nodes:1,elapsedMs:1}}});assert($('moveArrowLayer').hidden);assert.equal($('alternativeMove2').style.display,'none');
});
test('辅助盘第三次重复展示判负并停止分析，撤回后恢复可操作',async()=>{
 const {$,click}=await setup();$('editMode').onclick();const cycle=[{from:82,to:63},{from:1,to:18},{from:63,to:82},{from:18,to:1}];for(let i=0;i<10;i++){const m=cycle[i%4];click(m.from);click(m.to);if(i<2){$('revealType').value='N';$('confirmSync').onclick();}}
 assert.match($('status').textContent,/红方获胜.*黑方重复局面判负/);assert($('analyze').disabled);$('undo').onclick();assert(!/判负/.test($('status').textContent));assert(!$('analyze').disabled);
});
