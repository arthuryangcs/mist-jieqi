// Adapt existing rule/thread checks into the isolated cache, never edit originals.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {gate,root,variant,save,hash} from './common.mjs';
const [name,suite]=process.argv.slice(2);assert(['baseline','snapshot','integer','fma'].includes(name));assert(['rules','thread-check'].includes(suite));gate();
assert(!fs.existsSync(root+'/run.lock'),'Another speed operation is running');fs.mkdirSync(root,{recursive:true});fs.writeFileSync(root+'/run.lock',JSON.stringify({pid:process.pid}),{flag:'wx'});
try{
 const dir=`${root}/suites/${name}`,sourcePath=path.resolve(`native/experiments/jqe-current/${suite}.mjs`),v=variant(name);
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/nnue.hpp',v.header);
 const url=p=>pathToFileURL(path.resolve(p)).href;
 const shim=`import {build as b,variant,hash,sha,modelFile,modelSha256,patch,gate} from ${JSON.stringify(url('native/experiments/jqe-speed/common.mjs'))};
import {compile as c} from ${JSON.stringify(url('native/experiments/jqe-current/build.mjs'))};
export {hash,sha,modelFile,modelSha256,patch};
export const cache=${JSON.stringify(dir)},dir=cache;
export function sourceOf(){gate();return variant(${JSON.stringify(name)}).source;}
export function build(options){return b(${JSON.stringify(name)},options);}
export function compile(...args){gate();return c(...args);}
`;
 fs.writeFileSync(dir+'/shim.mjs',shim);
 let text=fs.readFileSync(sourcePath,'utf8');
 text=text.replace(/from\s*(['"])(\.\.?\/[^'"]+)\1/g,(_m,q,s)=>'from '+JSON.stringify(s==='./build.mjs'?url(dir+'/shim.mjs'):pathToFileURL(path.resolve(path.dirname(sourcePath),s)).href));
 text=text.replaceAll('.cache/jqe-current/thread-check',dir+'/thread-check').replaceAll('benchmarks/jqe-current-2026-11-09',dir);
 // Only the header path is redirected; test identity references stay truthful.
 text=text.replaceAll('native/experiments/jqe-current/nnue.hpp',dir+'/nnue.hpp');
 const file=path.resolve(dir+'/'+suite+'.mjs');fs.writeFileSync(file,text);
 const r=spawnSync(process.execPath,[file,...(process.argv.includes('--sanitize')?['--sanitize']:[])],{encoding:'utf8',timeout:1200000,env:process.env});
 save(`${name}-${suite}-suite.json`,{passed:r.status===0,status:r.status,originalSourceSha256:hash(sourcePath),adaptedSourceSha256:hash(file),stdout:r.stdout,stderr:r.stderr});assert.equal(r.status,0,'Isolated suite failed; inspect local record');
}finally{fs.unlinkSync(root+'/run.lock');}
