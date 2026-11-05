import assert from 'node:assert/strict';import {initial,TYPES,legalMoves} from './legacy-engine-20261103.js';
const piece=(side,type,hidden=false,role=type)=>({side,type,hidden,role});
function sparse(name,placements,from,to,allowed=false){const s=initial(()=>.5);s.board=Array(90).fill(null);s.board[85]=piece('r','K');s.board[4]=piece('b','K');s.board[49]=piece('r','P');s.captured=[];s.positions=[];s.quiet=0;s.ply=0;for(const [i,side,type,hidden=false,role=type]of placements)s.board[i]=piece(side,type,hidden,role);for(const side of['r','b']){const bag=[...TYPES];for(const p of s.board)if(p?.side===side&&p.type!=='K'){const i=bag.indexOf(p.type);assert(i>=0,name+' stock');bag.splice(i,1);}for(const t of bag)s.captured.push(piece(side,t));}return{name,state:s,from,to,allowed};}
const raw=[
 sparse('炮首占位之前加屏成将军',[[58,'b','C'],[72,'r','R']],72,76),
 sparse('双炮屏移除第一屏',[[76,'r','R'],[67,'b','P'],[58,'b','C']],76,75),
 sparse('双炮屏移除第二屏',[[76,'b','P'],[67,'r','R'],[58,'b','C']],67,66),
 sparse('车线移除己方屏',[[76,'r','R'],[58,'b','R']],76,75),
 sparse('揭开象的象眼',[[65,'b','B'],[75,'r','R']],75,74),
 sparse('暗象仍限本河不能攻击彼岸',[[65,'b','R',true,'B'],[75,'r','R']],75,74,true),
 sparse('马腿移出暴露将军',[[66,'b','N'],[75,'r','R']],75,74),
 sparse('暗马按角色判断马腿',[[66,'b','C',true,'N'],[75,'r','R']],75,74),
 sparse('将帅照面屏移动',[[49,'r','R']],49,48)
];
export const targeted=raw.flatMap(c=>{const s=structuredClone(c.state);s.board=s.board.slice().reverse().map(p=>p?{...p,side:p.side==='r'?'b':'r'}:null);s.captured=s.captured.map(p=>({...p,side:p.side==='r'?'b':'r'}));s.turn='b';return[c,{...c,name:c.name+'黑方旋转',state:s,from:89-c.from,to:89-c.to}];});
for(const c of targeted)assert.equal(legalMoves(c.state).some(m=>m.from===c.from&&m.to===c.to),c.allowed,c.name);
