import{mergeSearchStats as mergeBase}from '../../../search-metrics.js';
import {legalMoves,rootRules} from '../../../engine.js';
import {ruleReplyLosses} from '../rule-reply/policy.mjs';

export const key=m=>m?m.from*90+m.to:-1;
export const same=(a,b)=>!!a&&!!b&&key(a)===key(b);
const flags=['from','to','draw','repetitionLoss','repetitionWin','ruleReplyLoss','repetitionCount'];
const scored=['score','spread','heuristicWinRate','sampleWins','sampleLosses','baseScore','tailLoss','riskWeight','riskPenalty'];
export function context(view,{entries,proofs}={}){
 const legal=legalMoves(view),rules=entries??legal.map(m=>({...m,...rootRules(view,m)}));
 proofs??=ruleReplyLosses(view,rules);
 const losses=new Set([...rules.filter(r=>r.loss),...proofs].map(key));
 return {legal,losses,proofs};
}
// No score is invented for an omitted root. All metrics keep their original
// presence/value; the selected move has a separate, explicit score provenance.
export function selectResult(r,c){
 const legal=new Set(c.legal.map(key)),unproved=c.legal.filter(m=>!c.losses.has(key(m)));
 const order=(a,b)=>Number(c.losses.has(key(a)))-Number(c.losses.has(key(b)))||((Number.isFinite(b.score)?b.score:-Infinity)-(Number.isFinite(a.score)?a.score:-Infinity));
 const table=(r.allCandidates??r.candidates??[]).filter(m=>legal.has(key(m))).map(m=>({...m,provenRuleLoss:c.losses.has(key(m))})).sort(order);
 const original=r.move,keep=legal.has(key(original))&&(!c.losses.has(key(original))||!unproved.length);
 const picked=keep?original:table.find(m=>!c.losses.has(key(m)))??unproved[0]??(legal.has(key(original))?original:table[0]??c.legal[0])??null;
 const row=table.find(m=>same(m,picked)),comparisonDepth=r.comparisonDepth??r.depth;
 const explicitUnscored=same(picked,original)&&r.selectedHasSameDepthScore===false;
 const tableScore=!explicitUnscored&&!!row&&(!row.scoreBound||row.scoreBound==='exact')&&Number.isFinite(row.score)&&Number.isInteger(comparisonDepth)&&comparisonDepth>0;
 const declaredScore=same(picked,original)&&r.selectedHasSameDepthScore===true&&Number.isFinite(r.score)&&r.selectedScoreDepth===comparisonDepth&&comparisonDepth>0;
 const hasScore=tableScore||declaredScore,result={...r,move:picked?{from:picked.from,to:picked.to}:null};
 if(tableScore){for(const k of [...scored,...flags])if(Object.hasOwn(row,k))result[k]=row[k];else delete result[k];}
 else if(!declaredScore){for(const k of scored)if(Object.hasOwn(result,k))result[k]=null;result.score=null;for(const k of flags)delete result[k];}
 if(Array.isArray(r.allCandidates))result.allCandidates=table;
 if(Array.isArray(r.candidates))result.candidates=table.slice(0,r.candidates.length);
 return {...result,selectedHasSameDepthScore:hasScore,selectedScoreDepth:hasScore?comparisonDepth:null,
  selectedProvenRuleLoss:picked?c.losses.has(key(picked)):false,unprovedLegalCount:unproved.length,
  selectionReason:!picked?'terminal-no-legal-move':!unproved.length&&picked?'all-legal-roots-proved-loss':!same(original,picked)?'public-proven-loss-demoted':'keep-unproved-selection',
  ruleReplyProofs:c.proofs,selectedBy:same(original,picked)?'source-root-choice':'host-public-rule-priority',selectionScoreSource:hasScore?'same-depth-root':'unscored-legal-selection'};
}
export function fallback(c){
 return selectResult({move:c.legal[0]??null,candidates:[],depth:0,score:null,nodes:0,samples:0,
  completedDepth:0,comparedCount:0,rootCount:c.legal.length,fullRootDepth:0,terminal:!c.legal.length,
  metricsOrigin:'host-fallback-no-search-frame',sampleCountMeaning:'no-completed-search-frame'},c);
}
export const metricKeys=['samples','depth','comparisonDepth','completedDepth','fullRootDepth','comparedCount','rootCount','mainDepth','selDepth','selectedHasSameDepthScore','selectedScoreDepth','selectedProvenRuleLoss','score','fallbackUsed','deadlineStop'];
export function snapshot(r){return {move:r.move,fields:Object.fromEntries(metricKeys.filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]])),missing:metricKeys.filter(k=>!Object.hasOwn(r,k))};}

export function mergeMetrics(result,stats,options){const r=mergeBase(result,stats,options);for(const k of ['samples','comparedCount','rootCount','completedDepth','fullRootDepth'])if(Object.hasOwn(result,k))r[k]=result[k];else delete r[k];return r;}
