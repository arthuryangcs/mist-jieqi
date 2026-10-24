#define main mist_program_main
#include "search-audit.cpp"
#undef main

void neuralAudit(const mist::State& s){
    using namespace observation_nnue;
    const State full=rebuilt(s.neural,s.board,s.turn,s.viewer);double error=0;
    for(int f:{0,1})for(int h=0;h<H;h++)error=std::max(error,std::abs(full.accumulator[f][h]-s.neural.accumulator[f][h]));
    const auto ids=indices(s.neural,s.board,s.turn,s.viewer);
    std::cout<<"{\"maxAccumulatorError\":"<<error<<",\"correction\":"<<correction(s.neural)<<",\"fullCorrection\":"<<correction(full)<<",\"base\":"<<mist::handEvaluate(s,0)<<",\"features\":[";
    for(int f:{0,1}){if(f)std::cout<<',';std::cout<<'[';for(size_t i=0;i<ids[f].size();i++){if(i)std::cout<<',';std::cout<<ids[f][i];}std::cout<<']';}
    std::cout<<"],\"stock\":[";for(int side:{0,1}){if(side)std::cout<<',';std::cout<<'[';for(int t=0;t<6;t++){if(t)std::cout<<',';std::cout<<s.neural.stock[side][t];}std::cout<<']';}std::cout<<"]}";
}
int main(){
    using namespace mist;std::ios::sync_with_stdio(false);std::cin.tie(nullptr);std::cout<<std::setprecision(17);initialize();observation_nnue::model.load(std::getenv("MIST_NNUE_MODEL"));std::cout<<"{\"ready\":true}\n"<<std::flush;
    try{Packet p;while(read(p)){
        State s=stateOf(p.worlds[0],p.captured,p.turn,p.viewer),before=s;std::cout<<"{\"root\":";neuralAudit(s);std::cout<<",\"transitions\":[";
        auto moves=legal(s.board,s.turn);for(size_t i=0;i<moves.size();i++){
            if(i)std::cout<<',';Move m=moves[i];Undo old=push(s,m);std::cout<<"{\"from\":"<<m.from<<",\"to\":"<<m.to<<",\"after\":";neuralAudit(s);pop(s,m,old);
            std::cout<<",\"restored\":"<<((s.board==before.board&&s.key()==before.key()&&s.neural==before.neural)?"true":"false")<<'}';
        }std::cout<<"]}\n"<<std::flush;p=Packet{};
    }}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 2;}return 0;
}
