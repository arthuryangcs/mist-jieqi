import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {compile,cache,dir,hash} from './build.mjs';
const sanitize=process.argv.includes('--sanitize');fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});
for(const f of ['sort.hpp','sort-probe.cpp'])fs.copyFileSync(new URL(f,import.meta.url),cache+'/'+f);
const binary=path.resolve(cache+'/sort-probe'+(sanitize?'-sanitized':'')),compiler=compile(path.resolve(cache+'/sort-probe.cpp'),binary,{sanitize});
const x=spawnSync(binary,[],{encoding:'utf8',timeout:120000});assert.equal(x.status,0,x.stderr);assert.equal(x.stderr,'');const r={...JSON.parse(x.stdout),sanitize,compiler,headerSha256:hash(cache+'/sort.hpp')};fs.writeFileSync(dir+'/sort-probe'+(sanitize?'-sanitized':'')+'.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
