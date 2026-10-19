import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const root=fileURLToPath(new URL('..',import.meta.url));
export const binary=path.join(root,'.cache/native/mist-core');
export const manifestPath=path.join(root,'.cache/native/build.json');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function build({sanitize=false}={}) {
 const source=path.join(root,'native/search.cpp'),out=sanitize?binary+'-sanitized':binary;
 fs.mkdirSync(path.dirname(out),{recursive:true});
 const flags=['-std=c++17',...(sanitize?['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']:['-O3','-DNDEBUG']),'-ffp-contract=off','-Wall','-Wextra','-Wpedantic'];
 if(process.platform==='darwin'){
  const sdk=spawnSync('xcrun',['--show-sdk-path'],{encoding:'utf8'});if(sdk.status!==0)throw Error(sdk.stderr||'SDK不可用');
  const headers=path.join(sdk.stdout.trim(),'usr/include/c++/v1');
  if(fs.existsSync(path.join(headers,'iostream')))flags.push('-isystem',headers);
 }else flags.push('-pthread');
 const compiler=process.env.CXX||'clang++',version=spawnSync(compiler,['--version'],{encoding:'utf8'});if(version.status!==0)throw Error(version.stderr||'编译器不可用');
 const result=spawnSync(compiler,[...flags,source,'-o',out],{encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr||`编译失败${result.status}`);
 const probe=spawnSync(out,[],{input:'',encoding:'utf8',timeout:10000});
 if(probe.status!==0||probe.stderr.trim())throw Error(probe.stderr||'核心能力检查失败');
 const capabilities=JSON.parse(probe.stdout.trim());
 if(!capabilities.ready||!Number.isInteger(capabilities.threads)||capabilities.threads<1)throw Error('核心能力响应无效');
 const record={compiler:version.stdout.trim(),flags,threads:capabilities.threads,independentWorldSearch:capabilities.independentWorldSearch===true,architecture:process.arch,sourceSha256:sha(source),binarySha256:sha(out),sanitize,compilerWarnings:result.stderr.trim()};
 fs.writeFileSync(sanitize?manifestPath.replace('.json','-sanitized.json'):manifestPath,JSON.stringify(record,null,2)+'\n');return{binary:out,...record};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize')}),null,2));
