import{initial,publicState}from'../engine.js';import{seeded}from'../ai.js';
const baseline=process.env.JIEQI_PROFILE_VARIANT!=='candidate';
const{analyze}=await import(baseline?'../benchmarks/search-speed-baseline-ai.js':'../ai.js');
const r=analyze(publicState(initial(seeded(17)),'r'),{seed:6101,samples:8,maxDepth:3,timeMs:60000});
console.log(JSON.stringify({variant:baseline?'baseline':'candidate',depth:r.depth,nodes:r.nodes,elapsedMs:r.elapsedMs,move:r.move}));
