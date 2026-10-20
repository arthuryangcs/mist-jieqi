// Reuse the retained simulated-DOM harness, with this round's parser and metadata.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
let s=fs.readFileSync('native/focus-ui-check.mjs','utf8').replace("from'./focus-web.mjs'","from'./frontier-web.mjs'").replace("from'./focus-variants.mjs'","from'./frontier-variants.mjs'");
s=s.replace('comparedCount:focused?2:ms.length,fullRootDepth:3,','comparedCount:focused?Math.min(ms.length,Math.max(2,Math.ceil(ms.length/4))):ms.length,minimumComparisonRoots:Math.min(ms.length,Math.max(2,Math.ceil(ms.length/4))),fullRootDepth:focused?4:3,');
s=s.replace('精算 2\\/44.*全候选 3 层','精算 11\\/44.*全候选 4 层');
// A second invalid frame exercises the stricter frontier acceptance quorum.
s=s.replace(' record.passed=true;',` h=await setup(data=>Promise.resolve(new Response(JSON.stringify({result:{engine:'cpp-native',engineVerified:true,move:legalMoves(data.view)[0],depth:5,samples:8,candidates:[],rootCount:44,comparedCount:2,minimumComparisonRoots:11,fullRootDepth:4,comparisonDepth:5,searchScope:'focused-root'}})+'\\n',{status:200,headers:{'X-Engine':'cpp-native','Content-Type':'application/x-ndjson'}})));
 h.$('autoMode').onclick();h.$('autoStep').onclick();await wait();assert.match(h.$('message').textContent,/候选比较范围无效/);assert.equal(h.$('counter').textContent,'第 1 回合 · 已走0步');record.checks.push({name:'insufficient completed-candidate quorum rejected',passed:true});
 record.passed=true;`);
s=s.replace(/from\s*(['"])(\.[^'"]*)\1/g,(_,q,p)=>'from '+JSON.stringify(pathToFileURL(path.resolve('native',p)).href));
await import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
