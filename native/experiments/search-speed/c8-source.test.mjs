import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {c7Source} from './c7-source.mjs';
import {applyC8Geometry,c8Source,c8UnitSource} from './c8-source.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
test('C8 reproduces the frozen non-slider geometry source and rejects another base',()=>{
 const source=c8Source();
 assert.equal(sha(source),'a17db66bebc4cfabe9bc0d48a5f4b1693bb9306b1af5397907a0c601afc80047');
 assert.throws(()=>applyC8Geometry(c7Source()+' '),/base source changed/);
 assert(source.includes('sizeof(NonSliderTable)==24480'));
 // The entire search, timing, TT, make/unmake and evaluation implementation is unchanged.
 const start='struct Position {';
 assert.equal(source.slice(source.indexOf(start)),c7Source().slice(c7Source().indexOf(start)));
});
test('C8 exhaustive geometry units are attached to the existing checked unit handler',()=>{
 const source=c8UnitSource(c8Source());
 assert(source.includes('+nonSliderGeometryUnits(packet.depth==17);'));
 assert(source.includes('int nonSliderGeometryUnits(bool full)'));
 assert.throws(()=>c8UnitSource('changed'),/anchors changed/);
});
