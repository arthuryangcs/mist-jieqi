import path from'node:path';import fs from'node:fs';import assert from'node:assert/strict';
export{hash,sha,environment,modelFile}from'../rule-priority/build.mjs';
import{hash,sha}from'../rule-priority/build.mjs';import{sourceOf}from'../default-all/build.mjs';
export const cache='.cache/cycle-signals-20261126',dir='benchmarks/cycle-signals-2026-11-26',control=path.resolve('.cache/default-all-20261118/default');
export function verifyControl(){assert.equal(sha(sourceOf()),'a6d1a5da2624202769b583d9631576c4d95a3af206567f96b0dd4fe8c87d0104');const m=JSON.parse(fs.readFileSync('.cache/default-all-20261118/default.json'));assert.equal(hash(control),m.binarySha256);return m;}
