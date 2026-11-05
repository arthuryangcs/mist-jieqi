// Self-authored optional implementation experiment. Production stays unchanged.
import fs from 'node:fs';
import {deferredOrderSource,deferredOrderUnitSource} from './deferred-order-source.mjs';
import {applyC6Edits} from './c6-source.mjs';
const derive=name=>applyC6Edits(deferredOrderSource(),JSON.parse(fs.readFileSync(new URL('./'+name+'-source-edits.json',import.meta.url))));
export const lazyHistorySource=()=>derive('lazy-history');
export const rejectedHistory16Source=()=>derive('history16-negative');
export const rejectedOccupiedGenerationSource=()=>derive('occupied-generation-negative');
export const setupProfileSource=()=>derive('setup-profile');
export function lazyHistoryUnitSource(cpp){const text=deferredOrderUnitSource(cpp),anchor=' uint32_t seed=0x6381b743;';if(text.split(anchor).length!==2)throw Error('history test anchor changed');return text.replace(anchor,fs.readFileSync(new URL('./lazy-history-test-support.hpp',import.meta.url),'utf8')+anchor);}
