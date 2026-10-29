// Exact candidate-filter pushdown inside the previous isolated q-check prototype.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {compile,patch,hash,sha,stableSource,stableBinary,baseline} from '../standpat/build.mjs';import {trialSource as parentSource,instrument} from '../mate-proof/build.mjs';
export {hash,sha,stableSource,stableBinary,baseline};export const cache='.cache/qcheck-filter',dir='benchmarks/qcheck-filter',reference=path.resolve('.cache/mate-proof/trial'),referenceSha='30dcd1cef87ab9f07746fde634b463290d4751da36aa4be83451252500597d91';
export function sourceOf(){
 let s=parentSource();if(sha(s)!=='4504740bd02e3d1e0a79c431c6d61bd1bb725c5dc5d557bac27cffb003dff37f')throw Error('Parent prototype changed');
 s=patch(s,'std::vector<Move>& out,int checked=-1) {','std::vector<Move>& out,int checked=-1,bool brightQuietOnly=false) {');
 s=patch(s,'if(king==-2)king=kingAt(b,side);out.clear();',`if(king==-2)king=kingAt(b,side);out.clear();
#ifdef MIST_VERIFY_RESTORE
    std::vector<Move> reference;
    if(brightQuietOnly){
        if(captures||first)throw std::logic_error("invalid bright quiet query");
        legalInto(b,side,false,false,king,reference,checked,false);
        reference.erase(std::remove_if(reference.begin(),reference.end(),[&](Move m){return b[m.from].hidden||b[m.to].live();}),reference.end());
    }
#endif`);
 s=patch(s,'for(int f=0;f<90;f++)if(b[f].side==side)for(int t:candidates(b,f,captures)) {','for(int f=0;f<90;f++)if(b[f].side==side&&(!brightQuietOnly||!b[f].hidden))for(int t:candidates(b,f,captures)) {');
 s=patch(s,'if(b[t].side==side)continue;const int role=','if(b[t].side==side||(brightQuietOnly&&b[t].live()))continue;const int role=');
 s=patch(s,'}\nstd::vector<Move> legal(Board& b,int side',`#ifdef MIST_VERIFY_RESTORE
    if(brightQuietOnly&&out!=reference)throw std::logic_error("bright quiet filter mismatch");
#endif
}
std::vector<Move> legal(Board& b,int side`);
 return patch(s,'legalInto(s.board,s.turn,false,false,s.kings[s.turn],probe,check);','legalInto(s.board,s.turn,false,false,s.kings[s.turn],probe,check,true);');
}
// Diagnostic counters run only with a fixed node limit (serial world searches).
function counters(s){
 s=patch(s,'uint64_t nodes=0,nodeLimit=0;','uint64_t nodes=0,nodeLimit=0,qLists=0,qGenerated=0,qRelevant=0;');
 const needle=s.includes('probe,check,true);')?'legalInto(s.board,s.turn,false,false,s.kings[s.turn],probe,check,true);':'legalInto(s.board,s.turn,false,false,s.kings[s.turn],probe,check);';
 s=patch(s,needle,needle+'qLists++;qGenerated+=probe.size();for(Move x:probe)qRelevant+=!s.board[x.from].hidden&&!s.board[x.to].live();');
 return patch(s,'std::cout<<",\\\"threads\\\":"<<lanes;std::cout<<",\\\"allCandidates\\\":";', 'std::cout<<",\\\"qProbe\\\":{\\\"lists\\\":"<<s.qLists<<",\\\"generated\\\":"<<s.qGenerated<<",\\\"relevant\\\":"<<s.qRelevant<<"}";std::cout<<",\\\"threads\\\":"<<lanes;std::cout<<",\\\"allCandidates\\\":";');
}
export function build({sanitize=false,trace=false,ref=false}={}){
 if(hash(baseline)!==stableBinary||hash(reference)!==referenceSha)throw Error('Frozen baseline/reference changed');fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});
 const name=ref?'diagnostic':'trial'+(trace?'-trace':'')+(sanitize?'-sanitized':''),source=path.resolve(cache+'/'+name+'.cpp'),binary=path.resolve(cache+'/'+name);let s=ref?parentSource():sourceOf();if(trace||ref)s=instrument(counters(s));fs.writeFileSync(source,s);
 const r={referenceSha256:referenceSha,productionStableSha256:stableBinary,sourceSha256:hash(source),sanitize,trace,ref,...compile(source,binary,{sanitize})};r.binarySha256=hash(binary);fs.writeFileSync(dir+'/'+name+'-build.json',JSON.stringify(r,null,2)+'\n');return {binary,...r};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize'),trace:process.argv.includes('--trace'),ref:process.argv.includes('--reference')})));
