import {initial,publicState,legalMoves,move,inCheck} from '../engine.js';import {analyze,values} from '../ai.js';
const p=(side,type)=>({side,type,role:type,hidden:false});
function base(){let s={board:Array(90).fill(null),turn:'r',captured:[],ply:0,quiet:0,positions:[],result:null};s.board[4]=p('b','K');s.board[85]=p('r','K');s.board[49]=p('r','P');return s;}
export function fixtures(){let a=base();a.board[12]=p('r','R');a.board[14]=p('r','R');a.board[23]=p('r','R');let b=base();b.board[81]=p('r','R');b.board[63]=p('b','R');let c=base();c.board[81]=p('r','R');c.board[63]=p('b','P');c.board[0]=p('b','R');return [{name:'一步制胜（将死或困毙）',state:a,pass:m=>move(a,m).result?.winner==='r'},{name:'吃无保护车',state:b,pass:m=>m.from===81&&m.to===63},{name:'拒绝吃兵丢车',state:c,pass:m=>!(m.from===81&&m.to===63)}];}
function rng(seed=20261019){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export function greedy(s){let ms=legalMoves(s);return ms.sort((a,b)=>(values[s.board[b.to]?.type]||0)-(values[s.board[a.to]?.type]||0))[0];}
if(process.argv[1]?.endsWith('benchmark.js')){
let rows=fixtures().map(f=>{let r=analyze(publicState(f.state),{timeMs:700,maxDepth:4,rng:rng()});return {test:f.name,searchPass:f.pass(r.move),greedyPass:f.pass(greedy(f.state)),depth:r.depth,nodes:r.nodes,elapsedMs:r.elapsedMs,move:r.move};});
let seed=rng(),s=initial(seed),plies=0,minDepth=99,maxDepth=0,nodes=0,start=performance.now();for(;plies<24&&!s.result;plies++){let r=analyze(publicState(s),{timeMs:200,rng:seed,maxDepth:4,samples:2});if(!legalMoves(s).some(m=>m.from===r.move?.from&&m.to===r.move?.to))throw Error('非法AI落子');s=move(s,r.move);if(inCheck(s.board,s.turn==='r'?'b':'r'))throw Error('AI送将');minDepth=Math.min(minDepth,r.depth);maxDepth=Math.max(maxDepth,r.depth);nodes+=r.nodes;}
let result={runtime:process.version,tactics:rows,selfPlay:{plies,allMovesLegal:true,depthRange:[minDepth,maxDepth],nodes,elapsedMs:Math.round(performance.now()-start),result:s.result},note:'微型战术回归和合法性基准，不是棋力评级或统计胜率。'};console.log(JSON.stringify(result,null,2));if(rows.some(r=>!r.searchPass))process.exitCode=1;
}
