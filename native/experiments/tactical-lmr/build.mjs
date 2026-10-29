// Combine one bright quiet q-check with verified late-move re-search.
// Separate prototype; no production strength switch.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {sourceOf as lmrSource,patch,hash,sha,baseline} from '../time-search/build.mjs';
export {patch,hash,sha,baseline};export const cache='.cache/tactical-lmr',dir='benchmarks/tactical-lmr';
export function sourceOf({trace=false}={}){
 let s=lmrSource({lmr:true,trace});
 s=patch(s,'int qleft=3,int extensions=2) {','int qleft=3,int extensions=2,int quietChecks=1) {');
 s=patch(s,'double v=node(s,depth,alpha,beta,ply,qleft,extensions);','double v=node(s,depth,alpha,beta,ply,qleft,extensions,quietChecks);');
 s=patch(s,'int ply,int qleft,int extensions) {','int ply,int qleft,int extensions,int quietChecks) {');
 // Filter only the optional quiet-check query; normal legality is unchanged.
 s=patch(s,'std::vector<Move>& out,int checked=-1) {','std::vector<Move>& out,int checked=-1,bool brightQuietOnly=false) {');
 s=patch(s,'for(int f=0;f<90;f++)if(b[f].side==side)for(int t:candidates(b,f,captures)) {','for(int f=0;f<90;f++)if(b[f].side==side&&(!brightQuietOnly||!b[f].hidden))for(int t:candidates(b,f,captures)) {');
 s=patch(s,'if(b[t].side==side)continue;const int role=','if(b[t].side==side||(brightQuietOnly&&b[t].live()))continue;const int role=');
 s=patch(s,'if(quiet){double stand=evaluate(s,s.turn);if(stand>=beta)return stand;alpha=std::max(alpha,stand);if(qleft<=0||moves.empty())return alpha;}',`if(quiet){
            double stand=evaluate(s,s.turn);if(stand>=beta)return stand;alpha=std::max(alpha,stand);if(qleft<=0)return alpha;
            if(quietChecks>0){
                auto& probe=probeBuffers.at(ply);legalInto(s.board,s.turn,false,false,s.kings[s.turn],probe,check,true);
#ifdef MIST_VERIFY_RESTORE
                std::vector<Move> expected;legalInto(s.board,s.turn,false,false,s.kings[s.turn],expected,check);
                expected.erase(std::remove_if(expected.begin(),expected.end(),[&](Move x){return s.board[x.from].hidden||s.board[x.to].live();}),expected.end());
                if(probe!=expected)throw std::logic_error("bright quiet filter mismatch");
#endif
                for(Move m:probe){Undo u=push(s,m);bool givesCheck=inCheck(s.board,s.turn,s.kings[s.turn]);pop(s,m,u);if(givesCheck)moves.push_back(m);}
            }
            if(moves.empty())return alpha;
        }`);
 s=patch(s,'bool capture=s.board[m.to].live();++moveCount;Undo old=push(s,m);double v;','bool capture=s.board[m.to].live();int nextChecks=quiet&&!capture?quietChecks-1:quietChecks;++moveCount;Undo old=push(s,m);double v;');
 const suffix='qleft,extensions)';if(s.split(suffix).length!==6)throw Error('Expected5 recursive calls');s=s.replaceAll(suffix,'qleft,extensions,nextChecks)');
 return s;
}
export function build({sanitize=false,trace=false}={}){fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});const name='trial'+(trace?'-trace':'')+(sanitize?'-sanitized':''),source=path.resolve(cache+'/'+name+'.cpp'),binary=path.resolve(cache+'/'+name);fs.writeFileSync(source,sourceOf({trace}));const ref=JSON.parse(fs.readFileSync('.cache/time-search/functional/build.json')),flags=sanitize?ref.flags.filter(x=>!['-O3','-DNDEBUG'].includes(x)).concat(['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']):ref.flags,compiler=process.env.CXX||'clang++',r=spawnSync(compiler,[...flags,source,'-o',binary],{encoding:'utf8',timeout:60000});if(r.status!==0)throw Error(r.stderr||String(r.error));const record={kind:'one bright q-check plus LMR, full-depth re-search on alpha improvement',sanitize,trace,baselineSourceSha256:ref.sourceSha256,baselineBinarySha256:hash(baseline),sourceSha256:hash(source),binarySha256:hash(binary),flags,compiler:ref.compiler,warnings:r.stderr.trim()};fs.writeFileSync(dir+'/'+name+'-build.json',JSON.stringify(record,null,2)+'\n');return {binary,...record};}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize'),trace:process.argv.includes('--trace')})));
