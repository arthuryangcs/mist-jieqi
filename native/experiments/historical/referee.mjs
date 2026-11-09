// Historical replay only. Never import this referee into production play.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
assert.equal(createHash('sha256').update(fs.readFileSync(new URL('./engine-9602155.js',import.meta.url))).digest('hex'),'9250d5440b8572c3473a84c0dec0284c99098387bb16a14a5dc259ac27ce510b','Historical referee source changed');
export * from './engine-9602155.js';
