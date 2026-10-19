import fs from'node:fs';
const input=process.argv[2],output=process.env.JIEQI_PROFILE_SUMMARY||'benchmarks/search-profile-replay.json';if(!input)throw Error('需要本地CPU profile路径');
const p=JSON.parse(fs.readFileSync(input)),byId=new Map(p.nodes.map(n=>[n.id,n])),weights=new Map(),summary=new Map();
p.samples.forEach((id,i)=>weights.set(id,(weights.get(id)||0)+(p.timeDeltas[i]||0)));
function walk(n,ancestors=new Set()){
 const own=weights.get(n.id)||0,name=n.callFrame.functionName||'(anonymous)',file=n.callFrame.url.split('/').at(-1)||'',key=name+'|'+file,active=new Set(ancestors);active.add(key);
 let inclusive=own;for(const id of n.children||[])inclusive+=walk(byId.get(id),active);
 const row=summary.get(key)||{name,file,selfUs:0,inclusiveUs:0};row.selfUs+=own;if(!ancestors.has(key))row.inclusiveUs+=inclusive;summary.set(key,row);return inclusive;
}
const totalUs=walk(p.nodes[0]),rows=[...summary.values()].map(r=>({...r,selfPct:100*r.selfUs/totalUs,inclusivePct:100*r.inclusiveUs/totalUs})).sort((a,b)=>b.selfUs-a.selfUs);
const result={protocol:'Node --cpu-prof；seed6101/8样本/完整3层。递归同函数inclusive仅计最外层，包含启动成本；不同函数的inclusive不可相加。采样剖析不作为等深度计时对照。',runtime:process.version,totalUs,topSelf:rows.slice(0,25)};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(rows.slice(0,10)));
