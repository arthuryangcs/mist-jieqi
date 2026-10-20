// Final archive/link/source integrity only; run after reports and page status.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync,execFileSync} from 'node:child_process';
import {dir,sha} from './frontier-variants.mjs';
const s=JSON.parse(fs.readFileSync(`${dir}/summary.json`));assert(s.defaultUnchanged);
for(const [p,h]of Object.entries(s.productionHashes)){assert.equal(sha(fs.readFileSync(p)),h,p);assert.equal(h,sha(execFileSync('git',['show',s.baseCommit+':'+p])),p);}
for(const [p,h]of Object.entries(s.sourceHashes))assert.equal(sha(fs.readFileSync(p)),h,p);
for(const [p,h]of Object.entries(s.artifactHashes))assert.equal(sha(fs.readFileSync(`${dir}/${p}`)),h,p);
const modules=fs.readdirSync('native').filter(f=>/^frontier-.*\.mjs$/.test(f));for(const f of modules){const r=spawnSync(process.execPath,['--check','native/'+f],{encoding:'utf8'});assert.equal(r.status,0,f+' '+r.stderr);}
const docs=['FRONTIER_SEARCH_REPORT.md','README.md','native/README.md'],links=[];
for(const p of docs)for(const m of fs.readFileSync(p,'utf8').matchAll(/\]\(([^)]+)\)/g)){const target=m[1];if(/^(https?:|#)/.test(target))continue;assert(fs.existsSync(path.resolve(path.dirname(p),target.split('#')[0])),p+' '+target);links.push({document:p,target});}
const pages=JSON.parse(fs.readFileSync(`${dir}/pages-status.json`));assert(pages.results.every(x=>x.status===200&&x.pageStatus===200));assert.equal(pages.results[0].body.sourceSha256,s.productionHashes['native/search.cpp']);
const result={passed:true,checkedAt:new Date().toISOString(),productionUnchanged:Object.keys(s.productionHashes),syntaxModules:modules.length,localLinks:links.length,summarySha256:sha(fs.readFileSync(`${dir}/summary.json`)),documentHashes:Object.fromEntries(docs.map(p=>[p,sha(fs.readFileSync(p))])),sourceHashes:s.sourceHashes,browserScope:'HTTP and simulated-DOM checks only; supported tool still provides no Chrome. No alternative automation used.',gates:s.gates,technical:Object.fromEntries(Object.entries(s.self).map(([n,x])=>[n,x.faults])),pikaFaults:s.pika.faults,defaultUnchanged:true};
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,syntaxModules:modules.length,localLinks:links.length,defaultUnchanged:true}));
