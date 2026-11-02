// Independent exhaustive defense oracle retained from native/defense-check.mjs.
import {pseudo,other} from '../../../engine.js';import {remaining,values,evaluate} from '../../../ai.js';import {informationBonus} from '../information-value/policy.mjs';
export function referenceDefense(s){
 const counts=[Array(90).fill(0),Array(90).fill(0)],cheapest=[Array(90).fill(1000000),Array(90).fill(1000000)];
 const means=['r','b'].map(side=>{const pool=remaining(s,side);return pool.length?pool.reduce((a,t)=>a+values[t],0)/pool.length:0;});
 const material=p=>p.hidden?means[p.side==='r'?0:1]:values[p.type];
 // Independent exhaustive target enumeration using the JS rules, with a virtual
 // opposing occupant at each target. This includes defenses and cannon controls.
 for(let f=0;f<90;f++){
  const p=s.board[f];if(!p)continue;const side=p.side==='r'?0:1,b=[...s.board];
  for(let t=0;t<90;t++)if(t!==f){const old=b[t];b[t]={side:other(p.side),type:old?.type==='K'&&!old.hidden?'K':'P',hidden:false};
   if(pseudo(b,f,t)){counts[side][t]++;cheapest[side][t]=Math.min(cheapest[side][t],material(p));}b[t]=old;
  }
 }
 const threats=[0,0],king=[0,0],hanging=[0,0];
 for(let i=0;i<90;i++){const p=s.board[i];if(!p||(!p.hidden&&p.type==='K'))continue;const side=p.side==='r'?0:1;if(!counts[side^1][i])continue;
  threats[side]+=counts[side][i]?0.10*Math.max(0,material(p)-cheapest[side^1][i]):0.18*material(p);
  if(!counts[side][i])hanging[side]+=0.18*material(p);
 }
 for(const [side,color]of ['r','b'].entries()){
  const k=s.board.findIndex(p=>p?.side===color&&!p.hidden&&p.type==='K');if(k<0)continue;
  let controlled=0,safe=0;for(let t=0;t<90;t++){
   const x=t%9,y=Math.floor(t/9);if(Math.abs(x-k%9)+Math.abs(y-Math.floor(k/9))!==1||x<3||x>5||!(side===0?y>=7:y<=2))continue;
   if(counts[side^1][t])controlled++;else if(s.board[t]?.side!==color)safe++;
  }
  king[side]=20*Number(counts[side^1][k]>0)+12*controlled+(controlled?18*Math.max(0,2-safe):0);
 }
 return {attacks:counts,cheapest,threats,king,hanging};
}

export function baseReference(view){const activity=evaluate({...view,_config:{activity:true,slidingMobility:true}},'r');const generic=evaluate({...view,_config:{mobility:true}},'r')-evaluate({...view,_config:{mobility:false}},'r');return activity+generic+informationBonus(view,'r');}
