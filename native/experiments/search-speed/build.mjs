// Isolated, self-contained experiment. Does not replace .cache/native/mist-core.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

export const root=fileURLToPath(new URL('../../../',import.meta.url));
export const sourcePath=fileURLToPath(new URL('./search.cpp',import.meta.url));
export const cache=path.join(root,'.cache/native/search-speed');
export const binary=path.join(cache,'core');
export const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');

export function build({kind='optimized',sanitize=false,threadSanitize=false,force=false}={}){
 if(!['optimized','plain','unit'].includes(kind)||sanitize&&threadSanitize)throw Error('invalid experiment build options');
 fs.mkdirSync(cache,{recursive:true});
 const suffix=threadSanitize?'-tsan':sanitize?'-sanitized':'',out=path.join(cache,kind==='optimized'?'core'+suffix:kind+suffix),manifest=out+'.json';
 let source=sourcePath;
 if(kind==='unit'){
  let cpp=fs.readFileSync(sourcePath,'utf8');
  const anchor='void verify(const Packet& p) {';
  if(cpp.split(anchor).length!==2)throw Error('test-support anchor changed');
  cpp=cpp.replace(anchor,fs.readFileSync(new URL('./test-support.hpp',import.meta.url),'utf8')+'\n'+anchor);
  cpp=cpp.replace('if(packet.mode=="VERIFY")verify(packet);','if(packet.mode=="VERIFY"){const int n=packet.depth==17?runUnits(packet):qLeafUnits(packet);std::cout<<"{\\"passed\\":true,\\"assertions\\":"<<n<<"}\\n";}');
  source=path.join(cache,'unit.cpp');fs.writeFileSync(source,cpp);
 }
 const flags=['-std=c++17',...(sanitize||threadSanitize?['-O1','-g',`-fsanitize=${threadSanitize?'thread':'address,undefined'}`,'-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']:['-O3','-DNDEBUG']),'-ffp-contract=off','-Wall','-Wextra','-Wpedantic','-DMIST_ROOT_LANES=4','-DMIST_MESH_LANES=4','-DMIST_CAPTURE_PREFIX_DISABLE'];
 if(kind==='plain')flags.push('-DMIST_PLAIN');
 if(process.platform==='darwin'){
  const sdk=spawnSync('xcrun',['--show-sdk-path'],{encoding:'utf8',timeout:10000});if(sdk.status!==0)throw Error(sdk.stderr||'SDK unavailable');
  const headers=path.join(sdk.stdout.trim(),'usr/include/c++/v1');if(fs.existsSync(path.join(headers,'iostream')))flags.push('-isystem',headers);
 }else flags.push('-pthread');
 const compiler=process.env.CXX||'clang++',sourceSha256=hash(source);
 if(!force&&fs.existsSync(out)&&fs.existsSync(manifest)){
  const saved=JSON.parse(fs.readFileSync(manifest));
  if(saved.sourceSha256===sourceSha256&&saved.compiler===compiler&&JSON.stringify(saved.flags)===JSON.stringify(flags)&&saved.binarySha256===hash(out))return{binary:out,...saved};
 }
 const version=spawnSync(compiler,['--version'],{encoding:'utf8',timeout:10000});if(version.status!==0)throw Error(version.stderr||'compiler unavailable');
 const built=spawnSync(compiler,[...flags,source,'-o',out],{encoding:'utf8',timeout:120000});if(built.status!==0)throw Error(built.stderr||String(built.error));
 const probe=spawnSync(out,[],{input:'',encoding:'utf8',timeout:10000});if(probe.status!==0||probe.stderr.trim())throw Error(probe.stderr||'experiment readiness failed');
 const capabilities=JSON.parse(probe.stdout.trim());if(capabilities.protocol!==3||!capabilities.lazyPositiveDepthTTKey||capabilities.threads!==4)throw Error('experiment capabilities mismatch');
 const saved={kind,sanitize,threadSanitize,compiler,compilerVersion:version.stdout.trim(),flags,sourceSha256,binarySha256:hash(out),warnings:built.stderr.trim(),capabilities};fs.writeFileSync(manifest,JSON.stringify(saved,null,2)+'\n');return{binary:out,...saved};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({kind:process.argv.includes('--plain')?'plain':process.argv.includes('--unit')?'unit':'optimized',sanitize:process.argv.includes('--sanitize'),threadSanitize:process.argv.includes('--tsan')}),null,2));
