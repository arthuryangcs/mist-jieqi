// The frozen evaluator cannot safely serve the current repetition protocol.
import test from 'node:test';
import assert from 'node:assert/strict';
import {previewModule,writePreview} from './web.mjs';
test('historical JQE preview refuses current production play before launch',async()=>{
 assert.throws(()=>writePreview(),/Historical JQE preview disabled/);
 await assert.rejects(()=>previewModule(),/Historical JQE preview disabled/);
});
