import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {sourceOf,sha} from './source.mjs';import {compile} from '../selfplay-value/build.mjs';
import {sourceOf as hceSource} from '../jqe-current/build.mjs';
export {sourceOf,sha};export const cache='.cache/default-all-20261118',dir=cache+'/checks',model='models/experimental/observation-nnue-v1.bin';
export const modelFile=path.resolve(model);
export const hash=p=>sha(fs.readFileSync(p));
export const baseline=path.resolve(cache+'/hce');
export function buildControl(){fs.mkdirSync(dir,{recursive:true});const source=baseline+'.cpp',s=hceSource({trial:false}),manifest=baseline+'.json';if(fs.existsSync(manifest)&&fs.existsSync(baseline)){const b=JSON.parse(fs.readFileSync(manifest));if(b.sourceSha256===sha(s)&&b.binarySha256===hash(baseline))return{binary:baseline,...b};}fs.writeFileSync(source,s);const compiler=compile(source,baseline);const b={sourceSha256:sha(s),binarySha256:hash(baseline),...compiler};fs.writeFileSync(manifest,JSON.stringify(b,null,2)+'\n');return{binary:baseline,...b};}
export function environment(){process.env.MIST_NNUE_MODEL=path.resolve(model);process.env.MIST_NNUE_FULL='0';}
export function build({sanitize=false}={}){
 const inventory=JSON.parse(fs.readFileSync(new URL('inventory.json',import.meta.url)));if(hash(model)!==inventory.model.sha256)throw Error('Default residual model hash mismatch');
 fs.mkdirSync(dir,{recursive:true});const source=path.resolve(cache+'/default'+(sanitize?'-sanitized':'')+'.cpp'),binary=source.slice(0,-4),manifest=binary+'.json';const s=sourceOf();
 fs.copyFileSync(new URL('../nnue/nnue.hpp',import.meta.url),cache+'/nnue.hpp');fs.writeFileSync(source,s);environment();
 if(fs.existsSync(binary)&&fs.existsSync(manifest)){const b=JSON.parse(fs.readFileSync(manifest));if(b.sourceSha256===sha(s)&&b.headerSha256===hash(cache+'/nnue.hpp')&&b.binarySha256===hash(binary)&&b.sanitize===sanitize)return {binary,...b};}
 const compiler=compile(source,binary,{sanitize});const p=spawnSync(binary,[],{input:'',encoding:'utf8',timeout:10000});if(p.status!==0||p.stderr.trim())throw Error(p.stderr||String(p.error)||'Default startup failed');const capabilities=JSON.parse(p.stdout.trim());if(capabilities.defaultPreset!=='all-compatible-v2'||!capabilities.currentRootResponsibility)throw Error('Wrong default capabilities');
 const r={sourceSha256:sha(s),headerSha256:hash(cache+'/nnue.hpp'),binarySha256:hash(binary),modelSha256:hash(model),sanitize,threads:4,independentWorldSearch:true,unlimitedDepth:true,depthMetrics:true,safetyMaxPly:127,profile:'all-compatible-v2',samples:15,capabilities,...compiler};fs.writeFileSync(manifest,JSON.stringify(r,null,2)+'\n');return {binary,...r};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize')})));
