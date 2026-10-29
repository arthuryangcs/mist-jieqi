import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {compile,patch,hash,sha,stableSource,stableBinary,baseline} from '../standpat/build.mjs';
export {hash,sha,stableSource,stableBinary,baseline};export const cache='.cache/mate-proof',dir='benchmarks/mate-proof';
export function instrument(source){
 source=patch(source,'Move move;double score=0,spread=0,winRate=0;','Move move;std::vector<double> worldScores;double score=0,spread=0,winRate=0;');
 source=patch(source,'Row row;row.move=m;double probability=0,mean=0;','Row row;row.move=m;row.worldScores=scores;double probability=0,mean=0;');
 return patch(source,"if(r.draw)std::cout<<\",\\\"draw\\\":true\";if(r.repetitionLoss)","std::cout<<\",\\\"worldScores\\\":[\";for(size_t i=0;i<r.worldScores.size();i++){if(i)std::cout<<',';std::cout<<r.worldScores[i];}std::cout<<']';if(r.draw)std::cout<<\",\\\"draw\\\":true\";if(r.repetitionLoss)");
}
export function build({sanitize=false,diagnostic=true}={}){
 fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});const original=fs.readFileSync('native/search.cpp','utf8');if(sha(original)!==stableSource||hash(baseline)!==stableBinary)throw Error('Stable source/binary changed');
 const source=path.resolve(cache+'/diagnostic.cpp'),binary=path.resolve(cache+'/diagnostic'+(sanitize?'-sanitized':''));fs.writeFileSync(source,instrument(original));
 const record={kind:'unchanged algorithm, root per-world score instrumentation only',sanitize,stableSourceSha256:stableSource,sourceSha256:hash(source),binarySha256:null,...compile(source,binary,{sanitize})};record.binarySha256=hash(binary);fs.writeFileSync(dir+'/diagnostic-build'+(sanitize?'-sanitized':'')+'.json',JSON.stringify(record,null,2)+'\n');return {binary,...record};
}
export function trialSource(){
 let s=fs.readFileSync('native/search.cpp','utf8');if(sha(s)!==stableSource)throw Error('Stable changed');
 s=patch(s,'int qleft=3,int extensions=2) {','int qleft=3,int extensions=2,int quietChecks=1) {');
 s=patch(s,'double v=node(s,depth,alpha,beta,ply,qleft,extensions);','double v=node(s,depth,alpha,beta,ply,qleft,extensions,quietChecks);');
 s=patch(s,'int ply,int qleft,int extensions) {','int ply,int qleft,int extensions,int quietChecks) {');
 s=patch(s,'if(quiet){double stand=evaluate(s,s.turn);if(stand>=beta)return stand;alpha=std::max(alpha,stand);if(qleft<=0||moves.empty())return alpha;}',`if(quiet){
            double stand=evaluate(s,s.turn);if(stand>=beta)return stand;alpha=std::max(alpha,stand);if(qleft<=0)return alpha;
            // One non-capture bright checking move per quiescence line. Hidden
            // moves are never probed using an unobserved true identity.
            if(quietChecks>0){
                auto& probe=probeBuffers.at(ply);legalInto(s.board,s.turn,false,false,s.kings[s.turn],probe,check);
                for(Move m:probe)if(!s.board[m.to].live()&&!s.board[m.from].hidden){
                    Undo u=push(s,m);bool givesCheck=inCheck(s.board,s.turn,s.kings[s.turn]);pop(s,m,u);
                    if(givesCheck)moves.push_back(m);
                }
            }
            if(moves.empty())return alpha;
        }`);
 s=patch(s,'bool capture=s.board[m.to].live();Undo old=push(s,m);double v;','bool capture=s.board[m.to].live();int nextChecks=quiet&&!capture?quietChecks-1:quietChecks;Undo old=push(s,m);double v;');
 const from='quiet?qleft-1:qleft,extensions)';if(s.split(from).length!==4)throw Error('Expected 3 recursive calls');s=s.replaceAll(from,'quiet?qleft-1:qleft,extensions,nextChecks)');return s;
}
export function buildTrial({sanitize=false,diagnostic=false}={}){
 if(hash(baseline)!==stableBinary)throw Error('Stable changed');fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});
 const name='trial'+(diagnostic?'-trace':'')+(sanitize?'-sanitized':''),source=path.resolve(cache+'/'+name+'.cpp'),binary=path.resolve(cache+'/'+name);fs.writeFileSync(source,diagnostic?instrument(trialSource()):trialSource());
 const record={kind:'one bright non-capture check per quiescence line',sanitize,diagnostic,stableSourceSha256:stableSource,sourceSha256:hash(source),...compile(source,binary,{sanitize})};record.binarySha256=hash(binary);fs.writeFileSync(dir+'/'+name+'-build.json',JSON.stringify(record,null,2)+'\n');return {binary,...record};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(process.argv.includes('--trial')?buildTrial({sanitize:process.argv.includes('--sanitize'),diagnostic:process.argv.includes('--trace')}):build({sanitize:process.argv.includes('--sanitize')})));
