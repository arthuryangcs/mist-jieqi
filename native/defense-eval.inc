// Experimental pseudo-attack map. It is an evaluation feature, not a legality
// oracle: pins and the board changes caused by a king move still require search.
// Dark pieces attack with their public role; costs use the observer's pool mean.
struct AttackMap {
    std::array<std::array<uint8_t,90>,2> count{};
    std::array<std::array<double,90>,2> cheapest;
    AttackMap(){for(auto& row:cheapest)row.fill(1000000);}
    void add(int side,int square,double cost){count[side][square]++;cheapest[side][square]=std::min(cheapest[side][square],cost);}
};
double defenseMaterial(const State& s,Piece p){return p.hidden?(s.poolCount[p.side]?double(s.poolValue[p.side])/s.poolCount[p.side]:0):value[p.type];}
AttackMap attackMap(const State& s) {
    AttackMap out;
    for(int f=0;f<90;f++) {
        Piece p=s.board[f];if(!p.live())continue;
        const int type=p.effective(),x=f%9,y=f/9;const double cost=defenseMaterial(s,p);
        if(type==R||type==C) {
            for(auto d:rays) {
                bool screen=false;
                for(int u=x+d[0],v=y+d[1];inside(u,v);u+=d[0],v+=d[1]) {
                    const int t=v*9+u;const bool occupied=s.board[t].live();
                    if(type==R){out.add(p.side,t,cost);if(occupied)break;}
                    else if(!screen){if(occupied)screen=true;}
                    else {out.add(p.side,t,cost);if(occupied)break;}
                }
            }
        }else for(int t:candidates(s.board,f,false))if(pseudo(s.board,f,t,true))out.add(p.side,t,cost);
    }
    return out;
}
struct DefenseTerms {std::array<double,2> threats{},king{};};
DefenseTerms defenseTerms(const State& s,const AttackMap& map) {
    DefenseTerms out;
    for(int i=0;i<90;i++) {
        Piece p=s.board[i];if(!p.live()||(!p.hidden&&p.type==K)||!map.count[p.side^1][i])continue;
        const double material=defenseMaterial(s,p);
        out.threats[p.side]+=map.count[p.side][i]?0.10*std::max(0.0,material-map.cheapest[p.side^1][i]):0.18*material;
    }
    for(int side:{0,1}) {
        int k=s.kings[side];if(k<0)continue;int controlled=0,safe=0;
        for(auto d:rays) {
            int u=k%9+d[0],v=k/9+d[1];if(!inside(u,v)||!palace(u,v,side))continue;
            int t=v*9+u;
            if(map.count[side^1][t])controlled++;
            else if(s.board[t].side!=side)safe++;
        }
        out.king[side]=20*int(map.count[side^1][k]>0)+12*controlled+(controlled?18*std::max(0,2-safe):0);
    }
    return out;
}
double defenseDelta(const State& s,int side) {
    const AttackMap map=attackMap(s);const DefenseTerms terms=defenseTerms(s,map);
    return (MIST_DEFENSE_THREATS?(terms.threats[side^1]-terms.threats[side]):0)
          +(MIST_DEFENSE_KING?(terms.king[side^1]-terms.king[side]):0);
}
// Lower-cost ablation: query only occupied targets and the king's neighbors.
// Reusing the existing geometric checker avoids constructing a full attack map.
double fastDefenseDelta(const State& s,int side) {
    #if MIST_DEFENSE_CACHE
    auto& cached=s.pressureCache[(s.h1^(s.h2>>16))&2047];
    if(cached.valid&&cached.h1==s.h1&&cached.h2==s.h2){s.pressureHits++;return side==0?cached.red:-cached.red;}
    s.pressureMisses++;
    #endif
    double penalty[2]={0,0};
    if(MIST_DEFENSE_THREATS)for(int i=0;i<90;i++) {
        Piece p=s.board[i];if(!p.live()||(!p.hidden&&p.type==K))continue;
        if(inCheck(s.board,p.side,i)&&!inCheck(s.board,p.side^1,i))penalty[p.side]+=0.18*defenseMaterial(s,p);
    }
    if(MIST_DEFENSE_KING)for(int color:{0,1}) {
        int k=s.kings[color];if(k<0)continue;int controlled=0,safe=0;
        for(auto d:rays) {
            int u=k%9+d[0],v=k/9+d[1];if(!inside(u,v)||!palace(u,v,color))continue;
            int t=v*9+u;if(inCheck(s.board,color,t))controlled++;else if(s.board[t].side!=color)safe++;
        }
        penalty[color]+=20*int(inCheck(s.board,color,k))+12*controlled+(controlled?18*std::max(0,2-safe):0);
    }
    const double red=penalty[1]-penalty[0];
    #if MIST_DEFENSE_CACHE
    cached={s.h1,s.h2,red,true};
    #endif
    return side==0?red:-red;
}
void writeDefense(const State& s) {
    auto map=attackMap(s);auto terms=defenseTerms(s,map);
    std::cout<<"{\"threats\":["<<terms.threats[0]<<','<<terms.threats[1]<<"],\"king\":["<<terms.king[0]<<','<<terms.king[1]<<"],\"attacks\":[";
    for(int side:{0,1}){if(side)std::cout<<',';std::cout<<'[';for(int i=0;i<90;i++){if(i)std::cout<<',';std::cout<<int(map.count[side][i]);}std::cout<<']';}
    std::cout<<"],\"cheapest\":[";
    for(int side:{0,1}){if(side)std::cout<<',';std::cout<<'[';for(int i=0;i<90;i++){if(i)std::cout<<',';std::cout<<map.cheapest[side][i];}std::cout<<']';}
    std::cout<<"]}";
}
