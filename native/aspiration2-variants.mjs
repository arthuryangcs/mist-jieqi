import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const sha=x=>createHash('sha256').update(x).digest('hex');
const patch=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Nonunique patch: '+a.slice(0,70));return s.replace(a,b);};
export function sourceOf(name,{audit=false,cap=90000}={}) {
 let s=fs.readFileSync('benchmarks/aspiration2/baseline.cpp','utf8');
 if(sha(s)!=='eb1c25bbd4209321bbd0a881128bce0de784d300d2aed8abe6c189167ac38698')throw Error('Frozen baseline changed');
 const asp=['asp','both','bothFast','poolasp'].includes(name),refresh=['refresh','both','refreshFast','bothFast','refreshLookup'].includes(name),pool=['pool','poolasp'].includes(name);
 if(!['baseline','asp','refresh','both','refreshFast','bothFast','refreshLookup','pool','poolasp'].includes(name))throw Error('Unknown variant');
 if(cap!==90000)s=patch(s,'s.table.size()<90000',`s.table.size()<${cap}`);
 if(refresh)s=patch(s,`s.table.size()<${cap}`,name==='refreshLookup'?`(s.table.size()<${cap}||s.table.find(key)!=s.table.end())`:name.endsWith('Fast')?`(s.table.size()<${cap}||hasEntry)`:`(hasEntry||s.table.size()<${cap})`);
 if(pool){
  s=patch(s,'#include <future>','#include <future>\n#include <thread>\n#include <mutex>\n#include <condition_variable>\n#include <queue>\n#include <functional>\n#include <memory>');
  s=patch(s,'struct Search {',`// Own request-local workers only; Search/State still belong to sampled worlds.
class RequestWorkers {
    std::mutex mutex;std::condition_variable ready;
    std::queue<std::function<void()>> jobs;std::vector<std::thread> threads;
    bool stopping=false;
    void close(){
        {std::lock_guard<std::mutex> lock(mutex);stopping=true;}
        ready.notify_all();for(auto& thread:threads)if(thread.joinable())thread.join();
    }
public:
    explicit RequestWorkers(size_t count){
        try{for(size_t i=0;i<count;i++)threads.emplace_back([this]{
            for(;;){std::function<void()> job;
                {std::unique_lock<std::mutex> lock(mutex);ready.wait(lock,[this]{return stopping||!jobs.empty();});
                 if(stopping&&jobs.empty())return;job=std::move(jobs.front());jobs.pop();}
                job();
            }
        });}catch(...){close();throw;}
    }
    ~RequestWorkers(){close();}
    std::future<void> submit(std::function<void()> job){
        auto task=std::make_shared<std::packaged_task<void()>>(std::move(job));auto result=task->get_future();
        {std::lock_guard<std::mutex> lock(mutex);if(stopping)throw std::runtime_error("request workers closed");jobs.emplace([task]{(*task)();});}
        ready.notify_one();return result;
    }
};
struct Search {`);
  s=patch(s,'for(auto& worker:workers){worker.start=s.start;worker.limit=s.limit;}',`for(auto& worker:workers){worker.start=s.start;worker.limit=s.limit;}
    std::unique_ptr<RequestWorkers> pool;if(parallel)pool=std::make_unique<RequestWorkers>(lanes);`);
  s=patch(s,'std::vector<double> scores(s.worlds.size());std::vector<std::future<void>> tasks;', 'std::vector<double> scores(s.worlds.size());std::vector<std::future<void>> tasks;std::exception_ptr error;\n        try{');
  s=patch(s,'std::async(std::launch::async,[&,lane]{','pool->submit([&,lane]{');
  s=patch(s,'std::exception_ptr error;for(auto& task:tasks)', '}catch(...){error=std::current_exception();}\n        for(auto& task:tasks)');
  s=patch(s,'    #ifdef MIST_VERIFY_RESTORE','    pool.reset(); // Join idle workers before restoration checks and final timing.\n    #ifdef MIST_VERIFY_RESTORE');
 }
 if(asp){
  s=patch(s,'for(auto& worker:workers){worker.start=s.start;worker.limit=s.limit;}',`for(auto& worker:workers){worker.start=s.start;worker.limit=s.limit;}
    // Each prediction and statistic belongs to one exact root move and sampled
    // world, with this request's viewer, inventories, rule metadata and config.
    std::vector<std::array<double,8100>> previous(s.worlds.size());
    for(auto& row:previous)row.fill(inf);
    std::vector<std::array<uint64_t,3>> windowStats(s.worlds.size());
    auto exactSample=[&](Search& worker,State& w,size_t world,Move m,int childDepth) {
        const double guess=previous[world][m.index()];double radius=200;
        // Node-limited requests preserve the original interruption/node contract.
        double low=childDepth>=3&&!p.nodeLimit&&std::isfinite(guess)&&std::abs(guess)<98000?guess-radius:-inf;
        double high=std::isfinite(low)?guess+radius:inf;
        unsigned failures=0;double v;
        for(;;) {
            if(std::isfinite(low)||std::isfinite(high))windowStats[world][0]++;
            v=-worker.search(w,childDepth,-high,-low,1);
            // Only a strictly interior result is exact. Bounds are never averaged.
            if(v>low&&v<high)break;
            windowStats[world][1]++;radius*=2;
            if(++failures>=3){low=-inf;high=inf;windowStats[world][2]++;}
            else if(v<=low)low=v-radius;else high=v+radius;
        }
        previous[world][m.index()]=v;return v;
    };`);
  s=patch(s,'scores[world]=-workers[world].search(w,childDepth,-inf,inf,1);','scores[world]=exactSample(workers[world],w,world,m,childDepth);');
  const before='else for(State& w:s.worlds){if(s.elapsed()>s.limit)throw Timeout{};Undo old=push(w,m);double v;try{v=-s.search(w,depth-1,-inf,inf,1);}catch(...){pop(w,m,old);throw;}pop(w,m,old);scores.push_back(v);}';
  s=patch(s,before,'else for(size_t world=0;world<s.worlds.size();world++){State& w=s.worlds[world];if(s.elapsed()>s.limit)throw Timeout{};Undo old=push(w,m);double v;try{v=exactSample(s,w,world,m,depth-1);}catch(...){pop(w,m,old);throw;}pop(w,m,old);scores.push_back(v);}');
  s=patch(s,'std::cout<<",\\"threads\\":"<<lanes;',`std::array<uint64_t,3> total{};for(const auto& stats:windowStats)for(size_t i=0;i<3;i++)total[i]+=stats[i];
    std::cout<<",\\"windowStats\\":{\\"attempts\\":"<<total[0]<<",\\"failures\\":"<<total[1]<<",\\"fullFallbacks\\":"<<total[2]<<'}';
    std::cout<<",\\"threads\\":"<<lanes;`);
 }
 if(audit){
  s=patch(s,'Move move;double score=0,spread=0,winRate=0;','std::vector<double> sampleScores;Move move;double score=0,spread=0,winRate=0;');
  s=patch(s,'Row row;row.move=m;double probability=0,mean=0;','Row row;row.sampleScores=scores;row.move=m;double probability=0,mean=0;');
  s=patch(s,"if(r.draw)std::cout<<\",\\\"draw\\\":true\";std::cout<<'}';",`std::cout<<",\\"sampleScores\\":[";for(size_t i=0;i<r.sampleScores.size();i++){if(i)std::cout<<',';std::cout<<r.sampleScores[i];}std::cout<<']';if(r.draw)std::cout<<",\\"draw\\":true";std::cout<<'}';`);
  s=patch(s,'std::cout<<",\\"threads\\":"<<lanes;',`std::cout<<",\\"cacheSizes\\":[";for(size_t i=0;i<s.worlds.size();i++){if(i)std::cout<<',';std::cout<<s.worlds[i].table.size();}std::cout<<']';std::cout<<",\\"threads\\":"<<lanes;`);
 }
 return s;
}
export function compileAspiration(name,{audit=false,cap=90000,sanitizer=null}={}){
 const dir='.cache/aspiration2',suffix=`${audit?'-audit':''}${cap===90000?'':'-cap'+cap}${sanitizer?'-'+sanitizer:''}`;
 fs.mkdirSync(dir,{recursive:true});const source=sourceOf(name,{audit,cap}),file=path.join(dir,name+suffix+'.cpp'),binary=path.resolve(file.slice(0,-4));fs.writeFileSync(file,source);
 let flags=JSON.parse(fs.readFileSync('benchmarks/aspiration2/baseline-build.json')).flags;
 if(sanitizer)flags=flags.filter(x=>!['-O3','-DNDEBUG'].includes(x)).concat(['-O1','-g',`-fsanitize=${sanitizer}`,'-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']);
 const compiler=process.env.CXX||'clang++',version=spawnSync(compiler,['--version'],{encoding:'utf8'});if(version.status!==0)throw Error(version.stderr);
 try{const saved=JSON.parse(fs.readFileSync(binary+'.json'));if(saved.sourceSha256===sha(source)&&saved.binarySha256===sha(fs.readFileSync(binary))&&saved.compiler===version.stdout.trim()&&JSON.stringify(saved.flags)===JSON.stringify(flags))return {...saved,reusedBuild:true};}catch{}
 const r=spawnSync(compiler,[...flags,file,'-o',binary],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);
 const info={name,audit,cap,sanitizer,binary,sourceSha256:sha(source),binarySha256:sha(fs.readFileSync(binary)),compiler:version.stdout.trim(),flags,warnings:r.stderr};
 fs.writeFileSync(binary+'.json',JSON.stringify(info,null,2)+'\n');return info;
}
