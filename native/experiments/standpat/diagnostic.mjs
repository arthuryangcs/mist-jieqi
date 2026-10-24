import fs from 'node:fs';import path from 'node:path';
import {cache,patch,compile,sourceOf,hash} from './build.mjs';
export function diagnosticBuild(name,{sanitize=false}={}){
 if(!['baseline','trial'].includes(name))throw Error('Unknown diagnostic');let source=name==='baseline'?fs.readFileSync('native/search.cpp','utf8'):sourceOf();
 source=patch(source,'namespace mist {',`namespace mist {
struct Diagnostic {uint64_t captureLists=0,firstLegalProbes=0,candidateCalls=0;};
thread_local Diagnostic diagnostic;`);
 source=patch(source,'Destinations candidates(const Board& b,int f,bool captures) {','Destinations candidates(const Board& b,int f,bool captures) {diagnostic.candidateCalls++;');
 source=patch(source,'void legalInto(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out,int checked=-1) {','void legalInto(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out,int checked=-1) {if(captures&&!first)diagnostic.captureLists++;if(!captures&&first)diagnostic.firstLegalProbes++;');
 // Renamed original main is unused, but retain a defined return for compiler checks.
 source=patch(source,"catch(const std::exception& error){std::cerr<<\"native error: \"<<error.what()<<'\\n';return 2;}\n}","catch(const std::exception& error){std::cerr<<\"native error: \"<<error.what()<<'\\n';return 2;}\n    return 0;\n}");
 const file=path.resolve(cache+`/diagnostic-${name}.cpp`),wrapper=path.resolve(cache+`/qverify-${name}.cpp`),binary=path.resolve(cache+`/qverify-${name}${sanitize?'-sanitized':''}`);fs.writeFileSync(file,source);
 fs.writeFileSync(wrapper,`#define MIST_TEST_SOURCE "diagnostic-${name}.cpp"\n`+fs.readFileSync(new URL('./qverify.cpp',import.meta.url),'utf8'));
 const compiler=compile(wrapper,binary,{sanitize});return {binary,sourceSha256:hash(file),wrapperSha256:hash(wrapper),binarySha256:hash(binary),...compiler};
}
