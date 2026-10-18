import {writeFile} from 'node:fs/promises';
import {initial,publicState,legalMoves,move} from '../engine.js';
import {analyze} from '../benchmarks/reference-ai.js';
export function seeded(seed=20261019){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export function positions(){let rng=seeded(),s=initial(rng),opening=publicState(s);for(let i=0;i<36&&!s.result;i++){let ms=legalMoves(s);s=move(s,ms[Math.floor(rng()*ms.length)]);}return [{name:'初始全暗',state:opening},{name:'固定种子36手中局',state:publicState(s)}];}
if(process.argv[1]?.endsWith('diagnose.js')){let rows=[];for(let f of positions())for(let budget of [150,500,1500])for(let seed of [11,22,33]){let progress=[];let r=analyze(f.state,{timeMs:budget,rng:seeded(seed),onProgress:x=>progress.push({depth:x.depth,elapsedMs:x.elapsedMs})});rows.push({position:f.name,budget,seed,move:r.move,score:r.score,depth:r.depth,nodes:r.nodes,samples:r.samples,elapsedMs:r.elapsedMs,firstResultMs:progress[0]?.elapsedMs??null,spread:r.candidates[0]?.spread});console.log(JSON.stringify(rows.at(-1)));}await writeFile('benchmarks/before.json',JSON.stringify(rows,null,2)+'\n');}
