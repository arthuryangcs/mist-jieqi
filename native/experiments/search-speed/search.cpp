#include <deque>
#include <new>
// Mist Jieqi isolated exact-context / search-speed experiment.
// Full roots, eight sampled dark worlds, maximum four search threads.
// Production default is unchanged. License: see repository LICENSE.
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
#include <thread>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <memory>
#include <exception>
#include <atomic>
#include <functional>

namespace mist {
enum Type { K, R, N, B, C, A, P };
constexpr int value[] = {100000,900,420,210,450,210,110};
std::array<std::array<std::array<int,90>,7>,2> hceBase{};
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
std::array<std::vector<Leap>,90> checks;
std::array<uint32_t,90*112> z1,z2;
int sign(int x) { return (x>0)-(x<0); }
bool inside(int x,int y) { return x>=0&&x<9&&y>=0&&y<10; }
bool palace(int x,int y,int side) { return x>=3&&x<=5&&(side==0?y>=7:y<=2); }
int kingAt(const Board& b,int side) { for(int i=0;i<90;i++)if(b[i].side==side&&!b[i].hidden&&b[i].type==K)return i;return -1; }
void initializeHCE();
void initialize() {initializeHCE();
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
bool pseudo(const Board& b,int f,int t) {
    if(f<0||f>=90||t<0||t>=90||f==t)return false;
    Piece p=b[f],q=b[t];if(!p.live()||q.side==p.side)return false;
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
#ifdef MIST_VERIFY_RESTORE
    std::vector<int> expected;for(int t:candidates(b,f,captures))if(pseudo(b,f,t))expected.push_back(t);if(expected!=std::vector<int>(out.begin(),out.end()))throw std::logic_error("fused destinations/order differs");
#endif
    return out;
}

void legalInto(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out,int checked=-1) {
    if(king==-2)king=kingAt(b,side);out.clear();
    const bool noCheck=king>=0&&!(checked<0?inCheck(b,side,king):checked);
    const int kx=king%9,ky=king/9;
    for(int f=0;f<90;f++)if(b[f].side==side)for(int t:pseudoDestinations(b,f,captures)) {
        Piece p=b[f],q=b[t];
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
// Own local experiment. Public positions contain no sampled dark identities.
struct Position {
    uint32_t h1=0,h2=0;int turn=0;
    bool operator==(const Position& p)const{return h1==p.h1&&h2==p.h2&&turn==p.turn;}
};
uint64_t mix64(uint64_t h){h^=h>>30;h*=0xbf58476d1ce4e5b9ULL;h^=h>>27;h*=0x94d049bb133111ebULL;return h^(h>>31);}
uint64_t positionDigest(Position p){return mix64((uint64_t(p.h1)<<32)|p.h2)^mix64(uint64_t(p.turn)+0x729fa213ULL);}
struct Key {
    uint64_t lo=0,hi=0;
    bool operator==(const Key& k)const{return lo==k.lo&&hi==k.hi;}
};
struct KeyHash {size_t operator()(const Key& k)const{return size_t(k.lo);}};

struct Entry {int depth,flag;double score;Move best;}; // exact=0, lower=1, upper=2
// Own experimental code. One bounded TT arena per request, separate per-world tables.
struct TTArena {
    static constexpr size_t budget=64*1024*1024;
    static size_t checked(size_t cap){if(cap==0||cap>budget)throw std::logic_error("invalid TT partition");return cap;}const size_t capacity;void* data;explicit TTArena(size_t cap=budget):capacity(checked(cap)),data(::operator new(capacity,std::align_val_t(64))){}
    std::atomic<size_t> used{0},denied{0};
    ~TTArena(){::operator delete(data,std::align_val_t(64));}
    void* allocate(size_t bytes,size_t align){
        size_t old=used.load();
        for(;;){size_t at=(old+align-1)&~(align-1);if(at>capacity||bytes>capacity-at){denied.fetch_add(1);throw std::bad_alloc();}
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
struct TTTable {
#ifdef MIST_CLUSTER_TT
    struct alignas(64) Slot {Key key{};Entry entry{};bool occupied=false;};
    static_assert(sizeof(Slot)==64,"TT slot budget changed");
    Slot* slots=nullptr;size_t count=0;uint64_t replacements=0;
    void configure(size_t worlds,size_t overrideSlots=0){
        size_t target=overrideSlots?overrideSlots:TTArena::budget/worlds/sizeof(Slot);count=2;while(count*2<=target)count*=2;
        slots=static_cast<Slot*>(activeTTArena->allocate(count*sizeof(Slot),alignof(Slot)));
        for(size_t i=0;i<count;i++)new(slots+i)Slot{};
    }
    size_t bucket(const Key& k)const{uint64_t h=KeyHash{}(k);h^=h>>30;h*=0xbf58476d1ce4e5b9ULL;h^=h>>27;h*=0x94d049bb133111ebULL;h^=h>>31;return (size_t(h)&(count/2-1))*2;}
    const Entry* probe(const Key& k)const{if(!count)return nullptr;size_t i=bucket(k);for(size_t j=i;j<i+2;j++)if(slots[j].occupied&&slots[j].key==k)return &slots[j].entry;return nullptr;}
    void store(const Key& k,const Entry& e){if(!count)return;size_t i=bucket(k),victim=i;
        for(size_t j=i;j<i+2;j++){if(!slots[j].occupied||slots[j].key==k){slots[j]={k,e,true};return;}if(slots[j].entry.depth<slots[victim].entry.depth)victim=j;}
        if(e.depth>=slots[victim].entry.depth){slots[victim]={k,e,true};replacements++;}
    }
#else
    using Map=std::unordered_map<Key,Entry,KeyHash,std::equal_to<Key>,TTAllocator<std::pair<const Key,Entry>>>;
    Map map;bool reserved=false;size_t entryLimit=90000;
    void configure(size_t,size_t=0){}
    const Entry* probe(const Key& k)const{auto i=map.find(k);return i==map.end()?nullptr:&i->second;}
    void store(const Key& k,const Entry& e){auto i=map.find(k);if(i!=map.end()){i->second=e;return;}if(map.size()>=entryLimit)return;
        try{if(!reserved){map.reserve(entryLimit);reserved=true;}map.emplace(k,e);}catch(const std::bad_alloc&){/* Safe cache miss; counted by arena. */}
    }
#endif
};

struct OccupiedBits {
 std::array<uint64_t,2> words{};void toggle(int i){words[i>>6]^=uint64_t(1)<<(i&63);}bool operator==(const OccupiedBits& x)const{return words==x.words;}
 struct It{uint64_t low,high;int operator*()const{return low?__builtin_ctzll(low):64+__builtin_ctzll(high);}It& operator++(){if(low)low&=low-1;else high&=high-1;return *this;}bool operator!=(const It& x)const{return low!=x.low||high!=x.high;}};It begin()const{return {words[0],words[1]};}It end()const{return {0,0};}
};

struct State {OccupiedBits occupied;int evalBase=0,evalPhase=0,darkCount[2]={0,0};
    Board board;int turn=0,viewer=-1,kings[2]={-1,-1},population=0,poolCount[2]={0,0},poolValue[2]={0,0};
    uint32_t h1=0,h2=0,pub1=0,pub2=0;uint64_t cycles=0;
    int quiet=0,gamePly=0;size_t historyStart=0;uint64_t historyDigest=0;std::vector<Position> positions;
    Position position()const{return {pub1,pub2,turn};}
    std::vector<Key> path;
    TTTable table;
    Key key(int ext=-1)const{
        const uint64_t meta=uint64_t(turn)|(uint64_t(poolCount[0])<<1)|(uint64_t(poolCount[1])<<6)|(uint64_t(poolValue[0])<<11)|(uint64_t(poolValue[1])<<25)|(uint64_t(ext+1)<<39)|(uint64_t(quiet)<<41)|(uint64_t(gamePly)<<48)|(uint64_t(viewer+1)<<57);
        const uint64_t boardHash=(uint64_t(h1)<<32)|h2, length=positions.size()-historyStart;
        return {mix64(boardHash^historyDigest^mix64(meta)),mix64(boardHash+0x9e3779b97f4a7c15ULL+historyDigest)^mix64(meta+length*0x429fab7191ULL)};
    }
};
void auditOccupied(const State& s){
#ifdef MIST_VERIFY_RESTORE
OccupiedBits rebuilt;for(int i=0;i<90;i++)if(s.board[i].live())rebuilt.toggle(i);if(!(rebuilt==s.occupied))throw std::logic_error("occupied mask drift");
#else
(void)s;
#endif
}
void xorPiece(State& s,Piece p,int i) {
    if(!p.live())return;int c=i*112+(p.side==0?0:56)+(p.hidden?7+p.role*7+p.type:p.type);
    if(c<0||c>=int(z1.size()))throw std::runtime_error("invalid sampled hash code");s.h1^=z1[c];s.h2^=z2[c];const int publicCode=i*112+(p.side==0?0:56)+(p.hidden?7+p.role*8:p.type);s.pub1^=z1[publicCode];s.pub2^=z2[publicCode];
}
// Same HCE formula split into integer base, linear phase coefficient, dark means.
// Only summation order changes (checked against original within 1e-7 points).
void updateTerms(State& s,Piece p,int square,int delta){
    if(!p.live())return;if(p.hidden){s.darkCount[p.side]+=delta;return;}
    const int signedDelta=(p.side==0?delta:-delta),progress=p.side==0?9-square/9:square/9;
    s.evalBase+=signedDelta*hceBase[p.side][p.type][square];
    if(p.type==K)s.evalPhase-=signedDelta*progress*8;
    if((p.type==A||p.type==B)&&s.kings[p.side]>=0){const int k=s.kings[p.side];if(std::abs(square%9-k%9)+std::abs(square/9-k/9)<=2)s.evalPhase+=signedDelta*8;}
}
void changedKingGuard(State& s,int side,int before,int after,int from,int to){
    if(before==after)return;const int sign=side==0?1:-1;
    for(int i:s.occupied){if(i==from||i==to)continue;const Piece p=s.board[i];if(p.side!=side||p.hidden||(p.type!=A&&p.type!=B))continue;
        auto near=[&](int k){return k>=0&&std::abs(i%9-k%9)+std::abs(i/9-k/9)<=2;};s.evalPhase+=sign*8*(int(near(after))-int(near(before)));
    }
}
void auditTerms(const State& s){
#ifdef MIST_VERIFY_RESTORE
    State reference;reference.kings[0]=s.kings[0];reference.kings[1]=s.kings[1];for(int i=0;i<90;i++)updateTerms(reference,s.board[i],i,1);
    if(s.evalBase!=reference.evalBase||s.evalPhase!=reference.evalPhase||s.darkCount[0]!=reference.darkCount[0]||s.darkCount[1]!=reference.darkCount[1])throw std::logic_error("incremental HCE terms drift");
#else
    (void)s;
#endif
}

State stateOf(const Board& b,const std::vector<Piece>& captured,int turn,int viewer) {
    State s;s.board=b;s.turn=turn;s.viewer=viewer;
    for(int side:{0,1}){auto pool=remaining(b,captured,side);s.poolCount[side]=int(pool.size());for(int t:pool)s.poolValue[side]+=value[t];}
    for(int i=0;i<90;i++){Piece p=b[i];if(!p.live())continue;s.occupied.toggle(i);xorPiece(s,p,i);if(!p.hidden&&p.type==K)s.kings[p.side]=i;else s.population++;}
    for(int i=0;i<90;i++)updateTerms(s,s.board[i],i,1);auditTerms(s);
    s.path.reserve(128);s.path.push_back(s.key());return s;
}
double evaluateReference(const State& s,int side) {
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
    }return total;
}
// Exact original HCE terms indexed by non-king population, side, type, square
// and near-own-king flag. Summation order stays square0..89,including dark means.
std::array<std::array<std::array<std::array<std::array<double,2>,90>,7>,2>,25> hceTerms{};
std::array<std::array<bool,90>,90> hceGuardNear{};
void initializeHCE(){
    for(int k=0;k<90;k++)for(int i=0;i<90;i++)hceGuardNear[k][i]=std::abs(i%9-k%9)+std::abs(i/9-k/9)<=2;
    for(int count=0;count<=24;count++)for(int side=0;side<2;side++)for(int type=0;type<7;type++)for(int i=0;i<90;i++)for(int guard=0;guard<2;guard++){
        double phase=std::min(1.0,count/24.0);int x=i%9,y=i/9,progress=side==0?9-y:y;
        double bonus=type==P?progress*12+(progress>=5?35:0):type==N||type==C?18-std::abs(x-4)*4:type==R?progress*2:0;
        if(type==K)bonus-=std::abs(x-4)*6+progress*phase*8;
        if((type==A||type==B)&&guard)bonus+=phase*8;
        hceTerms[count][side][type][i][guard]=value[type]+bonus;if(count==0&&guard==0)hceBase[side][type][i]=int(value[type]+bonus);
    }
}
double evaluate(const State& s,int side){
    const double phase=std::min(1.0,s.population/24.0),red=s.evalBase+phase*s.evalPhase+(s.poolCount[0]?s.darkCount[0]*double(s.poolValue[0])/s.poolCount[0]:0)-(s.poolCount[1]?s.darkCount[1]*double(s.poolValue[1])/s.poolCount[1]:0);
    const double total=side==0?red:-red;
#ifdef MIST_VERIFY_RESTORE
    if(std::abs(total-evaluateReference(s,side))>1e-7)throw std::logic_error("incremental HCE differs from original formula");
#endif
    return total;
}

struct Undo {int evalBase,evalPhase,dark0,dark1;Piece p,q;uint32_t h1,h2,pub1,pub2;int quiet,gamePly;size_t historyStart;uint64_t historyDigest;};
Undo push(State& s,Move m) {
    Piece p=s.board[m.from],q=s.board[m.to];Undo old={s.evalBase,s.evalPhase,s.darkCount[0],s.darkCount[1],p,q,s.h1,s.h2,s.pub1,s.pub2,s.quiet,s.gamePly,s.historyStart,s.historyDigest};
    s.gamePly++;if(q.live()||p.hidden){s.quiet=0;s.historyStart=s.positions.size();s.historyDigest=0;}else s.quiet++;updateTerms(s,p,m.from,-1);updateTerms(s,q,m.to,-1);const int oldKings[2]={s.kings[0],s.kings[1]};
    s.occupied.toggle(m.from);if(!q.live())s.occupied.toggle(m.to);
    if(!p.hidden&&p.type==K)s.kings[p.side]=m.to;
    if(q.live()){if(!q.hidden&&q.type==K)s.kings[q.side]=-1;else s.population--;}
    for(int side:{0,1})changedKingGuard(s,side,oldKings[side],s.kings[side],m.from,m.to);
    xorPiece(s,p,m.from);xorPiece(s,q,m.to);s.board[m.to]=p;s.board[m.to].hidden=false;s.board[m.from]=Piece{};xorPiece(s,s.board[m.to],m.to);
    if(p.hidden){s.poolCount[p.side]--;s.poolValue[p.side]-=value[p.type];}
    if(q.live()&&q.hidden&&p.side==s.viewer){s.poolCount[q.side]--;s.poolValue[q.side]-=value[q.type];}
    updateTerms(s,s.board[m.to],m.to,1);s.turn^=1;auditOccupied(s);auditTerms(s);return old;
}
void pop(State& s,Move m,const Undo& old) {
    Piece p=old.p,q=old.q;s.occupied.toggle(m.from);if(!q.live())s.occupied.toggle(m.to);if(!p.hidden&&p.type==K)s.kings[p.side]=m.from;
    if(q.live()){if(!q.hidden&&q.type==K)s.kings[q.side]=m.to;else s.population++;}
    if(q.live()&&q.hidden&&p.side==s.viewer){s.poolCount[q.side]++;s.poolValue[q.side]+=value[q.type];}
    if(p.hidden){s.poolCount[p.side]++;s.poolValue[p.side]+=value[p.type];}
    s.turn^=1;s.board[m.from]=p;s.board[m.to]=q;s.h1=old.h1;s.h2=old.h2;s.pub1=old.pub1;s.pub2=old.pub2;s.quiet=old.quiet;s.gamePly=old.gamePly;s.historyStart=old.historyStart;s.historyDigest=old.historyDigest;s.evalBase=old.evalBase;s.evalPhase=old.evalPhase;s.darkCount[0]=old.dark0;s.darkCount[1]=old.dark1;auditOccupied(s);auditTerms(s);
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
    Move move;std::vector<double> worldScores;double score=0,spread=0,winRate=0;int wins=0,losses=0,repetitions=0;bool draw=false,repetitionLoss=false;
};
Row summarize(Move m,const std::vector<double>& scores,bool uncertain) {
    Row row;row.move=m;row.worldScores=scores;double probability=0,mean=0;
    for(double v:scores){probability+=v>98000?1:v< -98000?0:1/(1+std::exp(-v/600));mean+=std::max(-3600.0,std::min(3600.0,v));row.wins+=v>98000;row.losses+=v< -98000;}
    probability/=scores.size();mean/=scores.size();
    row.score=uncertain?600*std::log(std::max(.0025,probability)/std::max(.0025,1-probability)):scores[0];
    for(double v:scores){double d=std::max(-3600.0,std::min(3600.0,v))-mean;row.spread+=d*d;}
    row.spread=std::sqrt(row.spread/scores.size());row.winRate=probability*100;return row;
}
struct Packet {
    std::string mode;int depth=0,turn=0,viewer=-1,quiet=0,gamePly=0;std::vector<Position> positions;double budget=0;uint64_t nodeLimit=0;
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
    if((p.mode!="SEARCH"&&p.mode!="STREAM"&&p.mode!="VERIFY")||p.depth<0||!std::isfinite(p.budget)||p.budget<0||p.budget>300000||p.turn<0||p.turn>1||p.viewer< -1||p.viewer>1||captured<0||captured>32||worlds<1||worlds>30||metadata<0||metadata>8100)throw std::runtime_error("header out of range");
    for(auto& v:p.view)v=readPiece();for(int i=0;i<captured;i++)p.captured.push_back(readPiece());
    p.worlds.resize(worlds);for(auto& w:p.worlds)for(auto& v:w){v=readPiece();if(v.live()&&(v.type<0||(v.hidden&&v.role<0)))throw std::runtime_error("incomplete sample");}
    for(int i=0;i<metadata;i++){int f,t,count,outcome;if(!(std::cin>>f>>t>>count>>outcome))throw std::runtime_error("truncated root metadata");if(f<0||f>=90||t<0||t>=90||count<0||outcome<0||outcome>2)throw std::runtime_error("root metadata out of range");p.repetitions[f*90+t]=count;p.outcomes[f*90+t]=outcome;}
    int n;if(!(std::cin>>p.quiet>>p.gamePly>>n)||p.quiet<0||p.quiet>120||p.gamePly<0||p.gamePly>400||n<1||n>512)throw std::runtime_error("invalid game context");
    for(int j=0;j<n;j++){Position x;if(!(std::cin>>x.h1>>x.h2>>x.turn)||x.turn<0||x.turn>1)throw std::runtime_error("invalid history");p.positions.push_back(x);}
    return true;
}
void initializeGame(State& s,const Packet& p){s.quiet=p.quiet;s.gamePly=p.gamePly;s.positions=p.positions;s.historyStart=0;s.historyDigest=0;for(Position x:s.positions)s.historyDigest+=positionDigest(x);if(s.positions.empty()||!(s.positions.back()==s.position()))throw std::logic_error("history/current mismatch");}
State gameState(const Board& b,const Packet& p){State s=stateOf(b,p.captured,p.turn,p.viewer);initializeGame(s,p);return s;}
bool terminalRoot(const Packet& p,const std::vector<Move>& root){
    int count=0;for(Position x:p.positions)count+=x==p.positions.back();
    if(!root.empty()&&count<3&&p.quiet<120&&p.gamePly<400)return false;
    const double score=root.empty()?-mate:count>=3?mate:0;
    std::cout<<"{\"depth\":0,\"mainDepth\":0,\"completedDepth\":0,\"selDepth\":0,\"visitedNodes\":0,\"nodes\":0,\"samples\":0,\"threads\":0,\"score\":"<<score<<",\"move\":null,\"terminal\":true,\"elapsedMs\":0,\"allCandidates\":[],\"iterations\":[],\"statsExact\":true,\"searchStatus\":\"completed\",\"terminationReason\":\"terminal\"}\n";return true;
}
struct Timeout {};
struct Iteration {int depth=0;uint64_t nodes=0;double elapsed=0;std::vector<Row> rows;};
struct ScoredMove {Move move;double score;};
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
    const std::atomic<bool>* cancel=nullptr;uint64_t nodes=0,nodeLimit=0;double limit=0;std::chrono::steady_clock::time_point start;
    int selDepth=0;uint64_t safetyCutoffs=0;
    std::atomic<uint64_t> publishedNodes{0};std::atomic<int> publishedSelDepth{0};
    std::function<void()> poll;
    double elapsed() const {return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();}
    void tick(int ply){nodes++;if(ply>selDepth){selDepth=ply;publishedSelDepth.store(ply,std::memory_order_relaxed);}if((nodes&255)==0)publishedNodes.store(nodes,std::memory_order_relaxed);if((nodes&1023)==0&&poll)poll();if((nodeLimit&&nodes>nodeLimit)||((nodes&7)==0&&((cancel&&cancel->load(std::memory_order_relaxed))||elapsed()>limit)))throw Timeout{};}
    double search(State& s,int depth,double alpha,double beta,int ply,int qleft=3,int extensions=2) {
        tick(ply);
        if(ply>=MAX_SEARCH_PLY-1){safetyCutoffs++;auto& probe=probeBuffers.back();legalInto(s.board,s.turn,false,true,s.kings[s.turn],probe);if(probe.empty())return -mate+ply;return evaluate(s,s.turn)-(inCheck(s.board,s.turn,s.kings[s.turn])?180:0);}
        const Position pos=s.position();int previous=0;
        for(size_t i=s.historyStart;i<s.positions.size();i++)previous+=s.positions[i]==pos;
        if(previous>=2||s.quiet>=120||s.gamePly>=400){auto& probe=probeBuffers.at(ply);legalInto(s.board,s.turn,false,true,s.kings[s.turn],probe);if(probe.empty())return -mate+ply;if(previous>=2)return mate-ply;return 0;}
        const uint64_t digest=s.historyDigest;s.positions.push_back(pos);s.historyDigest+=positionDigest(pos);
        try{double v=node(s,depth,alpha,beta,ply,qleft,extensions);s.positions.pop_back();s.historyDigest=digest;return v;}catch(...){s.positions.pop_back();s.historyDigest=digest;throw;}
    }
    // Independent alpha-beta reference: no PVS, TT, history or killer ordering.
    // Cross-checked against exhaustive JS minimax on bounded sparse fixtures.
    double plain(State& s,int depth,double alpha,double beta,int ply,int qleft,int extensions){
        const bool check=inCheck(s.board,s.turn,s.kings[s.turn]);
        if(check&&depth>0&&extensions>0){depth++;extensions--;}
        const bool quiet=depth<=0&&!check;auto moves=legal(s.board,s.turn,quiet);
        if(moves.empty()&&(!quiet||legal(s.board,s.turn,false,true).empty()))return -mate+ply;
        double best=quiet?evaluate(s,s.turn):-inf;
        if(quiet){if(best>=beta)return best;alpha=std::max(alpha,best);if(qleft<=0||moves.empty())return best;}
        if(depth<=-6)return evaluate(s,s.turn)-(check?180:0);
        for(Move m:moves){Undo old=push(s,m);double v;try{v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft,extensions);}catch(...){pop(s,m,old);throw;}pop(s,m,old);best=std::max(best,v);alpha=std::max(alpha,v);if(alpha>=beta)break;}
        return best;
    }

    double node(State& s,int depth,double alpha,double beta,int ply,int qleft,int extensions) {
#ifdef MIST_PLAIN
        return plain(s,depth,alpha,beta,ply,qleft,extensions);
#endif
        bool check=inCheck(s.board,s.turn,s.kings[s.turn]);if(check&&depth>0&&extensions>0){depth++;extensions--;}
        uint64_t cycleStart=s.cycles;Key key{};Entry entry{};bool hasEntry=false,hasKey=depth>0;double originalAlpha=alpha;
        if(hasKey){key=s.key(extensions);const Entry* i=
#ifdef MIST_NO_TT
        nullptr;
#else
        s.table.probe(key);
#endif
        if(i){entry=*i;hasEntry=true;if(entry.depth==depth){double v=entry.score;if(v>98000)v-=ply;else if(v< -98000)v+=ply;if(entry.flag==0)return v;if((entry.flag==1&&v>=beta)||(entry.flag==2&&v<=alpha))return v;}}}
        bool quiet=depth<=0&&!check;double stand=0;
        if(quiet){
            stand=evaluate(s,s.turn);
            if(stand>=beta){
                // Xiangqi stalemate is a loss: never accept stand-pat without a legal move.
                auto& probe=probeBuffers.at(ply);legalInto(s.board,s.turn,false,true,s.kings[s.turn],probe,check);
                if(probe.empty())return -mate+ply;
                return stand;
            }
#ifndef MIST_CAPTURE_PREFIX_DISABLE
            if(qleft<=0){
                auto& probe=probeBuffers.at(ply);
                // The prefix of the old capture-list pass is enough as proof.
                legalInto(s.board,s.turn,true,true,s.kings[s.turn],probe,check);
                if(probe.empty())legalInto(s.board,s.turn,false,true,s.kings[s.turn],probe,check);
                if(probe.empty())return -mate+ply;return std::max(alpha,stand);
            }
#endif
        }
        auto& moves=moveBuffers.at(ply);legalInto(s.board,s.turn,quiet,false,s.kings[s.turn],moves,check);
        if(moves.empty()){if(!quiet)return -mate+ply;auto& probe=probeBuffers.at(ply);legalInto(s.board,s.turn,false,true,s.kings[s.turn],probe,check);if(probe.empty())return -mate+ply;}
        if(quiet){alpha=std::max(alpha,stand);if(qleft<=0||moves.empty())return alpha;}
        if(depth<=-6)return evaluate(s,s.turn)-(check?180:0);
        int hbase=s.turn==0?0:8100;
        auto order=[&](Move m){if(hasEntry&&entry.best==m)return 10000000.0;double v=priority(s,m);if(!s.board[m.to].live()){v+=history[hbase+m.index()];const auto& ks=killers.at(ply);if(std::find(ks.begin(),ks.end(),m)!=ks.end())v+=3000;}return v;};
        auto& scored=scoreBuffers.at(ply);scored.clear();scored.reserve(moves.size());
        for(Move m:moves)scored.push_back({m,order(m)});
        std::stable_sort(scored.begin(),scored.end(),[](const ScoredMove& a,const ScoredMove& b){return a.score>b.score;});
        for(size_t i=0;i<moves.size();i++)moves[i]=scored[i].move;
        Move best;bool first=true;
        auto save=[&](double score,int flag,Move m){if(hasKey&&cycleStart==s.cycles)s.table.store(key,{depth,flag,score>98000?score+ply:score< -98000?score-ply:score,m});};
        for(Move m:moves) {
            bool capture=s.board[m.to].live();Undo old=push(s,m);double v;
            try {
                if(first||!std::isfinite(alpha))v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft,extensions);
                else {v=-search(s,depth-1,-alpha-1,-alpha,ply+1,quiet?qleft-1:qleft,extensions);if(v>alpha&&v<beta)v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft,extensions);}
            }catch(...){pop(s,m,old);throw;}pop(s,m,old);first=false;
            if(v>=beta){if(!capture&&depth>0){auto& h=history[hbase+m.index()];h=std::min(uint32_t(2000),h+uint32_t(std::min(uint64_t(2000),uint64_t(depth)*uint64_t(depth))));auto& ks=killers.at(ply);if(std::find(ks.begin(),ks.end(),m)==ks.end())ks.insert(ks.begin(),m);if(ks.size()>2)ks.resize(2);}save(v,1,m);return v;}
            if(v>alpha){alpha=v;best=m;}
        }save(alpha,alpha<=originalAlpha?2:0,best);return alpha;
    }
};
void writeMove(Move m){if(m.from<0)std::cout<<"null";else std::cout<<"{\"from\":"<<m.from<<",\"to\":"<<m.to<<"}";}
void writeMoves(const std::vector<Move>& moves){std::cout<<'[';bool comma=false;for(auto m:moves){if(comma)std::cout<<',';comma=true;writeMove(m);}std::cout<<']';}
void writeRows(const std::vector<Row>& rows) {
    std::cout<<'[';bool comma=false;for(const Row& r:rows){if(comma)std::cout<<',';comma=true;
        std::cout<<"{\"from\":"<<r.move.from<<",\"to\":"<<r.move.to<<",\"score\":"<<r.score<<",\"spread\":"<<r.spread<<",\"heuristicWinRate\":"<<r.winRate<<",\"sampleWins\":"<<r.wins<<",\"sampleLosses\":"<<r.losses<<",\"repetitionCount\":"<<r.repetitions;std::cout<<",\"worldScores\":[";for(size_t i=0;i<r.worldScores.size();i++){if(i)std::cout<<',';std::cout<<r.worldScores[i];}std::cout<<']';if(r.draw)std::cout<<",\"draw\":true";if(r.repetitionLoss)std::cout<<",\"repetitionLoss\":true";std::cout<<'}';}
    std::cout<<']';
}
// Every root is publicly proved to lose by repetition or draw immediately.
// No sampled identity can change these already checked public outcomes.
bool adjudicatedRoots(const Packet& p,const std::vector<Move>& root,double elapsed){
#ifdef MIST_RULE_SHORTCUT_DISABLE
    (void)p;(void)root;(void)elapsed;return false;
#else
    if(root.empty())return false;for(Move m:root)if(!p.outcomes[m.index()])return false;
    const bool uncertain=std::any_of(p.view.begin(),p.view.end(),[](Piece p){return p.live()&&p.hidden;});std::vector<Row> rows;
    for(Move m:root){const bool loss=p.outcomes[m.index()]==2;Row r=summarize(m,std::vector<double>(p.worlds.size(),loss?-mate+1.0:0.0),uncertain);r.repetitions=p.repetitions[m.index()];r.repetitionLoss=loss;r.draw=!loss;rows.push_back(std::move(r));}
    std::stable_sort(rows.begin(),rows.end(),[](const Row& a,const Row& b){return a.score>b.score;});
    std::cout<<R"({"depth":1,"mainDepth":0,"completedDepth":0,"selDepth":0,"nodes":0,"visitedNodes":0,"statsExact":true,"searchStatus":"completed","terminationReason":"root-adjudication","adjudicated":true,"adjudicatedRootPlies":1,"threads":0,"ttBudgetBytes":67108864,"ttAllocatedBytes":0,"ttDenied":0,"completedIterations":0,"iterationsTruncated":false,"safetyCutoffs":0,"interruptedDepth":0,"samples":)"<<p.worlds.size()<<R"(,"elapsedMs":)"<<elapsed<<R"(,"score":)"<<rows.front().score<<R"(,"move":)";writeMove(rows.front().move);std::cout<<R"(,"allCandidates":)";writeRows(rows);std::cout<<R"(,"iterations":[]})"<<'\n';return true;
#endif
}

void runDarkMesh(const Packet& p) {
    TTArena arena;TTScope scope(arena);Search s;s.start=std::chrono::steady_clock::now();s.nodeLimit=p.nodeLimit;s.limit=p.budget-std::min(35.0,p.budget*.10);
    // Root only uses public roles. Unknown true identities are never read here.
    Board rootBoard=p.view;auto root=legal(rootBoard,p.turn);if(terminalRoot(p,root))return;
    if(root.empty()){std::cout<<"{\"depth\":0,\"mainDepth\":0,\"selDepth\":0,\"completedDepth\":0,\"visitedNodes\":0,\"statsExact\":true,\"searchStatus\":\"completed\",\"terminationReason\":\"terminal\",\"nodes\":0,\"samples\":0,\"score\":-99999,\"move\":null,\"terminal\":true,\"elapsedMs\":"<<s.elapsed()<<",\"allCandidates\":[],\"iterations\":[]}\n";return;}
    State rootContext;rootContext.board=p.view;rootContext.turn=p.turn;
    for(int side:{0,1}){auto bag=remaining(p.view,p.captured,side);rootContext.poolCount[side]=int(bag.size());for(int t:bag)rootContext.poolValue[side]+=value[t];}
    std::array<double,8100> reveal{};for(auto m:root)reveal[m.index()]=revealOrder(rootContext,p.captured,m);
    std::stable_sort(root.begin(),root.end(),[&](Move a,Move b){return priority(rootContext,a)+reveal[a.index()]>priority(rootContext,b)+reveal[b.index()];});if(adjudicatedRoots(p,root,s.elapsed()))return;
    bool uncertain=false;for(auto q:p.view)uncertain|=q.live()&&q.hidden;
    for(const Board& b:p.worlds)s.worlds.push_back(gameState(b,p));
    for(auto& w:s.worlds)w.table.configure(s.worlds.size());
    std::vector<Iteration> iterations;int interrupted=0,currentDepth=0;Move fallback=root[0];
    const bool parallel=p.nodeLimit==0&&s.worlds.size()>1;
    const size_t lanes=parallel?std::min(size_t(MIST_MESH_LANES),s.worlds.size()):1;
    std::vector<Search> workers(parallel?s.worlds.size():0);
    for(auto& worker:workers){worker.start=s.start;worker.limit=s.limit;}
std::unique_ptr<RequestWorkers> pool;if(parallel)pool=std::make_unique<RequestWorkers>(lanes);
    bool jobsActive=false;double lastTelemetry=-100,lastProgress=-100;uint64_t completedIterations=0;bool iterationsTruncated=false;
    auto telemetry=[&](){
        if(p.mode!="STREAM"||s.elapsed()-lastTelemetry<50)return;
        lastTelemetry=s.elapsed();uint64_t seen=s.nodes;int deepest=s.selDepth;
        if(parallel&&jobsActive){seen=0;for(auto& w:workers){seen+=w.publishedNodes.load(std::memory_order_relaxed);deepest=std::max(deepest,w.publishedSelDepth.load(std::memory_order_relaxed));}}
        std::cout<<"{\"telemetry\":{\"mainDepth\":"<<currentDepth<<",\"selDepth\":"<<deepest<<",\"completedDepth\":"<<(iterations.empty()?0:iterations.back().depth)<<",\"visitedNodes\":"<<seen<<",\"elapsedMs\":"<<s.elapsed()<<",\"statsExact\":false,\"searchStatus\":\"searching\"}}\n"<<std::flush;
    };
    if(!parallel&&p.mode=="STREAM")s.poll=telemetry;
    // Root x world ready queue. A world has at most one active task, and retains
// the exact original root order, private State, TT, history and search buffers.
auto parallelIteration=[&](int childDepth){
    const size_t count=s.worlds.size();
    std::vector<std::vector<double>> scores(root.size(),std::vector<double>(count,std::numeric_limits<double>::quiet_NaN()));
    std::vector<size_t> next(count,0);std::vector<bool> active(count,false);
    std::deque<size_t> ready;std::mutex mutex;std::condition_variable changed;
    size_t remaining=count;std::atomic<bool> cancelled{false};std::exception_ptr error;
    auto advance=[&](size_t w){while(next[w]<root.size()&&p.outcomes[root[next[w]].index()])next[w]++;};
    for(size_t w=0;w<count;w++){advance(w);if(next[w]<root.size())ready.push_back(w);else remaining--;}
    std::vector<std::future<void>> tasks;tasks.reserve(lanes);
    for(auto& worker:workers)worker.cancel=&cancelled;
    auto fail=[&](std::exception_ptr e){{std::lock_guard<std::mutex> lock(mutex);if(!error)error=e;cancelled.store(true,std::memory_order_relaxed);}changed.notify_all();};
    jobsActive=true;
    try{for(size_t lane=0;lane<lanes;lane++)tasks.push_back(pool->submit([&]{
        for(;;){size_t w,r;
            {std::unique_lock<std::mutex> lock(mutex);changed.wait(lock,[&]{return cancelled.load(std::memory_order_relaxed)||!ready.empty()||remaining==0;});
                if(cancelled.load(std::memory_order_relaxed)||remaining==0)return;
                w=ready.front();ready.pop_front();if(w>=count){lock.unlock();fail(std::make_exception_ptr(std::logic_error("mesh invalid world")));return;}r=next[w];
                if(r>=root.size()||active[w]){lock.unlock();fail(std::make_exception_ptr(std::logic_error("mesh duplicate or invalid task")));return;}
                active[w]=true;
            }
            try{
                State& state=s.worlds[w];Search& worker=workers[w];
                if(cancelled.load(std::memory_order_relaxed)||worker.elapsed()>worker.limit)throw Timeout{};
                const Move m=root[r];Undo old=push(state,m);
                double score;try{
#ifdef MIST_MESH_FAULT
if(w==0&&r==1&&childDepth==2){
#if MIST_MESH_FAULT==1
throw Timeout{};
#else
throw std::runtime_error("injected mesh failure");
#endif
}
#endif
score=-worker.search(state,childDepth,-inf,inf,1);}catch(...){pop(state,m,old);throw;}
                pop(state,m,old);scores[r][w]=score;
                bool finished;{std::lock_guard<std::mutex> lock(mutex);active[w]=false;next[w]++;advance(w);if(next[w]<root.size())ready.push_back(w);else remaining--;finished=remaining==0;}
                if(finished)changed.notify_all();else changed.notify_one();
            }catch(...){
                {std::lock_guard<std::mutex> lock(mutex);active[w]=false;}
                fail(std::current_exception());return;
            }
        }
    }));}catch(...){fail(std::current_exception());}
    for(auto& task:tasks)try{while(task.wait_for(std::chrono::milliseconds(5))!=std::future_status::ready){try{telemetry();}catch(...){fail(std::current_exception());}}task.get();}catch(...){fail(std::current_exception());}
    for(auto& worker:workers)worker.cancel=nullptr;
    s.nodes=0;s.safetyCutoffs=0;for(const auto& worker:workers){s.nodes+=worker.nodes;s.selDepth=std::max(s.selDepth,worker.selDepth);s.safetyCutoffs+=worker.safetyCutoffs;}
    jobsActive=false;if(error)std::rethrow_exception(error);
    if(remaining!=0||std::find(active.begin(),active.end(),true)!=active.end())throw std::logic_error("mesh incomplete iteration");
    for(size_t r=0;r<root.size();r++)if(!p.outcomes[root[r].index()])for(double v:scores[r])if(!std::isfinite(v))throw std::logic_error("mesh missing score");
    return scores;
};
    for(int depth=1;p.depth==0||depth<=p.depth;depth++) {
        currentDepth=depth;telemetry();
        if(depth==std::numeric_limits<int>::max()-1){s.safetyCutoffs++;break;}
        std::vector<Row> rows;
        try {std::vector<std::vector<double>> matrix;if(parallel)matrix=parallelIteration(depth-1);for(size_t rootIndex=0;rootIndex<root.size();rootIndex++){Move m=root[rootIndex];Row row;if(p.outcomes[m.index()]){const bool loss=p.outcomes[m.index()]==2;row=summarize(m,{loss?-mate+1.0:0.0},uncertain);row.draw=!loss;row.repetitionLoss=loss;}else{std::vector<double> scores;if(parallel){scores=std::move(matrix[rootIndex]);}else for(State& w:s.worlds){if(s.elapsed()>s.limit)throw Timeout{};Undo old=push(w,m);double v;try{v=-s.search(w,depth-1,-inf,inf,1);}catch(...){pop(w,m,old);throw;}pop(w,m,old);scores.push_back(v);}row=summarize(m,scores,uncertain);}row.repetitions=p.repetitions[m.index()];rows.push_back(row);}}
        catch(const Timeout&){interrupted=depth;break;}
        std::stable_sort(rows.begin(),rows.end(),[](const Row& a,const Row& b){return a.score>b.score;});
        iterations.push_back({depth,s.nodes,s.elapsed(),rows});completedIterations++;
        if(iterations.size()>64){iterations.erase(iterations.begin());iterationsTruncated=true;}
        // Stream only after every root move has completed in every sampled world.
        if(p.mode=="STREAM"&&(p.depth>0||completedIterations==1||s.elapsed()-lastProgress>=50)) {
            lastProgress=s.elapsed();
            std::cout<<"{\"progress\":true,\"result\":{\"depth\":"<<depth<<",\"nodes\":"<<s.nodes<<",\"samples\":"<<p.worlds.size()<<",\"elapsedMs\":"<<iterations.back().elapsed<<",\"threads\":"<<lanes<<",\"score\":"<<rows[0].score<<",\"move\":";writeMove(rows[0].move);
            std::cout<<",\"mainDepth\":"<<depth<<",\"completedDepth\":"<<depth<<",\"selDepth\":"<<s.selDepth<<",\"visitedNodes\":"<<s.nodes<<",\"statsExact\":true,\"searchStatus\":\"searching\",\"allCandidates\":";writeRows(rows);std::cout<<"}}\n"<<std::flush;
        }
        if(s.safetyCutoffs||(!uncertain&&std::abs(rows[0].score)>98000)||s.elapsed()>s.limit)break;
        std::array<int,8100> rank{};for(size_t i=0;i<rows.size();i++)rank[rows[i].move.index()]=int(i);
        std::stable_sort(root.begin(),root.end(),[&](Move a,Move b){return rank[a.index()]<rank[b.index()];});
    }
    pool.reset();
    #ifdef MIST_VERIFY_RESTORE
    // Check every sampled state after normal return and after timeout unwinding.
    for(size_t i=0;i<s.worlds.size();i++) {
        const State expected=gameState(p.worlds[i],p);const State& w=s.worlds[i];
        if(!(w.board==expected.board&&w.key()==expected.key()&&w.path==expected.path&&w.positions==expected.positions&&w.historyStart==expected.historyStart&&w.historyDigest==expected.historyDigest&&w.quiet==expected.quiet&&w.gamePly==expected.gamePly&&w.pub1==expected.pub1&&w.pub2==expected.pub2&&w.population==expected.population&&w.kings[0]==expected.kings[0]&&w.kings[1]==expected.kings[1]))throw std::runtime_error("sample state not restored");
    }
#endif
    double elapsed=s.elapsed();const Iteration* last=iterations.empty()?nullptr:&iterations.back();
    std::cout<<"{\"depth\":"<<(last?last->depth:0)<<",\"nodes\":"<<s.nodes<<",\"samples\":"<<p.worlds.size()<<",\"elapsedMs\":"<<elapsed<<",\"interruptedDepth\":"<<interrupted<<",\"score\":"<<(last?last->rows[0].score:0)<<",\"move\":";writeMove(last?last->rows[0].move:fallback);
    const char* reason=s.safetyCutoffs?"stack-safety":interrupted?(p.nodeLimit&&s.nodes>p.nodeLimit?"node-limit":"time-budget"):s.elapsed()>s.limit?"time-budget":last&&!uncertain&&std::abs(last->rows[0].score)>98000?"terminal":"depth-limit";
    std::cout<<",\"ttBudgetBytes\":"<<TTArena::budget<<",\"ttAllocatedBytes\":"<<arena.used.load()<<",\"ttDenied\":"<<arena.denied.load();std::cout<<",\"mainDepth\":"<<currentDepth<<",\"completedDepth\":"<<(last?last->depth:0)<<",\"selDepth\":"<<s.selDepth<<",\"visitedNodes\":"<<s.nodes<<",\"statsExact\":true,\"completedIterations\":"<<completedIterations<<",\"iterationsTruncated\":"<<(iterationsTruncated?"true":"false")<<",\"safetyCutoffs\":"<<s.safetyCutoffs<<",\"terminationReason\":\""<<reason<<"\",\"searchStatus\":\""<<(interrupted||s.elapsed()>s.limit?"time-budget":"completed")<<"\",\"threads\":"<<lanes;std::cout<<",\"allCandidates\":";writeRows(last?last->rows:std::vector<Row>{});std::cout<<",\"iterations\":[";
    if(p.mode!="STREAM")for(size_t i=0;i<iterations.size();i++){if(i)std::cout<<',';const auto& r=iterations[i];std::cout<<"{\"depth\":"<<r.depth<<",\"nodes\":"<<r.nodes<<",\"elapsedMs\":"<<r.elapsed<<",\"allCandidates\":";writeRows(r.rows);std::cout<<'}';}
    std::cout<<"]}\n";
}

void runLegacy(const Packet& p) {
    TTArena arena;TTScope scope(arena);Search s;s.start=std::chrono::steady_clock::now();s.nodeLimit=p.nodeLimit;s.limit=p.budget-std::min(35.0,p.budget*.10);
    // Root only uses public roles. Unknown true identities are never read here.
    Board rootBoard=p.view;auto root=legal(rootBoard,p.turn);if(terminalRoot(p,root))return;
    if(root.empty()){std::cout<<"{\"depth\":0,\"mainDepth\":0,\"selDepth\":0,\"completedDepth\":0,\"visitedNodes\":0,\"statsExact\":true,\"searchStatus\":\"completed\",\"terminationReason\":\"terminal\",\"nodes\":0,\"samples\":0,\"score\":-99999,\"move\":null,\"terminal\":true,\"elapsedMs\":"<<s.elapsed()<<",\"allCandidates\":[],\"iterations\":[]}\n";return;}
    State rootContext;rootContext.board=p.view;rootContext.turn=p.turn;
    for(int side:{0,1}){auto bag=remaining(p.view,p.captured,side);rootContext.poolCount[side]=int(bag.size());for(int t:bag)rootContext.poolValue[side]+=value[t];}
    std::array<double,8100> reveal{};for(auto m:root)reveal[m.index()]=revealOrder(rootContext,p.captured,m);
    std::stable_sort(root.begin(),root.end(),[&](Move a,Move b){return priority(rootContext,a)+reveal[a.index()]>priority(rootContext,b)+reveal[b.index()];});if(adjudicatedRoots(p,root,s.elapsed()))return;
    bool uncertain=false;for(auto q:p.view)uncertain|=q.live()&&q.hidden;
    for(const Board& b:p.worlds)s.worlds.push_back(gameState(b,p));
    for(auto& w:s.worlds)w.table.configure(s.worlds.size());
    std::vector<Iteration> iterations;int interrupted=0,currentDepth=0;Move fallback=root[0];
    const bool parallel=p.nodeLimit==0&&s.worlds.size()>1;
    const size_t lanes=parallel?std::min(size_t(4),s.worlds.size()):1;
    std::vector<Search> workers(parallel?s.worlds.size():0);
    for(auto& worker:workers){worker.start=s.start;worker.limit=s.limit;}
std::unique_ptr<RequestWorkers> pool;if(parallel)pool=std::make_unique<RequestWorkers>(lanes);
    bool jobsActive=false;double lastTelemetry=-100,lastProgress=-100;uint64_t completedIterations=0;bool iterationsTruncated=false;
    auto telemetry=[&](){
        if(p.mode!="STREAM"||s.elapsed()-lastTelemetry<50)return;
        lastTelemetry=s.elapsed();uint64_t seen=s.nodes;int deepest=s.selDepth;
        if(parallel&&jobsActive){seen=0;for(auto& w:workers){seen+=w.publishedNodes.load(std::memory_order_relaxed);deepest=std::max(deepest,w.publishedSelDepth.load(std::memory_order_relaxed));}}
        std::cout<<"{\"telemetry\":{\"mainDepth\":"<<currentDepth<<",\"selDepth\":"<<deepest<<",\"completedDepth\":"<<(iterations.empty()?0:iterations.back().depth)<<",\"visitedNodes\":"<<seen<<",\"elapsedMs\":"<<s.elapsed()<<",\"statsExact\":false,\"searchStatus\":\"searching\"}}\n"<<std::flush;
    };
    if(!parallel&&p.mode=="STREAM")s.poll=telemetry;
    auto parallelScores=[&](Move m,int childDepth) {
        std::vector<double> scores(s.worlds.size());std::vector<std::future<void>> tasks;std::exception_ptr error;std::atomic<size_t> nextWorld{0};jobsActive=true;try{
        for(size_t lane=0;lane<lanes;lane++)tasks.push_back(pool->submit([&]{
            for(size_t world=nextWorld.fetch_add(1,std::memory_order_relaxed);world<s.worlds.size();world=nextWorld.fetch_add(1,std::memory_order_relaxed)){
                State& w=s.worlds[world];if(workers[world].elapsed()>workers[world].limit)throw Timeout{};Undo old=push(w,m);
                try{scores[world]=-workers[world].search(w,childDepth,-inf,inf,1);}catch(...){pop(w,m,old);throw;}
                pop(w,m,old);
            }
        }));
        }catch(...){error=std::current_exception();}for(auto& task:tasks)try{while(task.wait_for(std::chrono::milliseconds(5))!=std::future_status::ready)telemetry();task.get();}catch(...){if(!error)error=std::current_exception();}
        s.nodes=0;s.safetyCutoffs=0;for(const auto& worker:workers){s.nodes+=worker.nodes;s.selDepth=std::max(s.selDepth,worker.selDepth);s.safetyCutoffs+=worker.safetyCutoffs;}jobsActive=false;
        if(error)std::rethrow_exception(error);return scores;
    };
    for(int depth=1;p.depth==0||depth<=p.depth;depth++) {
        currentDepth=depth;telemetry();
        if(depth==std::numeric_limits<int>::max()-1){s.safetyCutoffs++;break;}
        std::vector<Row> rows;
        try {for(Move m:root){Row row;if(p.outcomes[m.index()]){const bool loss=p.outcomes[m.index()]==2;row=summarize(m,{loss?-mate+1.0:0.0},uncertain);row.draw=!loss;row.repetitionLoss=loss;}else{std::vector<double> scores;if(parallel){scores=parallelScores(m,depth-1);}else for(State& w:s.worlds){if(s.elapsed()>s.limit)throw Timeout{};Undo old=push(w,m);double v;try{v=-s.search(w,depth-1,-inf,inf,1);}catch(...){pop(w,m,old);throw;}pop(w,m,old);scores.push_back(v);}row=summarize(m,scores,uncertain);}row.repetitions=p.repetitions[m.index()];rows.push_back(row);}}
        catch(const Timeout&){interrupted=depth;break;}
        std::stable_sort(rows.begin(),rows.end(),[](const Row& a,const Row& b){return a.score>b.score;});
        iterations.push_back({depth,s.nodes,s.elapsed(),rows});completedIterations++;
        if(iterations.size()>64){iterations.erase(iterations.begin());iterationsTruncated=true;}
        // Stream only after every root move has completed in every sampled world.
        if(p.mode=="STREAM"&&(p.depth>0||completedIterations==1||s.elapsed()-lastProgress>=50)) {
            lastProgress=s.elapsed();
            std::cout<<"{\"progress\":true,\"result\":{\"depth\":"<<depth<<",\"nodes\":"<<s.nodes<<",\"samples\":"<<p.worlds.size()<<",\"elapsedMs\":"<<iterations.back().elapsed<<",\"threads\":"<<lanes<<",\"score\":"<<rows[0].score<<",\"move\":";writeMove(rows[0].move);
            std::cout<<",\"mainDepth\":"<<depth<<",\"completedDepth\":"<<depth<<",\"selDepth\":"<<s.selDepth<<",\"visitedNodes\":"<<s.nodes<<",\"statsExact\":true,\"searchStatus\":\"searching\",\"allCandidates\":";writeRows(rows);std::cout<<"}}\n"<<std::flush;
        }
        if(s.safetyCutoffs||(!uncertain&&std::abs(rows[0].score)>98000)||s.elapsed()>s.limit)break;
        std::array<int,8100> rank{};for(size_t i=0;i<rows.size();i++)rank[rows[i].move.index()]=int(i);
        std::stable_sort(root.begin(),root.end(),[&](Move a,Move b){return rank[a.index()]<rank[b.index()];});
    }
    pool.reset();
    #ifdef MIST_VERIFY_RESTORE
    // Check every sampled state after normal return and after timeout unwinding.
    for(size_t i=0;i<s.worlds.size();i++) {
        const State expected=gameState(p.worlds[i],p);const State& w=s.worlds[i];
        if(!(w.board==expected.board&&w.key()==expected.key()&&w.path==expected.path&&w.positions==expected.positions&&w.historyStart==expected.historyStart&&w.historyDigest==expected.historyDigest&&w.quiet==expected.quiet&&w.gamePly==expected.gamePly&&w.pub1==expected.pub1&&w.pub2==expected.pub2&&w.population==expected.population&&w.kings[0]==expected.kings[0]&&w.kings[1]==expected.kings[1]))throw std::runtime_error("sample state not restored");
    }
#endif
    double elapsed=s.elapsed();const Iteration* last=iterations.empty()?nullptr:&iterations.back();
    std::cout<<"{\"depth\":"<<(last?last->depth:0)<<",\"nodes\":"<<s.nodes<<",\"samples\":"<<p.worlds.size()<<",\"elapsedMs\":"<<elapsed<<",\"interruptedDepth\":"<<interrupted<<",\"score\":"<<(last?last->rows[0].score:0)<<",\"move\":";writeMove(last?last->rows[0].move:fallback);
    const char* reason=s.safetyCutoffs?"stack-safety":interrupted?(p.nodeLimit&&s.nodes>p.nodeLimit?"node-limit":"time-budget"):s.elapsed()>s.limit?"time-budget":last&&!uncertain&&std::abs(last->rows[0].score)>98000?"terminal":"depth-limit";
    std::cout<<",\"ttBudgetBytes\":"<<TTArena::budget<<",\"ttAllocatedBytes\":"<<arena.used.load()<<",\"ttDenied\":"<<arena.denied.load();std::cout<<",\"mainDepth\":"<<currentDepth<<",\"completedDepth\":"<<(last?last->depth:0)<<",\"selDepth\":"<<s.selDepth<<",\"visitedNodes\":"<<s.nodes<<",\"statsExact\":true,\"completedIterations\":"<<completedIterations<<",\"iterationsTruncated\":"<<(iterationsTruncated?"true":"false")<<",\"safetyCutoffs\":"<<s.safetyCutoffs<<",\"terminationReason\":\""<<reason<<"\",\"searchStatus\":\""<<(interrupted||s.elapsed()>s.limit?"time-budget":"completed")<<"\",\"threads\":"<<lanes;std::cout<<",\"allCandidates\":";writeRows(last?last->rows:std::vector<Row>{});std::cout<<",\"iterations\":[";
    if(p.mode!="STREAM")for(size_t i=0;i<iterations.size();i++){if(i)std::cout<<',';const auto& r=iterations[i];std::cout<<"{\"depth\":"<<r.depth<<",\"nodes\":"<<r.nodes<<",\"elapsedMs\":"<<r.elapsed<<",\"allCandidates\":";writeRows(r.rows);std::cout<<'}';}
    std::cout<<"]}\n";
}
#ifndef MIST_ROOT_LANES
#define MIST_ROOT_LANES 4
#endif
static_assert(MIST_ROOT_LANES>=1&&MIST_ROOT_LANES<=4,"invalid root lanes");
State stateInArena(TTArena& arena,const Packet& p){TTScope scope(arena);return gameState(p.worlds[0],p);}
struct PrivateRoot {
    std::unique_ptr<TTArena> arena;State state;Search search;Move move;
    PrivateRoot(const Packet& p,Move m,size_t partitions,std::chrono::steady_clock::time_point start,double limit):
        arena(std::make_unique<TTArena>((TTArena::budget/partitions/64)*64)),state(stateInArena(*arena,p)),move(m){
        if(state.table.map.get_allocator().arena!=arena.get())throw std::logic_error("private TT allocator binding");state.table.entryLimit=std::max(size_t(1),size_t(90000)/partitions);search.start=start;search.limit=limit;
    }
};
void runBright(const Packet& p){
    if(p.worlds.size()!=1||p.nodeLimit||std::any_of(p.view.begin(),p.view.end(),[](Piece v){return v.live()&&v.hidden;})){runLegacy(p);return;}
    const auto start=std::chrono::steady_clock::now();Search controller;controller.start=start;controller.limit=p.budget-std::min(35.0,p.budget*.10);
    Board rootBoard=p.view;auto root=legal(rootBoard,p.turn);if(terminalRoot(p,root))return;
    // Allocation guard only: unusual oversized boards still receive full legacy search.
    if(root.size()<2||root.size()>256){runLegacy(p);return;}
    State publicContext;publicContext.board=p.view;publicContext.turn=p.turn;
    for(int side:{0,1}){auto bag=remaining(p.view,p.captured,side);publicContext.poolCount[side]=int(bag.size());for(int t:bag)publicContext.poolValue[side]+=value[t];}
    std::stable_sort(root.begin(),root.end(),[&](Move a,Move b){return priority(publicContext,a)>priority(publicContext,b);});if(adjudicatedRoots(p,root,controller.elapsed()))return;
    std::vector<std::unique_ptr<PrivateRoot>> contexts;contexts.reserve(root.size());std::array<int,8100> identity;identity.fill(-1);
    for(Move m:root){identity[m.index()]=int(contexts.size());contexts.push_back(std::make_unique<PrivateRoot>(p,m,root.size(),start,controller.limit));}
    const size_t lanes=std::min(size_t(MIST_ROOT_LANES),root.size());std::atomic<bool> cancelled{false};
    for(auto& c:contexts)c->search.cancel=&cancelled;
    std::unique_ptr<RequestWorkers> pool=std::make_unique<RequestWorkers>(lanes);
    std::vector<Iteration> iterations;int currentDepth=0,interrupted=0;uint64_t completedIterations=0;bool iterationsTruncated=false,jobsActive=false;
    double lastTelemetry=-100,lastProgress=-100;const Move fallback=root[0];
    auto syncStats=[&]{controller.nodes=0;controller.safetyCutoffs=0;for(const auto& c:contexts){controller.nodes+=c->search.nodes;controller.selDepth=std::max(controller.selDepth,c->search.selDepth);controller.safetyCutoffs+=c->search.safetyCutoffs;}};
    auto telemetry=[&]{if(p.mode!="STREAM"||controller.elapsed()-lastTelemetry<50)return;lastTelemetry=controller.elapsed();uint64_t nodes=controller.nodes;int deepest=controller.selDepth;
        if(jobsActive){nodes=0;for(const auto& c:contexts){nodes+=c->search.publishedNodes.load(std::memory_order_relaxed);deepest=std::max(deepest,c->search.publishedSelDepth.load(std::memory_order_relaxed));}}
        std::cout<<"{\"telemetry\":{\"mainDepth\":"<<currentDepth<<",\"selDepth\":"<<deepest<<",\"completedDepth\":"<<(iterations.empty()?0:iterations.back().depth)<<",\"visitedNodes\":"<<nodes<<",\"elapsedMs\":"<<controller.elapsed()<<",\"statsExact\":false,\"searchStatus\":\"searching\"}}\n"<<std::flush;
    };
    auto iteration=[&](int childDepth){
        std::vector<Row> rows(root.size());std::vector<uint8_t> done(root.size(),0);std::atomic<size_t> next{0};std::mutex errorMutex;std::exception_ptr error;
        std::vector<std::future<void>> tasks;tasks.reserve(lanes);cancelled.store(false,std::memory_order_relaxed);jobsActive=true;
        auto fail=[&](std::exception_ptr e){std::lock_guard<std::mutex> lock(errorMutex);if(!error)error=e;cancelled.store(true,std::memory_order_relaxed);};
        try{for(size_t lane=0;lane<lanes;lane++)tasks.push_back(pool->submit([&]{
            for(size_t r=next.fetch_add(1,std::memory_order_relaxed);r<root.size();r=next.fetch_add(1,std::memory_order_relaxed)){
                if(cancelled.load(std::memory_order_relaxed))return;
                try{const Move m=root[r];Row row;
                    if(p.outcomes[m.index()]){const bool loss=p.outcomes[m.index()]==2;row=summarize(m,{loss?-mate+1.0:0.0},false);row.draw=!loss;row.repetitionLoss=loss;}
                    else {const int id=identity[m.index()];if(id<0||size_t(id)>=contexts.size())throw std::logic_error("invalid private root identity");PrivateRoot& c=*contexts[size_t(id)];if(!(c.move==m))throw std::logic_error("private root identity drift");if(c.search.elapsed()>c.search.limit)throw Timeout{};
                        Undo old=push(c.state,m);double score;try{
#ifdef MIST_ROOT_FAULT
if(r==1&&childDepth==2){
#if MIST_ROOT_FAULT==1
throw Timeout{};
#else
throw std::runtime_error("injected private root failure");
#endif
}
#endif
score=-c.search.search(c.state,childDepth,-inf,inf,1);}catch(...){pop(c.state,m,old);throw;}pop(c.state,m,old);if(!std::isfinite(score))throw std::logic_error("nonfinite private root score");row=summarize(m,{score},false);
                    }
                    row.repetitions=p.repetitions[m.index()];rows[r]=std::move(row);done[r]=1;
                }catch(...){fail(std::current_exception());return;}
            }
        }));}catch(...){fail(std::current_exception());}
        for(auto& task:tasks)try{while(task.wait_for(std::chrono::milliseconds(5))!=std::future_status::ready){try{telemetry();}catch(...){fail(std::current_exception());}}task.get();}catch(...){fail(std::current_exception());}
        syncStats();jobsActive=false;if(error)std::rethrow_exception(error);if(std::find(done.begin(),done.end(),0)!=done.end())throw std::logic_error("incomplete private root iteration");return rows;
    };
    for(int depth=1;p.depth==0||depth<=p.depth;depth++){
        currentDepth=depth;telemetry();if(depth==std::numeric_limits<int>::max()-1){controller.safetyCutoffs++;break;}
        std::vector<Row> rows;try{rows=iteration(depth-1);}catch(const Timeout&){interrupted=depth;break;}
        std::stable_sort(rows.begin(),rows.end(),[](const Row& a,const Row& b){return a.score>b.score;});
        iterations.push_back({depth,controller.nodes,controller.elapsed(),rows});completedIterations++;if(iterations.size()>64){iterations.erase(iterations.begin());iterationsTruncated=true;}
        if(p.mode=="STREAM"&&(p.depth>0||completedIterations==1||controller.elapsed()-lastProgress>=50)){lastProgress=controller.elapsed();
            std::cout<<"{\"progress\":true,\"result\":{\"depth\":"<<depth<<",\"nodes\":"<<controller.nodes<<",\"samples\":1,\"elapsedMs\":"<<controller.elapsed()<<",\"threads\":"<<lanes<<",\"score\":"<<rows[0].score<<",\"move\":";writeMove(rows[0].move);
            std::cout<<",\"mainDepth\":"<<depth<<",\"completedDepth\":"<<depth<<",\"selDepth\":"<<controller.selDepth<<",\"visitedNodes\":"<<controller.nodes<<",\"statsExact\":true,\"searchStatus\":\"searching\",\"allCandidates\":";writeRows(rows);std::cout<<"}}\n"<<std::flush;
        }
        if(controller.safetyCutoffs||std::abs(rows[0].score)>98000||controller.elapsed()>controller.limit)break;
        std::array<int,8100> rank{};for(size_t i=0;i<rows.size();i++)rank[rows[i].move.index()]=int(i);std::stable_sort(root.begin(),root.end(),[&](Move a,Move b){return rank[a.index()]<rank[b.index()];});
    }
    pool.reset();for(auto& c:contexts)c->search.cancel=nullptr;
#ifdef MIST_VERIFY_RESTORE
    for(const auto& c:contexts){const State expected=gameState(p.worlds[0],p);const State& w=c->state;if(!(w.board==expected.board&&w.key()==expected.key()&&w.path==expected.path&&w.positions==expected.positions&&w.historyStart==expected.historyStart&&w.historyDigest==expected.historyDigest&&w.quiet==expected.quiet&&w.gamePly==expected.gamePly&&w.pub1==expected.pub1&&w.pub2==expected.pub2&&w.population==expected.population&&w.kings[0]==expected.kings[0]&&w.kings[1]==expected.kings[1]))throw std::logic_error("private root state not restored");}
#endif
    size_t allocated=0,denied=0;for(const auto& c:contexts){allocated+=c->arena->used.load();denied+=c->arena->denied.load();}
    const Iteration* last=iterations.empty()?nullptr:&iterations.back();const char* reason=controller.safetyCutoffs?"stack-safety":interrupted?"time-budget":last&&std::abs(last->rows[0].score)>98000?"terminal":controller.elapsed()>controller.limit?"time-budget":"depth-limit";
    std::cout<<"{\"depth\":"<<(last?last->depth:0)<<",\"mainDepth\":"<<currentDepth<<",\"completedDepth\":"<<(last?last->depth:0)<<",\"selDepth\":"<<controller.selDepth<<",\"nodes\":"<<controller.nodes<<",\"visitedNodes\":"<<controller.nodes<<",\"statsExact\":true,\"samples\":1,\"elapsedMs\":"<<controller.elapsed()<<",\"interruptedDepth\":"<<interrupted<<",\"score\":"<<(last?last->rows[0].score:0)<<",\"move\":";writeMove(last?last->rows[0].move:fallback);
    std::cout<<",\"threads\":"<<lanes<<",\"ttBudgetBytes\":"<<TTArena::budget<<",\"ttAllocatedBytes\":"<<allocated<<",\"ttDenied\":"<<denied<<",\"rootPartitioned\":true,\"rootContexts\":"<<contexts.size()<<",\"rootTTEntriesEach\":"<<contexts[0]->state.table.entryLimit<<",\"completedIterations\":"<<completedIterations<<",\"iterationsTruncated\":"<<(iterationsTruncated?"true":"false")<<",\"safetyCutoffs\":"<<controller.safetyCutoffs<<",\"terminationReason\":\""<<reason<<"\",\"searchStatus\":\""<<(interrupted||controller.elapsed()>controller.limit?"time-budget":"completed")<<"\",\"allCandidates\":";writeRows(last?last->rows:std::vector<Row>{});std::cout<<",\"iterations\":[";
    if(p.mode!="STREAM")for(size_t i=0;i<iterations.size();i++){if(i)std::cout<<',';const auto& r=iterations[i];std::cout<<"{\"depth\":"<<r.depth<<",\"nodes\":"<<r.nodes<<",\"elapsedMs\":"<<r.elapsed<<",\"allCandidates\":";writeRows(r.rows);std::cout<<'}';}std::cout<<"]}\n";
}

// Own local two-ply root split. Bounds never cross a root or sampled world.
struct FrontierGroup {
    Move root;std::vector<Move> replies;std::vector<size_t> contexts;size_t fallback=0,first=0;bool terminal=false;double terminalScore=0;
};
State childState(const Packet& p,Move root){State s=gameState(p.worlds[0],p);push(s,root);return s;}
bool childTerminal(State& s,double& score){
    auto ms=legal(s.board,s.turn);if(ms.empty()){score=-mate+1;return true;}
    int previous=0;for(size_t i=s.historyStart;i<s.positions.size();i++)previous+=s.positions[i]==s.position();
    if(previous>=2){score=mate-1;return true;}if(s.quiet>=120||s.gamePly>=400){score=0;return true;}return false;
}
void runFrontier(const Packet& p){
    Board b=p.view;auto roots=legal(b,p.turn);
    if(p.worlds.size()!=1||p.nodeLimit||roots.empty()||roots.size()>3||std::any_of(p.view.begin(),p.view.end(),[](Piece v){return v.live()&&v.hidden;})){runBright(p);return;}
    if(terminalRoot(p,roots))return;
    const auto start=std::chrono::steady_clock::now();Search controller;controller.start=start;controller.limit=p.budget-std::min(35.0,p.budget*.10);if(adjudicatedRoots(p,roots,controller.elapsed()))return;
    std::vector<FrontierGroup> groups;size_t partitions=roots.size();
    for(Move m:roots){FrontierGroup g;g.root=m;State s=childState(p,m);g.terminal=childTerminal(s,g.terminalScore);if(!g.terminal){g.replies=legal(s.board,s.turn);std::stable_sort(g.replies.begin(),g.replies.end(),[&](Move a,Move b){return priority(s,a)>priority(s,b);});partitions+=g.replies.size();}groups.push_back(std::move(g));}
    if(partitions>512){runBright(p);return;}
    std::vector<std::unique_ptr<PrivateRoot>> contexts;contexts.reserve(partitions);
    for(auto& g:groups){g.fallback=contexts.size();contexts.push_back(std::make_unique<PrivateRoot>(p,g.root,partitions,start,controller.limit));
        for(Move reply:g.replies){g.contexts.push_back(contexts.size());contexts.push_back(std::make_unique<PrivateRoot>(p,g.root,partitions,start,controller.limit));State& s=contexts.back()->state;push(s,g.root);s.positions.push_back(s.position());s.historyDigest+=positionDigest(s.position());push(s,reply);}
    }
    const size_t lanes=std::min(size_t(MIST_ROOT_LANES),partitions);std::atomic<bool> cancelled{false};for(auto& c:contexts)c->search.cancel=&cancelled;
    auto pool=std::make_unique<RequestWorkers>(lanes);uint64_t splitNodes=0,completed=0;int currentDepth=0,interrupted=0;double lastTelemetry=-100;bool active=false;std::vector<Iteration> iterations;
    auto stats=[&]{controller.nodes=splitNodes;controller.safetyCutoffs=0;for(const auto& c:contexts){controller.nodes+=c->search.nodes;controller.safetyCutoffs+=c->search.safetyCutoffs;controller.selDepth=std::max(controller.selDepth,c->search.selDepth);}};
    auto telemetry=[&]{if(p.mode!="STREAM"||controller.elapsed()-lastTelemetry<50)return;lastTelemetry=controller.elapsed();uint64_t nodes=splitNodes;int sel=controller.selDepth;for(const auto& c:contexts){nodes+=active?c->search.publishedNodes.load(std::memory_order_relaxed):c->search.nodes;sel=std::max(sel,c->search.publishedSelDepth.load(std::memory_order_relaxed));}std::cout<<"{\"telemetry\":{\"mainDepth\":"<<currentDepth<<",\"completedDepth\":"<<(iterations.empty()?0:iterations.back().depth)<<",\"selDepth\":"<<sel<<",\"visitedNodes\":"<<nodes<<",\"elapsedMs\":"<<controller.elapsed()<<",\"statsExact\":false,\"searchStatus\":\"searching\"}}\n"<<std::flush;};
    std::array<std::atomic<double>,3> provenAlpha;std::vector<uint8_t> exactProof;
    struct Job {size_t group,reply,context;int depth,ply,ext;double alpha;bool fallback;};
    auto batch=[&](const std::vector<Job>& jobs){
        std::vector<double> values(jobs.size());exactProof.assign(jobs.size(),0);std::atomic<size_t> next{0};std::mutex mutex;std::exception_ptr error;std::vector<std::future<void>> futures;active=true;
        auto fail=[&](std::exception_ptr e){std::lock_guard<std::mutex> lock(mutex);if(!error)error=e;cancelled.store(true,std::memory_order_relaxed);};
        try{for(size_t lane=0;lane<std::min(lanes,jobs.size());lane++)futures.push_back(pool->submit([&]{for(size_t i=next.fetch_add(1);i<jobs.size();i=next.fetch_add(1)){
            if(cancelled.load(std::memory_order_relaxed))return;const Job j=jobs[i];PrivateRoot& c=*contexts[j.context];try{
                if(c.search.elapsed()>c.search.limit)throw Timeout{};
#ifdef MIST_FRONTIER_FAULT
                if(currentDepth==3&&i==0){
#if MIST_FRONTIER_FAULT==1
                    throw Timeout{};
#else
                    throw std::runtime_error("injected frontier error");
#endif
                }
#endif
#ifdef MIST_VERIFY_RESTORE
                const auto originalKey=c.state.key();const auto originalHistory=c.state.positions;
#endif
                if(j.fallback){Undo u=push(c.state,groups[j.group].root);try{values[i]=c.search.search(c.state,j.depth,-inf,inf,1);}catch(...){pop(c.state,groups[j.group].root,u);throw;}pop(c.state,groups[j.group].root,u);}
                else {const double bound=provenAlpha[j.group].load(std::memory_order_relaxed);values[i]=-c.search.search(c.state,j.depth,-inf,-bound,j.ply,3,j.ext);exactProof[i]=values[i]>bound;
                    double old=provenAlpha[j.group].load(std::memory_order_relaxed);while(values[i]>old&&!provenAlpha[j.group].compare_exchange_weak(old,values[i],std::memory_order_relaxed)){}
                }
#ifdef MIST_VERIFY_RESTORE
                if(!(c.state.key()==originalKey)||c.state.positions!=originalHistory)throw std::logic_error("frontier context not restored");
#endif
            }catch(...){fail(std::current_exception());return;}
        }}));}catch(...){fail(std::current_exception());}
        for(auto& f:futures)try{while(f.wait_for(std::chrono::milliseconds(5))!=std::future_status::ready){try{telemetry();}catch(...){fail(std::current_exception());}}f.get();}catch(...){fail(std::current_exception());}
        active=false;stats();if(error)std::rethrow_exception(error);return values;
    };
    for(int depth=1;p.depth==0||depth<=p.depth;depth++){
        currentDepth=depth;telemetry();if(depth==std::numeric_limits<int>::max()-1){controller.safetyCutoffs++;break;}cancelled.store(false,std::memory_order_relaxed);
        std::vector<double> best(groups.size(),-inf);std::vector<int> remaining(groups.size()),exts(groups.size(),2);std::vector<size_t> bestReply(groups.size());std::vector<bool> split(groups.size(),false);std::vector<Job> first;
        std::vector<Row> rows;try{
            for(size_t g=0;g<groups.size();g++){provenAlpha[g].store(-inf,std::memory_order_relaxed);auto& group=groups[g];bestReply[g]=group.first;
                if(p.outcomes[group.root.index()]){best[g]=p.outcomes[group.root.index()]==2?mate-1:0;continue;}
                if(group.terminal){controller.tick(1);splitNodes++;best[g]=group.terminalScore;continue;}
                remaining[g]=depth-1;State child=childState(p,group.root);if(inCheck(child.board,child.turn,child.kings[child.turn])&&remaining[g]>0){remaining[g]++;exts[g]--;}
                if(remaining[g]<=0){first.push_back({g,0,group.fallback,depth-1,1,2,-inf,true});continue;}
                controller.tick(1);splitNodes++;split[g]=true;first.push_back({g,group.first,group.contexts[group.first],remaining[g]-1,2,exts[g],-inf,false});
            }
            auto initial=batch(first);for(size_t i=0;i<first.size();i++)best[first[i].group]=initial[i];
            std::vector<std::pair<size_t,size_t>> todo;size_t width=0;for(const auto& g:groups)width=std::max(width,g.replies.size());for(size_t j=0;j<width;j++)for(size_t g=0;g<groups.size();g++)if(split[g]&&j<groups[g].replies.size()&&j!=groups[g].first)todo.push_back({g,j});
            // Live per-root proven bounds; nodes can depend on worker scheduling.
            std::vector<Job> jobs;for(const auto [g,j]:todo)jobs.push_back({g,j,groups[g].contexts[j],remaining[g]-1,2,exts[g],best[g],false});
            const auto values=batch(jobs);for(size_t i=0;i<jobs.size();i++){const size_t g=jobs[i].group;if(values[i]>best[g])best[g]=values[i];if(exactProof[i]&&values[i]>=best[g])bestReply[g]=jobs[i].reply;}
            for(size_t g=0;g<groups.size();g++){auto row=summarize(groups[g].root,{-best[g]},false);row.repetitions=p.repetitions[row.move.index()];if(p.outcomes[row.move.index()]){row.repetitionLoss=p.outcomes[row.move.index()]==2;row.draw=!row.repetitionLoss;}rows.push_back(row);groups[g].first=bestReply[g];}
        }catch(const Timeout&){interrupted=depth;break;}
        stats();std::stable_sort(rows.begin(),rows.end(),[](const Row& a,const Row& b){return a.score>b.score;});iterations.push_back({depth,controller.nodes,controller.elapsed(),rows});completed++;if(iterations.size()>64)iterations.erase(iterations.begin());
        if(p.mode=="STREAM"){std::cout<<"{\"progress\":true,\"result\":{\"depth\":"<<depth<<",\"mainDepth\":"<<depth<<",\"completedDepth\":"<<depth<<",\"selDepth\":"<<controller.selDepth<<",\"nodes\":"<<controller.nodes<<",\"visitedNodes\":"<<controller.nodes<<",\"statsExact\":true,\"samples\":1,\"threads\":"<<lanes<<",\"score\":"<<rows[0].score<<",\"move\":";writeMove(rows[0].move);std::cout<<",\"allCandidates\":";writeRows(rows);std::cout<<"}}\n"<<std::flush;}
        if(controller.safetyCutoffs||std::abs(rows[0].score)>98000||controller.elapsed()>controller.limit)break;
    }
    pool.reset();for(auto& c:contexts)c->search.cancel=nullptr;stats();size_t allocated=0,denied=0;for(const auto& c:contexts){allocated+=c->arena->used.load();denied+=c->arena->denied.load();}
    const Iteration* last=iterations.empty()?nullptr:&iterations.back();std::cout<<"{\"depth\":"<<(last?last->depth:0)<<",\"mainDepth\":"<<currentDepth<<",\"completedDepth\":"<<(last?last->depth:0)<<",\"selDepth\":"<<controller.selDepth<<",\"nodes\":"<<controller.nodes<<",\"visitedNodes\":"<<controller.nodes<<",\"statsExact\":true,\"samples\":1,\"threads\":"<<lanes<<",\"elapsedMs\":"<<controller.elapsed()<<",\"score\":"<<(last?last->rows[0].score:0)<<",\"move\":";writeMove(last?last->rows[0].move:roots[0]);std::cout<<",\"ttBudgetBytes\":"<<TTArena::budget<<",\"ttAllocatedBytes\":"<<allocated<<",\"ttDenied\":"<<denied<<",\"frontierSplit\":true,\"frontierContexts\":"<<contexts.size()<<",\"splitNodes\":"<<splitNodes<<",\"completedIterations\":"<<completed<<",\"safetyCutoffs\":"<<controller.safetyCutoffs<<",\"interruptedDepth\":"<<interrupted<<",\"terminationReason\":\""<<(controller.safetyCutoffs?"stack-safety":interrupted?"time-budget":last&&std::abs(last->rows[0].score)>98000?"terminal":"depth-limit")<<"\",\"searchStatus\":\""<<(interrupted?"time-budget":"completed")<<"\",\"allCandidates\":";writeRows(last?last->rows:std::vector<Row>{});std::cout<<",\"iterations\":[";if(p.mode!="STREAM")for(size_t i=0;i<iterations.size();i++){if(i)std::cout<<',';std::cout<<"{\"depth\":"<<iterations[i].depth<<",\"nodes\":"<<iterations[i].nodes<<",\"elapsedMs\":"<<iterations[i].elapsed<<",\"allCandidates\":";writeRows(iterations[i].rows);std::cout<<'}';}std::cout<<"]}\n";
}

void verify(const Packet& p) {
    State s=gameState(p.worlds[0],p);std::cout<<"{\"sides\":[";
    for(int side:{0,1}){if(side)std::cout<<',';std::cout<<"{\"check\":"<<(inCheck(s.board,side,s.kings[side])?"true":"false")<<",\"score\":"<<evaluate(s,side)<<",\"legal\":";writeMoves(legal(s.board,side));std::cout<<",\"captures\":";writeMoves(legal(s.board,side,true));std::cout<<'}';}
    std::cout<<"],\"transitions\":[";const Board before=s.board;Key old=s.key();const int oldPopulation=s.population,oldKings[2]={s.kings[0],s.kings[1]};auto moves=legal(s.board,s.turn);
    for(size_t i=0;i<moves.size();i++){if(i)std::cout<<',';Move m=moves[i];Undo u=push(s,m);std::cout<<"{\"from\":"<<m.from<<",\"to\":"<<m.to<<",\"type\":"<<s.board[m.to].type<<",\"score\":"<<evaluate(s,p.turn)<<",\"poolCount\":["<<s.poolCount[0]<<','<<s.poolCount[1]<<"],\"poolValue\":["<<s.poolValue[0]<<','<<s.poolValue[1]<<"],\"reply\":";writeMoves(legal(s.board,s.turn));pop(s,m,u);std::cout<<",\"restored\":"<<((s.board==before&&s.key()==old&&s.population==oldPopulation&&s.kings[0]==oldKings[0]&&s.kings[1]==oldKings[1])?"true":"false")<<'}';}
    std::cout<<"]}\n";
}
} // namespace mist
int main() {
    using namespace mist;std::ios::sync_with_stdio(false);std::cin.tie(nullptr);std::cout<<std::setprecision(17);initialize();std::cout<<"{\"ready\":true,\"protocol\":3,\"streaming\":true,\"depthMetrics\":true,\"unlimitedDepth\":true,\"safetyMaxPly\":"<<MAX_SEARCH_PLY-1<<",\"threads\":4,\"independentWorldSearch\":true,\"independentRootSearch\":true,\"unifiedRetainedCandidate\":true,\"darkWorldMesh\":true,\"brightLiveFrontier\":true,\"lazyPositiveDepthTTKey\":true}\n"<<std::flush;
    try {Packet packet;while(read(packet)){if(packet.mode=="VERIFY")verify(packet);else {if(std::any_of(packet.view.begin(),packet.view.end(),[](Piece p){return p.live()&&p.hidden;}))runDarkMesh(packet);else runFrontier(packet);}std::cout<<std::flush;packet=Packet{};}}
    catch(const std::exception& error){std::cerr<<"native error: "<<error.what()<<'\n';return 2;}
}
