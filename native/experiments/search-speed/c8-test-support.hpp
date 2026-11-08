// Inject after Search inside namespace mist, alongside the existing C7 unit support.
// Full mode covers every N/A/B/P geometry, occupancy combinations, and seeded boards.
int nonSliderGeometryUnits(bool full) {
    int tests=0;
    auto need=[&](bool condition,const char* message){tests++;if(!condition)throw std::logic_error(message);};
    struct RestoreHints {bool before;~RestoreHints(){kingHintEnabled=before;}} restore{kingHintEnabled};
    need(nonSliderGeometryTable!=nullptr,"non-slider table was not initialized before search");
    need(sizeof(NonSliderTable)<=50*1024,"non-slider table exceeds budget");
    auto equal=[](Destinations& a,Destinations& b){return a.count==b.count&&std::equal(a.begin(),a.end(),b.begin());};
    auto check=[&](const Board& board,int from){
        const Board before=board;const Piece source=board[from];const int kind=nonSliderKind(source.effective());
        OccupiedBits occupied;for(int square=0;square<90;square++)if(board[square].live())occupied.toggle(square);
        int enemyKing=-1;for(int square=0;square<90;square++)if(board[square].side!=source.side&&board[square].type==K){enemyKing=square;break;}
        for(bool captures:{false,true}){
            auto expected=hintDestinations(board,from,captures,enemyKing);
            kingHintEnabled=true;
            auto actual=lineDestinations(board,occupied,from,captures,enemyKing);
            need(equal(actual,expected),"non-slider line output/order differs from hint generator");
            if(kind>=0){
                auto direct=nonSliderDestinations(board,from,captures,kind);
                need(equal(direct,expected),"non-slider direct table output/order differs");
            }
            kingHintEnabled=false;
            auto fallback=lineDestinations(board,occupied,from,captures,enemyKing);
            auto oldFallback=pseudoDestinations(board,from,captures);
            need(equal(fallback,oldFallback),"non-slider changed disabled-hint fallback");
        }
        need(board==before,"non-slider generation changed board");
    };
    auto occupant=[](int status,int side){return status==0?Piece{}:Piece{status==1?side:side^1,P,P,false};};
    const std::array<int,4> types={N,A,B,P};
    if(full)for(int type:types)for(int side:{0,1})for(bool hidden:{false,true})for(int from=0;from<90;from++){
        Board empty;empty[from]={side,hidden?R:type,type,hidden}; // Hidden true type must not select geometry.
        check(empty,from);
        const auto& entry=(*nonSliderGeometryTable)[nonSliderIndex(nonSliderKind(type),side,hidden,from)];
        need(entry.count<=8,"non-slider entry exceeds eight destinations");
        std::array<bool,90> seen{};
        for(unsigned i=0;i<entry.count;i++){
            const NonSliderStep step=entry.steps[i];
            need(step.to<90&&step.to!=from&&!seen[step.to],"invalid or duplicate non-slider destination");
            seen[step.to]=true;
            need(step.block>=-1&&step.block<90&&step.block!=from,"invalid non-slider blocker square");
        }

        // Derive test targets/blockers independently from the table under test.
        auto raw=candidates(empty,from,false);
        std::vector<int> targets(raw.begin(),raw.end()),blocks;
        auto blocker=[&](int to){
            const int x=from%9,y=from/9,dx=to%9-x,dy=to/9-y;
            if(type==N)return (y+(std::abs(dy)==2?sign(dy):0))*9+x+(std::abs(dx)==2?sign(dx):0);
            if(type==B)return (y+dy/2)*9+x+dx/2;
            return -1;
        };
        for(int to:targets){
            const int block=blocker(to);
            if(block>=0&&std::find(blocks.begin(),blocks.end(),block)==blocks.end())blocks.push_back(block);
            // Each destination: empty/own/enemy crossed with each blocker state.
            for(int destinationState=0;destinationState<3;destinationState++)for(int blockerState=0;blockerState<(block>=0?3:1);blockerState++){
                Board board=empty;board[to]=occupant(destinationState,side);
                if(block>=0)board[block]=occupant(blockerState,side);
                check(board,from);
            }
        }
        // All simultaneous leg/eye occupancies, plus three mixed destination patterns.
        // This catches shared horse legs and ordering after several candidates disappear.
        int combinations=1;for(size_t i=0;i<blocks.size();i++)combinations*=3;
        for(int mask=0;mask<combinations;mask++)for(int pattern=0;pattern<3;pattern++){
            Board board=empty;
            for(size_t i=0;i<targets.size();i++)board[targets[i]]=occupant((int(i)+pattern)%3,side);
            int digits=mask;for(int block:blocks){board[block]=occupant(digits%3,side);digits/=3;}
            check(board,from);
        }
    }

    uint32_t seed=0x72a9c31d;
    auto next=[&](){seed^=seed<<13;seed^=seed>>17;seed^=seed<<5;return seed;};
    const std::array<int,6> ordinary={N,A,B,P,R,C};
    for(int sample=0;sample<(full?2000:40);sample++){
        Board board;
        for(int square=0;square<90;square++)if(next()%100<38){
            const int side=int(next()%2),role=ordinary[next()%ordinary.size()],type=ordinary[next()%ordinary.size()];
            const bool hidden=bool(next()%2);board[square]={side,hidden?type:role,role,hidden};
        }
        board[85]={0,K,K,false};board[4]={1,K,K,false};
        for(int from=0;from<90;from++)if(board[from].live())check(board,from);
    }

    // Explicit king/sliders and hint-disabled paths remain the C7 implementation.
    for(int type:{K,R,C})for(int side:{0,1})for(int from=0;from<90;from++){
        Board board;board[85]={0,K,K,false};board[4]={1,K,K,false};
        board[from]={side,type,type,false};
        if(!board[49].live())board[49]={side^1,P,P,false};
        check(board,from);
    }
    return tests;
}
