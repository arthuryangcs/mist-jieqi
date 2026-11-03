// Adapter fix only: the unchanged engine prints an EMPTY stock field for
// the standard '-' empty-stock token. Normalize only when both pools are empty.
import assert from 'node:assert/strict';import {PikaClient as FixedPika,canonical,canonicalFen,mapMove,assertObservation} from '../all-features/pika.mjs';import {ClockPika} from '../coverage-validation/engines.mjs';import {fen as rawFen} from '../../../scripts/external-engine.js';import {remaining} from '../../../ai.js';
export * from '../all-features/pika.mjs';
function sameFen(actual,expected,v){const a=actual.split(' '),e=expected.split(' ');assert.equal(a[0],e[0]);assert.equal(a[1],e[1]);if(e[2]==='-'){assert.equal(remaining(v,'r').length+remaining(v,'b').length,0);assert(!v.board.some(p=>p?.hidden));assert(a[2]===''||a[2]==='-');}else assert.equal(a[2],e[2]);return e[2]==='-'&&a[2]==='';}
export class PikaClient extends FixedPika {
 async position(start,journal,view){const v=canonical(view);assertObservation(v);const pending=this.wait(x=>x.startsWith('Fen: '));this.send('position fen '+start+(journal.length?' moves '+journal.join(' '):''));this.send('d');const actual=(await pending).slice(5).trim(),expected=rawFen(v),normalized=sameFen(actual,expected,v);return{actual,expected,emptyStockNormalized:normalized};}
 async search(start,journal,view,budget,options={}){const v=canonical(view,view.viewer),expected=rawFen(v);if(expected.split(' ')[2]!=='-')return super.search(start,journal,view,budget,options);assert.equal(remaining(v,'r').length+remaining(v,'b').length,0);assert(!v.board.some(p=>p?.hidden));const normalized=expected.replace(/ (w|b) - /,' $1  '),x=await ClockPika.prototype.search.call(this,start,journal,budget,normalized,{...options,searchMoves:options.searchMoves?.map(m=>mapMove(m,view.viewer))}),info=x.lines.filter(l=>/^info depth /.test(l)).at(-1),field=k=>{const m=info?.match(new RegExp('\\b'+k+' (\\d+)'));return m?+m[1]:null;},actual=x.lines.find(l=>l.startsWith('Fen: '))?.slice(5).trim();sameFen(actual,expected,v);return {...x,move:mapMove(x.move,view.viewer),threads:4,depth:field('depth'),selDepth:field('seldepth'),nodes:field('nodes'),clock:{...x.clock,position:{actual,expected,emptyStockNormalized:true}}};}
}

// Preserve explicit thread evidence on every request.
export class FourThreadPika extends PikaClient {
 constructor(){super();this.threadCommands=[];}
 send(line){if(/^setoption name Threads /.test(line))this.threadCommands?.push(line);return super.send(line);}
 async init(){await super.init();assert.equal(this.threadCommands.at(-1),'setoption name Threads value 4');this.config={...this.config,threadCommands:this.threadCommands};return this.config;}
 async search(...args){return {...await super.search(...args),threads:4};}
}
