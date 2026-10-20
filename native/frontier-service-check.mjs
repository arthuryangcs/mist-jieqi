import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
let s=fs.readFileSync('native/focus-service-check.mjs','utf8').replace("||'both',record=","||'combined',record=").replace("from'./focus-variants.mjs'","from'./frontier-variants.mjs'").replace("from'./focus-web.mjs'","from'./frontier-web.mjs'");
s=s.replace('/实验页面/','/覆盖与封顶实验/');
s=s.replace('assert(r.comparedCount>=2);','assert(r.comparedCount>=r.minimumComparisonRoots);if(variant!==\'cap\'&&r.depth>3)assert(r.fullRootDepth>=r.depth-1);');
s=s.replace(/from\s*(['"])(\.[^'"]*)\1/g,(_,q,p)=>'from '+JSON.stringify(pathToFileURL(path.resolve('native',p)).href));
await import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
