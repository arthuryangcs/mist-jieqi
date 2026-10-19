// Request-level public-geometry gate, computed once, not an evaluation term.
bool criticalKing(Board board,int side) {
    const int king=kingAt(board,side);if(king<0)return true;
    if(inCheck(board,side,king))return true;
    int safe=0,controlled=0;
    for(auto d:rays) {
        int u=king%9+d[0],v=king/9+d[1];if(!inside(u,v)||!palace(u,v,side))continue;
        const int to=v*9+u;
        if(inCheck(board,side,to))controlled++;
        if(board[to].side==side||!pseudo(board,king,to))continue;
        Piece p=board[king],q=board[to];board[king]=Piece{};board[to]=p;
        safe+=!inCheck(board,side,to);board[king]=p;board[to]=q;
    }
    return controlled>0&&safe<=1;
}
// Only called at the first quiescence boundary of a gated PLAY request.
// Hypothetical revealed identities belong to the supplied samples, never truth.
void focusedQuietChecks(State& s,std::vector<Move>& out) {
    const int side=s.turn,enemy=side^1,k=s.kings[enemy];if(k<0)return;
    const int kx=k%9,ky=k/9;const bool alreadyChecked=inCheck(s.board,enemy,k);
    for(int f=0;f<90;f++) {
        const Piece p=s.board[f];if(p.side!=side)continue;const int fx=f%9,fy=f/9;
        for(int t:candidates(s.board,f,false)) {
            if(s.board[t].live())continue;const int tx=t%9,ty=t/9;
            const bool sensitive=alreadyChecked||fx==kx||fy==ky||(std::abs(fx-kx)==1&&std::abs(fy-ky)==1)||tx==kx||ty==ky||(std::abs(tx-kx)<=2&&std::abs(ty-ky)<=2);
            if(!sensitive||!pseudo(s.board,f,t))continue;
            const Move m={f,t};const Undo old=push(s,m);
            const bool gives=inCheck(s.board,enemy,s.kings[enemy]);
            const bool safe=gives&&!inCheck(s.board,side,s.kings[side]);pop(s,m,old);
            if(safe)out.push_back(m);
        }
    }
}
