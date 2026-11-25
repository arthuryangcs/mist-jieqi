import fs from 'node:fs';import assert from 'node:assert/strict';
import {hash,environment}from './build.mjs';import {browserOverrides}from './entry-source.mjs';
export async function transport(){
 const url=new URL('../../server.mjs',import.meta.url);assert.equal(hash(url),'062f0fd5b823264e578f5b2fb4518a853dfa34a227d3399ee8211b91e4e51ff7');
 let s=fs.readFileSync(url,'utf8');s=s.slice(0,s.indexOf('\nif(process.argv[1]===fileURLToPath(import.meta.url))'));
 const once=(a,b)=>{assert.equal(s.split(a).length,2,a);s=s.replace(a,b);};
 once("'.js':'text/javascript; charset=utf-8'","'.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8'");
 once('maxSearches=2}={})','maxSearches=2,createNative=null}={})');
 once('native=new Native({binary:executable})','native=createNative?createNative({binary:executable}):new Native({binary:executable})');
 once('const top=r.allCandidates?.[0]||{};','r=selectResult(r,f.priorityContext);const top=r.allCandidates?.find(x=>same(x,r.move))||{};');
 once("const fallback={move:legalMoves(input.view)[0]||null,depth:0,nodes:0,samples:0,score:0,elapsedMs:0,allCandidates:[]};",'const fallback=publicFallback(f.priorityContext);');
 once("fallbackUsed:!r.depth&&!r.terminal","fallbackUsed:!r.terminal&&(!r.depth||r.selectedHasSameDepthScore===false)");
 once("const data=fs.readFileSync(path.join(root,file));","const virtual=overrides.get(file),data=virtual===undefined?fs.readFileSync(path.join(root,file)):Buffer.from(virtual);");
 s=s.replace(/from\s*(['"])(\.\.?\/[^'"]+)\1/g,(_m,q,p)=>'from '+JSON.stringify(p==='./bridge.mjs'?new URL('./bridge.mjs',import.meta.url).href:new URL(p,url).href));
 s='import{selectResult,same,mergeMetrics,fallback as publicFallback}from '+JSON.stringify(new URL('./selection.mjs',import.meta.url).href)+';\nimport{browserOverrides}from '+JSON.stringify(new URL('./entry-source.mjs',import.meta.url).href)+';\n'+s;
 const at=s.indexOf('async function readJSON');assert(at>0);
 s=s.slice(0,at)+`const overrides=browserOverrides();for(const f of ['native/experiments/rule-priority/selection.mjs','native/experiments/rule-priority/javascript.mjs','native/experiments/rule-reply/policy.mjs'])staticFiles.set('/'+f,f);\n`+s.slice(at);
 environment();return import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
}
