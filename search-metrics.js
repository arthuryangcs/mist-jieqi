const integer=n=>Number.isSafeInteger(n)&&n>=0;
// Telemetry carries counters only. It never supplies a move or a score.
export function cleanSearchStats(s){
 if(!s||!integer(s.mainDepth)||!integer(s.selDepth)||!integer(s.completedDepth)||s.completedDepth>s.mainDepth||!Number.isFinite(s.elapsedMs)||s.elapsedMs<0)return null;
 return {mainDepth:s.mainDepth,selDepth:s.selDepth,completedDepth:s.completedDepth,...(integer(s.visitedNodes)?{visitedNodes:s.visitedNodes}:{}),statsExact:s.statsExact===true,searchStatus:'searching',elapsedMs:s.elapsedMs,...(s.engine?{engine:s.engine,engineVerified:s.engineVerified===true,sourceSha256:s.sourceSha256}:{} )};
}
export function mergeSearchStats(result,stats,{deadlineStop=false}={}){
 const r={...result},s=cleanSearchStats(stats);
 if(s){for(const key of ['mainDepth','selDepth','visitedNodes'])if(integer(s[key]))r[key]=Math.max(integer(r[key])?r[key]:0,s[key]);if(s.elapsedMs>(r.elapsedMs||0))r.elapsedMs=s.elapsedMs;}
 r.completedDepth=result.completedDepth??result.depth??0;
 if(deadlineStop){r.statsExact=false;r.searchStatus=r.completedDepth?'time-budget':'fallback';r.terminationReason='host-deadline';}
 return r;
}
export function depthSummary(r,{partial=false}={}){
 const sel=integer(r.selDepth)?r.selDepth+' 半回合':'未报告',main=integer(r.mainDepth)?r.mainDepth:'未报告',done=r.completedDepth??r.depth??0;
 const status=partial?'搜索中':r.fallbackUsed||r.searchStatus==='fallback'?'合法保底，尚无完整结果':r.deadlineStop||r.searchStatus==='time-budget'?'时间到，保留完整结果':r.terminationReason==='stack-safety'?'触及栈保护':'已结束';
 return `最深走子 ${sel}（含静态延伸${r.statsExact===false?'，已报告值':''}） · 主搜目标 ${main} · 完成迭代 ${done} · ${status}`;
}
