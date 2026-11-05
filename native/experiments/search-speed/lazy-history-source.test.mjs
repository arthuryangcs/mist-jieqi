import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import{lazyHistorySource,lazyHistoryUnitSource,rejectedHistory16Source,rejectedOccupiedGenerationSource,setupProfileSource}from './lazy-history-source.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
test('lazy-history regenerates exact measured source',()=>assert.equal(sha(lazyHistorySource()),'7d848c79bf4312e7886afc5df51069f465ca6f1ef45aefdfc06966db4f6e3f88'));
test('history16-negative regenerates exact measured source',()=>assert.equal(sha(rejectedHistory16Source()),'ea9f035ad324d3e823a723aba2d05e9f71a29f5e611bbb6627ee34be7a9602a9'));
test('occupied-generation-negative regenerates exact measured source',()=>assert.equal(sha(rejectedOccupiedGenerationSource()),'f382185ed8380511c656b4a9f88c3db7cf37437470e5eeec857a9fa28adbafab'));
test('setup-profile regenerates exact measured source',()=>assert.equal(sha(setupProfileSource()),'93ae5d3db5b6fb20dd0ec2e1f6f398d190ba36822c6c58d479d3e9611fd184c2'));
test('private zero-initialized history unit source matches sanitizer-tested source',()=>assert.equal(sha(lazyHistoryUnitSource(lazyHistorySource())),'bd339c8770c96c7cdf33fd6b9b37b12e25eefa3599a863fef19676f21a3701b2'));
