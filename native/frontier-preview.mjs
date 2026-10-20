import fs from 'node:fs';import {compileFrontier,variants} from './frontier-variants.mjs';import {writePreview,previewModule} from './frontier-web.mjs';
const variant=process.argv[2]||'combined';if(!variants.includes(variant))throw Error('Unknown frontier profile');
const build=compileFrontier(variant),mod=await previewModule(),service=mod.createLocalServer({executable:build.binary,buildInfo:{...build,threads:4,independentWorldSearch:true,focusedPlay:true,rootBudget:true,criticalTactics:true},staticRoot:writePreview()});
const port=Number(process.env.PORT||8768);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local port');
await service.listen(port);fs.writeFileSync('.cache/frontier-preview-runtime.json',JSON.stringify({pid:process.pid,variant,url:`http://127.0.0.1:${port}/`,sourceSha256:build.sourceSha256,binarySha256:build.binarySha256})+'\n');
console.log(`覆盖与封顶实验：http://127.0.0.1:${port}/\n${variant} · 尚未默认启用 · ${build.sourceSha256.slice(0,12)}`);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await service.close();process.exit(0);});
