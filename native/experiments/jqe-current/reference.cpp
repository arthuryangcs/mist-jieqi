// Test-only upstream oracle: no upstream move generation or search is linked.
// nnue.cpp and its headers must be from the pinned external/jqe checkout.
#define main mist_program_main
#include "search-audit.cpp"
#undef main
#ifdef HUGE
#undef HUGE
#endif
#include "nnue.cpp"

void neuralAudit(const mist::State& s){
    const auto full=mist_jqe::rebuilt(s.neural,s.board,s.turn,s.viewer);
    jq::Position p;std::fill_n(p.board,90,jq::NO_PIECE);std::fill_n(p.pcount,2,0);
    constexpr int types[7]={1,2,3,4,6,5,7},slots[6]={0,1,2,4,3,5};
    for(int c=0;c<2;c++){
        p.kingSq[c]=c?85:4;
        for(int sq=0;sq<90;sq++){const auto& x=s.board[sq];if(!x.live()||x.side!=c)continue;
            const int target=(9-sq/9)*9+sq%9;
            p.board[target]=jq::make_piece(jq::Color(c),jq::PieceType(x.hidden?8:types[x.type]));
            p.plist[c][p.pcount[c]++]=uint8_t(target);if(x.type==0&&!x.hidden)p.kingSq[c]=int8_t(target);
        }
        for(int t=0;t<6;t++)p.urn[c][slots[t]]=int8_t(s.neural.stock[c][t]);
    }
    jq::nnue::Accumulator ref{};jq::nnue::refresh(p,ref);
    double error=0,upstreamError=0;int integerError=0,upstreamIntegerError=0;
    for(int c=0;c<2;c++)for(int h=0;h<=mist_jqe::model.ft;h++){
        error=std::max(error,double(std::abs(full.accumulator[c][h]-s.neural.accumulator[c][h])));
        integerError=std::max(integerError,std::abs(int(full.quantizedAccumulator[c][h])-int(s.neural.quantizedAccumulator[c][h])));
        if(mist_jqe::model.quantized())upstreamIntegerError=std::max(upstreamIntegerError,std::abs(int(ref.q[c][h])-int(full.quantizedAccumulator[c][h])));
        else upstreamError=std::max(upstreamError,double(std::abs(ref.v[c][h]-full.accumulator[c][h])));
    }
    std::cout<<"{\"maxAccumulatorError\":"<<error<<",\"integerAccumulatorError\":"<<integerError<<",\"upstreamAccumulatorError\":"<<upstreamError<<",\"upstreamIntegerError\":"<<upstreamIntegerError<<",\"scores\":[";
    for(int c=0;c<2;c++){if(c)std::cout<<',';std::cout<<'['<<mist_jqe::correction(s.neural,c)<<','<<mist_jqe::correction(full,c)<<','<<jq::nnue::evaluate(ref,jq::Color(c))<<']';}
    std::cout<<"],\"features\":[";
    for(int c=0;c<2;c++){if(c)std::cout<<',';std::vector<int> ids;const int kb=jq::nnue::king_bucket_offset(jq::Color(c),p.kingSq[c]);
        for(int side=0;side<2;side++)for(int i=0;i<p.pcount[side];i++){int sq=p.plist[side][i];ids.push_back(jq::nnue::piece_feature(jq::Color(c),p.board[sq],sq,kb));}
        for(int side=0;side<2;side++)for(int t=0;t<6;t++)for(int j=1;j<=p.urn[side][t];j++)ids.push_back(jq::nnue::urn_feature(jq::Color(c),jq::Color(side),t,j));
        std::sort(ids.begin(),ids.end());std::cout<<'[';for(size_t i=0;i<ids.size();i++){if(i)std::cout<<',';std::cout<<ids[i];}std::cout<<']';}
    std::cout<<"],\"stock\":[";for(int c=0;c<2;c++){if(c)std::cout<<',';std::cout<<'[';for(int t=0;t<6;t++){if(t)std::cout<<',';std::cout<<s.neural.stock[c][t];}std::cout<<']';}std::cout<<"]}";
}
int main(){
    using namespace mist;std::ios::sync_with_stdio(false);std::cin.tie(nullptr);std::cout<<std::setprecision(17);
    try{
        const bool quant=!(std::getenv("MIST_JQE_QUANT")&&std::string(std::getenv("MIST_JQE_QUANT"))=="0");
        initialize();mist_jqe::model.load(std::getenv("MIST_JQE_MODEL"),quant);std::string err;
        if(!jq::nnue::load(std::getenv("MIST_JQE_MODEL"),&err))throw std::runtime_error(err);
        jq::nnue::set_quantized(quant);if(jq::nnue::quantized()!=quant)throw std::runtime_error("Upstream quantization unavailable; AVX2/FMA required");
        std::cout<<"{\"ready\":true}\n"<<std::flush;
        Packet p;while(read(p)){
            State s=stateOf(p.worlds[0],p.captured,p.turn,p.viewer),before=s;std::cout<<"{\"root\":";neuralAudit(s);std::cout<<",\"transitions\":[";
            auto moves=legal(s.board,s.turn);for(size_t i=0;i<moves.size();i++){
                if(i)std::cout<<',';Move m=moves[i];Undo old=push(s,m);std::cout<<"{\"from\":"<<m.from<<",\"to\":"<<m.to<<",\"after\":";neuralAudit(s);pop(s,m,old);
                std::cout<<",\"restored\":"<<((s.board==before.board&&s.key()==before.key()&&s.neural==before.neural)?"true":"false")<<'}';
            }std::cout<<"]}\n"<<std::flush;p=Packet{};
        }
    }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 2;}return 0;
}
