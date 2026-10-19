import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {build,binary,manifestPath,root} from './build.mjs';
import {Native,fixture,observationSeed} from './bridge.mjs';
import {legalMoves} from '../engine.js';
import {validatePosition} from '../editor.js';

const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const staticFiles=new Map(['index.html','style.css','board.svg','app.js','engine.js','ai.js','editor.js','worker.js','deadline-search.js','native-client.js'].map(p=>['/'+p,p]));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const tokenPattern=/^[a-zA-Z0-9_-]{8,80}$/;
function invalid(message){throw Object.assign(Error(message),{status:400});}
export function validateRequest(input){
 if(!input||!tokenPattern.test(input.token||''))invalid('无效搜索编号');
 if(Object.keys(input).some(k=>!['token','timeMs','view'].includes(k)))invalid('不支持的搜索选项');
 if(!Number.isInteger(input.timeMs)||input.timeMs<100||input.timeMs>15000)invalid('思考预算须为100至15000毫秒');
 const v=input.view;if(!v||!Array.isArray(v.board)||v.board.length!==90||!Array.isArray(v.captured)||v.captured.length>30||!['r','b'].includes(v.turn)||![null,'r','b'].includes(v.viewer))invalid('无效公开局面');
 const clean=(p,captured=false)=>{
  if(p===null&&!captured)return null;
  if(!p||!['r','b'].includes(p.side)||typeof p.hidden!=='boolean')invalid('无效棋子');
  if(p.hidden&&'type'in p)invalid('拒绝含真实暗子身份的输入');
  if(!p.hidden&&!/^[KRNBCAP]$/.test(p.type||''))invalid('无效明子身份');
  if(!captured&&p.role!==undefined&&!/^[KRNBCAP]$/.test(p.role))invalid('无效棋子角色');
  if(captured&&p.type==='K')invalid('终局将帅不能进入离盘库存');
  if(!captured&&p.hidden&&!/^[RNBCAP]$/.test(p.role||''))invalid('无效暗子角色');
  if(captured&&p.wasHidden&&(!v.viewer||p.capturedBy!==v.viewer||p.side===v.viewer))invalid('暗俘身份不属于当前视角');
  if(captured&&p.capturedBy!==undefined&&p.capturedBy!==(p.side==='r'?'b':'r'))invalid('无效吃子方');
  return{side:p.side,hidden:p.hidden,...(!p.hidden?{type:p.type}:{}),...(!captured?{role:p.role??p.type}:{}),...(captured&&p.wasHidden?{wasHidden:true}:{}),...(captured&&p.capturedBy?{capturedBy:p.capturedBy}:{})};
 };
 const board=v.board.map(p=>clean(p)),captured=v.captured.map(p=>clean(p,true));
 for(const key of['ply','quiet'])if(!Number.isInteger(v[key])||v[key]<0||v[key]>400)invalid('无效步数');
 if(!Array.isArray(v.positions)||v.positions.length>401||v.positions.some(p=>typeof p!=='string'||p.length>12000))invalid('无效重复局面记录');
 const known=side=>captured.filter(p=>p.side===side&&!p.hidden).map(p=>p.type).join('');
 const validation=validatePosition(board,v.turn,{r:known('r'),b:known('b')});
 if(validation.errors.length)invalid(validation.errors.join('；'));
 for(const side of['r','b'])if(board.filter(p=>p?.side===side).length+captured.filter(p=>p.side===side).length!==16)invalid('每方盘上及离盘棋子合计须为16');
 return{token:input.token,timeMs:input.timeMs,view:{board,captured,turn:v.turn,viewer:v.viewer,ply:v.ply,quiet:v.quiet,positions:v.positions,result:null}};
}
async function readJSON(req){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>2*1024*1024)throw Object.assign(Error('请求过大'),{status:413});parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{invalid('请求不是有效JSON');}}

