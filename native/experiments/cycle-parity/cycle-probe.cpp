#include <random>
int main(){
    using namespace mist;std::mt19937_64 rng(2026102707);
    size_t cases=0,positive=0,negative=0,fieldCases=0;
    auto check=[&](const std::vector<Key>& path,const Key& key){
        const bool expected=std::find(path.begin(),path.end(),key)!=path.end();
        if(sameTurnCycle(path,key)!=expected)throw std::runtime_error("synthetic path mismatch");
        cases++;if(expected)positive++;else negative++;
    };
    auto randomKey=[&](int turn){return Key{uint32_t(rng()%31),uint32_t(rng()%29),turn,int(rng()%16),int(rng()%3000),int(rng()%16),int(rng()%3000),int(rng()%4)-1};};
    for(int n=0;n<=160;n++)for(int firstTurn:{0,1}){
        std::vector<Key> path;for(int j=0;j<n;j++)path.push_back(randomKey((firstTurn+j)&1));
        if(n>2)path.back()=path[size_t((n-1)&1)];
        for(int q=0;q<32;q++)check(path,randomKey(q&1));
        for(const Key& key:path){
            check(path,key);
            for(int field=0;field<4;field++){
                Key changed=key;if(field==0)changed.c0++;if(field==1)changed.v0++;if(field==2)changed.c1++;if(field==3)changed.v1++;
                check(path,changed);
            }
        }
    }
    const Key base{17,23,0,9,1000,11,2000,-1};
    for(int field=0;field<8;field++){
        Key key=base;
        if(field==0)key.h1++;if(field==1)key.h2++;if(field==2)key.turn^=1;
        if(field==3)key.c0++;if(field==4)key.v0++;if(field==5)key.c1++;if(field==6)key.v1++;if(field==7)key.extensions++;
        if(sameTurnCycle(std::vector<Key>{base},key))throw std::runtime_error("full key field ignored");
        check(std::vector<Key>{base},key);fieldCases++;
    }
    if(!positive||!negative)throw std::runtime_error("missing hit/miss coverage");
    std::cout<<"{\"passed\":true,\"cases\":"<<cases<<",\"positive\":"<<positive<<",\"negative\":"<<negative<<",\"fieldCases\":"<<fieldCases<<",\"maxLength\":160,\"seed\":2026102707}\n";return 0;
}
