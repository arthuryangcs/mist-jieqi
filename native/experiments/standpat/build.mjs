// Exact quiescence early exit experiment, isolated from the playable binary.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
export const cache='.cache/standpat',dir='benchmarks/standpat',baseline=path.resolve('.cache/native/mist-core');
export const stableSource='94dab5ee87ff8996fcf9e8f93070a8012866926822611eb0f84f6bd3607e1b2c',stableBinary='5c68913e2035093465cb3807ea81604839023daa884d0c0c66ba65f5958a2d23';
export const sha=x=>createHash('sha256').update(x).digest('hex'),hash=p=>sha(fs.readFileSync(p));
export function patch(s,a,b){if(s.split(a).length!==2)throw Error('Ambiguous stand-pat patch');return s.replace(a,b);}
export function sourceOf(){
 const original=fs.readFileSync('native/search.cpp','utf8');if(sha(original)!==stableSource)throw Error('Review the new stable source first');
 return patch(original,`bool quiet=depth<=0&&!check;auto& moves=moveBuffers.at(ply);legalInto(s.board,s.turn,quiet,false,s.kings[s.turn],moves,check);
        if(moves.empty()){if(!quiet)return -mate+ply;auto& probe=probeBuffers.at(ply);legalInto(s.board,s.turn,false,true,s.kings[s.turn],probe,check);if(probe.empty())return -mate+ply;}
        if(quiet){double stand=evaluate(s,s.turn);if(stand>=beta)return stand;alpha=std::max(alpha,stand);if(qleft<=0||moves.empty())return alpha;}`,`bool quiet=depth<=0&&!check;double stand=0;
        if(quiet){
            stand=evaluate(s,s.turn);
            if(stand>=beta){
                // Xiangqi stalemate is a loss: never accept stand-pat without a legal move.
                auto& probe=probeBuffers.at(ply);legalInto(s.board,s.turn,false,true,s.kings[s.turn],probe,check);
                if(probe.empty())return -mate+ply;
                return stand;
            }
        }
        auto& moves=moveBuffers.at(ply);legalInto(s.board,s.turn,quiet,false,s.kings[s.turn],moves,check);
        if(moves.empty()){if(!quiet)return -mate+ply;auto& probe=probeBuffers.at(ply);legalInto(s.board,s.turn,false,true,s.kings[s.turn],probe,check);if(probe.empty())return -mate+ply;}
        if(quiet){alpha=std::max(alpha,stand);if(qleft<=0||moves.empty())return alpha;}`);
}
export function compile(source,binary,{sanitize=false}={}){
 const saved=JSON.parse(fs.readFileSync('.cache/native/build.json'));if(saved.sourceSha256!==stableSource||saved.binarySha256!==stableBinary)throw Error('Stable build manifest changed');
 const flags=sanitize?saved.flags.filter(x=>!['-O3','-DNDEBUG'].includes(x)).concat(['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']):saved.flags;
 const compiler=process.env.CXX||'clang++',v=spawnSync(compiler,['--version'],{encoding:'utf8'});if(v.status!==0)throw Error(v.stderr);
 const r=spawnSync(compiler,[...flags,source,'-o',binary],{encoding:'utf8',timeout:60000});if(r.status!==0)throw Error(r.stderr||String(r.error));
 return {flags,compiler:v.stdout.trim(),warnings:r.stderr.trim()};
}
export function build({sanitize=false}={}){
 if(hash(baseline)!==stableBinary)throw Error('Stable binary changed');fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});
 const source=path.resolve(cache+'/search.cpp'),binary=path.resolve(cache+'/mist-standpat'+(sanitize?'-sanitized':''));fs.writeFileSync(source,sourceOf());
 const compiler=compile(source,binary,{sanitize}),record={stableSourceSha256:stableSource,stableBinarySha256:stableBinary,sourceSha256:hash(source),binarySha256:hash(binary),sanitize,...compiler};
 fs.writeFileSync(cache+`/build${sanitize?'-sanitized':''}.json`,JSON.stringify(record,null,2)+'\n');return {binary,...record};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize')}),null,2));
