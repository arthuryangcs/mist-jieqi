// Export only this synthetic experiment. No user games, referee boards or binaries.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {cache,hash,binary} from './build.mjs';
const dir=process.env.MIST_MATCH_DIR??cache+'/daily-2026-11-03',r=JSON.parse(fs.readFileSync(dir+'/matches.json')),replay=JSON.parse(fs.readFileSync(dir+'/replay.json'));
assert(r.completedAt&&r.games.length===8&&r.games.every(g=>g.result));assert(replay.passed&&replay.games.length===8);
const out='benchmarks/search-speed';fs.mkdirSync(out,{recursive:true});
const publicRecord={synthetic:true,refereeSeedsMustNotBeEngineInputs:true,createdAt:r.createdAt,completedAt:r.completedAt,budgetMs:r.budgetMs,graceMs:r.graceMs,maxPlies:r.maxPlies,selection:r.selection,opponent:r.opponent,initials:r.initials,summary:r.summary,sourceProvenance:{candidateSourceSha256:hash('native/experiments/search-speed/search.cpp'),candidateBinarySha256:hash(binary),stableBinarySha256:hash(dir+'/stable')},games:r.games.map(g=>({index:g.index,seed:g.seed,kind:g.kind,candidateSide:g.candidateSide,startedAt:g.startedAt,finishedAt:g.finishedAt,plies:g.finalState.ply,result:g.result,candidateCapabilities:g.candidateCapabilities,stableCapabilities:g.stableCapabilities,pikaConfig:g.pikaConfig,log:g.log.map(({captured,clock,...row})=>({...row,clock:clock?Object.fromEntries(Object.entries(clock).filter(([k])=>!['frames','commands','start'].includes(k))):null,capturedPublic:captured?{side:captured.side,hidden:captured.hidden,...(!captured.hidden?{type:captured.type}:{})}:null}))}))};
fs.writeFileSync(out+'/matches.json',JSON.stringify(publicRecord,null,2)+'\n');
fs.writeFileSync(out+'/replay.json',JSON.stringify(replay,null,2)+'\n');
for(const n of['check','check-sanitized','check-tsan','reference','reference-sanitized','rules','rules-sanitized']){
 const a=JSON.parse(fs.readFileSync(cache+'/'+n+'.json'));assert(a.passed);delete a.build;delete a.runtimeStderr;
 fs.writeFileSync(out+'/'+n+'.json',JSON.stringify(a,null,2)+'\n');
}
const protocol=JSON.parse(fs.readFileSync(cache+'/pika-protocol.json'));assert(protocol.passed);fs.writeFileSync(out+'/pika-protocol.json',JSON.stringify(protocol,null,2)+'\n');
console.log(JSON.stringify({exported:true,games:publicRecord.games.length,moves:replay.moves,privateChecks:replay.privateChecks}));
