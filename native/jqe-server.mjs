// Conditional deployment entrypoint. Importing this file never builds, probes,
// listens, or changes the default launcher. See docs/jqe-default.md.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const root=fileURLToPath(new URL('../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const readLocal=relative=>fs.readFileSync(path.join(root,relative));
export const pinned=Object.freeze({
  'engine.js':'f64f8dad3d16dd5b08c392ccc141d7e035dc13986f55aa04b2f96781c2cc7629',
  'ai.js':'363ebb21c6f7c248cb97fd0505b419d7d06154774af5582de434d14f4c162ea5',
  'native/search.cpp':'3c3505b46d935362ec06bb7d03a0b57ab4eeb742385b2e11773f68005332a9fc',
  'native/server.mjs':'ad908a8c6c865937871d8eac09966ef32ce22dc28a094a4e15777087dfa85018',
  'native/bridge.mjs':'0e2eb66fcbd4be136e39e881c72764909b77ecbc47952e4181d0a106de1b7879',
  'native/experiments/jqe-current/web.mjs':'5dec2e3d81aa8cbd41ea3f5fbb70d7bd5e3914cd3c375ecc18fcf6fa3b3a7ace',
  'native/experiments/jqe-current/nnue.hpp':'b7363b9f1930636819bf6a69723e8bb6cd645728eaabfced30bf29d3962d5378',
  'native/experiments/jqe-current/build.mjs':'b5454a89c0600fb17261aad2a53796a230a5446ecb70f3edbe6369d0bebf0997',
  'native/experiments/selfplay-value/build.mjs':'83a332adab90b444b7fa629ba6984a214b56e497861fbac8ace481139ae2c896',
  'native/experiments/cluster-tt/table.hpp':'d814598433069a56b9cc14927e0c40d8cf6a8e4ce65954aa924eeb470dbf74ea',
  'models/jqe/it014.jqn':'f90bd44e8ee244405eb08eb4f784e3f156900f0691f651b5124d50032f8ba160',
});
export const generatedSourceSha256='3df6f9cfcbfb4875977e71fb059cffef961cd0367b38ddd07884e2c62a459352';
function verifyFiles(pins,read){
  for(const [relative,expected] of Object.entries(pins)){
    let bytes;try{bytes=read(relative);}catch{throw Error('JQE required artifact missing: '+relative);}
    if(sha(bytes)!==expected)throw Error('JQE artifact hash mismatch: '+relative);
  }
}
export function verifyPinnedArtifacts(read=readLocal){
  verifyFiles(pinned,read);
  verifyFiles({'.cache/jqe-current/candidate.cpp':generatedSourceSha256,'.cache/jqe-current/nnue.hpp':pinned['native/experiments/jqe-current/nnue.hpp']},read);
  let manifest;try{manifest=JSON.parse(read('.cache/jqe-current/candidate-build.json'));}catch{throw Error('JQE build manifest missing or invalid');}
  const expected={trial:true,sanitize:false,stableSourceSha256:pinned['native/search.cpp'],sourceSha256:generatedSourceSha256,headerSha256:pinned['native/experiments/jqe-current/nnue.hpp'],modelSha256:pinned['models/jqe/it014.jqn'],upstreamCommit:'331a6e612a038c4a04cf980f7b9482910fd50078'};
  for(const [key,value] of Object.entries(expected))if(manifest[key]!==value)throw Error('JQE manifest mismatch: '+key);
  // Binary hashes are local compiler outputs, not a platform-independent pin.
  if(!/^[a-f0-9]{64}$/.test(manifest.binarySha256||''))throw Error('JQE manifest mismatch: binarySha256');
  verifyFiles({'.cache/jqe-current/candidate':manifest.binarySha256},read);
  const portable=['-std=c++17','-ffp-contract=off','-O3','-DNDEBUG'];
  const allowed=[portable,[...portable,'-pthread'],[...portable,'-isystem','<system-c++-include>']];
  if(!allowed.some(flags=>JSON.stringify(flags)===JSON.stringify(manifest.flags)))throw Error('JQE manifest mismatch: portable compiler flags');
  return {...expected,binarySha256:manifest.binarySha256,binary:path.join(root,'.cache/jqe-current/candidate')};
}
async function buildBaseline(){
  // The frozen helper uses cwd-relative inputs. Only run before serving requests.
  const cwd=process.cwd();
  try{
    process.chdir(root);
    const recipe=await import('./experiments/jqe-current/build.mjs');
    if(sha(recipe.sourceOf({trial:true}))!==generatedSourceSha256)throw Error('JQE generated source hash mismatch before compilation');
    recipe.build({trial:true,sanitize:false});
  }finally{process.chdir(cwd);}
}
export async function ensureJqeBuild({read=readLocal,exists=relative=>fs.existsSync(path.join(root,relative)),build=buildBaseline}={}){
  verifyFiles(pinned,read);
  // Only an entirely absent cache permits a first build. Partial/corrupt caches
  // are evidence to diagnose, never silently repair or overwrite.
  if(!exists('.cache/jqe-current'))await build();
  return verifyPinnedArtifacts(read);
}
export async function createJqeServer({maxSearches=2}={}){
  const built=await ensureJqeBuild();
  // Use the audited pinned transport, never writePreview() or ensureBuild().
  const {previewModule}=await import('./experiments/jqe-current/web.mjs');
  const transport=await previewModule({quantized:true});
  const service=transport.createLocalServer({executable:built.binary,buildInfo:transport.probeBuild(built),maxSearches,staticRoot:root});
  Object.assign(service.info,{
    evaluation:'jqe',model:'it014',modelSha256:built.modelSha256,
    upstreamCommit:built.upstreamCommit,quantized:true,incremental:true,
    scoreScale:'600/430',headerSha256:built.headerSha256,
  });
  return service;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const port=Number(process.env.PORT||8766);
    if(!Number.isInteger(port)||port<1024||port>65535)throw Error('PORT须为1024至65535');
    const service=await createJqeServer();await service.listen(port);
    console.log(`揭棋 JQE 本机版：http://127.0.0.1:${port}/\n模型 it014 · 核心 ${service.info.binarySha256.slice(0,12)} · Ctrl+C停止`);
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await service.close();process.exit(0);});
  }catch(error){console.error('JQE启动失败：'+error.message);process.exitCode=1;}
}
