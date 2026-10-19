import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash}from'node:crypto';
const directory='.cache/perf',baseline=fs.readFileSync('benchmarks/native-perf/baseline.cpp','utf8');
const patch=(s,a,b)=>{if(s.split(a).length!==2)throw Error('non-unique patch '+a.slice(0,60));return s.replace(a,b);};
const sortLine='std::stable_sort(moves.begin(),moves.end(),[&](Move a,Move b){return order(a)>order(b);});';
export function variantSource(name){let s=baseline;
 if(!['baseline','scored','buffers','both','tt-refresh'].includes(name))throw Error('unknown variant '+name);
 const scored=['scored','both','tt-refresh'].includes(name),buffers=['buffers','both','tt-refresh'].includes(name);
 if(buffers){
  s=patch(s,'std::vector<int> candidates(const Board& b,int f,bool captures) {\n    std::vector<int> out;out.reserve(20);',`struct Destinations {
    std::array<int,90> data;size_t count=0;
    void push_back(int square){if(count>=data.size())throw std::logic_error("destination capacity exceeded");data[count++]=square;}
    int* begin(){return data.data();}int* end(){return data.data()+count;}
};
Destinations candidates(const Board& b,int f,bool captures) {
    Destinations out;`);
  s=patch(s,'std::vector<Move> legal(Board& b,int side,bool captures=false,bool first=false,int king=-2) {\n    if(king==-2)king=kingAt(b,side);std::vector<Move> out;out.reserve(48);',`void legalInto(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out) {
    if(king==-2)king=kingAt(b,side);out.clear();`);
  s=patch(s,'if(safe) {out.push_back({f,t});if(first)return out;}\n    }return out;\n}',`if(safe) {out.push_back({f,t});if(first)return;}
    }
}
std::vector<Move> legal(Board& b,int side,bool captures=false,bool first=false,int king=-2) {
    std::vector<Move> out;out.reserve(48);legalInto(b,side,captures,first,king,out);return out;
}`);
  s=patch(s,'std::vector<State> worlds;std::array<uint32_t,16200> history{};',`std::array<std::vector<Move>,128> moveBuffers,probeBuffers;
    std::vector<State> worlds;std::array<uint32_t,16200> history{};`);
  s=patch(s,'bool quiet=depth<=0&&!check;auto moves=legal(s.board,s.turn,quiet,false,s.kings[s.turn]);\n        if(moves.empty()&&(!quiet||legal(s.board,s.turn,false,true,s.kings[s.turn]).empty()))return -mate+ply;',`bool quiet=depth<=0&&!check;auto& moves=moveBuffers.at(ply);legalInto(s.board,s.turn,quiet,false,s.kings[s.turn],moves);
        if(moves.empty()){if(!quiet)return -mate+ply;auto& probe=probeBuffers.at(ply);legalInto(s.board,s.turn,false,true,s.kings[s.turn],probe);if(probe.empty())return -mate+ply;}`);
 }
 if(scored){
  s=patch(s,'struct Search {','struct ScoredMove {Move move;double score;};\nstruct Search {');
  if(buffers)s=patch(s,'std::array<std::vector<Move>,128> moveBuffers,probeBuffers;','std::array<std::vector<Move>,128> moveBuffers,probeBuffers;\n    std::array<std::vector<ScoredMove>,128> scoreBuffers;');
  s=patch(s,sortLine,`${buffers?'auto& scored=scoreBuffers.at(ply);scored.clear();':'std::vector<ScoredMove> scored;'}scored.reserve(moves.size());
        for(Move m:moves)scored.push_back({m,order(m)});
        std::stable_sort(scored.begin(),scored.end(),[](const ScoredMove& a,const ScoredMove& b){return a.score>b.score;});
        for(size_t i=0;i<moves.size();i++)moves[i]=scored[i].move;`);
 }
 if(name==='tt-refresh')s=patch(s,'s.table.size()<90000','(s.table.size()<90000||s.table.find(key)!=s.table.end())');
 return s;
}
export function compileVariant(name,{profile=false,diagnostics=false}={}){
 fs.mkdirSync(directory,{recursive:true});let source=variantSource(name);
 if(profile){
  source=patch(source,'namespace mist {',`namespace mist {
struct Measurement {uint64_t calls=0,nanos=0;};std::array<Measurement,3> measurements{};
struct Scope {size_t index;std::chrono::steady_clock::time_point start=std::chrono::steady_clock::now();explicit Scope(size_t i):index(i){}~Scope(){measurements[index].calls++;measurements[index].nanos+=std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now()-start).count();}};`);
  const signatures=[['candidates(const Board& b,int f,bool captures) {',0],[name==='baseline'||name==='scored'?'std::vector<Move> legal(Board& b,int side,bool captures=false,bool first=false,int king=-2) {':'void legalInto(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out) {',1],['double evaluate(const State& s,int side) {',2]];
  for(const[a,i]of signatures)source=patch(source,a,a+`Scope timer(${i});`);
  source=patch(source,'Search s;s.start=','measurements={};Search s;s.start=');
  source=patch(source,'std::cout<<"]}\\n";\n}\nvoid verify',`std::cout<<"]}\\n";
    std::cerr<<"{\\"profile\\":[";for(size_t i=0;i<measurements.size();i++){if(i)std::cerr<<',';std::cerr<<"{\\"calls\\":"<<measurements[i].calls<<",\\"nanos\\":"<<measurements[i].nanos<<'}';}std::cerr<<"]}\\n";
}
void verify`);
 }
 if(diagnostics)source=patch(source,'std::cout<<"]}\\n";\n}\nvoid verify',`std::cout<<"]}\\n";
    std::cerr<<"{\\"tableSizes\\":[";for(size_t i=0;i<s.worlds.size();i++){if(i)std::cerr<<',';std::cerr<<s.worlds[i].table.size();}std::cerr<<"]}\\n";
}
void verify`);
 const suffix=name+(profile?'-profile':'')+(diagnostics?'-diagnostic':''),file=path.join(directory,suffix+'.cpp'),binary=path.resolve(directory,suffix);fs.writeFileSync(file,source);
 const base=JSON.parse(fs.readFileSync('benchmarks/native-perf/baseline-build.json')),flags=base.flags,compiler=process.env.CXX||'clang++';
 const version=spawnSync(compiler,['--version'],{encoding:'utf8'});if(version.status!==0)throw Error(version.stderr||'compiler unavailable');
 const r=spawnSync(compiler,[...flags,file,'-o',binary],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);const sha=x=>createHash('sha256').update(x).digest('hex');
 return{name:suffix,binary,sourceSha256:sha(source),binarySha256:sha(fs.readFileSync(binary)),flags,compiler:version.stdout.trim(),warnings:r.stderr};
}
