import fs from 'node:fs';import {createHash}from'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
function patch(s,a,b){if(s.split(a).length!==2)throw Error('Entry patch mismatch: '+a);return s.replace(a,b);}
export function deadlineSource({browser=false}={}){
 let s=fs.readFileSync(new URL('../../../deadline-search.js',import.meta.url),'utf8');
 if(sha(s)!=='02ef297647282c48c3908d4d53913c3cc032a9db1231293fdbc61fe1be737236')throw Error('Refresh pinned deadline source after explicit review');
 s=patch(s,"const fallback={move:moves[0]||null,candidates:[],score:moves.length?0:-99999,depth:0,samples:0,nodes:0,terminal:!moves.length};","const priority=context(view),fallback=publicFallback(priority);");
 s=patch(s,'const accepted=valid(result)?result:(latest||fallback);','const accepted=selectResult(valid(result)?result:(latest||fallback),priority);');
 s=patch(s,'latest=data.result;','latest=selectResult(data.result,priority);');
 s=patch(s,'fallbackUsed:!accepted.depth&&!accepted.terminal','fallbackUsed:!accepted.terminal&&(!accepted.depth||accepted.selectedHasSameDepthScore===false)');
 s=patch(s,'mergeSearchStats(accepted,latestStats,{deadlineStop})','mergeMetrics(accepted,latestStats,{deadlineStop})');
 const selection=browser?'/native/experiments/rule-priority/selection.mjs':new URL('./selection.mjs',import.meta.url).href;
 s='import {context,selectResult,mergeMetrics,fallback as publicFallback}from '+JSON.stringify(selection)+';\n'+s;
 if(!browser)s=s.replace(/from\s*(['"])(\.\/?[^'"]+)\1/g,(_m,q,p)=>'from '+JSON.stringify(new URL('../../../'+p.replace(/^\.\//,''),import.meta.url).href));
 return s;
}
export async function loadDeadline(){return import('data:text/javascript;base64,'+Buffer.from(deadlineSource()).toString('base64'));}
export function appSource(){
 let s=fs.readFileSync(new URL('../../../app.js',import.meta.url),'utf8');
 s=patch(s,"lead.textContent=!r.depth&&!r.terminal?","lead.textContent=r.selectedHasSameDepthScore===false&&!r.terminal?'所选着尚无同深度评分':!r.depth&&!r.terminal?");
 s=patch(s,"p.textContent=!r.depth&&!r.terminal?","p.textContent=r.selectedHasSameDepthScore===false&&!r.terminal?depthSummary(r,{partial})+' · 未证负不等于安全':!r.depth&&!r.terminal?");
 s=patch(s,"box.append(p);if(r.move)","if(Object.hasOwn(r,'selectedHasSameDepthScore')){const metric=k=>Object.hasOwn(r,k)&&r[k]!==null?r[k]:'未报告';p.textContent+=' · 所选着'+(r.selectedHasSameDepthScore?'有深度'+r.selectedScoreDepth+'评分':'无同深度评分')+' · 样本 '+metric('samples')+' · 同层根 '+metric('comparedCount')+'/'+metric('rootCount')+' · 完成 '+metric('completedDepth')+' · 全根 '+metric('fullRootDepth');}box.append(p);if(r.move)");
 return s;
}
export function browserOverrides(){return new Map([
 ['app.js',appSource()],
 ['deadline-search.js',deadlineSource({browser:true})],
 ['worker.js',fs.readFileSync(new URL('../../../worker.js',import.meta.url),'utf8').replace("'./ai.js'","'/native/experiments/rule-priority/javascript.mjs'")]
]);}
