// Independent rules/observation replay plus re-evaluation of diagnostic metadata.
import fs from'node:fs';import assert from'node:assert/strict';
import{initial,positionKey,move}from'../../../engine.js';import{seeded}from'../../../ai.js';
import{audit,observation}from'../jqe-retest/audit.mjs';import{inspectCycle}from'./signals.mjs';import{hash,cache}from'./build.mjs';
const input=process.argv[2]??cache+'/matches.json',output=process.argv[3]??cache+'/audit.json',d=JSON.parse(fs.readFileSync(input)),base=audit(d);assert(base.passed&&base.complete);
function facts(x){if(Array.isArray(x))return x.map(facts);if(!x||typeof x!=='object')return x;return Object.fromEntries(Object.entries(x).filter(([k])=>!['elapsedMs','signalPreparationMs','diagnosticOnly','orderingChanged'].includes(k)).map(([k,v])=>[k,facts(v)]));}
let checks=0,available=0,incomplete=0;const events=[];
for(const g of d.games){let s=initial(seeded(g.seed));s.positions=[positionKey(s)];for(const row of g.log){if(row.engine==='candidate'){
 const e=row.cycleSignals;assert(e&&e.enabled&&e.diagnosticOnly);assert.equal(e.orderingChanged,false);assert.equal(e.adjudicationChanged,false);
 const expected=inspectCycle(observation(s,s.turn),{maxMs:Infinity});checks++;assert.equal(e.available,expected.available);
 if(e.available){available++;if(e.complete)assert.deepEqual(facts(e),facts(expected));else{incomplete++;assert.equal(e.localNoncheckingRiskCandidate,null);assert.equal(e.newlyAvailableMate,null);}events.push({gameIndex:g.index,ply:row.ply,move:row.move,evidence:e});}
 else assert.deepEqual(facts(e),facts(expected));
 }if(row.applied)s=move(s,row.move);}}
const r={...base,inputSha256:hash(input),signalsAudit:{passed:true,checks,available,incomplete,events,orderingChanged:false,adjudicationChanged:false,scope:'Original independent rule/observation replay plus complete public last-transition facts; not full competition chase/kill adjudication or unrecorded process-memory proof'}};
fs.writeFileSync(output,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({passed:true,complete:true,games:base.auditedGames,categories:base.categories,checks,available,incomplete}));
