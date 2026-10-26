#include <random>
int main(){
    using namespace mist;initialize();std::mt19937_64 rng(2026102607);
    size_t bitCases=0,worlds=0,transitions=0,reveals=0,darkCaptures=0,crossWordMoves=0,legalComparisons=0;
    auto expect=[](bool ok){if(!ok)throw std::runtime_error("mask probe mismatch");};
    for(int n=0;n<1000;n++){
        SquareBits m;std::vector<int> expected;
        for(int i=0;i<90;i++)if(n==0?false:n==1?true:(rng()&1)){m.toggle(i);expected.push_back(i);}
        std::vector<int> actual;for(int i:m)actual.push_back(i);expect(actual==expected);
        for(int i:expected)m.toggle(i);expect(m.words[0]==0&&m.words[1]==0);bitCases++;
    }
    for(int i=0;i<90;i++){SquareBits m;m.toggle(i);std::vector<int> actual;for(int x:m)actual.push_back(x);expect(actual==std::vector<int>{i});m.toggle(i);expect(m.begin()!=m.end()?false:true);bitCases++;}
    Packet p;
    while(read(p)){
        for(const Board& b:p.worlds){
            State s=stateOf(b,p.captured,p.turn,p.viewer);const Board original=s.board;const auto originalMasks=s.occupied;const Key old=s.key();const int turn=s.turn,population=s.population,k0=s.kings[0],k1=s.kings[1];
            std::vector<std::pair<Move,Undo>> path;
            for(int ply=0;ply<64;ply++){
                expect(s.occupied==rebuiltMasks(s.board));
                for(int side:{0,1})for(bool cap:{false,true})for(bool first:{false,true}){
                    std::vector<Move> a,c;legalInto(s.board,side,cap,first,-2,a);legalMaskedInto(s,side,cap,first,-2,c);expect(a==c);legalComparisons++;
                }
                auto moves=maskedLegal(s,s.turn);if(moves.empty())break;const Move m=moves[rng()%moves.size()];
                if(s.board[m.from].hidden)reveals++;if(s.board[m.to].live()&&s.board[m.to].hidden)darkCaptures++;if((m.from>>6)!=(m.to>>6))crossWordMoves++;
                const Undo u=push(s,m);expect(s.occupied==rebuiltMasks(s.board));path.push_back({m,u});transitions++;
            }
            while(!path.empty()){const auto x=path.back();path.pop_back();pop(s,x.first,x.second);expect(s.occupied==rebuiltMasks(s.board));transitions++;}
            expect(s.board==original&&s.occupied==originalMasks&&s.key()==old&&s.turn==turn&&s.population==population&&s.kings[0]==k0&&s.kings[1]==k1);worlds++;
        }p=Packet{};
    }
    expect(reveals>0&&darkCaptures>0&&crossWordMoves>0);
    std::cout<<"{\"passed\":true,\"bitCases\":"<<bitCases<<",\"worlds\":"<<worlds<<",\"transitions\":"<<transitions<<",\"reveals\":"<<reveals<<",\"darkCaptures\":"<<darkCaptures<<",\"crossWordMoves\":"<<crossWordMoves<<",\"legalComparisons\":"<<legalComparisons<<"}\n";return 0;
}
