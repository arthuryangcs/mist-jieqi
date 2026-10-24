#pragma once
#include <array>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace observation_nnue {
constexpr int D=2597,H=16,StockOffset=2520,TurnOffset=2592,ViewerOffset=2594;
struct Model {
    std::array<std::array<double,H>,D> weight{};
    std::array<double,H> bias{},output{};
    double outputBias=0,cap=256,scale=600;bool full=false;
    void load(const char* path){
        if(!path)throw std::runtime_error("NNUE model path required");std::ifstream in(path,std::ios::binary);
        char magic[8];uint32_t dimensions,hidden;float c,s;
        in.read(magic,8);in.read(reinterpret_cast<char*>(&dimensions),4);in.read(reinterpret_cast<char*>(&hidden),4);in.read(reinterpret_cast<char*>(&c),4);in.read(reinterpret_cast<char*>(&s),4);
        if(!in||std::memcmp(magic,"JQNNUE1\0",8)||dimensions!=D||hidden!=H||c!=256||s!=600)throw std::runtime_error("Incompatible NNUE model");
        auto read=[&](){float v;in.read(reinterpret_cast<char*>(&v),4);if(!in||!std::isfinite(v))throw std::runtime_error("Invalid NNUE weight");return double(v);};
        for(auto& row:weight)for(auto& v:row)v=read();for(auto& v:bias)v=read();for(auto& v:output)v=read();outputBias=read();
        char extra;if(in.get(extra))throw std::runtime_error("Trailing NNUE model bytes");cap=c;scale=s;
        full=std::getenv("MIST_NNUE_FULL")&&std::string(std::getenv("MIST_NNUE_FULL"))=="1";
    }
};
inline Model model;
struct State {
    std::array<std::array<int,6>,2> stock{};
    std::array<std::array<double,H>,2> accumulator{};
    bool operator==(const State& x)const{return stock==x.stock&&accumulator==x.accumulator;}
};
inline void feature(State& n,int frame,int id,int direction){
    if(id<0||id>=D)throw std::runtime_error("NNUE feature out of range");
    for(int h=0;h<H;h++)n.accumulator[frame][h]+=direction*model.weight[id][h];
}
template<class Piece>int pieceFeature(Piece p,int square,int frame){
    const int type=p.hidden?7+p.role:p.type;
    if(p.side<0||p.side>1||type<0||type>=14)throw std::runtime_error("NNUE piece out of range");
    return ((p.side^frame)*14+type)*90+(frame?89-square:square);
}
template<class Piece>void piece(State& n,Piece p,int square,int direction){if(p.live())for(int f:{0,1})feature(n,f,pieceFeature(p,square,f),direction);}
inline int stockFeature(int side,int type,int count,int frame){
    if(type<0||type>=6||count<0||count>5)throw std::runtime_error("NNUE inventory out of range");
    return StockOffset+((side^frame)*6+type)*6+count;
}
inline void changeStock(State& n,int side,int type,int change){
    const int t=type-1,old=n.stock.at(side).at(t),next=old+change;
    for(int f:{0,1}){feature(n,f,stockFeature(side,t,old,f),-1);feature(n,f,stockFeature(side,t,next,f),1);}n.stock[side][t]=next;
}
inline void changeTurn(State& n,int oldTurn,int newTurn){for(int f:{0,1}){feature(n,f,TurnOffset+(oldTurn^f),-1);feature(n,f,TurnOffset+(newTurn^f),1);}}
template<class Board>State rebuilt(const State& counts,const Board& b,int turn,int viewer){
    State n;n.stock=counts.stock;for(int f:{0,1})n.accumulator[f]=model.bias;
    for(int i=0;i<90;i++)piece(n,b[i],i,1);
    for(int side:{0,1})for(int t=0;t<6;t++)for(int f:{0,1})feature(n,f,stockFeature(side,t,n.stock[side][t],f),1);
    for(int f:{0,1}){feature(n,f,TurnOffset+(turn^f),1);feature(n,f,ViewerOffset+(viewer<0?2:viewer^f),1);}return n;
}
inline double correction(const State& n){
    double z[2]={model.outputBias,model.outputBias};
    for(int f:{0,1})for(int h=0;h<H;h++)z[f]+=std::clamp(n.accumulator[f][h],0.0,1.0)*model.output[h];
    return model.cap*.5*(std::tanh(z[0])-std::tanh(z[1]));
}
template<class Board>std::array<std::vector<int>,2> indices(const State& n,const Board& b,int turn,int viewer){
    std::array<std::vector<int>,2> result;for(int f:{0,1}){
        for(int i=0;i<90;i++)if(b[i].live())result[f].push_back(pieceFeature(b[i],i,f));
        for(int side:{0,1})for(int t=0;t<6;t++)result[f].push_back(stockFeature(side,t,n.stock[side][t],f));
        result[f].push_back(TurnOffset+(turn^f));result[f].push_back(ViewerOffset+(viewer<0?2:viewer^f));
    }return result;
}
}
