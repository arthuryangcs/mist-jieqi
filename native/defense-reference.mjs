// Independent JS implementation of the selected king-pressure feature.
// This only produces an in-memory reference module; playable ai.js is untouched.
import fs from 'node:fs';
import {patch,dir} from './defense-variants.mjs';
export const kingPressureCode=String.raw`
function kingPressure(s,side){
 const b=s.board,penalty={r:0,b:0};
 for(const color of ['r','b']){
  const k=s._kings?.[color]??b.findIndex(p=>p?.side===color&&!p.hidden&&p.type==='K');if(k<0)continue;
  let controlled=0,safe=0;
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const u=k%9+dx,v=Math.floor(k/9)+dy;
   if(u<3||u>5||v<0||v>9||!(color==='r'?v>=7:v<=2))continue;
   const t=v*9+u;
   if(inCheck(b,color,t))controlled++;else if(b[t]?.side!==color)safe++;
  }
  penalty[color]=20*Number(inCheck(b,color,k))+12*controlled+(controlled?18*Math.max(0,2-safe):0);
 }
 return penalty[other(side)]-penalty[side];
}
`;
export function javascriptSource({fixedWorlds=false}={}){
 let s=fs.readFileSync(`${dir}/baseline-ai.js`,'utf8');
 s=patch(s,'function simpleEvaluate(s,side,pools){','function simpleEvaluateBase(s,side,pools){');
 s=patch(s,'export function evaluate(s,side){',kingPressureCode+'\nfunction simpleEvaluate(s,side,pools){return simpleEvaluateBase(s,side,pools)+kingPressure(s,side);}\nexport function evaluate(s,side){');
 s=patch(s,'if(quiet){let stand=evaluate(s,s.turn);','if(quiet){let stand;if(config.activity)stand=evaluate(s,s.turn);else{const base=simpleEvaluateBase(s,s.turn,s._pools);if(base-104>=beta)return base-104;stand=base+104<=alpha?alpha:base+kingPressure(s,s.turn);}');
 if(fixedWorlds){s=patch(s,'features={}}={})','features={},fixedWorlds}={})');s=patch(s,'worlds=balancedSamples(view,uncertain?samples:1,rng)','worlds=fixedWorlds?structuredClone(fixedWorlds):balancedSamples(view,uncertain?samples:1,rng)');}
 return s;
}
export async function reference(){
 const s=javascriptSource({fixedWorlds:true}).replace("'./engine.js'",JSON.stringify(new URL('../engine.js',import.meta.url).href));
 return import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
}
