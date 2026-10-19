// Mist Jieqi native search prototype. Default aa7644c semantics, one thread.
// No third-party source or libraries. Input worlds are samples, never real dark layout.
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>
#include <future>
#include <exception>

namespace mist {
enum Type { K, R, N, B, C, A, P };
constexpr int value[] = {100000,900,420,210,450,210,110};
constexpr int mate=99000;
constexpr double inf=std::numeric_limits<double>::infinity();
struct Piece {
    int side=-1, type=-1, role=-1; bool hidden=false;
    bool live() const { return side>=0; }
    int effective() const { return hidden?role:type; }
    bool operator==(const Piece& q) const { return side==q.side&&type==q.type&&role==q.role&&hidden==q.hidden; }
};
using Board=std::array<Piece,90>;
struct Move {
    int from=-1,to=-1;
    bool operator==(const Move& m) const { return from==m.from&&to==m.to; }
    int index() const { return from*90+to; }
};
const std::array<std::array<int,2>,4> rays={{{1,0},{-1,0},{0,1},{0,-1}}};
const std::array<std::array<int,2>,8> horses={{{1,2},{2,1},{-1,2},{-2,1},{1,-2},{2,-1},{-1,-2},{-2,-1}}};
struct Leap { int from,type,block; };
std::array<std::vector<Leap>,90> checks;
std::array<uint32_t,90*112> z1,z2;
int sign(int x) { return (x>0)-(x<0); }
bool inside(int x,int y) { return x>=0&&x<9&&y>=0&&y<10; }
bool palace(int x,int y,int side) { return x>=3&&x<=5&&(side==0?y>=7:y<=2); }
int kingAt(const Board& b,int side) { for(int i=0;i<90;i++)if(b[i].side==side&&!b[i].hidden&&b[i].type==K)return i;return -1; }
void initialize() {
    uint32_t rng=817331;auto next=[&](){rng=rng*1664525u+1013904223u;return rng;};
    for(auto& z:z1)z=next();for(auto& z:z2)z=next();
    for(int k=0;k<90;k++) {
        int x=k%9,y=k/9;
        for(auto d:horses)if(inside(x+d[0],y+d[1])) {
            int u=x+d[0],v=y+d[1];
            checks[k].push_back({v*9+u,N,(v-(std::abs(d[1])==2?sign(d[1]):0))*9+u-(std::abs(d[0])==2?sign(d[0]):0)});
        }
        for(int t:{A,B})for(int dx:{1,-1})for(int dy:{1,-1}) {
            int distance=t==A?1:2,u=x+dx*distance,v=y+dy*distance;
            if(inside(u,v))checks[k].push_back({v*9+u,t,t==B?(y+dy)*9+x+dx:0});
        }
    }
}
bool pseudo(const Board& b,int f,int t,bool friendly=false) {
    if(f<0||f>=90||t<0||t>=90||f==t)return false;
    Piece p=b[f],q=b[t];if(!p.live()||(!friendly&&q.side==p.side))return false;
    int x=f%9,y=f/9,u=t%9,v=t/9,dx=u-x,dy=v-y,ax=std::abs(dx),ay=std::abs(dy),count=0;
    if(dx==0||dy==0) { int step=dx==0?sign(dy)*9:sign(dx);for(int i=f+step;i!=t;i+=step)if(b[i].live())count++; }
    switch(p.effective()) {
        case K:return (ax+ay==1&&palace(u,v,p.side))||(q.type==K&&dx==0&&count==0);
        case A:return ax==1&&ay==1&&(!p.hidden||palace(u,v,p.side));
        case B:return ax==2&&ay==2&&!b[(y+dy/2)*9+x+dx/2].live()&&(!p.hidden||(p.side==0?v>=5:v<=4));
        case N:return ax*ay==2&&!b[(y+(ay==2?sign(dy):0))*9+x+(ax==2?sign(dx):0)].live();
        case R:return (dx==0||dy==0)&&count==0;
        case C:return (dx==0||dy==0)&&count==(q.live()?1:0);
        case P:return (dx==0&&dy==(p.side==0?-1:1))||(ay==0&&ax==1&&(p.side==0?y<=4:y>=5));
    }return false;
}
bool inCheck(const Board& b,int side,int k=-2) {
    if(k==-2)k=kingAt(b,side);if(k<0)return true;
    int x=k%9,y=k/9;
    for(auto d:rays) {
        int count=0,distance=0;
        for(int u=x+d[0],v=y+d[1];inside(u,v);u+=d[0],v+=d[1]) {
            distance++;Piece p=b[v*9+u];if(!p.live())continue;count++;
            if(p.side!=side) {
                int t=p.effective();if(t==C&&count==2)return true;
                if(count==1) {
                    if(t==R)return true;
                    if(t==K&&((d[0]==0&&b[k].type==K)||(distance==1&&palace(x,y,p.side))))return true;
                    if(t==P&&distance==1&&(d[0]==0?(p.side==0?d[1]==1:d[1]==-1):(p.side==0?v<=4:v>=5)))return true;
                }
            }if(count==2)break;
        }
    }
    for(auto a:checks[k]) {
        Piece p=b[a.from];if(!p.live()||p.side==side||p.effective()!=a.type)continue;
        if(a.type==N) { if(!b[a.block].live())return true; }
        else if(a.type==A) { if(!p.hidden||palace(x,y,p.side))return true; }
        else if(!b[a.block].live()&&(!p.hidden||(p.side==0?y>=5:y<=4)))return true;
    }return false;
}
struct Destinations {
    std::array<int,90> data;size_t count=0;
    void push_back(int square){if(count>=data.size())throw std::logic_error("destination capacity exceeded");data[count++]=square;}
    int* begin(){return data.data();}int* end(){return data.data()+count;}
};
Destinations candidates(const Board& b,int f,bool captures) {
    Destinations out;Piece p=b[f];int t=p.effective(),x=f%9,y=f/9;
    auto add=[&](int u,int v){if(inside(u,v)&&(!captures||b[v*9+u].live()))out.push_back(v*9+u);};
    if(t==R||t==C)for(auto d:rays) {
        bool screen=false;
        for(int u=x+d[0],v=y+d[1];inside(u,v);u+=d[0],v+=d[1]) {
            bool occupied=b[v*9+u].live();
            if(t==R) { if(!captures||occupied)add(u,v);if(occupied)break; }
            else if(!screen) { if(occupied)screen=true;else if(!captures)add(u,v); }
            else if(occupied) { add(u,v);break; }
        }
    }
    else if(t==N)for(auto d:horses)add(x+d[0],y+d[1]);
    else if(t==A||t==B) {int d=t==A?1:2;for(int dx:{-d,d})for(int dy:{-d,d})add(x+dx,y+dy);}
    else if(t==P) {add(x,y+(p.side==0?-1:1));add(x+1,y);add(x-1,y);}
    else {for(auto d:rays)add(x+d[0],y+d[1]);for(int i=0;i<90;i++)if(b[i].side!=p.side&&b[i].type==K){if(std::find(out.begin(),out.end(),i)==out.end())out.push_back(i);break;}}
    return out;
}
void legalInto(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out,int checked=-1) {
    if(king==-2)king=kingAt(b,side);out.clear();
    const bool noCheck=king>=0&&!(checked<0?inCheck(b,side,king):checked);
    const int kx=king%9,ky=king/9;
    for(int f=0;f<90;f++)if(b[f].side==side)for(int t:candidates(b,f,captures)) {
        if(b[t].side==side)continue;const int role=b[f].effective();if(role!=R&&role!=C&&!pseudo(b,f,t))continue;Piece p=b[f],q=b[t];
        const int fx=f%9,fy=f/9,tx=t%9,ty=t/9;
        // Removing a ray blocker or a horse/elephant blocker can expose check;
        // adding a ray blocker can create a cannon screen. Keep the full test there.
        const bool sensitive=fx==kx||fy==ky||tx==kx||ty==ky||(std::abs(fx-kx)==1&&std::abs(fy-ky)==1);
        if(noCheck&&!(!p.hidden&&p.type==K)&&!sensitive){out.push_back({f,t});if(first)return;continue;}
        b[t]=p;b[f]=Piece{};
        bool safe=!inCheck(b,side,!p.hidden&&p.type==K?t:king);b[f]=p;b[t]=q;
        if(safe) {out.push_back({f,t});if(first)return;}
    }
}
std::vector<Move> legal(Board& b,int side,bool captures=false,bool first=false,int king=-2) {
    std::vector<Move> out;out.reserve(48);legalInto(b,side,captures,first,king,out);return out;
}
std::vector<int> remaining(const Board& b,const std::vector<Piece>& captured,int side) {
    std::vector<int> bag={R,R,N,N,B,B,A,A,C,C,P,P,P,P,P};
    auto remove=[&](Piece p){if(p.side==side&&!p.hidden&&p.type!=K){auto i=std::find(bag.begin(),bag.end(),p.type);if(i!=bag.end())bag.erase(i);}};
    for(Piece p:b)remove(p);for(Piece p:captured)remove(p);return bag;
}
struct Key {
    uint32_t h1,h2;int turn,c0,v0,c1,v1,extensions;
    bool operator==(const Key& k)const{return h1==k.h1&&h2==k.h2&&turn==k.turn&&c0==k.c0&&v0==k.v0&&c1==k.c1&&v1==k.v1&&extensions==k.extensions;}
};
struct KeyHash { size_t operator()(const Key& k)const {
    uint64_t h=(uint64_t(k.h1)<<32)|k.h2;
    for(int x:{k.turn,k.c0,k.v0,k.c1,k.v1,k.extensions})h^=uint64_t(uint32_t(x))+0x9e3779b97f4a7c15ULL+(h<<6)+(h>>2);
    return size_t(h);
}};
struct Entry {int depth,flag;double score;Move best;}; // exact=0, lower=1, upper=2
struct State {
    Board board;int turn=0,viewer=-1,kings[2]={-1,-1},population=0,poolCount[2]={0,0},poolValue[2]={0,0};
    uint32_t h1=0,h2=0;uint64_t cycles=0;
    std::vector<Key> path;
    std::unordered_map<Key,Entry,KeyHash> table;
    Key key(int ext=-1)const{return {h1,h2,turn,poolCount[0],poolValue[0],poolCount[1],poolValue[1],ext};}
};
void xorPiece(State& s,Piece p,int i) {
    if(!p.live())return;int c=i*112+(p.side==0?0:56)+(p.hidden?7+p.role*7+p.type:p.type);
    if(c<0||c>=int(z1.size()))throw std::runtime_error("invalid sampled hash code");s.h1^=z1[c];s.h2^=z2[c];
}
State stateOf(const Board& b,const std::vector<Piece>& captured,int turn,int viewer) {
    State s;s.board=b;s.turn=turn;s.viewer=viewer;
    for(int side:{0,1}){auto pool=remaining(b,captured,side);s.poolCount[side]=int(pool.size());for(int t:pool)s.poolValue[side]+=value[t];}
    for(int i=0;i<90;i++){Piece p=b[i];if(!p.live())continue;xorPiece(s,p,i);if(!p.hidden&&p.type==K)s.kings[p.side]=i;else s.population++;}
    s.path.reserve(128);s.path.push_back(s.key());return s;
}
#define MIST_DEFENSE_THREATS 1
#define MIST_DEFENSE_KING 0
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
void writeDefense(const State& s) {
    auto map=attackMap(s);auto terms=defenseTerms(s,map);
    std::cout<<"{\"threats\":["<<terms.threats[0]<<','<<terms.threats[1]<<"],\"king\":["<<terms.king[0]<<','<<terms.king[1]<<"],\"attacks\":[";
    for(int side:{0,1}){if(side)std::cout<<',';std::cout<<'[';for(int i=0;i<90;i++){if(i)std::cout<<',';std::cout<<int(map.count[side][i]);}std::cout<<']';}
    std::cout<<"],\"cheapest\":[";
    for(int side:{0,1}){if(side)std::cout<<',';std::cout<<'[';for(int i=0;i<90;i++){if(i)std::cout<<',';std::cout<<map.cheapest[side][i];}std::cout<<']';}
    std::cout<<"]}";
}

double evaluate(const State& s,int side) {
    double total=0,phase=std::min(1.0,s.population/24.0);
    for(int i=0;i<90;i++) {
        Piece p=s.board[i];if(!p.live())continue;int x=i%9,y=i/9,progress=p.side==0?9-y:y;
        double bonus=p.hidden?0:p.type==P?progress*12+(progress>=5?35:0):p.type==N||p.type==C?18-std::abs(x-4)*4:p.type==R?progress*2:0;
        if(!p.hidden) {
            if(p.type==K)bonus-=std::abs(x-4)*6+progress*phase*8;
            if((p.type==A||p.type==B)&&s.kings[p.side]>=0){int k=s.kings[p.side];if(std::abs(x-k%9)+std::abs(y-k/9)<=2)bonus+=phase*8;}
        }
        double material=p.hidden?(s.poolCount[p.side]?double(s.poolValue[p.side])/s.poolCount[p.side]:0):value[p.type];
        total+=(p.side==side?1:-1)*(material+bonus);
    }return total+defenseDelta(s,side);
}
struct Undo {Piece p,q;uint32_t h1,h2;};
Undo push(State& s,Move m) {
    Piece p=s.board[m.from],q=s.board[m.to];Undo old={p,q,s.h1,s.h2};
    if(!p.hidden&&p.type==K)s.kings[p.side]=m.to;
    if(q.live()){if(!q.hidden&&q.type==K)s.kings[q.side]=-1;else s.population--;}
    xorPiece(s,p,m.from);xorPiece(s,q,m.to);s.board[m.to]=p;s.board[m.to].hidden=false;s.board[m.from]=Piece{};xorPiece(s,s.board[m.to],m.to);
    if(p.hidden){s.poolCount[p.side]--;s.poolValue[p.side]-=value[p.type];}
    if(q.live()&&q.hidden&&p.side==s.viewer){s.poolCount[q.side]--;s.poolValue[q.side]-=value[q.type];}
    s.turn^=1;return old;
}
void pop(State& s,Move m,const Undo& old) {
    Piece p=old.p,q=old.q;if(!p.hidden&&p.type==K)s.kings[p.side]=m.from;
    if(q.live()){if(!q.hidden&&q.type==K)s.kings[q.side]=m.to;else s.population++;}
    if(q.live()&&q.hidden&&p.side==s.viewer){s.poolCount[q.side]++;s.poolValue[q.side]+=value[q.type];}
    if(p.hidden){s.poolCount[p.side]++;s.poolValue[p.side]+=value[p.type];}
    s.turn^=1;s.board[m.from]=p;s.board[m.to]=q;s.h1=old.h1;s.h2=old.h2;
}
double orderingValue(const State& s,Piece p){return p.hidden?(s.poolCount[p.side]?double(s.poolValue[p.side])/s.poolCount[p.side]:0):value[p.type];}
double priority(const State& s,Move m){Piece p=s.board[m.from],q=s.board[m.to];return(q.live()?10*orderingValue(s,q)-orderingValue(s,p):0)+(p.hidden?35:0);}
int mobility(Board b,Piece p,int i) {
    b[i]=p;int result=0;
    // pseudo destinations match the activity index, except cannon captures count twice.
    if(p.type==K)return 0;
    for(int t:candidates(b,i,false))if(pseudo(b,i,t))result+=(p.type==C&&b[t].live()?2:1);
    return result;
}
double revealOrder(const State& view,const std::vector<Piece>& captured,Move m) {
    Piece p=view.board[m.from];if(!p.hidden)return 0;auto pool=remaining(view.board,captured,p.side);if(pool.empty())return 0;
    Piece original=p;original.type=p.role;double before=mobility(view.board,original,m.from),after=0;Board b=view.board;b[m.from]=Piece{};
    for(int type:pool){Piece shown={p.side,type,-1,false};b[m.to]=shown;after+=mobility(b,shown,m.to);}
    return 3*(after/pool.size()-before);
}
struct Row {
    Move move;double score=0,spread=0,winRate=0;int wins=0,losses=0,repetitions=0;bool draw=false;
};
Row summarize(Move m,const std::vector<double>& scores,bool uncertain) {
    Row row;row.move=m;double probability=0,mean=0;
    for(double v:scores){probability+=v>98000?1:v< -98000?0:1/(1+std::exp(-v/600));mean+=std::max(-3600.0,std::min(3600.0,v));row.wins+=v>98000;row.losses+=v< -98000;}
    probability/=scores.size();mean/=scores.size();
    row.score=uncertain?600*std::log(std::max(.0025,probability)/std::max(.0025,1-probability)):scores[0];
    for(double v:scores){double d=std::max(-3600.0,std::min(3600.0,v))-mean;row.spread+=d*d;}
    row.spread=std::sqrt(row.spread/scores.size());row.winRate=probability*100;return row;
}
struct Packet {
    std::string mode;int depth=0,turn=0,viewer=-1;double budget=0;uint64_t nodeLimit=0;
    Board view;std::vector<Piece> captured;std::vector<Board> worlds;
    std::array<int,8100> repetitions{};std::array<bool,8100> draws{};
};
Piece readPiece() {
    Piece p;int hidden;if(!(std::cin>>p.side>>p.type>>p.role>>hidden))throw std::runtime_error("truncated piece");p.hidden=hidden!=0;
    if(p.side< -1||p.side>1||p.type< -1||p.type>6||p.role< -1||p.role>6||hidden<0||hidden>1)throw std::runtime_error("piece out of range");
    return p;
}
bool read(Packet& p) {
    if(!(std::cin>>p.mode))return false;int captured,worlds,metadata;
    if(!(std::cin>>p.depth>>p.budget>>p.nodeLimit>>p.turn>>p.viewer>>captured>>worlds>>metadata))throw std::runtime_error("truncated header");
    if((p.mode!="SEARCH"&&p.mode!="STREAM"&&p.mode!="VERIFY")||p.depth<0||p.depth>8||!std::isfinite(p.budget)||p.budget<0||p.budget>300000||p.turn<0||p.turn>1||p.viewer< -1||p.viewer>1||captured<0||captured>32||worlds<1||worlds>30||metadata<0||metadata>8100)throw std::runtime_error("header out of range");
    for(auto& v:p.view)v=readPiece();for(int i=0;i<captured;i++)p.captured.push_back(readPiece());
    p.worlds.resize(worlds);for(auto& w:p.worlds)for(auto& v:w){v=readPiece();if(v.live()&&(v.type<0||(v.hidden&&v.role<0)))throw std::runtime_error("incomplete sample");}
    for(int i=0;i<metadata;i++){int f,t,count,draw;if(!(std::cin>>f>>t>>count>>draw))throw std::runtime_error("truncated root metadata");if(f<0||f>=90||t<0||t>=90||count<0||draw<0||draw>1)throw std::runtime_error("root metadata out of range");p.repetitions[f*90+t]=count;p.draws[f*90+t]=draw;}
    return true;
}
struct Timeout {};
struct Iteration {int depth=0;uint64_t nodes=0;double elapsed=0;std::vector<Row> rows;};
struct ScoredMove {Move move;double score;};
struct Search {
    std::array<std::vector<Move>,128> moveBuffers,probeBuffers;
    std::array<std::vector<ScoredMove>,128> scoreBuffers;
    std::vector<State> worlds;std::array<uint32_t,16200> history{};std::array<std::vector<Move>,128> killers;
    uint64_t nodes=0,nodeLimit=0;double limit=0;std::chrono::steady_clock::time_point start;
    double elapsed() const {return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();}
    void tick(){nodes++;if((nodeLimit&&nodes>nodeLimit)||((nodes&7)==0&&elapsed()>limit))throw Timeout{};}
    double search(State& s,int depth,double alpha,double beta,int ply,int qleft=3,int extensions=2) {
        tick();Key path=s.key();if(std::find(s.path.begin(),s.path.end(),path)!=s.path.end()){s.cycles++;return 0;}
        s.path.push_back(path);
        try{double v=node(s,depth,alpha,beta,ply,qleft,extensions);s.path.pop_back();return v;}catch(...){s.path.pop_back();throw;}
    }
    double node(State& s,int depth,double alpha,double beta,int ply,int qleft,int extensions) {
        bool check=inCheck(s.board,s.turn,s.kings[s.turn]);if(check&&depth>0&&extensions>0){depth++;extensions--;}
        uint64_t cycleStart=s.cycles;Key key=s.key(extensions);Entry entry{};bool hasEntry=false,hasKey=depth>0;double originalAlpha=alpha;
        if(hasKey){auto i=s.table.find(key);if(i!=s.table.end()){entry=i->second;hasEntry=true;if(entry.depth>=depth){double v=entry.score;if(v>98000)v-=ply;else if(v< -98000)v+=ply;if(entry.flag==0)return v;if(entry.flag==1)alpha=std::max(alpha,v);else beta=std::min(beta,v);if(alpha>=beta)return v;}}}
        bool quiet=depth<=0&&!check;auto& moves=moveBuffers.at(ply);legalInto(s.board,s.turn,quiet,false,s.kings[s.turn],moves,check);
        if(moves.empty()){if(!quiet)return -mate+ply;auto& probe=probeBuffers.at(ply);legalInto(s.board,s.turn,false,true,s.kings[s.turn],probe,check);if(probe.empty())return -mate+ply;}
        if(quiet){double stand=evaluate(s,s.turn);if(stand>=beta)return stand;alpha=std::max(alpha,stand);if(qleft<=0||moves.empty())return alpha;}
        if(depth<=-6)return evaluate(s,s.turn)-(check?180:0);
        int hbase=s.turn==0?0:8100;
        auto order=[&](Move m){if(hasEntry&&entry.best==m)return 10000000.0;double v=priority(s,m);if(!s.board[m.to].live()){v+=history[hbase+m.index()];const auto& ks=killers.at(ply);if(std::find(ks.begin(),ks.end(),m)!=ks.end())v+=3000;}return v;};
        auto& scored=scoreBuffers.at(ply);scored.clear();scored.reserve(moves.size());
        for(Move m:moves)scored.push_back({m,order(m)});
        std::stable_sort(scored.begin(),scored.end(),[](const ScoredMove& a,const ScoredMove& b){return a.score>b.score;});
        for(size_t i=0;i<moves.size();i++)moves[i]=scored[i].move;
        Move best;bool first=true;
        auto save=[&](double score,int flag,Move m){if(hasKey&&cycleStart==s.cycles&&(s.table.size()<90000||s.table.find(key)!=s.table.end()))s.table[key]={depth,flag,score>98000?score+ply:score< -98000?score-ply:score,m};};
        for(Move m:moves) {
            bool capture=s.board[m.to].live();Undo old=push(s,m);double v;
            try {
                if(first||!std::isfinite(alpha))v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft,extensions);
                else {v=-search(s,depth-1,-alpha-1,-alpha,ply+1,quiet?qleft-1:qleft,extensions);if(v>alpha&&v<beta)v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft,extensions);}
            }catch(...){pop(s,m,old);throw;}pop(s,m,old);first=false;
            if(v>=beta){if(!capture&&depth>0){auto& h=history[hbase+m.index()];h=std::min(uint32_t(2000),h+uint32_t(depth*depth));auto& ks=killers.at(ply);if(std::find(ks.begin(),ks.end(),m)==ks.end())ks.insert(ks.begin(),m);if(ks.size()>2)ks.resize(2);}save(v,1,m);return v;}
            if(v>alpha){alpha=v;best=m;}
        }save(alpha,alpha<=originalAlpha?2:0,best);return alpha;
    }
};
void writeMove(Move m){if(m.from<0)std::cout<<"null";else std::cout<<"{\"from\":"<<m.from<<",\"to\":"<<m.to<<"}";}
void writeMoves(const std::vector<Move>& moves){std::cout<<'[';bool comma=false;for(auto m:moves){if(comma)std::cout<<',';comma=true;writeMove(m);}std::cout<<']';}
void writeRows(const std::vector<Row>& rows) {
    std::cout<<'[';bool comma=false;for(const Row& r:rows){if(comma)std::cout<<',';comma=true;
        std::cout<<"{\"from\":"<<r.move.from<<",\"to\":"<<r.move.to<<",\"score\":"<<r.score<<",\"spread\":"<<r.spread<<",\"heuristicWinRate\":"<<r.winRate<<",\"sampleWins\":"<<r.wins<<",\"sampleLosses\":"<<r.losses<<",\"repetitionCount\":"<<r.repetitions;if(r.draw)std::cout<<",\"draw\":true";std::cout<<'}';}
    std::cout<<']';
}
void run(const Packet& p) {
    Search s;s.start=std::chrono::steady_clock::now();s.nodeLimit=p.nodeLimit;s.limit=p.budget-std::min(35.0,p.budget*.10);
    // Root only uses public roles. Unknown true identities are never read here.
    Board rootBoard=p.view;auto root=legal(rootBoard,p.turn);
    if(root.empty()){std::cout<<"{\"depth\":0,\"nodes\":0,\"samples\":0,\"score\":-99999,\"move\":null,\"terminal\":true,\"elapsedMs\":"<<s.elapsed()<<",\"allCandidates\":[],\"iterations\":[]}\n";return;}
    State rootContext;rootContext.board=p.view;rootContext.turn=p.turn;
    for(int side:{0,1}){auto bag=remaining(p.view,p.captured,side);rootContext.poolCount[side]=int(bag.size());for(int t:bag)rootContext.poolValue[side]+=value[t];}
    std::array<double,8100> reveal{};for(auto m:root)reveal[m.index()]=revealOrder(rootContext,p.captured,m);
    std::stable_sort(root.begin(),root.end(),[&](Move a,Move b){return priority(rootContext,a)+reveal[a.index()]>priority(rootContext,b)+reveal[b.index()];});
    bool uncertain=false;for(auto q:p.view)uncertain|=q.live()&&q.hidden;
    for(const Board& b:p.worlds)s.worlds.push_back(stateOf(b,p.captured,p.turn,p.viewer));
    std::vector<Iteration> iterations;int interrupted=0;Move fallback=root[0];
    const bool parallel=p.nodeLimit==0&&s.worlds.size()>1;
    const size_t lanes=parallel?std::min(size_t(4),s.worlds.size()):1;
    std::vector<Search> workers(parallel?s.worlds.size():0);
    for(auto& worker:workers){worker.start=s.start;worker.limit=s.limit;}
    auto parallelScores=[&](Move m,int childDepth) {
        std::vector<double> scores(s.worlds.size());std::vector<std::future<void>> tasks;
        for(size_t lane=0;lane<lanes;lane++)tasks.push_back(std::async(std::launch::async,[&,lane]{
            for(size_t world=lane;world<s.worlds.size();world+=lanes){
                State& w=s.worlds[world];if(workers[world].elapsed()>workers[world].limit)throw Timeout{};Undo old=push(w,m);
                try{scores[world]=-workers[world].search(w,childDepth,-inf,inf,1);}catch(...){pop(w,m,old);throw;}
                pop(w,m,old);
            }
        }));
        std::exception_ptr error;for(auto& task:tasks)try{task.get();}catch(...){if(!error)error=std::current_exception();}
        s.nodes=0;for(const auto& worker:workers)s.nodes+=worker.nodes;
        if(error)std::rethrow_exception(error);return scores;
    };
    for(int depth=1;depth<=p.depth;depth++) {
        std::vector<Row> rows;
        try {for(Move m:root){Row row;if(p.draws[m.index()]){row=summarize(m,{0},uncertain);row.draw=true;}else{std::vector<double> scores;if(parallel){scores=parallelScores(m,depth-1);}else for(State& w:s.worlds){if(s.elapsed()>s.limit)throw Timeout{};Undo old=push(w,m);double v;try{v=-s.search(w,depth-1,-inf,inf,1);}catch(...){pop(w,m,old);throw;}pop(w,m,old);scores.push_back(v);}row=summarize(m,scores,uncertain);}row.repetitions=p.repetitions[m.index()];rows.push_back(row);}}
        catch(const Timeout&){interrupted=depth;break;}
        std::stable_sort(rows.begin(),rows.end(),[](const Row& a,const Row& b){return a.score>b.score;});
        iterations.push_back({depth,s.nodes,s.elapsed(),rows});
        // Stream only after every root move has completed in every sampled world.
        if(p.mode=="STREAM") {
            std::cout<<"{\"progress\":true,\"result\":{\"depth\":"<<depth<<",\"nodes\":"<<s.nodes<<",\"samples\":"<<p.worlds.size()<<",\"elapsedMs\":"<<iterations.back().elapsed<<",\"threads\":"<<lanes<<",\"score\":"<<rows[0].score<<",\"move\":";writeMove(rows[0].move);
            std::cout<<",\"allCandidates\":";writeRows(rows);std::cout<<"}}\n"<<std::flush;
        }
        if((!uncertain&&std::abs(rows[0].score)>98000)||s.elapsed()>s.limit)break;
        std::array<int,8100> rank{};for(size_t i=0;i<rows.size();i++)rank[rows[i].move.index()]=int(i);
        std::stable_sort(root.begin(),root.end(),[&](Move a,Move b){return rank[a.index()]<rank[b.index()];});
    }
    #ifdef MIST_VERIFY_RESTORE
    // Check every sampled state after normal return and after timeout unwinding.
    for(size_t i=0;i<s.worlds.size();i++) {
        const State expected=stateOf(p.worlds[i],p.captured,p.turn,p.viewer);const State& w=s.worlds[i];
        if(!(w.board==expected.board&&w.key()==expected.key()&&w.path==expected.path&&w.population==expected.population&&w.kings[0]==expected.kings[0]&&w.kings[1]==expected.kings[1]))throw std::runtime_error("sample state not restored");
    }
#endif
    double elapsed=s.elapsed();const Iteration* last=iterations.empty()?nullptr:&iterations.back();
    std::cout<<"{\"depth\":"<<(last?last->depth:0)<<",\"nodes\":"<<s.nodes<<",\"samples\":"<<p.worlds.size()<<",\"elapsedMs\":"<<elapsed<<",\"interruptedDepth\":"<<interrupted<<",\"score\":"<<(last?last->rows[0].score:0)<<",\"move\":";writeMove(last?last->rows[0].move:fallback);
    std::cout<<",\"threads\":"<<lanes;std::cout<<",\"allCandidates\":";writeRows(last?last->rows:std::vector<Row>{});std::cout<<",\"iterations\":[";
    if(p.mode!="STREAM")for(size_t i=0;i<iterations.size();i++){if(i)std::cout<<',';const auto& r=iterations[i];std::cout<<"{\"depth\":"<<r.depth<<",\"nodes\":"<<r.nodes<<",\"elapsedMs\":"<<r.elapsed<<",\"allCandidates\":";writeRows(r.rows);std::cout<<'}';}
    std::cout<<"]}\n";
}
void verify(const Packet& p) {
    State s=stateOf(p.worlds[0],p.captured,p.turn,p.viewer);std::cout<<"{\"sides\":[";
    for(int side:{0,1}){if(side)std::cout<<',';std::cout<<"{\"check\":"<<(inCheck(s.board,side,s.kings[side])?"true":"false")<<",\"score\":"<<evaluate(s,side)<<",\"legal\":";writeMoves(legal(s.board,side));std::cout<<",\"captures\":";writeMoves(legal(s.board,side,true));std::cout<<'}';}
    std::cout<<"],\"defense\":";writeDefense(s);std::cout<<",\"transitions\":[";const Board before=s.board;Key old=s.key();const int oldPopulation=s.population,oldKings[2]={s.kings[0],s.kings[1]};auto moves=legal(s.board,s.turn);
    for(size_t i=0;i<moves.size();i++){if(i)std::cout<<',';Move m=moves[i];Undo u=push(s,m);std::cout<<"{\"from\":"<<m.from<<",\"to\":"<<m.to<<",\"type\":"<<s.board[m.to].type<<",\"score\":"<<evaluate(s,p.turn)<<",\"poolCount\":["<<s.poolCount[0]<<','<<s.poolCount[1]<<"],\"poolValue\":["<<s.poolValue[0]<<','<<s.poolValue[1]<<"],\"reply\":";writeMoves(legal(s.board,s.turn));pop(s,m,u);std::cout<<",\"restored\":"<<((s.board==before&&s.key()==old&&s.population==oldPopulation&&s.kings[0]==oldKings[0]&&s.kings[1]==oldKings[1])?"true":"false")<<'}';}
    std::cout<<"]}\n";
}
} // namespace mist
int main() {
    using namespace mist;std::ios::sync_with_stdio(false);std::cin.tie(nullptr);std::cout<<std::setprecision(17);initialize();std::cout<<"{\"ready\":true,\"protocol\":2,\"streaming\":true,\"threads\":4,\"independentWorldSearch\":true}\n"<<std::flush;
    try {Packet packet;while(read(packet)){if(packet.mode=="VERIFY")verify(packet);else run(packet);std::cout<<std::flush;packet=Packet{};}}
    catch(const std::exception& error){std::cerr<<"native error: "<<error.what()<<'\n';return 2;}
}
