// Prespecified independent confirmation; no engines, tuning, or default writes.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const plan=JSON.parse(fs.readFileSync(new URL('./plan.json',import.meta.url)));
export function score(g){assert(g.result);const r=g.result;assert(['decided','draw','unresolved'].includes(r.status));return r.status==='unresolved'?0:r.winner===g.candidateSide?1:r.status==='draw'?.5:0;}
export function signTail(positive,negative){assert(Number.isInteger(positive)&&Number.isInteger(negative)&&positive>=0&&negative>=0&&positive+negative<=16);const n=positive+negative;let choose=1,sum=0;for(let k=0;k<=n;k++){if(k>=positive)sum+=choose;choose=choose*(n-k)/(k+1);}return sum/2**n;}
export function analyze(r,{replayReport=null,auditReport=null,ledgerSha256=null}={}){
 const expected=plan.matches.seeds.flatMap(seed=>['r','b'].map(candidateSide=>({seed,candidateSide,group:'internal',kind:'stable',candidateName:'candidate'})));
 assert.deepEqual(r.tasks,expected,'confirmation task list differs from prospective plan');assert(Array.isArray(r.games));const seen=new Set();
 for(const g of r.games){assert(!seen.has(g.index),'duplicate game index');seen.add(g.index);assert(expected[g.index]);for(const [k,v]of Object.entries(expected[g.index]))assert.equal(g[k],v,k);}
 const rows=[];for(const seed of plan.matches.seeds){const games=r.games.filter(g=>g.seed===seed&&g.result);if(games.length===2){const mean=games.reduce((n,g)=>n+score(g),0)/2;rows.push({seed,mean,sign:mean>.5?'positive':mean<.5?'negative':'tie'});}}
 const positive=rows.filter(x=>x.sign==='positive').length,negative=rows.filter(x=>x.sign==='negative').length,ties=rows.length-positive-negative;
 const finished=r.games.filter(g=>g.result),points=finished.reduce((n,g)=>n+score(g),0),worstCaseTotalScore=points/32;
 const complete=!!r.completedAt&&r.games.length===32&&finished.length===32&&rows.length===16;
 const technicalFailures=finished.filter(g=>g.result.technicalForfeit).length,cleanupFailures=r.games.reduce((n,g)=>n+(g.cleanupErrors?.length??0),0);
 // No interim p-value or success indication: all planned pairs must finish.
 const pValue=complete?signTail(positive,negative):null;
 const statisticalGate=complete&&pValue<=.05&&worstCaseTotalScore>=.60;
 const replayPassed=!!ledgerSha256&&replayReport?.passed===true&&replayReport?.complete===true&&replayReport?.games===32&&replayReport?.matchesSha256===ledgerSha256;
 const auditPassed=!!ledgerSha256&&auditReport?.passed===true&&auditReport?.complete===true&&auditReport?.auditedGames===32&&auditReport?.inputSha256===ledgerSha256;
 return {experiment:plan.experiment,complete,expectedLayouts:16,expectedGames:32,completedLayouts:rows.length,finishedGames:finished.length,positive,negative,ties,nonTieLayouts:positive+negative,pValue,alpha:.05,worstCasePoints:points,worstCaseTotalScore,requiredWorstCaseTotalScore:.60,technicalFailures,cleanupFailures,statisticalGate,replayPassed,auditPassed,eligibleForDefaultReview:statisticalGate&&technicalFailures===0&&cleanupFailures===0&&replayPassed&&auditPassed,defaultEnable:false,requiresFinalRulePrivacyRegressionReview:true,rows,inference:'Exact one-sided paired-layout win tendency conditional on non-ties; not a confidence interval for exact population mean or Elo. Prior144games are exploratory and excluded. No early stop, extension, parameter change or outcome-based replacement.'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const [input,replayFile,auditFile]=process.argv.slice(2);assert(input,'Usage: analysis.mjs MATCHES.json [REPLAY.json AUDIT.json]');const raw=fs.readFileSync(input),read=p=>p?JSON.parse(fs.readFileSync(p)):null;console.log(JSON.stringify(analyze(JSON.parse(raw),{ledgerSha256:createHash('sha256').update(raw).digest('hex'),replayReport:read(replayFile),auditReport:read(auditFile)}),null,2));}
