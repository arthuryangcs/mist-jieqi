// Explicit command only; no startup on import of the entrypoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {root,pinned,verifyPinnedArtifacts,ensureJqeBuild,createJqeServer} from './jqe-server.mjs';
import {initial,publicState,legalMoves} from '../engine.js';
import {seeded} from '../ai.js';

test('deployment verifies the original artifacts and fails closed',()=>{
  assert.match(verifyPinnedArtifacts().binarySha256,/^[a-f0-9]{64}$/);
  const read=p=>fs.readFileSync(path.join(root,p));
  for(const target of Object.keys(pinned))assert.throws(()=>verifyPinnedArtifacts(p=>p===target?Buffer.from('corrupt'):read(p)),/hash mismatch/);
  assert.throws(()=>verifyPinnedArtifacts(p=>{if(p==='.cache/jqe-current/candidate')throw Error('missing');return read(p);}),/required artifact missing/);
  assert.throws(()=>verifyPinnedArtifacts(p=>p.endsWith('candidate-build.json')?'{}':read(p)),/manifest mismatch/);
});
test('fresh-cache build and local binary identity are mockable without compilation',async()=>{
  const local=p=>fs.readFileSync(path.join(root,p));
  const otherBinary=Buffer.from('a different platform build');
  const manifest={...JSON.parse(local('.cache/jqe-current/candidate-build.json')),binarySha256:createHash('sha256').update(otherBinary).digest('hex'),flags:['-std=c++17','-ffp-contract=off','-O3','-DNDEBUG','-pthread']};
  let built=false,calls=0;
  const read=p=>{
    if(p.startsWith('.cache/')&&!built)throw Error('absent');
    if(p==='.cache/jqe-current/candidate')return otherBinary;
    if(p.endsWith('candidate-build.json'))return JSON.stringify(manifest);
    return local(p);
  };
  const options={read,exists:()=>built,build:async()=>{calls++;built=true;}};
  assert.equal((await ensureJqeBuild(options)).binarySha256,manifest.binarySha256);assert.equal(calls,1);
  await ensureJqeBuild(options);assert.equal(calls,1);
  built=false;
  await assert.rejects(()=>ensureJqeBuild({...options,exists:()=>true}),/required artifact missing/);assert.equal(calls,1);
  await assert.rejects(()=>ensureJqeBuild({...options,build:async()=>{throw Error('compile failed');}}),/compile failed/);
  built=true;
  manifest.flags.push('-march=native');assert.throws(()=>verifyPinnedArtifacts(read),/portable compiler flags/);manifest.flags.pop();
  manifest.binarySha256='0'.repeat(64);assert.throws(()=>verifyPinnedArtifacts(read),/hash mismatch/);
});
test('ordinary UI and model provenance use the pinned JQE service',async()=>{
  const old={...process.env};let service;
  try{
    // Ambient settings cannot downgrade the evaluator or substitute a model.
    process.env.MIST_JQE_MODEL='/nonexistent/other.jqn';process.env.MIST_JQE_QUANT='0';process.env.MIST_JQE_FULL='1';
    service=await createJqeServer();const address=await service.listen(0),base=`http://127.0.0.1:${address.port}`;
    assert.equal(address.address,'127.0.0.1');
    assert.equal(await(await fetch(base+'/')).text(),fs.readFileSync(path.join(root,'index.html'),'utf8'));
    const status=await(await fetch(base+'/api/status')).json();
    assert.equal(status.evaluation,'jqe');assert.equal(status.model,'it014');assert.equal(status.quantized,true);
    assert.equal(status.modelSha256,pinned['models/jqe/it014.jqn']);assert.equal(status.binarySha256,verifyPinnedArtifacts().binarySha256);
    assert(!JSON.stringify(status).includes(root));
    for(const resource of ['/native/jqe-server.mjs','/models/jqe/it014.jqn','/.cache/jqe-current/candidate'])assert.equal((await fetch(base+resource)).status,404);
    assert.equal((await fetch(base+'/api/status',{headers:{Origin:'https://example.com'}})).status,403);
    const view=publicState(initial(seeded(17)),'r');
    const response=await fetch(base+'/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'jqe-default-test',timeMs:2000,view})});
    assert.equal(response.status,200);const frames=(await response.text()).trim().split('\n').map(JSON.parse);
    assert(!frames.some(f=>f.error));const result=frames.at(-1).result;
    assert.equal(result.evaluation,'jqe');assert.equal(result.modelSha256,status.modelSha256);assert.equal(result.binarySha256,status.binarySha256);
    assert(result.depth>0);assert(!result.fallbackUsed);assert(result.engineVerified);
    assert(legalMoves(view).some(m=>m.from===result.move?.from&&m.to===result.move?.to));
    assert.equal(service.active.size,0);
  }finally{
    if(service)await service.close();
    for(const key of ['MIST_JQE_MODEL','MIST_JQE_QUANT','MIST_JQE_FULL'])if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];
  }
});
test('fresh checkout builds baseline and serves ordinary UI on an ephemeral port',{skip:process.env.MIST_JQE_TEST_FRESH!=='1'},async()=>{
  // Explicit opt-in CPU test. Never removes or rebuilds the original cache.
  // Keep disposable work inside the authorized repository workspace.
  fs.mkdirSync(path.join(root,'.cache'),{recursive:true});
  const sandbox=fs.mkdtempSync(path.join(root,'.cache','jqe-deployment-check-'));let service;
  try{
    const files=new Set([...Object.keys(pinned),'native/jqe-server.mjs','native/build.mjs','editor.js','search-metrics.js','package.json','index.html','style.css','board.svg','app.js','worker.js','deadline-search.js','native-client.js']);
    for(const file of files){const target=path.join(sandbox,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
    assert(!fs.existsSync(path.join(sandbox,'.cache/jqe-current')));
    const fresh=await import(pathToFileURL(path.join(sandbox,'native/jqe-server.mjs')).href);
    service=await fresh.createJqeServer();const address=await service.listen(0),base=`http://127.0.0.1:${address.port}`;
    const status=await(await fetch(base+'/api/status')).json();
    assert.equal(status.evaluation,'jqe');assert.equal(status.sourceSha256,fresh.generatedSourceSha256);
    assert.equal(status.binarySha256,fresh.verifyPinnedArtifacts().binarySha256);
    assert.equal(await(await fetch(base+'/')).text(),fs.readFileSync(path.join(root,'index.html'),'utf8'));
  }finally{if(service)await service.close();fs.rmSync(sandbox,{recursive:true,force:true});}
});
