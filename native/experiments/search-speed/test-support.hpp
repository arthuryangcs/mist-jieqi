double reference(State& s,int depth,double alpha,double beta,int ply,int qleft=3,int extensions=2){
    auto all=legal(s.board,s.turn);if(all.empty())return -mate+ply;
    int count=0;for(size_t i=s.historyStart;i<s.positions.size();i++)count+=s.positions[i]==s.position();
    if(count>=2)return mate-ply;if(s.quiet>=120||s.gamePly>=400)return 0;
    const auto digest=s.historyDigest;s.positions.push_back(s.position());s.historyDigest+=positionDigest(s.position());
    double answer;try{const bool check=inCheck(s.board,s.turn,s.kings[s.turn]);if(check&&depth>0&&extensions>0){depth++;extensions--;}
        const bool quiet=depth<=0&&!check;double best=quiet?evaluate(s,s.turn):-inf;
        if(quiet&&(qleft<=0||best>=beta))answer=best;
        else if(depth<=-6)answer=evaluate(s,s.turn)-(check?180:0);
        else{alpha=std::max(alpha,best);for(Move m:all){if(quiet&&!s.board[m.to].live())continue;Undo u=push(s,m);const double v=-reference(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft,extensions);pop(s,m,u);best=std::max(best,v);alpha=std::max(alpha,v);if(alpha>=beta)break;}answer=best;}
    }catch(...){s.positions.pop_back();s.historyDigest=digest;throw;}
    s.positions.pop_back();s.historyDigest=digest;return answer;
}
void require(bool value,const char* message){if(!value)throw std::runtime_error(message);}
int runUnits(const Packet& p){size_t tests=0;TTArena arena;TTScope scope(arena);State root=gameState(p.worlds[0],p);auto moves=legal(root.board,root.turn);
    // Public context and counters are restored exactly, including irreversible resets.
    for(Move m:moves){State s=gameState(p.worlds[0],p);const auto key=s.key();const auto positions=s.positions;const auto digest=s.historyDigest;const int quiet=s.quiet,gamePly=s.gamePly;const auto old=push(s,m);const auto next=stateOf(s.board,p.captured,s.turn,s.viewer);require(s.pub1==next.pub1&&s.pub2==next.pub2,"public incremental hash");pop(s,m,old);require(s.key()==key&&s.positions==positions&&s.historyDigest==digest&&s.quiet==quiet&&s.gamePly==gamePly,"context undo");tests++;}
    const auto key=root.key();root.quiet++;require(!(key==root.key()),"quiet missing from TT key");root.quiet--;root.gamePly++;require(!(key==root.key()),"game ply missing from TT key");root.gamePly--;root.viewer=(root.viewer+1)%2;require(!(key==root.key()),"observer missing from TT key");root.viewer=p.viewer;root.poolValue[0]++;require(!(key==root.key()),"inventory missing from TT key");root.poolValue[0]--;root.positions.push_back(root.position());root.historyDigest+=positionDigest(root.position());require(!(key==root.key()),"history missing from TT key");root.positions.pop_back();root.historyDigest-=positionDigest(root.position());require(root.key()==key,"context key drift");tests+=5;
    for(size_t r=0;r<std::min(size_t(3),moves.size());r++)for(int depth:{1,2,3}){
        State s=gameState(p.worlds[0],p);Undo old=push(s,moves[r]);const auto clean=s.key();const double exact=reference(s,depth,-inf,inf,1);require(s.key()==clean,"reference undo");
        for(int window=0;window<3;window++){
            TTArena localArena;TTScope localScope(localArena);State a=gameState(p.worlds[0],p);Undo u=push(a,moves[r]);Search search;search.start=std::chrono::steady_clock::now();search.limit=15000;
            const double alpha=window==0?-inf:window==1?exact+20:exact-40,beta=window==0?inf:window==1?exact+40:exact-20;
            const double got=search.search(a,depth,alpha,beta,1);require(window==0?std::abs(got-exact)<1e-7:window==1?got<=alpha:got>=beta,"TT window differs from independent value");
            // Repeating a full window through a previously narrow-window table must be exact.
            const double full=search.search(a,depth,-inf,inf,1);require(std::abs(full-exact)<1e-7,"cached bound misclassified as exact");
            const bool check=inCheck(a.board,a.turn,a.kings[a.turn]);const int effectiveDepth=depth+(check?1:0),ext=check?1:2;
            a.positions.push_back(a.position());a.historyDigest+=positionDigest(a.position());const Key saved=a.key(ext);a.table.store(saved,{effectiveDepth+1,0,7777,Move{}});a.positions.pop_back();a.historyDigest-=positionDigest(a.position());
            require(std::abs(search.search(a,depth,-inf,inf,1)-exact)<1e-7,"deeper TT score reused at shallower horizon");
            require(a.key()==clean,"search undo");pop(a,moves[r],u);tests+=4;
        }pop(s,moves[r],old);
    }
    // Third occurrence is a loss for the previous mover, independent of evaluator.
    for(int turn:{0,1}){State s=gameState(p.worlds[0],p);s.turn=turn;s.positions={s.position(),s.position()};s.historyStart=0;s.historyDigest=2*positionDigest(s.position());Search search;search.start=std::chrono::steady_clock::now();search.limit=1000;require(search.search(s,2,-inf,inf,7)==mate-7,"third occurrence distance/responsibility");tests++;}
    // Mate scores stored relative to the position, rebased to current root ply.
    for(double score:{double(mate-12),double(-mate+12)}){State s=gameState(p.worlds[0],p);const bool check=inCheck(s.board,s.turn,s.kings[s.turn]);s.positions.push_back(s.position());s.historyDigest+=positionDigest(s.position());const Key k=s.key(check?1:2);s.table.store(k,{2+(check?1:0),0,score>0?score+5:score-5,{}});s.positions.pop_back();s.historyDigest-=positionDigest(s.position());Search search;search.start=std::chrono::steady_clock::now();search.limit=1000;require(search.search(s,2,-inf,inf,9)==(score>0?score-4:score+4),"TT mate distance normalization");tests++;}
    return int(tests);
}

int qLeafUnits(const Packet& p){int tests=0;
    for(int depth:{0,-3})for(int window=0;window<3;window++){
        TTArena arena;TTScope scope(arena);State s=gameState(p.worlds[0],p);s.positions.pop_back();s.historyDigest-=positionDigest(s.position());
        const auto key=s.key();const auto history=s.positions;const double exact=reference(s,depth,-inf,inf,1,0,2);
        const double alpha=window==0?-inf:window==1?exact+20:exact-40,beta=window==0?inf:window==1?exact+40:exact-20;
        Search search;search.start=std::chrono::steady_clock::now();search.limit=15000;const double got=search.search(s,depth,alpha,beta,1,0,2);
        require(window==0?std::abs(got-exact)<1e-7:window==1?got<=alpha:got>=beta,"qleft0 value/window/reference");
        require(s.key()==key&&s.positions==history,"qleft0 undo");tests+=2;
    }
    for(int rule=0;rule<3;rule++){TTArena arena;TTScope scope(arena);State s=gameState(p.worlds[0],p);s.positions.clear();s.historyStart=0;s.historyDigest=0;
        if(rule==0){s.positions={s.position(),s.position()};s.historyDigest=2*positionDigest(s.position());}else if(rule==1)s.quiet=120;else s.gamePly=400;
        const double expected=reference(s,0,-inf,inf,1,0,2);Search search;search.start=std::chrono::steady_clock::now();search.limit=15000;require(search.search(s,0,-inf,inf,1,0,2)==expected,"qleaf terminal precedence");tests++;}
    return tests;
}
