#define main mist_program_main
#include "search-audit.cpp"
#undef main
#include <atomic>

__attribute__((noinline)) double measured(const mist::State& s,int mode){
    std::atomic_signal_fence(std::memory_order_seq_cst);
    const double base=mist::handEvaluate(s,0);
    if(mode==0)return base;
    return base+observation_nnue::correction(mode==1?s.neural:observation_nnue::rebuilt(s.neural,s.board,s.turn,s.viewer));
}
int main(){
    using namespace mist;std::ios::sync_with_stdio(false);std::cin.tie(nullptr);std::cout<<std::setprecision(17);initialize();observation_nnue::model.load(std::getenv("MIST_NNUE_MODEL"));std::cout<<"{\"ready\":true}\n"<<std::flush;
    try{Packet p;while(read(p)){
        const State s=stateOf(p.worlds[0],p.captured,p.turn,p.viewer);constexpr int repeats=5,iterations=25000;double sums[3]={0,0,0};volatile double warm=0;
        for(int i=0;i<3000;i++)warm=warm+measured(s,i%3);
        std::cout<<"{\"iterations\":"<<iterations<<",\"rows\":[";bool comma=false;
        for(int repeat=0;repeat<repeats;repeat++)for(int j=0;j<3;j++){
            const int mode=(j+repeat)%3;double sum=0;auto start=std::chrono::steady_clock::now();
            for(int i=0;i<iterations;i++)sum+=measured(s,mode);
            const double ns=std::chrono::duration<double,std::nano>(std::chrono::steady_clock::now()-start).count()/iterations;sums[mode]=sum;
            if(comma)std::cout<<',';comma=true;std::cout<<"{\"repeat\":"<<repeat<<",\"mode\":"<<mode<<",\"nsPerCall\":"<<ns<<",\"checksum\":"<<sum<<'}';
        }
        if(std::abs(sums[1]-sums[2])>1e-6)throw std::runtime_error("Incremental/full benchmark mismatch");std::cout<<"]}\n"<<std::flush;p=Packet{};
    }}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 2;}return 0;
}
