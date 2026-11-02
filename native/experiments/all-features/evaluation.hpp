// Own composition of existing activity, information, defense and residual NNUE.
int mobility(Board b,Piece p,int i);
void auditNeural(const State& s){
#ifdef MIST_VERIFY_RESTORE
    const auto expected=observation_nnue::rebuilt(s.neural,s.board,s.turn,s.viewer);
    if(expected.stock!=s.neural.stock)throw std::logic_error("combined inventory drift");
    for(int f:{0,1})for(int h=0;h<16;h++)if(std::abs(expected.accumulator[f][h]-s.neural.accumulator[f][h])>1e-8)throw std::logic_error("combined accumulator drift");
#else
    (void)s;
#endif
}
double evaluateBase(const State& s,int side){
    s.evalCalls++;double total=0,phase=std::min(1.0,s.population/24.0);
    for(int i=0;i<90;i++){
        Piece p=s.board[i];if(!p.live())continue;const int x=i%9,y=i/9,progress=p.side==0?9-y:y;double bonus=0;
        if(!p.hidden){const double central=4-std::abs(x-4),m=mobility(s.board,p,i);
            if(p.type==P){bonus=progress*10+(progress>=5?25+central*4:0)-(progress==9?35:0);int k=s.kings[1-p.side];if(k>=0&&std::abs(x-k%9)+std::abs(y-k/9)<=2)bonus+=18;}
            else if(p.type==N)bonus=central*4+m*5+(1-phase)*16;
            else if(p.type==R)bonus=std::min(m,18.0)*2+progress*2;
            else if(p.type==C)bonus=std::min(m,16.0)*1.5+phase*20-12;
            else if(p.type==A||p.type==B){bonus=m*3+central*2;int k=s.kings[p.side];if(k>=0&&std::abs(x-k%9)+std::abs(y-k/9)<=2)bonus+=phase*10;}
            else if(p.type==K)bonus=-std::abs(x-4)*8-progress*phase*10;
        }
        if(p.hidden||p.type!=K){Piece role=p;if(role.hidden)role.type=role.role;bonus+=std::min(14,mobility(s.board,role,i))*3;}
        const double material=p.hidden?(s.poolCount[p.side]?double(s.poolValue[p.side])/s.poolCount[p.side]:0):value[p.type];total+=(p.side==side?1:-1)*(material+bonus);
    }
    total+=mist_information::bonus(s.board,side);s.nnueEvals++;const double correction=observation_nnue::correction(s.neural);return total+(side==0?correction:-correction);
}
double pressureCached(const State& s,int side){
    const Key key=s.key();auto& slot=s.pressureCache[(s.h1^(s.h2>>16))&2047];
    if(slot.valid&&slot.key==key){s.pressureHits++;return side==0?slot.red:-slot.red;}
    s.pressureMisses++;const double red=defenseDelta(s,0);slot={key,red,true};return side==0?red:-red;
}
double evaluate(const State& s,int side){return evaluateBase(s,side)+pressureCached(s,side);}
double evaluateStand(const State& s,int side,double alpha,double beta){
    const double base=evaluateBase(s,side);double material[2]={0,0};for(const Piece& p:s.board)if(p.live()&&(p.hidden||p.type!=K))material[p.side]+=defenseMaterial(s,p);
    // Each side's threats <=18% of its material; king term is in[0,104].
    const double low=-.18*material[side]-104,high=.18*material[1-side]+104;
    if(base+low>=beta){s.lazyCuts++;return base+low;}if(base+high<=alpha){s.lazyCuts++;return alpha;}return base+pressureCached(s,side);
}
