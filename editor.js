import {initial,TYPES,inCheck,other} from './engine.js';
const count=items=>{let out={R:0,N:0,B:0,A:0,C:0,P:0};for(let t of items)if(t in out)out[t]++;return out;};
export function parseInventory(text){let input=text.toUpperCase().replace(/[\s,，]/g,''),counts=count([]),seen=new Set(),parts=[...input.matchAll(/([RNBCAP])(\d+)/g)];if(!parts.length||parts.map(m=>m[0]).join('')!==input)return {error:'未知库存格式应为 R2N2B2A2C2P5（未写类型视为0）'};for(let [,t,n] of parts){if(seen.has(t)||Number(n)>5)return {error:'库存类型不能重复，单项数量不得超过初始数量'};seen.add(t);counts[t]=Number(n);}return {counts};}
export function validatePosition(board,turn,knownCaptured={r:'',b:''},inventory={r:'',b:''}){
 let errors=[],captured=[];const start=initial(()=>0.5).board,total=count(TYPES);
 for(let side of ['r','b']){
  let label=side==='r'?'红':'黑',pieces=board.filter(p=>p?.side===side),kings=board.map((p,i)=>({p,i})).filter(({p})=>p?.side===side&&!p.hidden&&p.type==='K');
  if(kings.length!==1)errors.push(label+'方必须恰有一枚将帅');
  for(let {i} of kings){let x=i%9,y=Math.floor(i/9);if(x<3||x>5||(side==='r'?y<7:y>2))errors.push('将帅必须在己方九宫');}
  let known=(knownCaptured[side]||'').toUpperCase().replace(/[\s,，]/g,'');
  if(/[^RNBCAP]/.test(known))errors.push('已知离盘身份仅接受 R车 N马 B象 A士 C炮 P兵');
  let alive=count(pieces.filter(p=>!p.hidden&&p.type!=='K').map(p=>p.type));
  if(inventory[side]?.trim()){
   let parsed=parseInventory(inventory[side]);if(parsed.error)errors.push(label+'方'+parsed.error);else{
    let inferred='';for(let t of Object.keys(total)){let dead=total[t]-alive[t]-parsed.counts[t];if(dead<0)errors.push(label+'方未知库存与盘上明子超过初始数量');else inferred+=t.repeat(dead);}
    if(known&&JSON.stringify(count(known))!==JSON.stringify(count(inferred)))errors.push(label+'方未知库存与已知离盘身份不一致');
    known=inferred;
   }
  }
  let dead=count(known),poolSize=0;for(let t of Object.keys(total)){let n=total[t]-alive[t]-dead[t];poolSize+=n;if(n<0)errors.push(label+'方明子与已知吃子超过初始数量');}
  for(let t of known)captured.push({side,type:t,role:t,hidden:false});
  let dark=pieces.filter(p=>p.hidden).length;if(dark>poolSize)errors.push(label+'方暗子数量超过未知棋子池');
  let missing=16-pieces.length-known.length;if(missing<0)errors.push('棋子总数超过16');for(let i=0;i<missing;i++)captured.push({side,hidden:true});
 }
 board.forEach((p,i)=>{if(p?.hidden&&(!start[i]?.hidden||start[i].side!==p.side||start[i].role!==p.role))errors.push('暗子只能放在己方原始非将帅位置，首步角色须与位置一致');});
 if(!errors.length&&inCheck(board,other(turn)))errors.push('非行棋方正被将军：上一手不合法，请更改行棋方或局面');
 return {errors:[...new Set(errors)],state:{board:structuredClone(board),turn,captured,ply:0,quiet:0,result:null,positions:[]}};
}
