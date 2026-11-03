import {legalMoves,inCheck,move,positionKey,publicState} from '../../../engine.js';import {evaluate} from '../../../ai.js';
export const mate=99000;
// Independent exhaustive minimax, no TT, alpha-beta, PVS or move ordering.
// Used only for bounded sparse positions; probabilities are explicit fixed worlds.
export function exhaustive(f,depth){let nodes=0;const rows=[];const viewer=f.view.viewer;
 function search(s,d,ply,qleft=3,extensions=2){if(++nodes>2000000)throw Error('exhaustive reference test size exceeded');const all=legalMoves(s);if(!all.length)return -mate+ply;const key=positionKey(s),previous=s.positions.filter(x=>x===key).length;if(previous>=2)return mate-ply;if(s.quiet>=120||s.ply>=400)return 0;
  s={...s,positions:[...s.positions,key]};const check=inCheck(s.board,s.turn);if(check&&d>0&&extensions>0){d++;extensions--;}
  const quiet=d<=0&&!check,stand=evaluate(publicState(s,viewer),s.turn),moves=quiet?all.filter(m=>s.board[m.to]):all;
  if(quiet&&(qleft<=0||!moves.length))return stand;if(d<=-6)return stand-(check?180:0);
  let best=quiet?stand:-Infinity;for(const m of moves)best=Math.max(best,-search(move(s,m,false),d-1,ply+1,quiet?qleft-1:qleft,extensions));return best;
 }
 for(const m of legalMoves(f.view)){const scores=[];for(const w of f.worlds){const s={...structuredClone(f.view),board:structuredClone(w.board)},key=positionKey(s);s.positions=[...(s.positions??[])];if(s.positions.at(-1)!==key)s.positions.push(key);s.quiet??=0;s.ply??=0;scores.push(-search(move(s,m,false),depth-1,1));}rows.push({...m,worldScores:scores});}
 return{rows,nodes};
}
