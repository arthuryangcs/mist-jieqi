// A PLAY result compares only fully evaluated roots at ONE common depth and
// across the identical fixed sample set. Shallower roots schedule exploration;
// their scores never enter a deeper result table. Full SEARCH/STREAM is separate.
// Frontier round: one-ply full coverage floor, broader acceptance, cap refill.
void runFocused(const Packet& p) {
    Search s;s.start=std::chrono::steady_clock::now();s.nodeLimit=p.nodeLimit;s.limit=p.budget-std::min(35.0,p.budget*.10);
    Board rootBoard=p.view;auto root=legal(rootBoard,p.turn);const size_t total=root.size();
    if(root.empty()){std::cout<<"{\"depth\":0,\"nodes\":0,\"samples\":0,\"score\":-99999,\"move\":null,\"terminal\":true,\"elapsedMs\":"<<s.elapsed()<<",\"allCandidates\":[],\"iterations\":[],\"rootCount\":0,\"comparedCount\":0,\"fullRootDepth\":0,\"searchScope\":\"full-root\"}\n";return;}
    State context;context.board=p.view;context.turn=p.turn;
    for(int side:{0,1}){auto bag=remaining(p.view,p.captured,side);context.poolCount[side]=int(bag.size());for(int t:bag)context.poolValue[side]+=value[t];}
    std::array<double,8100> reveal{};for(auto m:root)reveal[m.index()]=revealOrder(context,p.captured,m);
    std::stable_sort(root.begin(),root.end(),[&](Move a,Move b){return priority(context,a)+reveal[a.index()]>priority(context,b)+reveal[b.index()];});
    const auto original=root;const Move fallback=root[0];bool uncertain=false;for(auto q:p.view)uncertain|=q.live()&&q.hidden;
    const bool critical=criticalKing(rootBoard,0)||criticalKing(rootBoard,1);
    s.tacticalFocus=focusTacticsEnabled&&critical;s.strictDepth=canonicalRootsEnabled;
    for(const Board& b:p.worlds)s.worlds.push_back(stateOf(b,p.captured,p.turn,p.viewer));
    const bool parallel=p.nodeLimit==0&&s.worlds.size()>1;const size_t lanes=parallel?std::min(size_t(4),s.worlds.size()):1;
    std::vector<Search> workers(parallel?s.worlds.size():0);
    for(auto& worker:workers){worker.start=s.start;worker.limit=s.limit;worker.tacticalFocus=s.tacticalFocus;worker.strictDepth=canonicalRootsEnabled;}
    auto canonicalRoot=[&](Search& worker,State& world){
        // A reintroduced root must not inherit depth/path-sensitive cache or
        // ordering state from a different root or a different visited-depth set.
        // Capacity stays bounded; only within-root transpositions are retained.
        if(canonicalRootsEnabled){world.table.clear();worker.history.fill(0);for(auto& ks:worker.killers)ks.clear();}
    };
    auto updateNodes=[&](){if(parallel){s.nodes=0;s.tacticalQuietChecks=0;for(const auto& w:workers){s.nodes+=w.nodes;s.tacticalQuietChecks+=w.tacticalQuietChecks;}}};
    auto scoreRoot=[&](Move m,int depth) {
        if(p.draws[m.index()]){Row row=summarize(m,{0},uncertain);row.draw=true;row.repetitions=p.repetitions[m.index()];return row;}
        std::vector<double> scores(s.worlds.size());
        if(parallel){
            std::vector<std::future<void>> tasks;
            for(size_t lane=0;lane<lanes;lane++)tasks.push_back(std::async(std::launch::async,[&,lane]{
                for(size_t i=lane;i<s.worlds.size();i+=lanes){auto& w=s.worlds[i];auto& worker=workers[i];if(worker.elapsed()>worker.limit)throw Timeout{};canonicalRoot(worker,w);Undo old=push(w,m);try{scores[i]=-worker.search(w,depth-1,-inf,inf,1);}catch(...){pop(w,m,old);throw;}pop(w,m,old);}
            }));
            std::exception_ptr error;for(auto& task:tasks)try{task.get();}catch(...){if(!error)error=std::current_exception();}updateNodes();if(error)std::rethrow_exception(error);
        }else for(size_t i=0;i<s.worlds.size();i++){auto& w=s.worlds[i];if(s.elapsed()>s.limit)throw Timeout{};canonicalRoot(s,w);Undo old=push(w,m);try{scores[i]=-s.search(w,depth-1,-inf,inf,1);}catch(...){pop(w,m,old);throw;}pop(w,m,old);}
        Row row=summarize(m,scores,uncertain);row.repetitions=p.repetitions[m.index()];return row;
    };
    std::vector<Iteration> iterations;std::vector<Row> accepted,anchorRows,previous;
    int acceptedDepth=0,fullDepth=0,interrupted=0,planned=0,reentries=0,collapseExpansions=0;
    bool cohortComplete=true;size_t cursor=0;int coverageRefreshes=0,capFillRoots=0;
    const size_t minimumCompared=coverageRepairEnabled?std::min(total,std::max(size_t(2),(total+3)/4)):std::min(size_t(2),total);
    std::array<int,8100> completed{};std::array<double,8100> changes{},lastScore{};std::array<bool,8100> hasScore{},tactical{};
    // One-time root scheduling signals. Their values never modify a root score.
    if(focusRootEnabled)for(Move m:root){
        bool danger=p.view[m.to].live();
        for(auto& w:s.worlds){Undo old=push(w,m);danger|=inCheck(w.board,w.turn,w.kings[w.turn]);pop(w,m,old);if(danger)break;}
        tactical[m.index()]=danger;
    }
    auto writeScope=[&](int depth,size_t count,int target,bool complete) {
        std::cout<<",\"rootCount\":"<<total<<",\"comparedCount\":"<<count<<",\"plannedCount\":"<<target<<",\"cohortComplete\":"<<(complete?"true":"false")<<",\"fullRootDepth\":"<<fullDepth<<",\"searchScope\":\""<<(count==total?"full-root":"focused-root")<<"\",\"criticalRoot\":"<<(critical?"true":"false")<<",\"tacticalSearch\":"<<(s.tacticalFocus?"true":"false")<<",\"quietChecksSearched\":"<<s.tacticalQuietChecks<<",\"reintroducedCount\":"<<reentries<<",\"collapseExpansions\":"<<collapseExpansions<<",\"comparisonDepth\":"<<depth<<",\"minimumComparisonRoots\":"<<minimumCompared<<",\"coverageRefreshes\":"<<coverageRefreshes<<",\"capFillRoots\":"<<capFillRoots;
    };
    auto accept=[&](int depth,const std::vector<Row>& rows,int target,bool complete) {
        if(rows.size()<minimumCompared)return;accepted=rows;std::stable_sort(accepted.begin(),accepted.end(),[](const Row& a,const Row& b){return a.score>b.score;});
        acceptedDepth=depth;planned=target;cohortComplete=complete;
        if(rows.size()==total)fullDepth=depth;
        if(p.mode=="STREAM_PLAY"){
            std::cout<<"{\"progress\":true,\"result\":{\"depth\":"<<depth<<",\"nodes\":"<<s.nodes<<",\"samples\":"<<p.worlds.size()<<",\"elapsedMs\":"<<s.elapsed()<<",\"threads\":"<<lanes<<",\"score\":"<<accepted[0].score<<",\"move\":";writeMove(accepted[0].move);std::cout<<",\"allCandidates\":";writeRows(accepted);writeScope(depth,rows.size(),target,complete);std::cout<<"}}\n"<<std::flush;
        }
    };
    const int anchor=focusRootEnabled?(p.budget>=700?3:2):p.depth;
    for(int depth=1;depth<=p.depth;depth++) {
        const bool focused=focusRootEnabled&&depth>anchor;
        // Before opening another deeper tier, bring every omitted root to the
        // preceding depth. Published rows stay at one common exact depth.
        if(coverageRepairEnabled&&depth>anchor+1&&previous.size()<total){
            std::vector<Row> refreshed=previous;
            try{
                for(Move m:original){
                    if(std::any_of(refreshed.begin(),refreshed.end(),[&](const Row& r){return r.move==m;}))continue;
                    Row row=scoreRoot(m,depth-1);refreshed.push_back(row);coverageRefreshes++;
                    if(hasScore[m.index()])changes[m.index()]=std::abs(row.score-lastScore[m.index()]);
                    lastScore[m.index()]=row.score;hasScore[m.index()]=true;completed[m.index()]=depth-1;
                    if(refreshed.size()%4==0||refreshed.size()==total)accept(depth-1,refreshed,int(total),refreshed.size()==total);
                }
            }catch(const Timeout&){interrupted=depth-1;accept(depth-1,refreshed,int(total),false);break;}
            accept(depth-1,refreshed,int(total),true);previous=accepted;
        }
        std::vector<Move> cohort;std::array<bool,8100> added{},probes{};
        auto add=[&](Move m,bool probe=false){if(!added[m.index()]){added[m.index()]=true;cohort.push_back(m);probes[m.index()]=probe;}};
        if(!focused)cohort=root;
        else {
            // Champion first; exploration is interleaved before the rest of the
            // leading cohort, rather than left behind an expensive deep batch.
            if(!previous.empty())add(previous[0].move);
            if(previous.size()>1)add(previous[1].move);
            const int width=std::max(6,int((total+5)/6));
            std::vector<Move> leaders;for(const auto& row:previous){if(leaders.size()>=size_t(width))break;leaders.push_back(row.move);}
            for(const auto& row:anchorRows){if(leaders.size()>=size_t(width))break;if(std::find(leaders.begin(),leaders.end(),row.move)==leaders.end())leaders.push_back(row.move);}
            auto explore=[&](){
                int minDepth=100;for(Move m:original)if(!added[m.index()])minDepth=std::min(minDepth,completed[m.index()]);
                for(size_t j=0;j<total;j++){Move m=original[(cursor+j)%total];if(!added[m.index()]&&completed[m.index()]==minDepth&&std::find(leaders.begin(),leaders.end(),m)==leaders.end()){add(m,true);break;}}
            };
            explore();for(size_t i=0;i<leaders.size();i++){add(leaders[i]);if(i==0||i==2)explore();}
            // Separate unstable and tactical quotas; shallow scores are used
            // solely to schedule these moves, never averaged into deeper rows.
            auto unstable=original;std::stable_sort(unstable.begin(),unstable.end(),[&](Move a,Move b){return changes[a.index()]>changes[b.index()];});
            int n=0;for(Move m:unstable)if(!added[m.index()]&&changes[m.index()]>40){add(m);if(++n==2)break;}
            n=0;for(const auto& row:anchorRows)if(!added[row.move.index()]&&(tactical[row.move.index()]||row.losses>0||row.spread>350)){add(row.move);if(++n==3)break;}
        }
        // A finite leading cohort may be smaller than the coverage acceptance
        // quorum. Fill it by least-completed depth without score bonuses.
        if(coverageRepairEnabled&&focused)while(cohort.size()<minimumCompared){
            auto candidates=original;std::stable_sort(candidates.begin(),candidates.end(),[&](Move a,Move b){return completed[a.index()]<completed[b.index()];});
            bool found=false;for(Move m:candidates)if(!added[m.index()]){add(m,true);found=true;break;}if(!found)break;
        }
        std::array<bool,8100> capAdded{};
        // At the requested depth ceiling, spend remaining time on every
        // omitted root at that SAME depth, retaining partial progress on stop.
        if(capRepairEnabled&&focused&&depth==p.depth)for(Move m:original)if(!added[m.index()]){add(m,true);capAdded[m.index()]=true;}
        std::vector<Row> rows;bool expanded=false;
        try {
            for(size_t i=0;i<cohort.size();i++) {
                const Move m=cohort[i];Row row=scoreRoot(m,depth);rows.push_back(row);if(capAdded[m.index()])capFillRoots++;
                if(hasScore[m.index()])changes[m.index()]=std::abs(row.score-lastScore[m.index()]);lastScore[m.index()]=row.score;hasScore[m.index()]=true;completed[m.index()]=depth;
                if(focused&&probes[m.index()]){reentries++;for(size_t j=0;j<total;j++)if(original[j]==m){cursor=(j+1)%total;break;}}
                if(focused&&i==0&&!previous.empty()&&!expanded&&(row.losses>previous[0].losses||row.score<previous[0].score-220)){
                    expanded=true;collapseExpansions++;
                    // A collapsing champion cannot permanently suppress the
                    // shallow remainder. Reintroduce every omitted root now.
                    for(const auto& a:anchorRows)if(!added[a.move.index()])add(a.move,true);
                }
                if(focused&&(rows.size()==1||rows.size()==2||rows.size()%4==0||i+1==cohort.size()))accept(depth,rows,int(cohort.size()),i+1==cohort.size());
            }
        }catch(const Timeout&){interrupted=depth;if(focused&&rows.size()>=minimumCompared){accept(depth,rows,int(cohort.size()),false);iterations.push_back({depth,s.nodes,s.elapsed(),accepted});}break;}
        accept(depth,rows,int(cohort.size()),true);iterations.push_back({depth,s.nodes,s.elapsed(),accepted});previous=accepted;
        if(!focused){anchorRows=accepted;root.clear();for(const auto& row:accepted)root.push_back(row.move);}
        if((!uncertain&&std::abs(accepted[0].score)>98000)||s.elapsed()>s.limit)break;
    }
    #ifdef MIST_VERIFY_RESTORE
    for(size_t i=0;i<s.worlds.size();i++){const State expected=stateOf(p.worlds[i],p.captured,p.turn,p.viewer);const auto& w=s.worlds[i];if(!(w.board==expected.board&&w.key()==expected.key()&&w.path==expected.path&&w.population==expected.population&&w.kings[0]==expected.kings[0]&&w.kings[1]==expected.kings[1]))throw std::runtime_error("focused sample not restored");}
    #endif
    std::cout<<"{\"depth\":"<<acceptedDepth<<",\"nodes\":"<<s.nodes<<",\"samples\":"<<p.worlds.size()<<",\"elapsedMs\":"<<s.elapsed()<<",\"interruptedDepth\":"<<interrupted<<",\"score\":"<<(accepted.empty()?0:accepted[0].score)<<",\"move\":";writeMove(accepted.empty()?fallback:accepted[0].move);
    std::cout<<",\"threads\":"<<lanes<<",\"allCandidates\":";writeRows(accepted);writeScope(acceptedDepth,accepted.size(),planned,cohortComplete);
    std::cout<<",\"iterations\":[";if(p.mode!="STREAM_PLAY")for(size_t i=0;i<iterations.size();i++){if(i)std::cout<<',';const auto& it=iterations[i];std::cout<<"{\"depth\":"<<it.depth<<",\"nodes\":"<<it.nodes<<",\"elapsedMs\":"<<it.elapsed<<",\"allCandidates\":";writeRows(it.rows);std::cout<<'}';}std::cout<<"]}\n";
}
