struct RootSession {
    const Packet& p;Search& s;bool parallel,jobsActive=false;size_t lanes;std::vector<Search> workers;std::unique_ptr<RequestWorkers> pool;
    std::vector<std::array<double,8100>> guesses;std::function<void()> poll;
    std::vector<std::array<uint64_t,3>> windows;uint64_t poolTasks=0;
    RootSession(const Packet& packet,Search& search):p(packet),s(search),parallel(p.nodeLimit==0&&p.worlds.size()>1),lanes(parallel?std::min(size_t(4),p.worlds.size()):1),workers(parallel?p.worlds.size():0),guesses(p.worlds.size()),windows(p.worlds.size()){
        for(auto& g:guesses)g.fill(inf);for(const Board& b:p.worlds)s.worlds.push_back(stateOf(b,p.captured,p.turn,p.viewer));for(auto& w:s.worlds)w.table.configure(s.worlds.size());
        const bool critical=criticalKing(p.view,0)||criticalKing(p.view,1);s.tacticalFocus=critical;s.strictDepth=true;
        for(auto& w:workers){w.start=s.start;w.limit=s.limit;w.tacticalFocus=critical;w.strictDepth=true;}if(parallel)pool=std::make_unique<RequestWorkers>(lanes);
    }
    void canonical(Search& worker,State& world){world.table.clear();worker.history.fill(0);for(auto& k:worker.killers)k.clear();}
    double sample(Search& worker,State& world,size_t index,Move m,int depth){
        const double guess=guesses[index][m.index()];double radius=200;
        double low=depth>=3&&!p.nodeLimit&&std::isfinite(guess)&&std::abs(guess)<98000?guess-radius:-inf,high=std::isfinite(low)?guess+radius:inf,v=0;unsigned failures=0;
        const Undo old=push(world,m);try{for(;;){
            if(worker.elapsed()>worker.limit)throw Timeout{};canonical(worker,world);if(std::isfinite(low)||std::isfinite(high))windows[index][0]++;
            v=-worker.search(world,depth,-high,-low,1);
            if(v>low&&v<high)break;windows[index][1]++;radius*=2;
            if(++failures>=3){low=-inf;high=inf;windows[index][2]++;}else if(v<=low)low=v-radius;else high=v+radius;
        }}catch(...){pop(world,m,old);throw;}pop(world,m,old);guesses[index][m.index()]=v;return v;
    }
    void update(){if(!parallel)return;s.nodes=0;s.nullSearches=s.nullCutoffs=s.nullVerifications=s.lmrSearches=s.lmrResearches=s.quietQueries=s.quietAdded=s.quietSearched=s.tacticalAdded=0;s.safetyCutoffs=0;
        for(const auto& w:workers){s.nodes+=w.nodes;s.selDepth=std::max(s.selDepth,w.selDepth);s.safetyCutoffs+=w.safetyCutoffs;s.nullSearches+=w.nullSearches;s.nullCutoffs+=w.nullCutoffs;s.nullVerifications+=w.nullVerifications;s.lmrSearches+=w.lmrSearches;s.lmrResearches+=w.lmrResearches;s.quietQueries+=w.quietQueries;s.quietAdded+=w.quietAdded;s.quietSearched+=w.quietSearched;s.tacticalAdded+=w.tacticalAdded;}}
    std::pair<uint64_t,int> observed()const{if(!parallel||!jobsActive)return {s.nodes,s.selDepth};uint64_t nodes=0;int deepest=s.selDepth;for(const auto& w:workers){nodes+=w.publishedNodes.load(std::memory_order_relaxed);deepest=std::max(deepest,w.publishedSelDepth.load(std::memory_order_relaxed));}return {nodes,deepest};}
    Row score(Move m,int depth,bool uncertain){
        if(p.outcomes[m.index()]){bool loss=p.outcomes[m.index()]==2;Row r=summarize(m,{loss?-mate+1.0:0.0},uncertain);r.draw=!loss;r.repetitionLoss=loss;r.repetitions=p.repetitions[m.index()];return r;}
        std::vector<double> scores(s.worlds.size());
        if(parallel){std::vector<std::future<void>> tasks;std::exception_ptr error;jobsActive=true;try{for(size_t lane=0;lane<lanes;lane++){poolTasks++;tasks.push_back(pool->submit([&,lane]{for(size_t i=lane;i<s.worlds.size();i+=lanes)scores[i]=sample(workers[i],s.worlds[i],i,m,depth-1);}));}}catch(...){error=std::current_exception();}
            for(auto& task:tasks)try{while(task.wait_for(std::chrono::milliseconds(5))!=std::future_status::ready)if(poll)poll();task.get();}catch(...){if(!error)error=std::current_exception();}jobsActive=false;update();if(error)std::rethrow_exception(error);
        }else for(size_t i=0;i<s.worlds.size();i++)scores[i]=sample(s,s.worlds[i],i,m,depth-1);
        Row r=summarize(m,scores,uncertain);r.repetitions=p.repetitions[m.index()];return r;
    }
    void writeFeatures()const{
        uint64_t evaluations=0,nnue=0,updates=0,pressureHits=0,pressureMisses=0,lazy=0,probes=0,hits=0,clears=0;std::array<uint64_t,3> window{};
        for(const auto& w:s.worlds){evaluations+=w.evalCalls;nnue+=w.nnueEvals;updates+=w.nnueUpdates;pressureHits+=w.pressureHits;pressureMisses+=w.pressureMisses;lazy+=w.lazyCuts;probes+=w.table.probes;hits+=w.table.hits;clears+=w.table.clears;}for(const auto& x:windows)for(int i=0;i<3;i++)window[i]+=x[i];
        std::cout<<",\"features\":{\"nnueEvaluations\":"<<nnue<<",\"nnueUpdates\":"<<updates<<",\"fullActivityEvaluations\":"<<evaluations<<",\"pressureCacheHits\":"<<pressureHits<<",\"pressureCacheMisses\":"<<pressureMisses<<",\"lazyBounds\":"<<lazy<<",\"ttProbes\":"<<probes<<",\"ttHits\":"<<hits<<",\"canonicalClears\":"<<clears<<",\"poolTasks\":"<<poolTasks<<",\"windowAttempts\":"<<window[0]<<",\"windowFailures\":"<<window[1]<<",\"windowFullFallbacks\":"<<window[2]<<",\"lmrSearches\":"<<s.lmrSearches<<",\"lmrResearches\":"<<s.lmrResearches<<",\"nullSearches\":"<<s.nullSearches<<",\"nullCutoffs\":"<<s.nullCutoffs<<",\"nullVerifications\":"<<s.nullVerifications<<",\"quietQueries\":"<<s.quietQueries<<",\"quietAdded\":"<<s.quietAdded<<",\"quietSearched\":"<<s.quietSearched<<",\"criticalQuietAdded\":"<<s.tacticalAdded<<'}';
    }
};
