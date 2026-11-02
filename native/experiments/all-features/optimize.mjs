import fs from 'node:fs';import {patch} from '../time-search/build.mjs';
export function optimize(s){
 s=patch(s,'std::array<std::vector<Leap>,90> checks;','std::array<std::vector<Leap>,90> checks;std::array<std::array<uint8_t,90>,90> kingGeometry{};std::array<std::array<std::vector<int>,4>,90> attackRays;');
 s=patch(s,'int x=k%9,y=k/9;\n        for(auto d:horses)',`int x=k%9,y=k/9;
        for(int i=0;i<90;i++)kingGeometry[k][i]=uint8_t((i%9==x||i/9==y?1:0)|(std::abs(i%9-x)==1&&std::abs(i/9-y)==1?2:0));
        for(size_t direction=0;direction<rays.size();direction++){auto d=rays[direction];for(int u=x+d[0],v=y+d[1];inside(u,v);u+=d[0],v+=d[1])attackRays[k][direction].push_back(v*9+u);}
        for(auto d:horses)`);
 s=patch(s,'for(auto d:rays) {\n        int count=0,distance=0;\n        for(int u=x+d[0],v=y+d[1];inside(u,v);u+=d[0],v+=d[1]) {\n            distance++;Piece p=b[v*9+u];',`for(size_t direction=0;direction<rays.size();direction++){
        auto d=rays[direction];int count=0,distance=0;for(int square:attackRays[k][direction]){distance++;Piece p=b[square];`);
 s=patch(s,'(p.side==0?v<=4:v>=5)))return true;','(p.side==0?y<=4:y>=5)))return true;');
 s=patch(s,'const int kx=king%9,ky=king/9;','const auto& geometry=kingGeometry[king>=0?king:0];');
 s=patch(s,'const int fx=f%9,fy=f/9,tx=t%9,ty=t/9;\n        // Removing','// Removing');
 s=patch(s,'const bool sensitive=fx==kx||fy==ky||tx==kx||ty==ky||(std::abs(fx-kx)==1&&std::abs(fy-ky)==1);','const bool sensitive=geometry[f]||(geometry[t]&1);');
 const legacy=fs.readFileSync('native/movegen-variants.mjs','utf8'),generator=legacy.match(/const generator=`([\s\S]*?)`;/)?.[1];if(!generator)throw Error('Direct generator unavailable');
 s=patch(s,'void legalInto(',generator+'\nvoid legalInto(');
 s=patch(s,'for(int t:candidates(b,f,captures)) {','for(int t:pseudoDestinations(b,f,captures)) {');
 const a=s.indexOf('void legalInto('),b=s.indexOf('std::vector<Move> legal(',a);if(a<0||b<a)throw Error('Mask source anchors');
 const scan=s.slice(a,b),signature='void legalInto(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out,int checked=-1,bool brightQuietOnly=false)';
 if(!scan.includes(signature))throw Error('Mask query signature');
 const masked=scan.replace(signature,'void legalMaskedImpl(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out,const SquareBits& active,int checked=-1,bool brightQuietOnly=false)').replace('for(int f=0;f<90;f++)if(b[f].side==side&&','for(int f:active)if(b[f].side==side&&');
 s=patch(s,'struct State {',`struct SquareBits {std::array<uint64_t,2> words{};void toggle(int i){words[i>>6]^=uint64_t(1)<<(i&63);}bool operator==(const SquareBits& x)const{return words==x.words;}
    struct Iterator {uint64_t low,high;int operator*()const{return low?__builtin_ctzll(low):64+__builtin_ctzll(high);}Iterator& operator++(){if(low)low&=low-1;else high&=high-1;return *this;}bool operator!=(const Iterator& x)const{return low!=x.low||high!=x.high;}};Iterator begin()const{return {words[0],words[1]};}Iterator end()const{return {0,0};}};
struct State {std::array<SquareBits,2> occupied{};`);
 s=patch(s,'void xorPiece(State& s,Piece p,int i) {',masked+`std::array<SquareBits,2> rebuiltMasks(const Board& b){std::array<SquareBits,2> out{};for(int i=0;i<90;i++)if(b[i].live())out[b[i].side].toggle(i);return out;}
void legalMaskedInto(State& s,int side,bool captures,bool first,int king,std::vector<Move>& out,int checked=-1,bool brightQuietOnly=false){
#ifdef MIST_VERIFY_RESTORE
    if(!(s.occupied==rebuiltMasks(s.board)))throw std::logic_error("combined mask stale");
#endif
    legalMaskedImpl(s.board,side,captures,first,king,out,s.occupied[side],checked,brightQuietOnly);
#ifdef MIST_VERIFY_RESTORE
    std::vector<Move> expected;legalInto(s.board,side,captures,first,king,expected,checked,brightQuietOnly);if(out!=expected)throw std::logic_error("combined mask order");
#endif
}
void xorPiece(State& s,Piece p,int i) {`);
 s=patch(s,'xorPiece(s,p,i);if(!p.hidden&&p.type==K)','s.occupied[p.side].toggle(i);xorPiece(s,p,i);if(!p.hidden&&p.type==K)');
 s=patch(s,'Undo old={p,q,s.h1,s.h2,s.neural};s.nnueUpdates++;','Undo old={p,q,s.h1,s.h2,s.neural};s.occupied[p.side].toggle(m.from);s.occupied[p.side].toggle(m.to);if(q.live())s.occupied[q.side].toggle(m.to);s.nnueUpdates++;');
 s=patch(s,'s.neural=old.neural;Piece p=old.p,q=old.q;if(!p.hidden','s.neural=old.neural;Piece p=old.p,q=old.q;s.occupied[p.side].toggle(m.from);s.occupied[p.side].toggle(m.to);if(q.live())s.occupied[q.side].toggle(m.to);if(!p.hidden');
 // Search and q-check queries use masks; reference scan remains in VERIFY/oracle.
 s=s.replaceAll('legalInto(s.board,s.turn,','legalMaskedInto(s,s.turn,');
 return s;
}
