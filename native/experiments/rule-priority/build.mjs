import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {sourceOf as base,hash,sha,environment,modelFile} from '../rule-reply/build.mjs';import {patch} from '../default-all/source.mjs';import {compile} from '../selfplay-value/build.mjs';
export {hash,sha,environment,modelFile};export const cache='.cache/rule-priority-20261125',dir='benchmarks/rule-priority-2026-11-25',control=path.resolve('.cache/default-all-20261118/default');
export function sourceOf(){let s=base();assert.equal(sha(s),'ad3aaa025e318a9b41d1e47e6d39899d50c25359d1f754a177b45d1a53be5a84');
 s=patch(s,'const auto original=root;const Move fallback=root[0];',`const auto original=root;const bool hasUnprovedRoot=std::any_of(root.begin(),root.end(),[&](Move m){return p.outcomes[m.index()]!=2&&p.outcomes[m.index()]!=5;});
    Move fallback=root[0];for(Move m:root)if(p.outcomes[m.index()]!=2&&p.outcomes[m.index()]!=5){fallback=m;break;}`);
 s=patch(s,'if(rows.size()<minimumCompared)return;accepted=rows;',`if(rows.size()<minimumCompared)return;
        if(hasUnprovedRoot&&std::none_of(rows.begin(),rows.end(),[](const Row& r){return !r.repetitionLoss;}))return;
        accepted=rows;`);
 s=patch(s,'std::stable_sort(accepted.begin(),accepted.end(),[](const Row& a,const Row& b){return a.score>b.score;});','std::stable_sort(accepted.begin(),accepted.end(),[](const Row& a,const Row& b){if(a.repetitionLoss!=b.repetitionLoss)return !a.repetitionLoss;return a.score>b.score;});');
 s=patch(s,'auto writeScope=[&](int depth,size_t count,int target,bool complete) {',`auto writeScope=[&](int depth,size_t count,int target,bool complete) {
        std::cout<<",\\\"selectedHasSameDepthScore\\\":"<<(depth>0&&count>0?"true":"false")<<",\\\"selectedScoreDepth\\\":";if(depth>0&&count>0)std::cout<<depth;else std::cout<<"null";`);
 s=patch(s,'\\\"ruleReplyGuard\\\":true,','\\\"ruleReplyGuard\\\":true,\\\"provenLossPriority\\\":true,');return s;}
export function build({sanitize=false}={}){fs.mkdirSync(cache,{recursive:true});const s=sourceOf(),source=path.resolve(cache+'/trial'+(sanitize?'-sanitized':'')+'.cpp'),binary=source.slice(0,-4);environment();fs.copyFileSync('native/experiments/nnue/nnue.hpp',cache+'/nnue.hpp');fs.writeFileSync(source,s);const compiler=compile(source,binary,{sanitize}),probe=spawnSync(binary,[],{input:'',encoding:'utf8',timeout:10000});assert.equal(probe.status,0,probe.stderr);const capabilities=JSON.parse(probe.stdout.trim());assert(capabilities.provenLossPriority);const r={sourceSha256:sha(s),headerSha256:hash(cache+'/nnue.hpp'),binarySha256:hash(binary),modelSha256:hash(modelFile),sanitize,capabilities,...compiler};fs.writeFileSync(binary+'.json',JSON.stringify(r,null,2)+'\n');return{binary,...r};}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize')})));
