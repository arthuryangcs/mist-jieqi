// Local-only build of the fixed upstream source. No install, scripts or engine execution.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const cache='.cache/ab-jchess',dir='benchmarks/ab-jchess',upstream='external/AB-JChess-v0.2d';
export const commit='fe35d87c7553fd23e8aab3a1dde7e712f286b416';
export const sha=x=>createHash('sha256').update(x).digest('hex'),hash=p=>sha(fs.readFileSync(p));
export const binary=path.resolve(cache+'/AB-JChess-v0.2d-x86-64'),model=path.resolve(cache+'/abjchess-20261010.nnue');
export async function build(){
const actual=execFileSync('git',['-C',upstream,'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(actual!==commit)throw Error('Upstream commit changed');
if(execFileSync('git',['-C',upstream,'status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Upstream tree changed');
if(hash(model)!=='05c13ac64f5b8ede77cfdc408d399d1f235564ba0999e2c768bebaeedb1db761')throw Error('Model changed');
const sourceRoot=path.resolve(upstream+'/abjchess/src'),saved=JSON.parse(fs.readFileSync('.cache/native/build.json')),headerIndex=saved.flags.indexOf('-isystem');
if(headerIndex<0)throw Error('Existing SDK headers unavailable');
const flags=['-std=c++17','-O3','-funroll-loops','-DNDEBUG','-ffp-contract=off','-flto=full','-arch','x86_64','-mmacosx-version-min=10.15','-pthread','-DABJCHESS_V11','-DABJNNUE_RUNTIME_REFRESH_CACHE','-DABJNNUE_RUNTIME_SIMD_TRANSFORM','-DIS_64BIT','-DUSE_SSE2','-DNO_PREFETCH','-DUSE_PTHREADS','-isystem',saved.flags[headerIndex+1],'-I',sourceRoot];
const files=fs.readdirSync(sourceRoot,{recursive:true}).filter(p=>p.endsWith('.cpp')).sort();fs.mkdirSync(cache+'/objects',{recursive:true});fs.mkdirSync(dir,{recursive:true});
const objects=files.map(p=>path.resolve(cache+'/objects/'+p.replaceAll('/','_')+'.o'));
const record={upstream:'https://github.com/lxsgx23/AB-JChess',tag:'v0.2d',commit,modelSha256:hash(model),modelBytes:fs.statSync(model).size,license:'GPL-3.0 source; release model has no separate license file; local use only, no redistribution',arch:'x86_64 generic SSE2; no unverified BMI2/AVX2',flags:flags.map(x=>x.replaceAll(process.cwd(),'<project>')),compiler:execFileSync('clang++',['--version'],{encoding:'utf8'}).trim(),sources:Object.fromEntries(files.map(f=>[f,hash(sourceRoot+'/'+f)])),completed:[],passed:false};
const persist=()=>fs.writeFileSync(dir+'/build.json',JSON.stringify(record,null,2)+'\n');
async function run(args){return new Promise((resolve,reject)=>{const p=spawn('clang++',args,{stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>out+=b);p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(Error('compiler exit '+code+'\n'+out)));});}
try{
 for(let i=0;i<files.length;i++){
  const warnings=await run([...flags,'-c',sourceRoot+'/'+files[i],'-o',objects[i]]);record.completed.push({source:files[i],warnings:warnings.replaceAll(process.cwd(),'<project>')});persist();console.log(JSON.stringify({compiled:i+1,total:files.length,source:files[i]}));
 }
 record.linkWarnings=(await run([...flags,...objects,'-o',binary])).replaceAll(process.cwd(),'<project>');record.binarySha256=hash(binary);record.binaryBytes=fs.statSync(binary).size;record.passed=true;persist();console.log(JSON.stringify({passed:true,binarySha256:record.binarySha256}));
}catch(e){record.error=e.message.replaceAll(process.cwd(),'<project>');persist();throw e;}
return record;
}
if(process.argv[1]===fileURLToPath(import.meta.url))await build();
