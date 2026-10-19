import fs from'node:fs';import assert from'node:assert/strict';import path from'node:path';
import{dir,sha}from'./defense-variants.mjs';
const r=JSON.parse(fs.readFileSync(`${dir}/summary.json`));let sources=0,artifacts=0,links=0;
for(const[p,h]of Object.entries(r.sourceHashes)){assert.equal(sha(fs.readFileSync(p)),h,p);sources++;}
for(const[p,h]of Object.entries(r.artifactHashes)){assert.equal(sha(fs.readFileSync(`${dir}/${p}`)),h,p);artifacts++;}
assert(r.defaultUnchanged);assert(!r.pikaPlayed);assert(!r.confirmationPlayed);assert(!r.gates.screenScore&&!r.gates.technical&&!r.gates.depth);
assert.equal(r.summary.games,8);assert.equal(r.normalGames.games,7);assert.equal(r.normalGames.scoreRate,.5);
const status=JSON.parse(fs.readFileSync(`${dir}/production-status.json`)),build=JSON.parse(fs.readFileSync('.cache/native/build.json'));
assert.equal(status.sourceSha256,sha(fs.readFileSync('native/search.cpp')));assert.equal(build.sourceSha256,status.sourceSha256);assert.equal(build.binarySha256,status.binarySha256);assert.equal(sha(fs.readFileSync('.cache/native/mist-core')),status.binarySha256);
assert.equal(status.active,0);assert.equal(status.maxThreads,4);
const docs=['DEFENSE_EVAL_EXPERIMENT.md','README.md','native/README.md'];
for(const m of fs.readFileSync(docs[0],'utf8').matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){if(/^https?:/.test(m[1]))continue;assert(fs.existsSync(path.resolve(m[1].split('#')[0])),m[1]);links++;}
const out={passed:true,verifiedAt:new Date().toISOString(),sources,artifacts,localReportLinks:links,summarySha256:sha(fs.readFileSync(`${dir}/summary.json`)),documentHashes:Object.fromEntries(docs.map(p=>[p,sha(fs.readFileSync(p))])),defaultUnchanged:true,productionSourceSha256:status.sourceSha256,productionBinarySha256:status.binarySha256,decision:r.decision,summary:r.summary,normalGames:r.normalGames};
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
