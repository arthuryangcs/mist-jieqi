import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

export const root=fileURLToPath(new URL('../../../',import.meta.url));
export const output=path.join(root,'.cache/downside-risk');
export const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const frozen='73de0d5768fbedd97d46305891a0513f95c7a856aa5aba8edff8a92e2d1798d0';
export function compile(source,binary,{sanitize=false}={}) {
 const flags=['-std=c++17',...(sanitize?['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']:['-O3']),'-ffp-contract=off','-Wall','-Wextra','-Wpedantic'];
 if(process.platform==='darwin'){
  const sdk=spawnSync('xcrun',['--show-sdk-path'],{encoding:'utf8'});if(sdk.status!==0)throw Error(sdk.stderr||'SDK unavailable');
  const headers=path.join(sdk.stdout.trim(),'usr/include/c++/v1');if(fs.existsSync(path.join(headers,'iostream')))flags.push('-isystem',headers);
 }else flags.push('-pthread');
 const result=spawnSync(process.env.CXX||'clang++',[...flags,source,'-o',binary],{encoding:'utf8',timeout:60000});
 if(result.status!==0)throw Error(result.stderr||String(result.error||'compile failed'));
 return {flags,warnings:result.stderr.trim()};
}
export function build({sanitize=false}={}) {
 const original=path.join(root,'native/search.cpp');if(sha(original)!==frozen)throw Error('Stable core changed; review experiment patch first');
 fs.mkdirSync(output,{recursive:true});
 let source=fs.readFileSync(original,'utf8');
 const replace=(from,to)=>{if(source.split(from).length!==2)throw Error('Ambiguous risk patch: '+from);source=source.replace(from,to);};
 const policy=fs.readFileSync(new URL('./policy.hpp',import.meta.url),'utf8').replace('#pragma once','');
 source=policy+'\n'+source;
 replace('Move move;double score=0,spread=0,winRate=0;','Move move;double score=0,spread=0,winRate=0,baseScore=0,tailLoss=0,riskWeight=0,riskPenalty=0;std::vector<double> worldScores;');
 replace('row.spread=std::sqrt(row.spread/scores.size());row.winRate=probability*100;return row;',
  'row.spread=std::sqrt(row.spread/scores.size());row.winRate=probability*100;row.baseScore=row.score;row.worldScores=scores;row.tailLoss=uncertain?mist_risk::lowerTailLoss(scores):0;return row;');
 replace('std::stable_sort(rows.begin(),rows.end(),[](const Row& a,const Row& b){return a.score>b.score;});',
  'mist_risk::rank(rows,uncertain);\n        std::stable_sort(rows.begin(),rows.end(),[](const Row& a,const Row& b){return a.score>b.score;});');
 replace("if(r.draw)std::cout<<\",\\\"draw\\\":true\";std::cout<<'}';",
  `std::cout<<",\\\"baseScore\\\":"<<r.baseScore<<",\\\"tailLoss\\\":"<<r.tailLoss<<",\\\"riskWeight\\\":"<<r.riskWeight<<",\\\"riskPenalty\\\":"<<r.riskPenalty<<",\\\"worldScores\\\":[";for(size_t i=0;i<r.worldScores.size();i++){if(i)std::cout<<',';std::cout<<r.worldScores[i];}std::cout<<']';if(r.draw)std::cout<<",\\\"draw\\\":true";std::cout<<'}';`);
 const suffix=sanitize?'-sanitized':'',cpp=path.join(output,'search.cpp'),binary=path.join(output,'mist-risk'+suffix);fs.writeFileSync(cpp,source);
 const compiler=compile(cpp,binary,{sanitize});
 const record={stableSourceSha256:frozen,policySha256:sha(new URL('./policy.hpp',import.meta.url)),sourceSha256:sha(cpp),binarySha256:sha(binary),sanitize,...compiler};
 fs.writeFileSync(path.join(output,'build'+suffix+'.json'),JSON.stringify(record,null,2)+'\n');return {binary,...record};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize')}),null,2));
