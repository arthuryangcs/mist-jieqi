import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const variant=process.env.FRONTIER_VARIANT||'combined';assert(['coverage','cap','combined'].includes(variant));
let s=fs.readFileSync('native/focus-check.mjs','utf8');
s=s.replace("||'root',sanitizer=","||'both',sanitizer=").replace("from'./focus-variants.mjs'","from'./frontier-variants.mjs'").replace('check-${stage}-${kind}',`check-${variant}-\${kind}`);
s=s.replace('assert.equal(x.comparisonDepth,x.depth);',`assert.equal(x.comparisonDepth,x.depth);assert.equal(x.minimumComparisonRoots,${variant==='cap'?'Math.min(2,legal.length)':'Math.min(legal.length,Math.max(2,Math.ceil(legal.length/4)))'});if(x.depth)assert(x.comparedCount>=x.minimumComparisonRoots);${variant==='cap'?'':'if(x.depth>3)assert(x.fullRootDepth>=x.depth-1);'}`);
s=s.replace(/from\s*(['"])(\.[^'"]*)\1/g,(_,q,p)=>'from '+JSON.stringify(pathToFileURL(path.resolve('native',p)).href));
await import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
