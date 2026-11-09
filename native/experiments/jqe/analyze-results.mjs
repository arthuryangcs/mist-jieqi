// Post-match outcome audit only. No search, changes, or selection of games.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {replay,lawfulView} from './matches.mjs';import {legalMoves,rootRules} from '../../../engine.js';
import {dir,hash} from './build.mjs';
const file=dir+'/matches.json',r=JSON.parse(fs.readFileSync(file));assert(r.completedAt&&r.games.length===12);
const rows=[];
for(const g of r.games.filter(g=>g.result.reason.includes('重复'))){
 const before={...g,log:g.log.slice(0,-1)};delete before.result;delete before.plies;
 const s=replay(before),view=lawfulView(s,s.turn),moves=legalMoves(view).map(m=>({...m,...rootRules(view,m)}));
 rows.push({index:g.index,group:g.group,winner:g.result.winner,candidateSide:g.candidateSide,reason:g.result.reason,legalMoves:moves,forcedRepetition:moves.length>0&&moves.every(m=>m.loss)});
}
const out={passed:true,matchesSha256:hash(file),postMatchAnalysis:true,rows,candidateWins:r.games.filter(g=>g.candidateName==='candidate'&&g.result.winner===g.candidateSide).length,candidateRepetitionWins:rows.filter(g=>g.group!=='controlPika'&&g.winner===g.candidateSide).length,note:'Valid outcomes under the frozen Mist referee; not equivalent to mate wins or superiority under a different repetition rule.'};
fs.writeFileSync(dir+'/repetition-outcomes.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
