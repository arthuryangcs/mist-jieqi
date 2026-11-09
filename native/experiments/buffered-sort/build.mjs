// Isolated exact-order HCE experiment. Imports never write files.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {sourceOf as normalizedControl,patch,hash,sha,stableSource} from '../selfplay-value/build.mjs';
export {patch,hash,sha,stableSource};
export const cache='.cache/buffered-sort',dir='benchmarks/buffered-sort';
export function sourceOf({trial=true}={}) {
 let s=normalizedControl({trial:false});if(!trial)return s;
 s=patch(s,'struct Search {',fs.readFileSync('native/experiments/buffered-sort/sort.hpp','utf8')+'\nstruct Search {');
 s=patch(s,'std::array<std::vector<ScoredMove>,MAX_SEARCH_PLY> scoreBuffers;','std::array<std::vector<ScoredMove>,MAX_SEARCH_PLY> scoreBuffers;\n    std::vector<ScoredMove> sortScratch;');
 return patch(s,'std::stable_sort(scored.begin(),scored.end(),[](const ScoredMove& a,const ScoredMove& b){return a.score>b.score;});','bufferedStableSort(scored,sortScratch);');
}
export function compile(source,binary,{sanitize=false}={}){
 const flags=['-std=c++17','-ffp-contract=off',...(sanitize?['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']:['-O3','-DNDEBUG'])];
 if(process.platform==='darwin'){const r=spawnSync('xcrun',['--show-sdk-path'],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);flags.push('-isystem',path.join(r.stdout.trim(),'usr/include/c++/v1'));}else flags.push('-pthread');
 const compiler=process.env.CXX||'clang++',v=spawnSync(compiler,['--version'],{encoding:'utf8'}),r=spawnSync(compiler,[...flags,source,'-o',binary],{encoding:'utf8',timeout:120000});if(r.status!==0)throw Error(r.stderr||String(r.error));return{compiler:compiler,compilerVersion:v.stdout.trim().split('\n').filter(l=>!l.startsWith('InstalledDir:')).join('\n'),flags:flags.map(f=>path.isAbsolute(f)?'<system-c++-include>':f),warnings:r.stderr.trim()};
}
export function build({trial=true,sanitize=false}={}) {
 fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});const name=(trial?'candidate':'control')+(sanitize?'-sanitized':''),source=path.resolve(cache+'/'+name+'.cpp'),binary=path.resolve(cache+'/'+name);
 fs.writeFileSync(source,sourceOf({trial}));const compiler=compile(source,binary,{sanitize});
 const r={trial,sanitize,stableSourceSha256:stableSource,sourceSha256:hash(source),binarySha256:hash(binary),headerSha256:hash('native/experiments/buffered-sort/sort.hpp'),...compiler};fs.writeFileSync(cache+'/'+name+'-build.json',JSON.stringify(r,null,2)+'\n');return{binary,...r};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({trial:!process.argv.includes('--control'),sanitize:process.argv.includes('--sanitize')})));
