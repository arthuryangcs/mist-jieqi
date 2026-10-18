import fs from 'node:fs';import{createHash}from'node:crypto';import{ExternalEngine,fen,observationToken}from'./external-engine.js';
import{initial,publicState,legalMoves,move}from'../engine.js';import{seeded}from'../ai.js';
const enginePath=process.env.JIEQI_ENGINE_PATH;
if(!enginePath||createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex')!=='f32d3c6dfe4d6d90da7728d9cc2af68c3195a1cefb1bc28f3829f174c518dba1')throw Error('只允许运行已经审计并获准的bcc83f88本机构建');
const s0=initial(seeded(2027)),initialFen=fen(publicState(s0)),e=new ExternalEngine(),histories={r:[],b:[]},rows=[];let s=s0,darkCaptures=0;
try{await e.init();for(let i=0;i<24&&!s.result;i++){
 const ms=legalMoves(s),forced=[{from:64,to:1},{from:25,to:88}][i],m=forced||ms.find(m=>s.board[m.to]?.hidden)||ms[i%ms.length],q=s.board[m.to],next=move(s,m);
 if(q?.hidden)darkCaptures++;
 for(const viewer of ['r','b']){
  histories[viewer].push(observationToken(s,m,next,viewer));const wait=e.wait(line=>line.startsWith('Fen: '));e.send('position fen '+initialFen+' moves '+histories[viewer].join(' '));e.send('d');const actual=(await wait).slice(5).trim(),view=publicState(next,viewer),expected=fen(view);
  if(actual.split(' ').slice(0,3).join(' ')!==expected.split(' ').slice(0,3).join(' '))throw Error('观察视角协议不一致: '+JSON.stringify({ply:i+1,viewer,actual,expected}));
  rows.push({ply:i+1,viewer,actual,expected,knownDark:view.captured.filter(p=>p.wasHidden).length,unknownLoss:view.captured.filter(p=>p.side===viewer&&p.hidden).length,token:histories[viewer].at(-1)});
 }
 s=next;
}
 let smoke=null;if(!s.result){const view=publicState(s,s.turn),r=await e.search(initialFen,histories[s.turn],250,fen(view));if(!legalMoves(view).some(m=>m.from===r.move?.from&&m.to===r.move?.to))throw Error('外部引擎新规则根节点搜索返回非法着法');smoke={viewer:s.turn,move:r.move,elapsedMs:r.elapsedMs,verificationMs:r.verificationMs,nativeBudgetMs:r.nativeBudgetMs,legal:true};}
 const result={smoke,engine:'brianhliou/pikafish-jieqi-wasm',commit:'bcc83f88ee18760e60903d1a3aaa61ef6f70f2c9',plies:s.ply,darkCaptures,observations:rows.length,allBoardTurnPoolsAgree:true,protocol:'初始公开FEN + 每着6字符；第5字符为公开翻子或X，第6字符仅为观察方亲自吃到的暗俘身份或X。无隐藏布局和未知暗俘真身。',rows};fs.writeFileSync(process.env.JIEQI_PREFLIGHT_OUTPUT||'benchmarks/private-engine-preflight-replay.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({plies:s.ply,darkCaptures,observations:rows.length,allBoardTurnPoolsAgree:true}));
}finally{e.close();}
