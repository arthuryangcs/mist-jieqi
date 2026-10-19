import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const patch=(s,a,b)=>{if(s.split(a).length!==2)throw Error('non-unique patch '+a.slice(0,70));return s.replace(a,b);};
export function variantSource(name){
 let s=fs.readFileSync('benchmarks/native-windows/baseline.cpp','utf8');
 if(name==='baseline')return s;
 if(name==='reserve')return patch(s,'State s;s.board=b;s.turn=turn;s.viewer=viewer;','State s;s.board=b;s.turn=turn;s.viewer=viewer;s.table.reserve(90000);');
 if(name==='refresh')return patch(s,'s.table.size()<90000','(s.table.size()<90000||s.table.find(key)!=s.table.end())');
 if(name==='parallel4'||name==='parallel1'){
  const lanes=name==='parallel4'?4:1;
  s=patch(s,'#include <vector>','#include <vector>\n#include <future>\n#include <exception>');
  s=patch(s,'std::vector<Iteration> iterations;int interrupted=0;Move fallback=root[0];',`std::vector<Iteration> iterations;int interrupted=0;Move fallback=root[0];
    const bool parallel=p.nodeLimit==0&&s.worlds.size()>1;
    const size_t lanes=parallel?std::min(size_t(${lanes}),s.worlds.size()):1;
    std::vector<Search> workers(parallel?s.worlds.size():0);
    for(auto& worker:workers){worker.start=s.start;worker.limit=s.limit;}
    auto parallelScores=[&](Move m) {
        std::vector<double> scores(s.worlds.size());std::vector<std::future<void>> tasks;
        for(size_t lane=0;lane<lanes;lane++)tasks.push_back(std::async(std::launch::async,[&,lane]{
            for(size_t world=lane;world<s.worlds.size();world+=lanes){
                State& w=s.worlds[world];if(workers[world].elapsed()>workers[world].limit)throw Timeout{};Undo old=push(w,m);
                try{scores[world]=-workers[world].search(w,depthPlaceholder,-inf,inf,1);}catch(...){pop(w,m,old);throw;}
                pop(w,m,old);
            }
        }));
        std::exception_ptr error;for(auto& task:tasks)try{task.get();}catch(...){if(!error)error=std::current_exception();}
        s.nodes=0;for(const auto& worker:workers)s.nodes+=worker.nodes;
        if(error)std::rethrow_exception(error);return scores;
    };`);
  s=s.replace('auto parallelScores=[&](Move m) {','auto parallelScores=[&](Move m,int childDepth) {').replace('depthPlaceholder','childDepth');
  s=patch(s,'else{std::vector<double> scores;for(State& w:s.worlds)', 'else{std::vector<double> scores;if(parallel){scores=parallelScores(m,depth-1);}else for(State& w:s.worlds)');
  s=patch(s,'<<iterations.back().elapsed<<', '<<iterations.back().elapsed<<",\\\"threads\\\":"<<lanes<<');
  s=patch(s,'std::cout<<",\\"allCandidates\\":";writeRows(last?last->rows:std::vector<Row>{});',
   'std::cout<<",\\"threads\\":"<<lanes;std::cout<<",\\"allCandidates\\":";writeRows(last?last->rows:std::vector<Row>{});');
  s=patch(s,'\\"threads\\":1}\\n"<<std::flush;',`\\"threads\\":${lanes},\\"independentWorldSearch\\":true}\\n"<<std::flush;`);
  s=patch(s,'double elapsed=s.elapsed();const Iteration* last=',`#ifdef MIST_VERIFY_RESTORE
    // Check every sampled state after normal return and after timeout unwinding.
    for(size_t i=0;i<s.worlds.size();i++) {
        const State expected=stateOf(p.worlds[i],p.captured,p.turn,p.viewer);const State& w=s.worlds[i];
        if(!(w.board==expected.board&&w.key()==expected.key()&&w.path==expected.path&&w.population==expected.population&&w.kings[0]==expected.kings[0]&&w.kings[1]==expected.kings[1]))throw std::runtime_error("sample state not restored");
    }
#endif
    double elapsed=s.elapsed();const Iteration* last=`);
  s=s.replace('// Only a fully evaluated root round is streamed. Search order/tree stays identical.','// Stream only after every root move has completed in every sampled world.');
  return s;
 }
 if(name==='raycheck'){
  s=patch(s,'std::array<std::vector<Leap>,90> checks;','std::array<std::vector<Leap>,90> checks;\nstd::array<std::array<std::vector<int>,4>,90> attackRays;');
  s=patch(s,'int x=k%9,y=k/9;\n        for(auto d:horses)',`int x=k%9,y=k/9;
        for(size_t direction=0;direction<rays.size();direction++) {
            const auto d=rays[direction];auto& line=attackRays[k][direction];
            for(int u=x+d[0],v=y+d[1];inside(u,v);u+=d[0],v+=d[1])line.push_back(v*9+u);
        }
        for(auto d:horses)`);
  s=patch(s,'for(auto d:rays) {\n        int count=0,distance=0;\n        for(int u=x+d[0],v=y+d[1];inside(u,v);u+=d[0],v+=d[1]) {\n            distance++;Piece p=b[v*9+u];',`for(size_t direction=0;direction<rays.size();direction++) {
        const auto d=rays[direction];int count=0,distance=0;
        for(int square:attackRays[k][direction]) {
            distance++;Piece p=b[square];`);
  s=patch(s,'(p.side==0?v<=4:v>=5)))return true;','(p.side==0?y<=4:y>=5)))return true;');
  return s;
 }
 if(name==='flat'){
  s=patch(s,'#include <vector>','#include <vector>\n#include <utility>');
  const table=`// Full-key linear-probing table; the existing 90000-entry save policy is unchanged.
class Transpositions {
    struct Slot {Key first{};Entry second{};bool live=false;};
    std::vector<Slot> slots;size_t count=0;
    size_t index(const Key& key)const{return KeyHash{}(key)&(slots.size()-1);}
    Entry& insert(const Key& key){size_t i=index(key);while(slots[i].live)i=(i+1)&(slots.size()-1);slots[i].first=key;slots[i].live=true;count++;return slots[i].second;}
    void grow(){auto old=std::move(slots);slots=std::vector<Slot>(old.empty()?256:old.size()*2);count=0;for(const auto& slot:old)if(slot.live)insert(slot.first)=slot.second;}
public:
    size_t size()const{return count;}
    Slot* end(){return nullptr;}
    Slot* find(const Key& key){if(slots.empty())return nullptr;size_t i=index(key);while(slots[i].live){if(slots[i].first==key)return &slots[i];i=(i+1)&(slots.size()-1);}return nullptr;}
    Entry& operator[](const Key& key){if(auto slot=find(key))return slot->second;if(slots.empty()||count*2>=slots.size())grow();return insert(key);}
};
`;
  s=patch(s,'struct State {',table+'struct State {');return patch(s,'std::unordered_map<Key,Entry,KeyHash> table;','Transpositions table;');
 }
 const width={asp75:75,asp200:200,adaptive:200}[name];if(!width)throw Error('unknown variant');
 s=patch(s,'std::vector<Iteration> iterations;int interrupted=0;Move fallback=root[0];',`std::vector<Iteration> iterations;int interrupted=0;Move fallback=root[0];
    // Predictions belong to this exact (root move, sampled world), never its aggregate.
    std::vector<std::vector<double>> previous(s.worlds.size(),std::vector<double>(8100,inf));
    uint64_t narrowAttempts=0,windowFailures=0,fullFallbacks=0;`);
 const old='for(State& w:s.worlds){if(s.elapsed()>s.limit)throw Timeout{};Undo old=push(w,m);double v;try{v=-s.search(w,depth-1,-inf,inf,1);}catch(...){pop(w,m,old);throw;}pop(w,m,old);scores.push_back(v);}';
 s=patch(s,old,`for(size_t world=0;world<s.worlds.size();world++) {
                State& w=s.worlds[world];if(s.elapsed()>s.limit)throw Timeout{};
 const double guess=previous[world][m.index()];double radius=${width}.0;
                double low=std::isfinite(guess)&&std::abs(guess)<98000?guess-radius:-inf;
                double high=std::isfinite(guess)&&std::abs(guess)<98000?guess+radius:inf;
                int failures=0;Undo old=push(w,m);double v;
                try {for(;;) {
                    if(std::isfinite(low))narrowAttempts++;
                    v=-s.search(w,depth-1,-high,-low,1);
                    // Boundary values are bounds, never accepted as exact sample scores.
                    if(v>low&&v<high)break;
                    windowFailures++;failures++;radius*=2;
                    if(failures>=3){low=-inf;high=inf;fullFallbacks++;}
                    else {low=guess-radius;high=guess+radius;}
                }}catch(...){pop(w,m,old);throw;}
                pop(w,m,old);previous[world][m.index()]=v;scores.push_back(v);
            }`);
 if(name==='adaptive')s=patch(s,'else {low=guess-radius;high=guess+radius;}',
  'else if(v<=low){low=v-radius;}else{high=v+radius;}');
 s=patch(s,'std::cout<<",\\"allCandidates\\":";writeRows(last?last->rows:std::vector<Row>{});',
  'std::cout<<",\\"windowStats\\":{\\"narrowAttempts\\":"<<narrowAttempts<<",\\"failures\\":"<<windowFailures<<",\\"fullFallbacks\\":"<<fullFallbacks<<\'}\';std::cout<<",\\"allCandidates\\":";writeRows(last?last->rows:std::vector<Row>{});');
 return s;
}
export function compileVariant(name){
 const directory='.cache/windows';fs.mkdirSync(directory,{recursive:true});const source=variantSource(name),file=path.join(directory,name+'.cpp'),binary=path.resolve(directory,name);fs.writeFileSync(file,source);
 const flags=JSON.parse(fs.readFileSync('benchmarks/native-windows/baseline-build.json')).flags,compiler=process.env.CXX||'clang++';
 if(process.platform!=='darwin')flags.push('-pthread');
 const version=spawnSync(compiler,['--version'],{encoding:'utf8'});if(version.status!==0)throw Error(version.stderr);
 const result=spawnSync(compiler,[...flags,file,'-o',binary],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);
 const sha=x=>createHash('sha256').update(x).digest('hex');return{name,binary,sourceSha256:sha(source),binarySha256:sha(fs.readFileSync(binary)),compiler:version.stdout.trim(),flags,warnings:result.stderr};
}