export function createLocalServer({executable=binary,buildInfo=JSON.parse(fs.readFileSync(manifestPath)),maxSearches=2}={}){
 const active=new Map(),cancelled=new Map();let completed=0,aborted=0;
 const info={engine:'cpp-native',sourceSha256:buildInfo.sourceSha256,binarySha256:buildInfo.binarySha256,threads:1,transport:'loopback-http',protocol:2};
 function cancel(token){const job=active.get(token);if(job){aborted++;job.cancel();}else{cancelled.set(token,Date.now()+3000);if(cancelled.size>100)cancelled.delete(cancelled.keys().next().value);}}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const address=server.address(),expected=`127.0.0.1:${address.port}`;
  // Reject foreign Host/Origin (including DNS rebinding); expose no CORS API.
  if(req.headers.host!==expected&&req.headers.host!==`localhost:${address.port}`){res.writeHead(403).end('仅限本机地址');return;}
  const origin=req.headers.origin;
  if(origin&&origin!==`http://${req.headers.host}`){res.writeHead(403).end('拒绝跨站请求');return;}
  let url;try{url=new URL(req.url,`http://${expected}`);}catch{res.writeHead(400).end();return;}
  const json=(status,value)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}};
  try{
   if(req.method==='GET'&&url.pathname==='/api/status'){json(200,{...info,active:active.size,completed,aborted});return;}
   if(req.method==='DELETE'&&url.pathname.startsWith('/api/search/')){const token=url.pathname.slice('/api/search/'.length);if(!tokenPattern.test(token))invalid('无效搜索编号');cancel(token);json(200,{cancelled:true});return;}
   if(req.method==='POST'&&url.pathname==='/api/search'){
    if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('需要JSON请求'),{status:415});
    const started=performance.now(),input=validateRequest(await readJSON(req));
    for(const [key,expiry]of cancelled)if(expiry<Date.now())cancelled.delete(key);
    if(cancelled.has(input.token)){json(409,{error:'搜索已取消'});return;}
    if(active.has(input.token)){json(409,{error:'搜索编号重复'});return;}
    if(active.size>=maxSearches){json(429,{error:'本机搜索忙，请停止另一页面的搜索后重试'});return;}
    const f=fixture(input.view,{seed:observationSeed(input.view),samples:8}),native=new Native({binary:executable});
    let finished=false,timer,latest=null;
    const prepareMs=performance.now()-started;
    const wire=r=>{const top=r.allCandidates?.[0]||{};return{...r,...top,move:r.move??(top.from!==undefined?{from:top.from,to:top.to}:null),allCandidates:undefined,iterations:undefined,candidates:(r.allCandidates||[]).slice(0,5),uncertain:input.view.board.some(p=>p?.hidden),scoreKind:input.view.board.some(p=>p?.hidden)?'expected-utility':'material',seed:f.seed,...info,engineVerified:true,serviceElapsedMs:performance.now()-started,preparationMs:prepareMs,initializationMs:native.initializationMs??null};};
    const send=value=>{if(!res.destroyed&&!res.writableEnded)res.write(JSON.stringify(value)+'\n');};
    const cleanup=()=>{clearTimeout(timer);active.delete(input.token);native.stop();};
    const stop=()=>{if(finished)return;finished=true;cleanup();if(!res.writableEnded)res.end();};
    active.set(input.token,{cancel:stop,process:native.process});res.on('close',()=>{if(!finished){aborted++;stop();}});
    res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','X-Engine':'cpp-native'});res.flushHeaders();
    timer=setTimeout(()=>{
     if(finished)return;finished=true;
     // Independent Node timer remains responsive while the C++ process searches.
     const fallback={move:legalMoves(input.view)[0]||null,depth:0,nodes:0,samples:0,score:0,elapsedMs:0,allCandidates:[]};
     send({result:{...(latest||{...wire(fallback),engineVerified:false}),deadlineStop:true}});res.end();cleanup();
    },Math.max(0,input.timeMs-(performance.now()-started)));
    try{
     await native.ready;if(finished)return;if(native.capabilities.protocol!==2||!native.capabilities.streaming)throw Error('C++程序不支持流式接口，请重新构建');
     const remaining=Math.max(0,input.timeMs-(performance.now()-started)-15);
     const r=await native.request(f,{mode:'STREAM',depth:8,budget:remaining,onProgress:r=>{if(finished)return;latest=wire(r);send({progress:true,result:latest});}});
     if(finished)return;finished=true;completed++;send({result:wire(r)});res.end();cleanup();
    }catch(error){if(!finished){finished=true;send({error:'C++搜索未完成，请重试或明确选择JavaScript回退。'});res.end();cleanup();}}
    return;
   }
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
   const file=staticFiles.get(url.pathname==='/'?'/index.html':url.pathname);if(!file){res.writeHead(404).end('文件不存在');return;}
   const data=fs.readFileSync(path.join(root,file));res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);
  }catch(error){json(error.status||500,{error:error.status?error.message:'本机服务异常，请查看启动终端。'});}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;
 return{server,info,active,listen(port=8766){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve(server.address());});});},close(){for(const token of active.keys())cancel(token);server.closeAllConnections();return new Promise(resolve=>server.close(resolve));}};
}
export function ensureBuild(){let info;try{info=JSON.parse(fs.readFileSync(manifestPath));if(info.sourceSha256===hash(path.join(root,'native/search.cpp'))&&info.binarySha256===hash(binary))return info;}catch{}console.log('编译本项目 C++ 搜索核心（不下载依赖）…');const {binary:_,...built}=build();return built;}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{const port=Number(process.env.PORT||8766);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('PORT须为1024至65535');const service=createLocalServer({buildInfo:ensureBuild()});await service.listen(port);console.log(`揭棋 C++ 本机版：http://127.0.0.1:${port}/\n核心 ${service.info.sourceSha256.slice(0,12)} · 单线程 · Ctrl+C停止`);for(const signal of['SIGINT','SIGTERM'])process.once(signal,async()=>{await service.close();process.exit(0);});}catch(error){console.error('启动失败：'+error.message);process.exitCode=1;}
}
