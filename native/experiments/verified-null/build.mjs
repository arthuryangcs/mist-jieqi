// Independent protected null-move experiment; production search is unchanged.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {sourceOf as arenaSource,patch,hash,sha,baseline} from '../cluster-tt/build.mjs';
export {patch,hash,sha,baseline};export const cache='.cache/verified-null',dir='benchmarks/verified-null';
export function sourceOf({trial=true,trace=false}={}){
 let s=arenaSource({trial:false,trace});
 s=patch(s,'struct Search {',`bool nullEligible(const State& s,int depth,double beta,bool checked,size_t moves,bool allowNull,int virtualPlies){
    if(!allowNull||virtualPlies||depth<3||checked||moves<2||!std::isfinite(beta)||std::abs(beta)>=97000)return false;
    int heavy=0;for(const Piece& p:s.board)if(p.side==s.turn&&!p.hidden&&(p.type==R||p.type==C||p.type==N))heavy++;
    return heavy>=2&&evaluate(s,s.turn)>=beta;
}
struct Search {`);
 s=patch(s,'uint64_t nodes=0,nodeLimit=0;','uint64_t nullSearches=0,nullCutoffs=0,nullVerifications=0;uint64_t nodes=0,nodeLimit=0;');
 s=patch(s,'int qleft=3,int extensions=2) {','int qleft=3,int extensions=2,bool allowNull=true,int nullPlies=0) {');
 s=patch(s,'tick(ply);','tick(ply-nullPlies);');
 s=patch(s,'Key path=s.key();',`// Synthetic passes use separate buffer frames, not extra actual move depth.
        // They cannot read/write real-position TT bounds or claim repetition.
        if(nullPlies)return node(s,depth,alpha,beta,ply,qleft,extensions,false,nullPlies);
        Key path=s.key();`);
 s=patch(s,'double v=node(s,depth,alpha,beta,ply,qleft,extensions);','double v=node(s,depth,alpha,beta,ply,qleft,extensions,allowNull,nullPlies);');
 s=patch(s,'int ply,int qleft,int extensions) {','int ply,int qleft,int extensions,bool allowNull,int nullPlies) {');
 s=patch(s,'hasKey=depth>0;','hasKey=depth>0&&nullPlies==0;');
 s=patch(s,'int hbase=s.turn==0?0:8100;',`if(${trial?'true':'false'}&&nullEligible(s,depth,beta,check,moves.size(),allowNull,nullPlies)){
                const int reduction=2+int(depth>=6);const int originalTurn=s.turn;double v;
                nullSearches++;s.turn=1-s.turn;
                try{v=-search(s,depth-1-reduction,-beta,-beta+1,ply+1,qleft,extensions,false,nullPlies+1);}catch(...){s.turn=originalTurn;throw;}s.turn=originalTurn;
                if(v>=beta){
                    // Verify reduced legal-position search at greater depth or low population.
                    // The extra frame is bookkeeping, not a real move or a mate proof.
                    if(depth>=6||s.population<=10){nullVerifications++;v=search(s,depth-reduction,beta-1,beta,ply+1,qleft,extensions,false,nullPlies+1);}
                    if(v>=beta){nullCutoffs++;return beta;}
                }
        }
        int hbase=s.turn==0?0:8100;`);
 // All existing real-move recursion inherits the synthetic-frame offset.
 const suffix='qleft,extensions)';if(s.split(suffix).length!==4)throw Error('Expected three real recursive search calls');s=s.replaceAll(suffix,'qleft,extensions,allowNull,nullPlies)');
 s=patch(s,'if(!capture&&depth>0){','if(!capture&&depth>0&&nullPlies==0){');
 // Mate distance and TT conversion count legal moves, excluding synthetic frames.
 const start=s.indexOf('struct Search {'),end=s.indexOf('void writeMove',start);let body=s.slice(start,end);body=body.replaceAll('-mate+ply','-mate+(ply-nullPlies)').replaceAll('v-=ply','v-=ply-nullPlies').replaceAll('v+=ply','v+=ply-nullPlies').replaceAll('score+ply','score+(ply-nullPlies)').replaceAll('score-ply','score-(ply-nullPlies)');s=s.slice(0,start)+body+s.slice(end);
 s=patch(s,'s.nodes=0;s.safetyCutoffs=0;','s.nullSearches=0;s.nullCutoffs=0;s.nullVerifications=0;s.nodes=0;s.safetyCutoffs=0;');
 s=patch(s,'s.nodes+=worker.nodes;s.selDepth','s.nullSearches+=worker.nullSearches;s.nullCutoffs+=worker.nullCutoffs;s.nullVerifications+=worker.nullVerifications;s.nodes+=worker.nodes;s.selDepth');
 s=patch(s,'std::cout<<",\\\"mainDepth\\\":"<<currentDepth','std::cout<<",\\\"nullSearches\\\":"<<s.nullSearches<<",\\\"nullCutoffs\\\":"<<s.nullCutoffs<<",\\\"nullVerifications\\\":"<<s.nullVerifications;std::cout<<",\\\"mainDepth\\\":"<<currentDepth');
 return s;
}
export function build({trial=true,trace=false,sanitize=false}={}){fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});const name=(trial?'trial':'control')+(trace?'-trace':'')+(sanitize?'-sanitized':''),source=path.resolve(cache+'/'+name+'.cpp'),binary=path.resolve(cache+'/'+name);fs.writeFileSync(source,sourceOf({trial,trace}));const ref=JSON.parse(fs.readFileSync('.cache/time-search/functional/build.json')),flags=sanitize?ref.flags.filter(x=>!['-O3','-DNDEBUG'].includes(x)).concat(['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']):ref.flags,r=spawnSync(process.env.CXX||'clang++',[...flags,source,'-o',binary],{encoding:'utf8',timeout:60000});if(r.status!==0)throw Error(r.stderr||String(r.error));const record={trial,trace,sanitize,baselineSourceSha256:ref.sourceSha256,baselineBinarySha256:hash(baseline),sourceSha256:hash(source),binarySha256:hash(binary),flags,compiler:ref.compiler,warnings:r.stderr.trim()};fs.writeFileSync(dir+'/'+name+'-build.json',JSON.stringify(record,null,2)+'\n');return {binary,...record};}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({trial:!process.argv.includes('--control'),trace:process.argv.includes('--trace'),sanitize:process.argv.includes('--sanitize')})));
