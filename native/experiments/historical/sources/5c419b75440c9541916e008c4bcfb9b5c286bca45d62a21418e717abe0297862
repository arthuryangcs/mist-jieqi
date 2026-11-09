import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {sourceOf,hash,stableSource,modelFile,modelSha256} from './build.mjs';
import {sourceOf as control} from '../selfplay-value/build.mjs';
test('JQE is isolated, pinned, and does not replace stable search',()=>{
 assert.equal(hash('native/search.cpp'),stableSource);assert.equal(hash(modelFile),modelSha256);
 assert.equal(sourceOf({trial:false}),control({trial:false}));
 const candidate=sourceOf();assert.match(candidate,/mist_jqe::correction/);assert.match(candidate,/600\.0\/430\.0/);
 assert.match(candidate,/std::vector<Undo> undoBuffers/);assert.match(candidate,/Undo& old=undoBuffers.at\(ply\)/);
 assert.match(candidate,/if\(q.live\(\)&&q.hidden&&p.side==s.viewer\)mist_jqe::changeStock/);
 assert.match(candidate,/extensions==k.extensions&&inventory==k.inventory/);
 for(const file of ['native/search.cpp','native/server.mjs','app.js','native-client.js'])assert(!fs.readFileSync(file,'utf8').includes('MIST_JQE'));
 assert.match(fs.readFileSync('models/jqe/LICENSE','utf8'),/Copyright \(c\) 2026 Devin O'Keefe/);
});
