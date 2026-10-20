import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile,sha} from '../downside-risk/build.mjs';
export {sha};
export const root=fileURLToPath(new URL('../../../',import.meta.url)),output=path.join(root,'.cache/information-value');
export const frozen='94dab5ee87ff8996fcf9e8f93070a8012866926822611eb0f84f6bd3607e1b2c';
export function build({sanitize=false}={}){
 const stable=path.join(root,'native/search.cpp');if(sha(stable)!==frozen)throw Error('Stable core changed; review information experiment patch');
 fs.mkdirSync(output,{recursive:true});let source=fs.readFileSync(stable,'utf8');
 const from='    }return total;',to='    }return total+mist_information::bonus(s.board,side);';if(source.split(from).length!==2)throw Error('Ambiguous evaluation patch');source=source.replace(from,to);
 const policy=new URL('./policy.hpp',import.meta.url);source=fs.readFileSync(policy,'utf8').replace('#pragma once','')+'\n'+source;
 const cpp=path.join(output,'search.cpp'),binary=path.join(output,'mist-information'+(sanitize?'-sanitized':''));fs.writeFileSync(cpp,source);const compiler=compile(cpp,binary,{sanitize});
 return {binary,stableSourceSha256:frozen,sourceSha256:sha(cpp),policySha256:sha(policy),binarySha256:sha(binary),sanitize,...compiler};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize')}),null,2));
