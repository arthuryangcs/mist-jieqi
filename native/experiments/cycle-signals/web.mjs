import fs from'node:fs';import assert from'node:assert/strict';import{hash,environment}from'./build.mjs';
export async function transport(){const url=new URL('../../server.mjs',import.meta.url);assert.equal(hash(url),'062f0fd5b823264e578f5b2fb4518a853dfa34a227d3399ee8211b91e4e51ff7');let s=fs.readFileSync(url,'utf8');s=s.slice(0,s.indexOf('\nif(process.argv[1]===fileURLToPath(import.meta.url))'));
 const once=(a,b)=>{assert.equal(s.split(a).length,2,a);s=s.replace(a,b);};
 once("'.js':'text/javascript; charset=utf-8'","'.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8'");
 once('maxSearches=2}={})','maxSearches=2,createNative=null}={})');
 once("const {samples=8,searchMode='STREAM',engineProfile='hce'}","const {signalsEnabled=true,maxSignalMs=100,samples=8,searchMode='STREAM',engineProfile='hce'}");
 once('native=new Native({binary:executable})','native=createNative?createNative({binary:executable,signalsEnabled,maxSignalMs}):new Native({binary:executable,signalsEnabled,maxSignalMs})');
 once('const top=r.allCandidates?.[0]||{};',"r={...r,cycleSignals:r.cycleSignals??native.currentDiagnostics??{enabled:signalsEnabled,available:false,reason:'no-diagnostic-frame',signalOnly:true,adjudicationChanged:false}};const top=r.allCandidates?.[0]||{};");
 once('const data=fs.readFileSync(path.join(root,file));',"const data=file==='app.js'?Buffer.from(appSource()):file==='worker.js'?Buffer.from(workerSource(signalsEnabled)):fs.readFileSync(path.join(root,file));");
 s=s.replace(/from\s*(['"])(\.\.?\/[^'"]+)\1/g,(_m,q,p)=>'from '+JSON.stringify(p==='./bridge.mjs'?new URL('./bridge.mjs',import.meta.url).href:new URL(p,url).href));s='import{appSource,workerSource}from '+JSON.stringify(new URL('./entry-source.mjs',import.meta.url).href)+';\n'+s;
 const at=s.indexOf('async function readJSON');s=s.slice(0,at)+`for(const f of ['native/experiments/cycle-signals/javascript.mjs','native/experiments/cycle-signals/signals.mjs'])staticFiles.set('/'+f,f);\n`+s.slice(at);
 environment();return import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
}
