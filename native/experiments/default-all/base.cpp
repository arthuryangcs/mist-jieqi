
#include <algorithm>
namespace mist_information {
template<class Board> double bonus(const Board& board,int side) {
    int count[2]={0,0};
    for(const auto& p:board)if(p.side>=0&&!p.hidden&&p.type!=0)count[p.side]++;
    return 8.0*(std::min(8,count[side])-std::min(8,count[1-side]));
}
}


#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <vector>

// Experimental root ranking only. Values come from observation-based samples.
namespace mist_risk {
constexpr double lossThreshold = 450; // Ignore losses smaller than roughly a cannon.
constexpr double lossCap = 3600;      // Finite, shared material scale; not mate certainty.
inline double lowerTailLoss(const std::vector<double>& scores) {
    if (scores.empty()) throw std::invalid_argument("empty risk sample");
    std::vector<double> sorted = scores;
    for (double v : sorted) if (!std::isfinite(v)) throw std::invalid_argument("nonfinite risk sample");
    std::sort(sorted.begin(), sorted.end());
    // Fractional mass keeps the worst-quarter definition exact for nonmultiples of 4.
    const double mass = sorted.size() * .25;
    double left = mass, total = 0;
    for (double v : sorted) {
        const double take = std::min(1.0, left);
        total += take * std::max(0.0, -std::clamp(v, -lossCap, lossCap) - lossThreshold);
        left -= take;
        if (left <= 1e-12) break;
    }
    return total / mass;
}
inline double weight(double advantage) {
    // One common weight for every candidate in a completed depth, not per move.
    return .30 + .20 * std::clamp(advantage / 600.0, -1.0, 1.0);
}
template<class Rows> void rank(Rows& rows, bool uncertain) {
    if (rows.empty()) return;
    double advantage = rows.front().baseScore;
    for (const auto& row : rows) advantage = std::max(advantage, row.baseScore);
    const double w = uncertain ? weight(advantage) : 0;
    for (auto& row : rows) {
        row.riskWeight = w;
        row.riskPenalty = w * row.tailLoss;
        row.score = row.baseScore - row.riskPenalty;
    }
}
} // namespace mist_risk

#include "nnue.hpp"
#include <thread>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <memory>
#include <new>
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
#include <atomic>
#include <functional>

