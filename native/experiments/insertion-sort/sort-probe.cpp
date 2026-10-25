#define main mist_program_main
#include "search.cpp"
#undef main
#include <cstring>
#include <random>
int main(){
    using namespace mist;std::mt19937_64 rng(2026102507);size_t cases=0,items=0;
    const std::vector<size_t> lengths={0,1,2,3,4,7,8,15,16,31,32,48,64,90,128,256,512,1024};
    for(size_t n:lengths)for(int pattern=0;pattern<8;pattern++)for(int repeat=0;repeat<8;repeat++){
        std::vector<ScoredMove> a;
        for(size_t i=0;i<n;i++){
            double score=pattern==0?double(i):pattern==1?-double(i):pattern==2?1:pattern==3?double(rng()%7)-3:pattern==4?double(int64_t(rng()%20001)-10000)/3.0:pattern==5?(i%2?-0.0:0.0):pattern==6?(i%3==0?INFINITY:i%3==1?-INFINITY:0):double(i%4)*std::numeric_limits<double>::denorm_min();
            a.push_back({Move{int(i/90),int(i%90)},score});
        }
        auto b=a;std::stable_sort(a.begin(),a.end(),[](const ScoredMove& x,const ScoredMove& y){return x.score>y.score;});stableMoveSort(b);
        for(size_t i=0;i<n;i++)if(!(a[i].move==b[i].move)||std::memcmp(&a[i].score,&b[i].score,sizeof(double)))throw std::runtime_error("Stable ordering mismatch");
        cases++;items+=n;
    }
    std::cout<<"{\"passed\":true,\"cases\":"<<cases<<",\"items\":"<<items<<",\"maxLength\":1024,\"seed\":2026102507,\"scope\":\"Empty/single, sorted/reversed, equal/tied/random, signed zero, infinities and subnormals; compare full order and score bits. NaN excluded: engine priorities are finite.\"}\n";
}
