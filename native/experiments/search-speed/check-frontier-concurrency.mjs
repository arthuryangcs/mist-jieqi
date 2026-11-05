// Reuse the frozen C7 checks instead of maintaining a second copied suite.
// Runtime absolute module URLs stay in ignored .cache, never published artifacts.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';
import {cache} from './build-frontier-concurrency.mjs';
const mode=process.argv.find(x=>['search','rules','reference'].includes(x))||'search',name={search:'check-c7.mjs',rules:'rules-c7.mjs',reference:'reference-check-c7.mjs'}[mode],original=new URL('./'+name,import.meta.url),adapter=new URL('./frontier-concurrency-build-adapter.mjs',import.meta.url);
let source=fs.readFileSync(original,'utf8');source=source.replace(/(from\s*['"])(\.[^'"]+)(['"])/g,(_,a,b,c)=>a+(b==='./build-c7.mjs'?adapter.href:new URL(b,original).href)+c);source=source.replaceAll('import.meta.url',JSON.stringify(original.href));
if(mode==='search')source+='\nawait checkC7({sanitize:process.argv.includes("--sanitize"),threadSanitize:process.argv.includes("--tsan")});\n';
fs.mkdirSync(cache,{recursive:true});const generated=path.join(cache,'generated-'+name);fs.writeFileSync(generated,source);await import(pathToFileURL(path.resolve(generated)).href);
