// Exact self-authored C7 derivatives. No production default changes.
import fs from 'node:fs';
import {c7Source,c7UnitSource} from './c7-source.mjs';
import {applyC6Edits} from './c6-source.mjs';
export function deferredOrderSource(){return applyC6Edits(c7Source(),JSON.parse(fs.readFileSync(new URL('./deferred-order-source-edits.json',import.meta.url))));}
// Retain the rejected heap experiment for reproducibility, never enable it.
export function rejectedIndexHeapSource(){return applyC6Edits(c7Source(),JSON.parse(fs.readFileSync(new URL('./index-heap-negative-source-edits.json',import.meta.url))));}
export function deferredOrderUnitSource(cpp){let text=c7UnitSource(cpp);const anchor='void verify(const Packet& p) {',call='+sharedLineUnits(packet.depth==17);';if(text.split(anchor).length!==2||text.split(call).length!==2)throw Error('deferred-order unit anchors changed');text=text.replace(anchor,fs.readFileSync(new URL('./deferred-order-test-support.hpp',import.meta.url),'utf8')+'\n'+anchor);return text.replace(call,'+sharedLineUnits(packet.depth==17)+deferredOrderUnits(packet);');}
