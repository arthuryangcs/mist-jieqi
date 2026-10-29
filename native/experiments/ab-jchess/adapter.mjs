import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';import path from 'node:path';
import {fen,coordinate,parseMove} from '../../../scripts/external-engine.js';
import {legalMoves,other} from '../../../engine.js';
import {binary,model,hash} from './build.mjs';import fs from 'node:fs';
export {fen,coordinate,parseMove};
export function assertObservation(view,viewer=view.viewer){
 assert(['r','b',null].includes(viewer));assert.equal(view.viewer??null,viewer);
 for(const p of view.board)if(p?.hidden)assert(!('type' in p),'Hidden board truth must not reach adapter');
 for(const p of view.captured){
  if(p.hidden)assert(!('type' in p),'Unknown capture identity must not reach adapter');
  if(p.wasHidden)assert(viewer!==null&&p.capturedBy===viewer,'Opponent private capture identity');
 }
 return view;
}
// Only filtered before/after views are accepted. No referee board or seed enters this API.
export function observationToken(before,m,after,viewer){
 assertObservation(before,viewer);assertObservation(after,viewer);assert.equal(after.turn,other(before.turn));assert.equal(after.ply,before.ply+1);
 const p=before.board[m.from],q=before.board[m.to];assert(p&&p.side===before.turn);assert(legalMoves(before).some(x=>x.from===m.from&&x.to===m.to));
 let token=coordinate(m.from)+coordinate(m.to),letter=(type,side)=>side==='r'?type:type.toLowerCase();
 if(p.hidden){const shown=after.board[m.to];assert(shown&&!shown.hidden&&shown.type);token+=letter(shown.type,p.side);}
 if(q?.hidden&&p.side===viewer){const captured=after.captured.at(-1);assert(captured?.wasHidden&&captured.capturedBy===viewer&&captured.type);token+=letter(captured.type,q.side);}
 assert(/^[a-i][0-9][a-i][0-9][RNBACPrnbacp]{0,2}$/.test(token));return token;
}
export class ABClient {
 constructor(){
  const b=JSON.parse(fs.readFileSync('benchmarks/ab-jchess/build.json'));assert(b.passed);assert.equal(hash(binary),b.binarySha256);assert.equal(hash(model),b.modelSha256);
  this.lines=[];this.stderr='';this.waiters=[];this.sent=[];this.closing=false;
  this.p=spawn(binary,[],{cwd:path.dirname(binary),stdio:['pipe','pipe','pipe']});
  createInterface({input:this.p.stdout}).on('line',line=>{this.lines.push(line);for(const w of [...this.waiters])if(w.match(line)){this.waiters.splice(this.waiters.indexOf(w),1);clearTimeout(w.timer);w.resolve(line);}});
  this.p.stderr.on('data',b=>this.stderr+=b);this.p.stdin.on('error',e=>{if(!this.closing)this.fail(e);});this.p.on('error',e=>this.fail(e));
  this.closed=new Promise(resolve=>this.p.once('close',(code,signal)=>{this.exit={code,signal};if(!this.closing)this.fail(Error('AB process exit '+code+'/'+signal));resolve();}));
 }
 fail(e){for(const w of this.waiters){clearTimeout(w.timer);w.reject(e);}this.waiters=[];}
 send(line){assert(!/[\r\n]/.test(line),'UCI command injection');if(this.closing)throw Error('AB is closed');this.sent.push(line.replaceAll(process.cwd(),'<project>'));this.p.stdin.write(line+'\n');}
 wait(match,timeout=10000){return new Promise((resolve,reject)=>{const w={match,resolve,reject,timer:setTimeout(()=>{this.waiters=this.waiters.filter(x=>x!==w);reject(Error('AB response timeout'));},timeout)};this.waiters.push(w);});}
 checkErrors(from){const bad=this.lines.slice(from).find(x=>/command failed:|Unknown command:|ERROR|info string (?:invalid|illegal)/i.test(x));if(bad)throw Error(bad);}
 async sync(timeout=10000){const ready=this.wait(x=>x==='readyok',timeout);this.send('isready');await ready;}
 async init(view){
  assertObservation(view);const start=performance.now(),from=this.lines.length;const ready=this.wait(x=>x==='uciok');this.send('uci');await ready;
  for(const name of ['Threads','Hash','ChasingRule','EvalFile'])assert(this.lines.some(x=>x.startsWith('option name '+name+' ')),name+' option missing');
  this.send('setoption name Threads value 4');this.send('setoption name Hash value 64');this.send('setoption name ChasingRule value github');this.send('setoption name Move Overhead value 0');this.send('setoption name EvalFile value '+model);await this.sync();
  this.send('position fen '+fen(view));this.send('eval');await this.sync(30000);this.checkErrors(from);
  assert(this.lines.some(x=>x.includes('Using 4 threads')));assert(this.lines.some(x=>x.includes('ABJNNUE model loaded:')&&x.includes('inference_complete=true')&&x.includes('probability_tables=true')),'NNUE not confirmed');
  this.send('ucinewgame');await this.sync();this.initializationMs=performance.now()-start;return this.lines.slice(from).map(x=>x.replaceAll(process.cwd(),'<project>'));
 }
 async position(initialFen,journal,view){
  assertObservation(view);assert(!/[\r\n]/.test(initialFen));for(const token of journal)assert(/^[a-i][0-9][a-i][0-9][RNBACPrnbacp]{0,2}$/.test(token));
  const from=this.lines.length,pending=this.wait(x=>x.startsWith('Fen: '));this.send('position fen '+initialFen+(journal.length?' moves '+journal.join(' '):''));this.send('d');const actual=(await pending).slice(5).trim();await this.sync();this.checkErrors(from);
  const expected=fen(view),a=actual.split(/\s+/),e=expected.split(/\s+/);assert.equal(a.slice(0,3).join(' '),e.slice(0,3).join(' '),'AB visible board/turn/inventory mismatch');assert.equal(a[4],e[4],'Fullmove counter mismatch');
  return {actual,expected,abQuiet:Number(a[3]),mistQuiet:view.quiet};
 }
 async legal(view){
  const initialFen=fen(assertObservation(view));await this.position(initialFen,[],view);const from=this.lines.length,done=this.wait(x=>/^Nodes searched:/.test(x));this.send('go perft 1');await done;await this.sync();this.checkErrors(from);
  return this.lines.slice(from).filter(x=>/^[a-i][0-9][a-i][0-9]: 1$/.test(x)).map(x=>parseMove(x.slice(0,4)));
 }
 async search(initialFen,journal,view,budget,{searchMoves=null}={}){
  assertObservation(view);const start=performance.now(),from=this.lines.length,position=await this.position(initialFen,journal,view),verificationMs=performance.now()-start;
  const nativeBudget=Math.max(1,budget-Math.ceil(verificationMs));if(searchMoves!==null){assert(searchMoves.length);const allowed=legalMoves(view);for(const m of searchMoves)assert(allowed.some(x=>x.from===m.from&&x.to===m.to));}
  const done=this.wait(x=>x.startsWith('bestmove '),Math.max(1,budget+1000-(performance.now()-start)));this.send('go movetime '+nativeBudget+(searchMoves===null?'':' searchmoves '+searchMoves.map(m=>coordinate(m.from)+coordinate(m.to)).join(' ')));
  let stopAt=null;const timer=setTimeout(()=>{stopAt=performance.now()-start;if(!this.closing&&!this.exit)this.send('stop');},Math.max(0,budget+20-(performance.now()-start)));
  try{const best=await done;this.checkErrors(from);const lines=this.lines.slice(from),info=lines.filter(x=>/^info depth /.test(x)).at(-1),number=name=>{const m=info?.match(new RegExp('\\b'+name+' (\\d+)'));return m?Number(m[1]):null;};return {move:parseMove(best.split(' ')[1]),elapsedMs:performance.now()-start,verificationMs,nativeBudgetMs:nativeBudget,depth:number('depth'),nodes:number('nodes'),engineReportedMs:number('time'),deadlineStop:stopAt!==null,threads:4,lines,clock:{nominalBudgetMs:budget,verificationMs,nativeBudgetMs:nativeBudget,stopAt,position}};}finally{clearTimeout(timer);}
 }
 async close(){if(this.closing)return;try{this.send('quit');}catch{}this.closing=true;const timer=setTimeout(()=>this.p.kill('SIGKILL'),2000);await this.closed;clearTimeout(timer);}
}
