import fs from 'node:fs';
import assert from 'node:assert/strict';
import {root,save,hash} from './common.mjs';
const median=a=>{a=[...a].sort((a,b)=>a-b);return(a[(a.length-1)>>1]+a[a.length>>1])/2;};
const range=a=>({min:Math.min(...a),median:median(a),max:Math.max(...a)});
const variants=[];
for(const name of ['snapshot','fma','integer']){
 const p=`${root}/${name}-bench.json`,d=JSON.parse(fs.readFileSync(p));assert(d.passed);
 const positions=d.summary.map(s=>{
  const rows=d.rows.filter(r=>r.position===s.position),a=rows.filter(r=>r.arm==='A').map(r=>r.wallMs),b=rows.filter(r=>r.arm==='B').map(r=>r.wallMs),pairs=[];
  for(let i=0;i<rows.length;i+=2){const x=rows[i],y=rows[i+1];assert.notEqual(x.arm,y.arm);pairs.push(x.arm==='A'?x.wallMs/y.wallMs:y.wallMs/x.wallMs);}
  return {...s,nodes:rows[0].nodes,replicatesPerArm:a.length,baselineMs:range(a),candidateMs:range(b),adjacentPairRatios:range(pairs),allPairsFaster:pairs.every(r=>r>1)};
 });
 variants.push({name,depth:d.depth,sourceSha256:d.candidate.sourceSha256,headerSha256:d.candidate.headerSha256,binarySha256:d.candidate.binarySha256,baselineBinarySha256:d.baseline.binarySha256,geometricMeanMedianRatio:Math.exp(positions.reduce((s,p)=>s+Math.log(p.speedRatio),0)/positions.length),positions,benchmarkSha256:hash(p)});
}
save('summary.json',{variants,method:'Serial fixed-depth4 same-tree ABBA/BAAB, six measurements per arm per position. Pair range is descriptive variability, not a confidence interval. One machine, one corpus; no Elo/strength conclusion.',profileSummarySha256:hash(root+'/profile-summary.json')});
console.log(JSON.stringify(variants.map(v=>({name:v.name,geomean:v.geometricMeanMedianRatio,positions:v.positions.map(p=>({name:p.position,baselineMs:p.baselineMs,candidateMs:p.candidateMs,ratio:p.speedRatio,pairs:p.adjacentPairRatios}))})),null,2));
