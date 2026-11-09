import test from 'node:test';import assert from 'node:assert/strict';import {sourceOf,patch} from './build.mjs';import {sourceOf as base} from '../selfplay-value/build.mjs';import fs from 'node:fs';
test('control is byte-identical to normalized current HCE; candidate changes only internal sort',()=>{
 const control=sourceOf({trial:false});assert.equal(control,base({trial:false}));
 let candidate=sourceOf();candidate=patch(candidate,fs.readFileSync(new URL('sort.hpp',import.meta.url),'utf8')+'\nstruct Search {','struct Search {');
 candidate=patch(candidate,'\n    std::vector<ScoredMove> sortScratch;','');candidate=patch(candidate,'bufferedStableSort(scored,sortScratch);','std::stable_sort(scored.begin(),scored.end(),[](const ScoredMove& a,const ScoredMove& b){return a.score>b.score;});');assert.equal(candidate,control);
});
