// Fixed Pika binary, canonical own-red orientation. No hidden referee data accepted.
import assert from 'node:assert/strict';
import {PikaClient as FixedPika,verifyPika,pikaHash,pikaCommit,assertObservation,observationToken as rawToken} from '../tactical-lmr/pika.mjs';
import {fen as rawFen} from '../../../scripts/external-engine.js';
import {other} from '../../../engine.js';
export {verifyPika,pikaHash,pikaCommit,assertObservation};
export const fen=rawFen;
export const mapMove=(m,viewer)=>viewer==='b'?{from:89-m.from,to:89-m.to}:m;
export function oriented(view,viewer){assertObservation(view,viewer);if(viewer==='r')return structuredClone(view);const v=structuredClone(view);v.turn=other(v.turn);v.viewer=other(v.viewer);v.board.reverse();for(const p of [...v.board,...v.captured])if(p){p.side=other(p.side);if(p.capturedBy)p.capturedBy=other(p.capturedBy);}return v;}
export function canonical(view,viewer=view.viewer){const v=oriented(view,viewer),initialTurn=v.ply%2?other(v.turn):v.turn;v.ply+=initialTurn==='b'?1:0;return assertObservation(v,'r');}
export const canonicalFen=(view,viewer=view.viewer)=>rawFen(canonical(view,viewer));
export function observationToken(before,m,after,viewer){return rawToken(oriented(before,viewer),mapMove(m,viewer),oriented(after,viewer),'r');}
export class PikaClient extends FixedPika {
 async init(){const c=await super.init();this.config={...c,evaluation:'unchanged fixed HCE binary; canonical own-red orientation, distinct reference from raw historical Pika'};return this.config;}
 async position(start,journal,view){return super.position(start,journal,canonical(view));}
 async search(start,journal,view,budget,options={}){const viewer=view.viewer;const x=await super.search(start,journal,canonical(view,viewer),budget,{...options,searchMoves:options.searchMoves?.map(m=>mapMove(m,viewer))});return {...x,move:mapMove(x.move,viewer),canonicalOrientation:viewer==='b'?'rotate180+swap':'identity'};}
}
