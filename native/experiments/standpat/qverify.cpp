// Test-only entrypoint. Included engine is selected by the build script.
#define main mist_program_main
#include MIST_TEST_SOURCE
#undef main

int main() {
    using namespace mist;
    std::ios::sync_with_stdio(false);std::cin.tie(nullptr);std::cout<<std::setprecision(17);
    initialize();std::cout<<"{\"ready\":true}\n"<<std::flush;
    try {Packet p;while(read(p)){
        std::cout<<"{\"cases\":[";bool comma=false;
        for(int side:{0,1})for(int qleft:{0,3})for(int delta:{-1,0,1}){
            State s=stateOf(p.worlds[0],p.captured,side,p.viewer),before=s;
            double stand=evaluate(s,side),beta=stand+delta,alpha=beta-100;
            const bool checked=inCheck(s.board,side,s.kings[side]);
            Search search;search.start=std::chrono::steady_clock::now();search.limit=60000;search.nodeLimit=500000;
            diagnostic={};double score=search.node(s,0,alpha,beta,0,qleft,2);const auto counts=diagnostic;
            const bool restored=s.board==before.board&&s.key()==before.key()&&s.path==before.path&&s.population==before.population&&s.kings[0]==before.kings[0]&&s.kings[1]==before.kings[1];
            if(comma)std::cout<<',';comma=true;
            std::cout<<"{\"side\":"<<side<<",\"qleft\":"<<qleft<<",\"stand\":"<<stand<<",\"alpha\":"<<alpha<<",\"beta\":"<<beta<<",\"checked\":"<<(checked?"true":"false")<<",\"score\":"<<score<<",\"nodes\":"<<search.nodes<<",\"restored\":"<<(restored?"true":"false")<<",\"captureLists\":"<<counts.captureLists<<",\"firstLegalProbes\":"<<counts.firstLegalProbes<<",\"candidateCalls\":"<<counts.candidateCalls<<'}';
        }
        std::cout<<"]}\n"<<std::flush;p=Packet{};
    }}catch(const Timeout&){std::cerr<<"qverify node/time limit\n";return 2;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 2;}
    return 0;
}