namespace mist {
enum Type { K, R, N, B, C, A, P };
constexpr int value[] = {100000,900,420,210,450,210,110};
constexpr int mate=99000;
// Storage/stack protection, not a playing-strength depth setting.
constexpr int MAX_SEARCH_PLY=128;
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
std::array<std::vector<Leap>,90> checks;std::array<std::array<uint8_t,90>,90> kingGeometry{};std::array<std::array<std::vector<int>,4>,90> attackRays;
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
        for(int i=0;i<90;i++)kingGeometry[k][i]=uint8_t((i%9==x||i/9==y?1:0)|(std::abs(i%9-x)==1&&std::abs(i/9-y)==1?2:0));
        for(size_t direction=0;direction<rays.size();direction++){auto d=rays[direction];for(int u=x+d[0],v=y+d[1];inside(u,v);u+=d[0],v+=d[1])attackRays[k][direction].push_back(v*9+u);}
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
    for(size_t direction=0;direction<rays.size();direction++){
        auto d=rays[direction];int count=0,distance=0;for(int square:attackRays[k][direction]){distance++;Piece p=b[square];if(!p.live())continue;count++;
            if(p.side!=side) {
                int t=p.effective();if(t==C&&count==2)return true;
                if(count==1) {
                    if(t==R)return true;
                    if(t==K&&((d[0]==0&&b[k].type==K)||(distance==1&&palace(x,y,p.side))))return true;
                    if(t==P&&distance==1&&(d[0]==0?(p.side==0?d[1]==1:d[1]==-1):(p.side==0?y<=4:y>=5)))return true;
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
// Emit exactly the old candidates()+pseudo() sequence, without rescanning rays.
Destinations pseudoDestinations(const Board& b,int f,bool captures) {
    Destinations out;const Piece p=b[f];const int type=p.effective(),x=f%9,y=f/9;
    auto emit=[&](int to){const Piece q=b[to];if(q.side!=p.side&&(!captures||q.live()))out.push_back(to);};
    if(type==R||type==C) {
        for(auto d:rays) {
            bool screen=false;
            for(int u=x+d[0],v=y+d[1];inside(u,v);u+=d[0],v+=d[1]) {
                const int to=v*9+u;const bool occupied=b[to].live();
                if(type==R){emit(to);if(occupied)break;}
                else if(!screen){if(occupied)screen=true;else if(!captures)emit(to);}
                else if(occupied){emit(to);break;}
            }
        }
    }else if(type==N) {
        for(auto d:horses) {
            const int u=x+d[0],v=y+d[1];if(!inside(u,v))continue;
            const int block=(y+(std::abs(d[1])==2?sign(d[1]):0))*9+x+(std::abs(d[0])==2?sign(d[0]):0);
            if(!b[block].live())emit(v*9+u);
        }
    }else if(type==A||type==B) {
        const int distance=type==A?1:2;
        for(int dx:{-distance,distance})for(int dy:{-distance,distance}) {
            const int u=x+dx,v=y+dy;if(!inside(u,v))continue;
            if(type==A){if(!p.hidden||palace(u,v,p.side))emit(v*9+u);}
            else if(!b[(y+dy/2)*9+x+dx/2].live()&&(!p.hidden||(p.side==0?v>=5:v<=4)))emit(v*9+u);
        }
    }else if(type==P) {
        const int v=y+(p.side==0?-1:1);if(inside(x,v))emit(v*9+x);
        if(p.side==0?y<=4:y>=5){if(x<8)emit(f+1);if(x>0)emit(f-1);}
    }else if(type==K) {
        for(auto d:rays){const int u=x+d[0],v=y+d[1];if(inside(u,v)&&(palace(u,v,p.side)||(d[0]==0&&b[v*9+u].type==K)))emit(v*9+u);}
        for(int to=0;to<90;to++)if(b[to].side!=p.side&&b[to].type==K) {
            if(to%9==x&&std::find(out.begin(),out.end(),to)==out.end()) {
                const int step=to>f?9:-9;bool clear=true;
                for(int i=f+step;i!=to;i+=step)if(b[i].live()){clear=false;break;}
                if(clear)emit(to);
            }break;
        }
    }
    return out;
}

void legalInto(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out,int checked=-1,bool brightQuietOnly=false) {
    if(king==-2)king=kingAt(b,side);out.clear();
    const bool noCheck=king>=0&&!(checked<0?inCheck(b,side,king):checked);
    const auto& geometry=kingGeometry[king>=0?king:0];
    for(int f=0;f<90;f++)if(b[f].side==side&&(!brightQuietOnly||!b[f].hidden))for(int t:pseudoDestinations(b,f,captures)) {
        if(b[t].side==side||(brightQuietOnly&&b[t].live()))continue;const int role=b[f].effective();if(role!=R&&role!=C&&!pseudo(b,f,t))continue;Piece p=b[f],q=b[t];
        // Removing a ray blocker or a horse/elephant blocker can expose check;
        // adding a ray blocker can create a cannon screen. Keep the full test there.
        const bool sensitive=geometry[f]||(geometry[t]&1);
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
    uint32_t h1,h2;int turn,c0,v0,c1,v1,extensions;std::array<std::array<int,6>,2> inventory;
    bool operator==(const Key& k)const{return h1==k.h1&&h2==k.h2&&turn==k.turn&&c0==k.c0&&v0==k.v0&&c1==k.c1&&v1==k.v1&&extensions==k.extensions&&inventory==k.inventory;}
};
struct KeyHash { size_t operator()(const Key& k)const {
    uint64_t h=(uint64_t(k.h1)<<32)|k.h2;
    for(int x:{k.turn,k.c0,k.v0,k.c1,k.v1,k.extensions})h^=uint64_t(uint32_t(x))+0x9e3779b97f4a7c15ULL+(h<<6)+(h>>2);
    for(const auto& row:k.inventory)for(int x:row)h^=uint64_t(uint32_t(x))+0x9e3779b97f4a7c15ULL+(h<<6)+(h>>2);return size_t(h);
}};
struct Entry {int depth,flag;double score;Move best;}; // exact=0, lower=1, upper=2
// Own experimental code. One bounded TT arena per request, separate per-world tables.
struct TTArena {
    static constexpr size_t budget=64*1024*1024;
    void* data=::operator new(budget,std::align_val_t(64));
    std::atomic<size_t> used{0},denied{0};
    ~TTArena(){::operator delete(data,std::align_val_t(64));}
    void* allocate(size_t bytes,size_t align){
        size_t old=used.load();
        for(;;){size_t at=(old+align-1)&~(align-1);if(bytes>budget-at){denied.fetch_add(1);throw std::bad_alloc();}
            if(used.compare_exchange_weak(old,at+bytes))return static_cast<char*>(data)+at;}
    }
};
TTArena* activeTTArena=nullptr;
struct TTScope {TTArena* old;explicit TTScope(TTArena& a):old(activeTTArena){activeTTArena=&a;}~TTScope(){activeTTArena=old;}};
template<class T> struct TTAllocator {
    using value_type=T;TTArena* arena=activeTTArena;
    TTAllocator()=default;template<class U>TTAllocator(const TTAllocator<U>& a):arena(a.arena){}
    T* allocate(size_t n){if(!arena||n>SIZE_MAX/sizeof(T))throw std::bad_alloc();return static_cast<T*>(arena->allocate(n*sizeof(T),alignof(T)));}
    void deallocate(T*,size_t){}
    template<class U>bool operator==(const TTAllocator<U>& a)const{return arena==a.arena;}
    template<class U>bool operator!=(const TTAllocator<U>& a)const{return !(*this==a);}
};
// Two-way bounded TT. Full NNUE inventory key needs a 128-byte slot.
struct TTTable {
    struct alignas(64) Slot {Key key{};Entry entry{};uint32_t generation=0;};
    static_assert(sizeof(Slot)==128,"full inventory slot budget changed");
    Slot* slots=nullptr;size_t count=0,live=0;uint32_t generation=1;
    mutable uint64_t probes=0,hits=0;uint64_t stores=0,replacements=0,clears=0;
    void configure(size_t worlds){size_t target=TTArena::budget/worlds/sizeof(Slot);count=2;while(count*2<=target)count*=2;slots=static_cast<Slot*>(activeTTArena->allocate(count*sizeof(Slot),alignof(Slot)));for(size_t i=0;i<count;i++)new(slots+i)Slot{};}
    size_t bucket(const Key& k)const{uint64_t h=KeyHash{}(k);h^=h>>30;h*=0xbf58476d1ce4e5b9ULL;h^=h>>27;h*=0x94d049bb133111ebULL;h^=h>>31;return (size_t(h)&(count/2-1))*2;}
    const Entry* probe(const Key& k)const{probes++;if(!count)return nullptr;size_t i=bucket(k);for(size_t j=i;j<i+2;j++)if(slots[j].generation==generation&&slots[j].key==k){hits++;return &slots[j].entry;}return nullptr;}
    void store(const Key& k,const Entry& e){if(!count)return;stores++;size_t i=bucket(k),victim=i;for(size_t j=i;j<i+2;j++){if(slots[j].generation!=generation||slots[j].key==k){if(slots[j].generation!=generation)live++;slots[j]={k,e,generation};return;}if(slots[j].entry.depth<slots[victim].entry.depth)victim=j;}if(e.depth>=slots[victim].entry.depth){slots[victim]={k,e,generation};replacements++;}}
    void clear(){clears++;live=0;if(++generation==0){for(size_t i=0;i<count;i++)slots[i].generation=0;generation=1;}}
    size_t size()const{return live;}
};

struct PressureCacheEntry {Key key{};double red=0;bool valid=false;};
struct SquareBits {std::array<uint64_t,2> words{};void toggle(int i){words[i>>6]^=uint64_t(1)<<(i&63);}bool operator==(const SquareBits& x)const{return words==x.words;}
    struct Iterator {uint64_t low,high;int operator*()const{return low?__builtin_ctzll(low):64+__builtin_ctzll(high);}Iterator& operator++(){if(low)low&=low-1;else high&=high-1;return *this;}bool operator!=(const Iterator& x)const{return low!=x.low||high!=x.high;}};Iterator begin()const{return {words[0],words[1]};}Iterator end()const{return {0,0};}};
struct State {std::array<SquareBits,2> occupied{};
    observation_nnue::State neural;mutable std::array<PressureCacheEntry,2048> pressureCache{};
    mutable uint64_t evalCalls=0,nnueEvals=0,nnueUpdates=0,pressureHits=0,pressureMisses=0,lazyCuts=0;
    Board board;int turn=0,viewer=-1,kings[2]={-1,-1},population=0,poolCount[2]={0,0},poolValue[2]={0,0};
    uint32_t h1=0,h2=0;uint64_t cycles=0;
    std::vector<Key> path;
    TTTable table;
    Key key(int ext=-1)const{return {h1,h2,turn,poolCount[0],poolValue[0],poolCount[1],poolValue[1],ext,neural.stock};}
};
void legalMaskedImpl(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out,const SquareBits& active,int checked=-1,bool brightQuietOnly=false) {
    if(king==-2)king=kingAt(b,side);out.clear();
    const bool noCheck=king>=0&&!(checked<0?inCheck(b,side,king):checked);
    const auto& geometry=kingGeometry[king>=0?king:0];
    for(int f:active)if(b[f].side==side&&(!brightQuietOnly||!b[f].hidden))for(int t:pseudoDestinations(b,f,captures)) {
        if(b[t].side==side||(brightQuietOnly&&b[t].live()))continue;const int role=b[f].effective();if(role!=R&&role!=C&&!pseudo(b,f,t))continue;Piece p=b[f],q=b[t];
        // Removing a ray blocker or a horse/elephant blocker can expose check;
        // adding a ray blocker can create a cannon screen. Keep the full test there.
        const bool sensitive=geometry[f]||(geometry[t]&1);
        if(noCheck&&!(!p.hidden&&p.type==K)&&!sensitive){out.push_back({f,t});if(first)return;continue;}
        b[t]=p;b[f]=Piece{};
        bool safe=!inCheck(b,side,!p.hidden&&p.type==K?t:king);b[f]=p;b[t]=q;
        if(safe) {out.push_back({f,t});if(first)return;}
    }
}
std::array<SquareBits,2> rebuiltMasks(const Board& b){std::array<SquareBits,2> out{};for(int i=0;i<90;i++)if(b[i].live())out[b[i].side].toggle(i);return out;}
void legalMaskedInto(State& s,int side,bool captures,bool first,int king,std::vector<Move>& out,int checked=-1,bool brightQuietOnly=false){
#ifdef MIST_VERIFY_RESTORE
    if(!(s.occupied==rebuiltMasks(s.board)))throw std::logic_error("combined mask stale");
#endif
    legalMaskedImpl(s.board,side,captures,first,king,out,s.occupied[side],checked,brightQuietOnly);
#ifdef MIST_VERIFY_RESTORE
    std::vector<Move> expected;legalInto(s.board,side,captures,first,king,expected,checked,brightQuietOnly);if(out!=expected)throw std::logic_error("combined mask order");
#endif
}
void xorPiece(State& s,Piece p,int i) {
    if(!p.live())return;int c=i*112+(p.side==0?0:56)+(p.hidden?7+p.role*7+p.type:p.type);
    if(c<0||c>=int(z1.size()))throw std::runtime_error("invalid sampled hash code");s.h1^=z1[c];s.h2^=z2[c];
}
State stateOf(const Board& b,const std::vector<Piece>& captured,int turn,int viewer) {
    State s;s.board=b;s.turn=turn;s.viewer=viewer;
    for(int side:{0,1}){auto pool=remaining(b,captured,side);s.poolCount[side]=int(pool.size());for(int t:pool){s.poolValue[side]+=value[t];s.neural.stock[side][t-1]++;}}
    for(int i=0;i<90;i++){Piece p=b[i];if(!p.live())continue;s.occupied[p.side].toggle(i);xorPiece(s,p,i);if(!p.hidden&&p.type==K)s.kings[p.side]=i;else s.population++;}
    s.neural=observation_nnue::rebuilt(s.neural,s.board,s.turn,s.viewer);s.path.reserve(128);s.path.push_back(s.key());return s;
}
#define MIST_DEFENSE_THREATS 1
#define MIST_DEFENSE_KING 1
#define MIST_DEFENSE_CACHE 0
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

// Own composition of existing activity, information, defense and residual NNUE.
int mobility(Board b,Piece p,int i);
void auditNeural(const State& s){
#ifdef MIST_VERIFY_RESTORE
    const auto expected=observation_nnue::rebuilt(s.neural,s.board,s.turn,s.viewer);
    if(expected.stock!=s.neural.stock)throw std::logic_error("combined inventory drift");
    for(int f:{0,1})for(int h=0;h<16;h++)if(std::abs(expected.accumulator[f][h]-s.neural.accumulator[f][h])>1e-8)throw std::logic_error("combined accumulator drift");
#else
    (void)s;
#endif
}
double evaluateBase(const State& s,int side){
    s.evalCalls++;double total=0,phase=std::min(1.0,s.population/24.0);
    for(int i=0;i<90;i++){
        Piece p=s.board[i];if(!p.live())continue;const int x=i%9,y=i/9,progress=p.side==0?9-y:y;double bonus=0;
        if(!p.hidden){const double central=4-std::abs(x-4),m=mobility(s.board,p,i);
            if(p.type==P){bonus=progress*10+(progress>=5?25+central*4:0)-(progress==9?35:0);int k=s.kings[1-p.side];if(k>=0&&std::abs(x-k%9)+std::abs(y-k/9)<=2)bonus+=18;}
            else if(p.type==N)bonus=central*4+m*5+(1-phase)*16;
            else if(p.type==R)bonus=std::min(m,18.0)*2+progress*2;
            else if(p.type==C)bonus=std::min(m,16.0)*1.5+phase*20-12;
            else if(p.type==A||p.type==B){bonus=m*3+central*2;int k=s.kings[p.side];if(k>=0&&std::abs(x-k%9)+std::abs(y-k/9)<=2)bonus+=phase*10;}
            else if(p.type==K)bonus=-std::abs(x-4)*8-progress*phase*10;
        }
        if(p.hidden||p.type!=K){Piece role=p;if(role.hidden)role.type=role.role;bonus+=std::min(14,mobility(s.board,role,i))*3;}
        const double material=p.hidden?(s.poolCount[p.side]?double(s.poolValue[p.side])/s.poolCount[p.side]:0):value[p.type];total+=(p.side==side?1:-1)*(material+bonus);
    }
    total+=mist_information::bonus(s.board,side);s.nnueEvals++;const double correction=observation_nnue::correction(s.neural);return total+(side==0?correction:-correction);
}
double pressureCached(const State& s,int side){
    const Key key=s.key();auto& slot=s.pressureCache[(s.h1^(s.h2>>16))&2047];
    if(slot.valid&&slot.key==key){s.pressureHits++;return side==0?slot.red:-slot.red;}
    s.pressureMisses++;const double red=defenseDelta(s,0);slot={key,red,true};return side==0?red:-red;
}
double evaluate(const State& s,int side){return evaluateBase(s,side)+pressureCached(s,side);}
double evaluateStand(const State& s,int side,double alpha,double beta){
    const double base=evaluateBase(s,side);double material[2]={0,0};for(const Piece& p:s.board)if(p.live()&&(p.hidden||p.type!=K))material[p.side]+=defenseMaterial(s,p);
    // Each side's threats <=18% of its material; king term is in[0,104].
    const double low=-.18*material[side]-104,high=.18*material[1-side]+104;
    if(base+low>=beta){s.lazyCuts++;return base+low;}if(base+high<=alpha){s.lazyCuts++;return alpha;}return base+pressureCached(s,side);
}

struct Undo {Piece p,q;uint32_t h1,h2;observation_nnue::State neural;};
Undo push(State& s,Move m) {
    Piece p=s.board[m.from],q=s.board[m.to];Undo old={p,q,s.h1,s.h2,s.neural};s.occupied[p.side].toggle(m.from);s.occupied[p.side].toggle(m.to);if(q.live())s.occupied[q.side].toggle(m.to);s.nnueUpdates++;
    observation_nnue::piece(s.neural,p,m.from,-1);observation_nnue::piece(s.neural,q,m.to,-1);Piece shown=p;shown.hidden=false;observation_nnue::piece(s.neural,shown,m.to,1);
    if(p.hidden)observation_nnue::changeStock(s.neural,p.side,p.type,-1);
    if(q.live()&&q.hidden&&p.side==s.viewer)observation_nnue::changeStock(s.neural,q.side,q.type,-1);
    observation_nnue::changeTurn(s.neural,s.turn,1-s.turn);
    if(!p.hidden&&p.type==K)s.kings[p.side]=m.to;
    if(q.live()){if(!q.hidden&&q.type==K)s.kings[q.side]=-1;else s.population--;}
    xorPiece(s,p,m.from);xorPiece(s,q,m.to);s.board[m.to]=p;s.board[m.to].hidden=false;s.board[m.from]=Piece{};xorPiece(s,s.board[m.to],m.to);
    if(p.hidden){s.poolCount[p.side]--;s.poolValue[p.side]-=value[p.type];}
    if(q.live()&&q.hidden&&p.side==s.viewer){s.poolCount[q.side]--;s.poolValue[q.side]-=value[q.type];}
    s.turn^=1;auditNeural(s);return old;
}
void pop(State& s,Move m,const Undo& old) {
    s.neural=old.neural;Piece p=old.p,q=old.q;s.occupied[p.side].toggle(m.from);s.occupied[p.side].toggle(m.to);if(q.live())s.occupied[q.side].toggle(m.to);if(!p.hidden&&p.type==K)s.kings[p.side]=m.from;
    if(q.live()){if(!q.hidden&&q.type==K)s.kings[q.side]=m.to;else s.population++;}
    if(q.live()&&q.hidden&&p.side==s.viewer){s.poolCount[q.side]++;s.poolValue[q.side]+=value[q.type];}
    if(p.hidden){s.poolCount[p.side]++;s.poolValue[p.side]+=value[p.type];}
    s.turn^=1;s.board[m.from]=p;s.board[m.to]=q;s.h1=old.h1;s.h2=old.h2;auditNeural(s);
}
// Request-level public-geometry gate, computed once, not an evaluation term.
bool criticalKing(Board board,int side) {
    const int king=kingAt(board,side);if(king<0)return true;
    if(inCheck(board,side,king))return true;
    int safe=0,controlled=0;
    for(auto d:rays) {
        int u=king%9+d[0],v=king/9+d[1];if(!inside(u,v)||!palace(u,v,side))continue;
        const int to=v*9+u;
        if(inCheck(board,side,to))controlled++;
        if(board[to].side==side||!pseudo(board,king,to))continue;
        Piece p=board[king],q=board[to];board[king]=Piece{};board[to]=p;
        safe+=!inCheck(board,side,to);board[king]=p;board[to]=q;
    }
    return controlled>0&&safe<=1;
}
// Only called at the first quiescence boundary of a gated PLAY request.
// Hypothetical revealed identities belong to the supplied samples, never truth.
void focusedQuietChecks(State& s,std::vector<Move>& out) {
    const int side=s.turn,enemy=side^1,k=s.kings[enemy];if(k<0)return;
    const int kx=k%9,ky=k/9;const bool alreadyChecked=inCheck(s.board,enemy,k);
    for(int f=0;f<90;f++) {
        const Piece p=s.board[f];if(p.side!=side)continue;const int fx=f%9,fy=f/9;
        for(int t:candidates(s.board,f,false)) {
            if(s.board[t].live())continue;const int tx=t%9,ty=t/9;
            const bool sensitive=alreadyChecked||fx==kx||fy==ky||(std::abs(fx-kx)==1&&std::abs(fy-ky)==1)||tx==kx||ty==ky||(std::abs(tx-kx)<=2&&std::abs(ty-ky)<=2);
            if(!sensitive||!pseudo(s.board,f,t))continue;
            const Move m={f,t};const Undo old=push(s,m);
            const bool gives=inCheck(s.board,enemy,s.kings[enemy]);
            const bool safe=gives&&!inCheck(s.board,side,s.kings[side]);pop(s,m,old);
            if(safe)out.push_back(m);
        }
    }
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
    Move move;std::vector<double> worldScores;double baseScore=0,tailLoss=0,riskWeight=0,riskPenalty=0;double score=0,spread=0,winRate=0;int wins=0,losses=0,repetitions=0;bool draw=false,repetitionLoss=false;
};
Row summarize(Move m,const std::vector<double>& scores,bool uncertain) {
    Row row;row.move=m;row.worldScores=scores;double probability=0,mean=0;
    for(double v:scores){probability+=v>98000?1:v< -98000?0:1/(1+std::exp(-v/600));mean+=std::max(-3600.0,std::min(3600.0,v));row.wins+=v>98000;row.losses+=v< -98000;}
    probability/=scores.size();mean/=scores.size();
    row.score=uncertain?600*std::log(std::max(.0025,probability)/std::max(.0025,1-probability)):scores[0];
    for(double v:scores){double d=std::max(-3600.0,std::min(3600.0,v))-mean;row.spread+=d*d;}
    row.spread=std::sqrt(row.spread/scores.size());row.winRate=probability*100;row.baseScore=row.score;row.tailLoss=uncertain?mist_risk::lowerTailLoss(scores):0;return row;
}
struct Packet {
    std::string mode;int depth=0,turn=0,viewer=-1;double budget=0;uint64_t nodeLimit=0;
    Board view;std::vector<Piece> captured;std::vector<Board> worlds;
    std::array<int,8100> repetitions{};std::array<int,8100> outcomes{};
};
Piece readPiece() {
    Piece p;int hidden;if(!(std::cin>>p.side>>p.type>>p.role>>hidden))throw std::runtime_error("truncated piece");p.hidden=hidden!=0;
    if(p.side< -1||p.side>1||p.type< -1||p.type>6||p.role< -1||p.role>6||hidden<0||hidden>1)throw std::runtime_error("piece out of range");
    return p;
}
bool read(Packet& p) {
    if(!(std::cin>>p.mode))return false;int captured,worlds,metadata;
    if(!(std::cin>>p.depth>>p.budget>>p.nodeLimit>>p.turn>>p.viewer>>captured>>worlds>>metadata))throw std::runtime_error("truncated header");
    if((p.mode!="SEARCH"&&p.mode!="STREAM"&&p.mode!="VERIFY"&&p.mode!="PLAY"&&p.mode!="STREAM_PLAY")||p.depth<0||!std::isfinite(p.budget)||p.budget<0||p.budget>300000||p.turn<0||p.turn>1||p.viewer< -1||p.viewer>1||captured<0||captured>32||worlds<1||worlds>30||metadata<0||metadata>8100)throw std::runtime_error("header out of range");
    for(auto& v:p.view)v=readPiece();for(int i=0;i<captured;i++)p.captured.push_back(readPiece());
    p.worlds.resize(worlds);for(auto& w:p.worlds)for(auto& v:w){v=readPiece();if(v.live()&&(v.type<0||(v.hidden&&v.role<0)))throw std::runtime_error("incomplete sample");}
    for(int i=0;i<metadata;i++){int f,t,count,outcome;if(!(std::cin>>f>>t>>count>>outcome))throw std::runtime_error("truncated root metadata");if(f<0||f>=90||t<0||t>=90||count<0||outcome<0||outcome>2)throw std::runtime_error("root metadata out of range");p.repetitions[f*90+t]=count;p.outcomes[f*90+t]=outcome;}
    return true;
}
struct Timeout {};
struct Iteration {int depth=0;uint64_t nodes=0;double elapsed=0;std::vector<Row> rows;};
struct ScoredMove {Move move;double score;};
void stableMoveSort(std::vector<ScoredMove>& a){for(size_t i=1;i<a.size();i++){auto item=a[i];size_t j=i;while(j&&item.score>a[j-1].score){a[j]=a[j-1];j--;}a[j]=item;}}
bool nullEligible(const State& s,int depth,double beta,bool checked,size_t moves,bool allowNull,int virtualPlies){
    if(!allowNull||virtualPlies||depth<3||checked||moves<2||!std::isfinite(beta)||std::abs(beta)>=97000)return false;
    int heavy=0;for(const Piece& p:s.board)if(p.side==s.turn&&!p.hidden&&(p.type==R||p.type==C||p.type==N))heavy++;
    return heavy>=2&&evaluate(s,s.turn)>=beta;
}
// Inserted within namespace mist. Every real search edge toggles turn.
bool sameTurnCycle(const std::vector<Key>& history,const Key& key) {
#ifdef MIST_VERIFY_RESTORE
    for(size_t j=1;j<history.size();j++)
        if(history[j].turn==history[j-1].turn)
            throw std::runtime_error("non-alternating search path");
#endif
    const size_t first=history.empty()||history.front().turn==key.turn?0:1;
    bool found=false;
    for(size_t i=first;i<history.size();i+=2)if(history[i]==key){found=true;break;}
#ifdef MIST_VERIFY_RESTORE
    const bool reference=std::find(history.begin(),history.end(),key)!=history.end();
    if(found!=reference)throw std::runtime_error("cycle parity differs from full scan");
#endif
    return found;
}

// Existing request-local worker pool, shared dispatch only; worlds never share TT.
class RequestWorkers {
    std::mutex mutex;std::condition_variable ready;std::queue<std::function<void()>> jobs;std::vector<std::thread> threads;bool stopping=false;
    void close(){{std::lock_guard<std::mutex> lock(mutex);stopping=true;}ready.notify_all();for(auto& thread:threads)if(thread.joinable())thread.join();}
public:
    explicit RequestWorkers(size_t n){try{for(size_t i=0;i<n;i++)threads.emplace_back([this]{for(;;){std::function<void()> job;{std::unique_lock<std::mutex> lock(mutex);ready.wait(lock,[this]{return stopping||!jobs.empty();});if(stopping&&jobs.empty())return;job=std::move(jobs.front());jobs.pop();}job();}});}catch(...){close();throw;}}
    ~RequestWorkers(){close();}
    std::future<void> submit(std::function<void()> f){auto task=std::make_shared<std::packaged_task<void()>>(std::move(f));auto result=task->get_future();{std::lock_guard<std::mutex> lock(mutex);if(stopping)throw std::runtime_error("pool closed");jobs.emplace([task]{(*task)();});}ready.notify_one();return result;}
};

struct Search {
    std::array<std::vector<Move>,MAX_SEARCH_PLY> moveBuffers,probeBuffers;
    std::array<std::vector<ScoredMove>,MAX_SEARCH_PLY> scoreBuffers;
    std::vector<State> worlds;std::array<uint32_t,16200> history{};std::array<std::vector<Move>,MAX_SEARCH_PLY> killers;
    bool tacticalFocus=false,strictDepth=false;uint64_t lmrSearches=0,lmrResearches=0,quietQueries=0,quietAdded=0,quietSearched=0,tacticalAdded=0;uint64_t nullSearches=0,nullCutoffs=0,nullVerifications=0;uint64_t nodes=0,nodeLimit=0;double limit=0;std::chrono::steady_clock::time_point start;
    int selDepth=0;uint64_t safetyCutoffs=0;
    std::atomic<uint64_t> publishedNodes{0};std::atomic<int> publishedSelDepth{0};
    std::function<void()> poll;
    double elapsed() const {return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();}
    void tick(int ply){nodes++;if(ply>selDepth){selDepth=ply;publishedSelDepth.store(ply,std::memory_order_relaxed);}if((nodes&255)==0)publishedNodes.store(nodes,std::memory_order_relaxed);if((nodes&1023)==0&&poll)poll();if((nodeLimit&&nodes>nodeLimit)||((nodes&7)==0&&elapsed()>limit))throw Timeout{};}
    double search(State& s,int depth,double alpha,double beta,int ply,int qleft=3,int extensions=2,int quietChecks=1,bool allowNull=true,int nullPlies=0) {
        tick(ply-nullPlies);
        if(ply>=MAX_SEARCH_PLY-1){safetyCutoffs++;auto& probe=probeBuffers.back();legalMaskedInto(s,s.turn,false,true,s.kings[s.turn],probe);if(probe.empty())return -mate+(ply-nullPlies);return evaluate(s,s.turn)-(inCheck(s.board,s.turn,s.kings[s.turn])?180:0);}
        // Synthetic passes use separate buffer frames, not extra actual move depth.
        // They cannot read/write real-position TT bounds or claim repetition.
        if(nullPlies)return node(s,depth,alpha,beta,ply,qleft,extensions,quietChecks,false,nullPlies);
        Key path=s.key();if(sameTurnCycle(s.path,path)){s.cycles++;return 0;}
        s.path.push_back(path);
        try{double v=node(s,depth,alpha,beta,ply,qleft,extensions,quietChecks,allowNull,nullPlies);s.path.pop_back();return v;}catch(...){s.path.pop_back();throw;}
    }
    double node(State& s,int depth,double alpha,double beta,int ply,int qleft,int extensions,int quietChecks,bool allowNull,int nullPlies) {
        bool check=inCheck(s.board,s.turn,s.kings[s.turn]);if(check&&depth>0&&extensions>0){depth++;extensions--;}
        uint64_t cycleStart=s.cycles;Key key=s.key(extensions);Entry entry{};bool hasEntry=false,hasKey=depth>0&&nullPlies==0;double originalAlpha=alpha;
        if(hasKey){const Entry* i=s.table.probe(key);if(i){entry=*i;hasEntry=true;if(strictDepth?entry.depth==depth:entry.depth>=depth){double v=entry.score;if(v>98000)v-=ply-nullPlies;else if(v< -98000)v+=ply-nullPlies;if(entry.flag==0)return v;if(entry.flag==1)alpha=std::max(alpha,v);else beta=std::min(beta,v);if(alpha>=beta)return v;}}}
        bool quiet=depth<=0&&!check;double stand=0;
        if(quiet){stand=evaluateStand(s,s.turn,alpha,beta);if(stand>=beta){auto& probe=probeBuffers.at(ply);legalMaskedInto(s,s.turn,false,true,s.kings[s.turn],probe,check);if(probe.empty())return -mate+(ply-nullPlies);return stand;}}
        auto& moves=moveBuffers.at(ply);legalMaskedInto(s,s.turn,quiet,false,s.kings[s.turn],moves,check);
        if(moves.empty()){if(!quiet)return -mate+(ply-nullPlies);auto& probe=probeBuffers.at(ply);legalMaskedInto(s,s.turn,false,true,s.kings[s.turn],probe,check);if(probe.empty())return -mate+(ply-nullPlies);}
        if(quiet){alpha=std::max(alpha,stand);if(qleft<=0)return alpha;
            if(quietChecks>0){quietQueries++;auto& probe=probeBuffers.at(ply);legalMaskedInto(s,s.turn,false,false,s.kings[s.turn],probe,check,true);
                for(Move m:probe){Undo u=push(s,m);const bool gives=inCheck(s.board,s.turn,s.kings[s.turn]);pop(s,m,u);if(gives){moves.push_back(m);quietAdded++;}}
                if(depth==0&&tacticalFocus){std::vector<Move> extra;focusedQuietChecks(s,extra);for(Move m:extra)if(std::find(moves.begin(),moves.end(),m)==moves.end()){moves.push_back(m);tacticalAdded++;}}
            }if(moves.empty())return alpha;
        }
        if(depth<=-6)return evaluate(s,s.turn)-(check?180:0);
        if(true&&nullEligible(s,depth,beta,check,moves.size(),allowNull,nullPlies)){
                const int reduction=2+int(depth>=6);const int originalTurn=s.turn;const auto originalNeural=s.neural;double v;
                nullSearches++;s.turn=1-s.turn;s.nnueUpdates++;observation_nnue::changeTurn(s.neural,originalTurn,s.turn);auditNeural(s);
                try{v=-search(s,depth-1-reduction,-beta,-beta+1,ply+1,qleft,extensions,quietChecks,false,nullPlies+1);}catch(...){s.turn=originalTurn;s.neural=originalNeural;auditNeural(s);throw;}s.turn=originalTurn;s.neural=originalNeural;auditNeural(s);
                if(v>=beta){
                    // Verify reduced legal-position search at greater depth or low population.
                    // The extra frame is bookkeeping, not a real move or a mate proof.
                    if(depth>=6||s.population<=10){nullVerifications++;v=search(s,depth-reduction,beta-1,beta,ply+1,qleft,extensions,quietChecks,false,nullPlies+1);}
                    if(v>=beta){nullCutoffs++;return beta;}
                }
        }
        int hbase=s.turn==0?0:8100;
        auto order=[&](Move m){if(hasEntry&&entry.best==m)return 10000000.0;double v=priority(s,m);if(!s.board[m.to].live()){v+=history[hbase+m.index()];const auto& ks=killers.at(ply);if(std::find(ks.begin(),ks.end(),m)!=ks.end())v+=3000;}return v;};
        auto& scored=scoreBuffers.at(ply);scored.clear();scored.reserve(moves.size());
        for(Move m:moves)scored.push_back({m,order(m)});
        stableMoveSort(scored);
        for(size_t i=0;i<moves.size();i++)moves[i]=scored[i].move;
        Move best;bool first=true;int moveCount=0;
        auto save=[&](double score,int flag,Move m){if(hasKey&&cycleStart==s.cycles)s.table.store(key,{depth,flag,score>98000?score+(ply-nullPlies):score< -98000?score-(ply-nullPlies):score,m});};
        for(Move m:moves) {
            bool capture=s.board[m.to].live();const int nextChecks=quiet&&!capture?quietChecks-1:quietChecks;if(quiet&&!capture)quietSearched++;++moveCount;Undo old=push(s,m);double v;
            try {
                if(first||!std::isfinite(alpha))v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft,extensions,nextChecks,allowNull,nullPlies);
                else {int reduction=0;
                if(nullPlies==0&&depth>=3&&!check&&!capture&&moveCount>=4&&std::abs(alpha)<97000&&history[hbase+m.index()]<400&&std::find(killers.at(ply).begin(),killers.at(ply).end(),m)==killers.at(ply).end()&&!inCheck(s.board,s.turn,s.kings[s.turn]))reduction=1+int(depth>=6&&moveCount>=8);
                if(reduction){lmrSearches++;v=-search(s,depth-1-reduction,-alpha-1,-alpha,ply+1,qleft,extensions,nextChecks,allowNull,nullPlies);if(v>alpha){lmrResearches++;v=-search(s,depth-1,-alpha-1,-alpha,ply+1,qleft,extensions,nextChecks,allowNull,nullPlies);}}
                else v=-search(s,depth-1,-alpha-1,-alpha,ply+1,quiet?qleft-1:qleft,extensions,nextChecks,allowNull,nullPlies);
                if(v>alpha&&v<beta)v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft,extensions,nextChecks,allowNull,nullPlies);
            }
            }catch(...){pop(s,m,old);throw;}pop(s,m,old);first=false;
            if(v>=beta){if(!capture&&depth>0&&nullPlies==0){auto& h=history[hbase+m.index()];h=std::min(uint32_t(2000),h+uint32_t(std::min(uint64_t(2000),uint64_t(depth)*uint64_t(depth))));auto& ks=killers.at(ply);if(std::find(ks.begin(),ks.end(),m)==ks.end())ks.insert(ks.begin(),m);if(ks.size()>2)ks.resize(2);}save(v,1,m);return v;}
            if(v>alpha){alpha=v;best=m;}
        }save(alpha,alpha<=originalAlpha?2:0,best);return alpha;
    }
};
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

void writeMove(Move m){if(m.from<0)std::cout<<"null";else std::cout<<"{\"from\":"<<m.from<<",\"to\":"<<m.to<<"}";}
void writeMoves(const std::vector<Move>& moves){std::cout<<'[';bool comma=false;for(auto m:moves){if(comma)std::cout<<',';comma=true;writeMove(m);}std::cout<<']';}
void writeRows(const std::vector<Row>& rows) {
    std::cout<<'[';bool comma=false;for(const Row& r:rows){if(comma)std::cout<<',';comma=true;
        std::cout<<"{\"from\":"<<r.move.from<<",\"to\":"<<r.move.to<<",\"score\":"<<r.score<<",\"spread\":"<<r.spread<<",\"heuristicWinRate\":"<<r.winRate<<",\"sampleWins\":"<<r.wins<<",\"sampleLosses\":"<<r.losses<<",\"repetitionCount\":"<<r.repetitions;std::cout<<",\"worldScores\":[";for(size_t i=0;i<r.worldScores.size();i++){if(i)std::cout<<',';std::cout<<r.worldScores[i];}std::cout<<']';std::cout<<",\"baseScore\":"<<r.baseScore<<",\"tailLoss\":"<<r.tailLoss<<",\"riskWeight\":"<<r.riskWeight<<",\"riskPenalty\":"<<r.riskPenalty;if(r.draw)std::cout<<",\"draw\":true";if(r.repetitionLoss)std::cout<<",\"repetitionLoss\":true";std::cout<<'}';}
    std::cout<<']';
}
// A PLAY result compares only fully evaluated roots at ONE common depth and
// across the identical fixed sample set. Shallower roots schedule exploration;
// their scores never enter a deeper result table. Full SEARCH/STREAM is separate.
// Frontier round: one-ply full coverage floor, broader acceptance, cap refill.
void runCombo(const Packet& p) {
    TTArena arena;TTScope arenaScope(arena);Search s;s.start=std::chrono::steady_clock::now();s.nodeLimit=p.nodeLimit;s.limit=p.budget-std::min(35.0,p.budget*.10);
    const bool focusRootEnabled=p.mode=="PLAY"||p.mode=="STREAM_PLAY";constexpr bool coverageRepairEnabled=true,capRepairEnabled=true;
    Board rootBoard=p.view;auto root=legal(rootBoard,p.turn);const size_t total=root.size();
    if(root.empty()){std::cout<<"{\"depth\":0,\"nodes\":0,\"samples\":0,\"score\":-99999,\"move\":null,\"terminal\":true,\"elapsedMs\":"<<s.elapsed()<<",\"allCandidates\":[],\"iterations\":[],\"rootCount\":0,\"comparedCount\":0,\"fullRootDepth\":0,\"searchScope\":\"full-root\"}\n";return;}
    State context;context.board=p.view;context.turn=p.turn;
    for(int side:{0,1}){auto bag=remaining(p.view,p.captured,side);context.poolCount[side]=int(bag.size());for(int t:bag)context.poolValue[side]+=value[t];}
    std::array<double,8100> reveal{};for(auto m:root)reveal[m.index()]=revealOrder(context,p.captured,m);
    std::stable_sort(root.begin(),root.end(),[&](Move a,Move b){return priority(context,a)+reveal[a.index()]>priority(context,b)+reveal[b.index()];});
    const auto original=root;const Move fallback=root[0];bool uncertain=false;for(auto q:p.view)uncertain|=q.live()&&q.hidden;
    const bool critical=criticalKing(rootBoard,0)||criticalKing(rootBoard,1);
    RootSession session(p,s);const size_t lanes=session.lanes;
    auto scoreRoot=[&](Move m,int depth){return session.score(m,depth,uncertain);};
    std::vector<Iteration> iterations;std::vector<Row> accepted,anchorRows,previous;
    int currentDepth=0;bool finalized=false;double lastTelemetry=-100;uint64_t completedCohorts=0;
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
    auto telemetry=[&](){if(p.mode!="STREAM"&&p.mode!="STREAM_PLAY")return;if(s.elapsed()-lastTelemetry<50)return;lastTelemetry=s.elapsed();const auto seen=session.observed();std::cout<<"{\"telemetry\":{\"mainDepth\":"<<currentDepth<<",\"selDepth\":"<<seen.second<<",\"completedDepth\":"<<fullDepth<<",\"visitedNodes\":"<<seen.first<<",\"elapsedMs\":"<<s.elapsed()<<",\"statsExact\":false,\"searchStatus\":\"searching\"}}\n"<<std::flush;};
    session.poll=telemetry;if(!session.parallel)s.poll=telemetry;
    auto writeScope=[&](int depth,size_t count,int target,bool complete) {
        std::cout<<",\"rootCount\":"<<total<<",\"comparedCount\":"<<count<<",\"plannedCount\":"<<target<<",\"cohortComplete\":"<<(complete?"true":"false")<<",\"fullRootDepth\":"<<fullDepth<<",\"searchScope\":\""<<(count==total?"full-root":"focused-root")<<"\",\"criticalRoot\":"<<(critical?"true":"false")<<",\"tacticalSearch\":"<<(s.tacticalFocus?"true":"false")<<",\"quietChecksSearched\":"<<s.quietSearched<<",\"reintroducedCount\":"<<reentries<<",\"collapseExpansions\":"<<collapseExpansions<<",\"comparisonDepth\":"<<depth<<",\"minimumComparisonRoots\":"<<minimumCompared<<",\"coverageRefreshes\":"<<coverageRefreshes<<",\"capFillRoots\":"<<capFillRoots;
        std::cout<<",\"mainDepth\":"<<currentDepth<<",\"completedDepth\":"<<fullDepth<<",\"selDepth\":"<<s.selDepth<<",\"visitedNodes\":"<<s.nodes<<",\"statsExact\":true,\"searchStatus\":\""<<(finalized?(interrupted||s.elapsed()>s.limit?"time-budget":"completed"):"searching")<<"\",\"safetyCutoffs\":"<<s.safetyCutoffs<<",\"completedCohorts\":"<<completedCohorts<<",\"ttBudgetBytes\":"<<TTArena::budget<<",\"ttAllocatedBytes\":"<<arena.used.load()<<",\"ttDenied\":"<<arena.denied.load();session.writeFeatures();
    };
    auto accept=[&](int depth,const std::vector<Row>& rows,int target,bool complete) {
        if(rows.size()<minimumCompared)return;accepted=rows;mist_risk::rank(accepted,uncertain);std::stable_sort(accepted.begin(),accepted.end(),[](const Row& a,const Row& b){return a.score>b.score;});
        acceptedDepth=depth;planned=target;cohortComplete=complete;
        if(rows.size()==total)fullDepth=depth;
        if(p.mode=="STREAM_PLAY"||p.mode=="STREAM"){
            std::cout<<"{\"progress\":true,\"result\":{\"depth\":"<<depth<<",\"nodes\":"<<s.nodes<<",\"samples\":"<<p.worlds.size()<<",\"elapsedMs\":"<<s.elapsed()<<",\"threads\":"<<lanes<<",\"score\":"<<accepted[0].score<<",\"move\":";writeMove(accepted[0].move);std::cout<<",\"allCandidates\":";writeRows(accepted);writeScope(depth,rows.size(),target,complete);std::cout<<"}}\n"<<std::flush;
        }
    };
    const int anchor=focusRootEnabled?1:p.depth;
    const bool allKnown=std::all_of(root.begin(),root.end(),[&](Move m){return p.outcomes[m.index()]!=0;});
    for(int depth=1;p.depth==0||depth<=p.depth;depth++) {currentDepth=depth;telemetry();if(depth==std::numeric_limits<int>::max()-1){s.safetyCutoffs++;break;}
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
                int minDepth=std::numeric_limits<int>::max();for(Move m:original)if(!added[m.index()])minDepth=std::min(minDepth,completed[m.index()]);
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
        }catch(const Timeout&){interrupted=depth;if(focused&&rows.size()>=minimumCompared){accept(depth,rows,int(cohort.size()),false);iterations.push_back({depth,s.nodes,s.elapsed(),accepted});if(iterations.size()>64)iterations.erase(iterations.begin());}break;}
        accept(depth,rows,int(cohort.size()),true);completedCohorts++;iterations.push_back({depth,s.nodes,s.elapsed(),accepted});if(iterations.size()>64)iterations.erase(iterations.begin());previous=accepted;
        if(!focused){anchorRows=accepted;root.clear();for(const auto& row:accepted)root.push_back(row.move);}
        if(allKnown||s.safetyCutoffs||(!uncertain&&std::abs(accepted[0].score)>98000)||s.elapsed()>s.limit)break;
    }
    session.pool.reset();session.update();finalized=true;
    #ifdef MIST_VERIFY_RESTORE
    for(size_t i=0;i<s.worlds.size();i++){const State expected=stateOf(p.worlds[i],p.captured,p.turn,p.viewer);const auto& w=s.worlds[i];if(!(w.board==expected.board&&w.key()==expected.key()&&w.path==expected.path&&w.population==expected.population&&w.kings[0]==expected.kings[0]&&w.kings[1]==expected.kings[1]&&w.neural==expected.neural&&w.occupied==expected.occupied))throw std::runtime_error("focused sample not restored");}
    #endif
    std::cout<<"{\"depth\":"<<acceptedDepth<<",\"nodes\":"<<s.nodes<<",\"samples\":"<<p.worlds.size()<<",\"elapsedMs\":"<<s.elapsed()<<",\"interruptedDepth\":"<<interrupted<<",\"score\":"<<(accepted.empty()?0:accepted[0].score)<<",\"move\":";writeMove(accepted.empty()?fallback:accepted[0].move);
    std::cout<<",\"threads\":"<<lanes<<",\"allCandidates\":";writeRows(accepted);writeScope(acceptedDepth,accepted.size(),planned,cohortComplete);
    std::cout<<",\"iterations\":[";if(p.mode!="STREAM_PLAY"&&p.mode!="STREAM")for(size_t i=0;i<iterations.size();i++){if(i)std::cout<<',';const auto& it=iterations[i];std::cout<<"{\"depth\":"<<it.depth<<",\"nodes\":"<<it.nodes<<",\"elapsedMs\":"<<it.elapsed<<",\"allCandidates\":";writeRows(it.rows);std::cout<<'}';}std::cout<<"]}\n";
}

void verify(const Packet& p) {
    State s=stateOf(p.worlds[0],p.captured,p.turn,p.viewer);std::cout<<"{\"sides\":[";
    for(int side:{0,1}){if(side)std::cout<<',';std::cout<<"{\"check\":"<<(inCheck(s.board,side,s.kings[side])?"true":"false")<<",\"score\":"<<evaluate(s,side)<<",\"legal\":";writeMoves(legal(s.board,side));std::cout<<",\"captures\":";writeMoves(legal(s.board,side,true));std::cout<<'}';}
    std::cout<<"],\"transitions\":[";const Board before=s.board;Key old=s.key();const int oldPopulation=s.population,oldKings[2]={s.kings[0],s.kings[1]};auto moves=legal(s.board,s.turn);
    for(size_t i=0;i<moves.size();i++){if(i)std::cout<<',';Move m=moves[i];Undo u=push(s,m);std::cout<<"{\"from\":"<<m.from<<",\"to\":"<<m.to<<",\"type\":"<<s.board[m.to].type<<",\"score\":"<<evaluate(s,p.turn)<<",\"poolCount\":["<<s.poolCount[0]<<','<<s.poolCount[1]<<"],\"poolValue\":["<<s.poolValue[0]<<','<<s.poolValue[1]<<"],\"reply\":";writeMoves(legal(s.board,s.turn));pop(s,m,u);std::cout<<",\"restored\":"<<((s.board==before&&s.key()==old&&s.population==oldPopulation&&s.kings[0]==oldKings[0]&&s.kings[1]==oldKings[1])?"true":"false")<<'}';}
    std::cout<<"]}\n";
}
} // namespace mist
int main() {
    using namespace mist;std::ios::sync_with_stdio(false);std::cin.tie(nullptr);std::cout<<std::setprecision(17);initialize();observation_nnue::model.load(std::getenv("MIST_NNUE_MODEL"));if(observation_nnue::model.full)throw std::runtime_error("bundle requires incremental NNUE");std::cout<<"{\"ready\":true,\"protocol\":2,\"streaming\":true,\"depthMetrics\":true,\"unlimitedDepth\":true,\"safetyMaxPly\":"<<MAX_SEARCH_PLY-1<<",\"threads\":4,\"independentWorldSearch\":true,\"allFeatures\":true,\"nnue\":true,\"nnueModelSha256\":\"0b3ccf77fb30ce16ccdeaceb198bf7a114cee7b8a084643adac0d14887090edb\",\"ttSlotBytes\":128,\"focusedPlay\":true}\n"<<std::flush;
    try {Packet packet;while(read(packet)){if(packet.mode=="VERIFY")verify(packet);else runCombo(packet);std::cout<<std::flush;packet=Packet{};}}
    catch(const std::exception& error){std::cerr<<"native error: "<<error.what()<<'\n';return 2;}
}
