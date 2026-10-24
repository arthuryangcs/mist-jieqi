import {remaining,evaluate} from '../../../ai.js';
export const D=2597,H=16,TYPES='KRNBCAP',PIECES=2520,STOCK=2520,TURN=2592,VIEWER=2594;
const side=s=>s==='r'?0:s==='b'?1:2;
export function featureIndices(view){
 for(const p of [...view.board,...view.captured])if(p?.hidden&&'type'in p)throw Error('Hidden truth in observation');
 const stocks=['r','b'].map(s=>{const bag=remaining(view,s);return Array.from({length:6},(_,t)=>bag.filter(x=>x===TYPES[t+1]).length);});
 return [0,1].map(frame=>{
  const ids=[];for(const [i,p]of view.board.entries())if(p){const raw=TYPES.indexOf(p.hidden?p.role:p.type);if(raw<0)throw Error('Unknown piece feature');const type=raw+(p.hidden?7:0);ids.push(((side(p.side)^frame)*14+type)*90+(frame?89-i:i));}
  for(let s=0;s<2;s++)for(let t=0;t<6;t++){const c=stocks[s][t];if(c<0||c>5)throw Error('Inventory outside feature range');ids.push(STOCK+((s^frame)*6+t)*6+c);}
  ids.push(TURN+(side(view.turn)^frame));const viewer=side(view.viewer);ids.push(VIEWER+(viewer===2?2:viewer^frame));return ids;
 });
}
export function redBase(view){return evaluate(view,'r');}
