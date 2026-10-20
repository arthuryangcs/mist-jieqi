// Serial runner: no timed benchmark/match overlaps another search in this run.
import fs from 'node:fs';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {freezeRound,dir,sha} from './frontier-variants.mjs';
const frozen=freezeRound();for(const [p,h]of Object.entries(frozen.sourceHashes))assert.equal(sha(fs.readFileSync(p)),h,p);
for(const name of ['coverage','cap','combined'])for(const kind of ['release','asan'])assert(JSON.parse(fs.readFileSync(`${dir}/check-${name}-${kind}.json`)).passed);
for(const name of ['check-combined-tsan','invariants','ui-controller','service-combined','unit'])assert(JSON.parse(fs.readFileSync(`${dir}/${name}.json`)).passed,name);
const r={startedAt:new Date().toISOString(),steps:[],passed:false};
async function run(args,env={}){
 const item={args,startedAt:new Date().toISOString()};r.steps.push(item);fs.writeFileSync(`${dir}/pipeline.json`,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({stage:args.join(' '),startedAt:item.startedAt}));
 await new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});p.stdout.on('data',x=>process.stdout.write(x));p.stderr.on('data',x=>process.stderr.write(x));p.on('error',reject);p.on('exit',(code,signal)=>{item.finishedAt=new Date().toISOString();item.code=code;item.signal=signal;if(code===0)resolve();else reject(Error('Stage failed '+args.join(' ')));});});
 fs.writeFileSync(`${dir}/pipeline.json`,JSON.stringify(r,null,2)+'\n');
}
try{
 await run(['native/frontier-benchmark.mjs','budgets']);await run(['native/frontier-benchmark.mjs','diagnostic']);
 for(const name of ['coverage','cap','combined']){await run(['native/frontier-match.mjs',name,'screen']);await run(['native/frontier-match-verify.mjs',name,'screen']);}
 const screen=JSON.parse(fs.readFileSync(`${dir}/matches-combined-screen-production.json`));
 if(screen.summary.scoreRate>=.625&&!screen.summary.technical.length&&!screen.summary.unresolved){await run(['native/frontier-match.mjs','combined','confirm']);await run(['native/frontier-match-verify.mjs','combined','confirm']);}
 const pikaEnv={JIEQI_ENGINE_PATH:'./external/pikafish-jieqi-wasm/src/PikaJieQi'};
 if(!fs.existsSync(`${dir}/pika-combined.json`))await run(['native/frontier-pika.mjs','combined','freeze'],pikaEnv);
 await run(['native/frontier-pika.mjs','combined','run'],pikaEnv);await run(['native/frontier-pika-verify.mjs','combined']);r.passed=true;
}catch(e){r.error=e.stack;throw e;}finally{r.finishedAt=new Date().toISOString();fs.writeFileSync(`${dir}/pipeline.json`,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({pipelinePassed:r.passed,error:r.error}));}
