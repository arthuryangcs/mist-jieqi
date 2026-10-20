import fs from 'node:fs';import path from 'node:path';import {spawnSync,execFileSync} from 'node:child_process';
import {focusSource,compileFocus as priorCompile,originalBuild,patch,sha} from './focus-variants.mjs';
export {originalBuild,sha};export const dir='benchmarks/frontier';
export const variants=['coverage','cap','combined'];
export function frontierSource(name,{audit=false}={}){
 if(!variants.includes(name))throw Error('Unknown frontier profile');
 let s=focusSource('both',{audit});
 s=patch(s,'namespace mist {',`namespace mist {\nconstexpr bool coverageRepairEnabled=${name!=='cap'},capRepairEnabled=${name!=='coverage'};`);
 return patch(s,fs.readFileSync('native/focus-policy.inc','utf8'),fs.readFileSync('native/frontier-policy.inc','utf8'));
}
function archive(b,source){fs.mkdirSync(`${dir}/sources`,{recursive:true});fs.writeFileSync(`${dir}/sources/${b.sourceSha256}.cpp`,source);return b;}
export function compileFrontier(name,{audit=false,sanitizer=null}={}){
 fs.mkdirSync(dir,{recursive:true});
 if(name==='baseline'){const b=originalBuild();return archive(b,fs.readFileSync('native/search.cpp'));}
 if(name==='old'||name==='reference'||name==='auditBaseline'){
  const oldName=name==='old'?'both':name==='reference'?'tacticalCanonical':'baseline',b=priorCompile(oldName,{audit,sanitizer});return archive({...b,name},focusSource(oldName,{audit}));
 }
 const source=frontierSource(name,{audit}),cache='.cache/frontier';fs.mkdirSync(cache,{recursive:true});
 const file=`${cache}/${name}${audit?'-audit':''}${sanitizer?'-'+sanitizer:''}.cpp`,binary=path.resolve(file.slice(0,-4));fs.writeFileSync(file,source);
 let flags=JSON.parse(fs.readFileSync('benchmarks/focus/baseline-build.json')).flags;
 if(sanitizer)flags=flags.filter(x=>!['-O3','-DNDEBUG'].includes(x)).concat(['-O1','-g',`-fsanitize=${sanitizer}`,'-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']);
 const compiler=process.env.CXX||'clang++',version=spawnSync(compiler,['--version'],{encoding:'utf8'});if(version.status!==0)throw Error(version.stderr);
 try{const b=JSON.parse(fs.readFileSync(binary+'.json'));if(b.sourceSha256===sha(source)&&b.binarySha256===sha(fs.readFileSync(binary))&&b.compiler===version.stdout.trim()&&JSON.stringify(b.flags)===JSON.stringify(flags))return archive(b,source);}catch{}
 const r=spawnSync(compiler,[...flags,file,'-o',binary],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);
 const b={name,audit,sanitizer,binary,sourceSha256:sha(source),binarySha256:sha(fs.readFileSync(binary)),flags,compiler:version.stdout.trim(),warnings:r.stderr};fs.writeFileSync(binary+'.json',JSON.stringify(b,null,2)+'\n');return archive(b,source);
}
// Adapter only for the retained independent audit harness. It still compares
// every selected row to the original full-root canonical reference.
export function compileFocus(name,options){return compileFrontier(name==='both'?(process.env.FRONTIER_VARIANT||'combined'):name==='tacticalCanonical'?'reference':name==='baseline'?'auditBaseline':name,options);}
export function freezeRound(){
 const p=`${dir}/freeze.json`;if(fs.existsSync(p))return JSON.parse(fs.readFileSync(p));
 const files=['native/search.cpp','ai.js','engine.js','native/bridge.mjs','native/focus-engine.mjs','native/focus-policy.inc','native/focus-tactics.inc','native/focus-variants.mjs','native/frontier-policy.inc','native/frontier-variants.mjs'];
 const r={createdAt:new Date().toISOString(),baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,arch:process.arch,sourceHashes:Object.fromEntries(files.map(p=>[p,sha(fs.readFileSync(p))])),builds:['baseline','old',...variants].map(n=>compileFrontier(n)),decisionGate:'No default replacement without rule/per-world/sanitizer/UI checks, >=5/8 own-baseline screen points, then >=12/20 independent1000ms confirmation points and no technical/unresolved games. Pika direct paired controls do not override a failed own-baseline gate. No tuning after frozen match configs.',information:'Only actor publicState; captor-private dark captures; fixed8 samples, max4 world threads,90k TT entries/world; identical samples and depth within any published root tier.'};fs.writeFileSync(p,JSON.stringify(r,null,2)+'\n');return r;
}
