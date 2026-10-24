#define main mist_program_main
#include "search-audit.cpp"
#undef main
#ifndef EXPECT_DISTINCT_KEYS
#define EXPECT_DISTINCT_KEYS 1
#endif

int main(){
    using namespace mist;initialize();observation_nnue::model.load(std::getenv("MIST_NNUE_MODEL"));Packet p;if(!read(p))return 2;
    State a=stateOf(p.worlds[0],p.captured,p.turn,0);int advisor=-1,elephant=-1;
    for(int i=0;i<90;i++)if(a.board[i].side==0&&a.board[i].hidden){if(a.board[i].type==A)advisor=i;if(a.board[i].type==B)elephant=i;}
    if(advisor<0||elephant<0)throw std::runtime_error("Need initial sampled advisor and elephant");
    for(int square:{advisor,elephant}){xorPiece(a,a.board[square],square);a.board[square]=Piece{};a.population--;}
    State b=a;
    // Both gone; in one history the advisor was publicly revealed before capture,
    // in the other the elephant was. The other own dark loss remains unknown.
    a.poolCount[0]--;b.poolCount[0]--;a.poolValue[0]-=value[A];b.poolValue[0]-=value[B];
    a.neural.stock[0][A-1]--;b.neural.stock[0][B-1]--;
    a.neural=observation_nnue::rebuilt(a.neural,a.board,a.turn,a.viewer);b.neural=observation_nnue::rebuilt(b.neural,b.board,b.turn,b.viewer);
    const bool inheritedFieldsEqual=a.h1==b.h1&&a.h2==b.h2&&a.turn==b.turn&&a.poolCount[0]==b.poolCount[0]&&a.poolValue[0]==b.poolValue[0]&&a.poolCount[1]==b.poolCount[1]&&a.poolValue[1]==b.poolValue[1];
    std::unordered_map<Key,int,KeyHash> table;table[a.key()]=1;table[b.key()]=2;
    const bool equal=a.key()==b.key();
    if(!inheritedFieldsEqual||(EXPECT_DISTINCT_KEYS?(equal||table.size()!=2||table[a.key()]!=1||table[b.key()]!=2):(!equal||table.size()!=1)))throw std::runtime_error("Unexpected inventory-key behavior");
    std::cout<<std::setprecision(17)<<"{\"passed\":true,\"inheritedFieldsEqual\":true,\"keysEqual\":"<<(equal?"true":"false")<<",\"tableEntries\":"<<table.size()<<",\"scoreA\":"<<evaluate(a,0)<<",\"scoreB\":"<<evaluate(b,0)<<"}\n";return 0;
}
