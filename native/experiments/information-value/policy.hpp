#pragma once
#include <algorithm>
namespace mist_information {
template<class Board> double bonus(const Board& board,int side) {
    int count[2]={0,0};
    for(const auto& p:board)if(p.side>=0&&!p.hidden&&p.type!=0)count[p.side]++;
    return 8.0*(std::min(8,count[side])-std::min(8,count[1-side]));
}
}
