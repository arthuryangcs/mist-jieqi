import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyHistoricalSource,assertReplayOnly} from './provenance.mjs';
import {initial,legalMoves,move,positionKey} from './referee.mjs';
test('historical evidence source pins remain verifiable without current production equality',()=>{
 const m=JSON.parse(fs.readFileSync(new URL('./sources.json',import.meta.url)));
 for(const [file,pin]of Object.entries(m.sources))assert.equal(verifyHistoricalSource(file,pin.sha256).source,'archive');
 assert.throws(()=>verifyHistoricalSource('engine.js','0'.repeat(64)),/Unknown historical source pin/);
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL('./search-9602155.cpp',import.meta.url))).digest('hex'),'3fa98d62f3c1636b831680fcd5dcbf88f9339e966ed1b8e2f8a170b83afcbfb0');
});
test('archived mover-loss semantics are confined to explicit historical replay',()=>{
 const s=initial(()=>0.5),m=legalMoves(s)[0],key=positionKey(move(s,m,false));s.positions=[key,key];
 assert.equal(move(s,m).result.winner,'b');
 for(const mode of ['run','next','freeze'])assert.throws(()=>assertReplayOnly(mode),/replay-only/);
 for(const mode of ['replay','status'])assert.doesNotThrow(()=>assertReplayOnly(mode));
});
