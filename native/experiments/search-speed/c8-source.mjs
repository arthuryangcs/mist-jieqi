// Isolated geometry experiment on exact C7. Importing this module does not build or write files.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {c7Source,c7UnitSource} from './c7-source.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export const C7_SOURCE_SHA256='855cccb05cff5a4eb3efa919546f41d7b66ae7b852490ecf0b81115f7f9f20d0';

const geometry = String.raw`
// Ordered geometry only: no sampled identity, evaluation, or mutable State data.
struct NonSliderStep {uint8_t to=0;int8_t block=-1;};
struct NonSliderGeometry {std::array<NonSliderStep,8> steps{};uint8_t count=0;};
using NonSliderTable=std::array<NonSliderGeometry,4*2*2*90>;
static_assert(sizeof(NonSliderStep)==2&&sizeof(NonSliderGeometry)==17,"non-slider geometry layout");
static_assert(sizeof(NonSliderTable)==24480&&sizeof(NonSliderTable)<=50*1024,"non-slider geometry budget");
// Written during initialize(), before any search worker exists. The table itself is const.
const NonSliderTable* nonSliderGeometryTable=nullptr;
int nonSliderKind(int type){switch(type){case N:return 0;case A:return 1;case B:return 2;case P:return 3;default:return -1;}}
size_t nonSliderIndex(int kind,int side,bool hidden,int from){return size_t(((kind*2+side)*2+int(hidden))*90+from);}
void initializeNonSlider(){
    static const NonSliderTable table=[](){
        NonSliderTable result{};
        const std::array<int,4> types={N,A,B,P};
        for(int kind=0;kind<4;kind++)for(int side=0;side<2;side++)for(bool hidden:{false,true})for(int from=0;from<90;from++){
            auto& entry=result[nonSliderIndex(kind,side,hidden,from)];
            const int type=types[kind],x=from%9,y=from/9;
            auto append=[&](int u,int v,int block){
                if(!inside(u,v))return;
                if(entry.count>=entry.steps.size())throw std::logic_error("non-slider geometry capacity");
                entry.steps[entry.count++]={uint8_t(v*9+u),int8_t(block)};
            };
            if(type==N){
                // This is horses[] order, not coordinate or destination order.
                for(auto d:horses){
                    const int u=x+d[0],v=y+d[1];if(!inside(u,v))continue;
                    const int leg=(y+(std::abs(d[1])==2?sign(d[1]):0))*9+x+(std::abs(d[0])==2?sign(d[0]):0);
                    append(u,v,leg);
                }
            }else if(type==A||type==B){
                const int distance=type==A?1:2;
                for(int dx:{-distance,distance})for(int dy:{-distance,distance}){
                    const int u=x+dx,v=y+dy;if(!inside(u,v))continue;
                    if(type==A){if(!hidden||palace(u,v,side))append(u,v,-1);}
                    else if(!hidden||(side==0?v>=5:v<=4))append(u,v,(y+dy/2)*9+x+dx/2);
                }
            }else{
                // Preserve forward, right, left, including the river restriction.
                append(x,y+(side==0?-1:1),-1);
                if(side==0?y<=4:y>=5){append(x+1,y,-1);append(x-1,y,-1);}
            }
        }
        return result;
    }();
    nonSliderGeometryTable=&table;
}
Destinations nonSliderDestinations(const Board& b,int from,bool captures,int kind){
    const Piece p=b[from];const auto& entry=(*nonSliderGeometryTable)[nonSliderIndex(kind,p.side,p.hidden,from)];
    Destinations out;
    for(unsigned i=0;i<entry.count;i++){
        const NonSliderStep step=entry.steps[i];
        if(step.block>=0&&b[unsigned(step.block)].live())continue;
        const Piece q=b[step.to];
        if(q.side!=p.side&&(!captures||q.live()))out.push_back(step.to);
    }
#ifdef MIST_VERIFY_RESTORE
    auto expected=hintDestinations(b,from,captures,-1);
    if(expected.count!=out.count||!std::equal(expected.begin(),expected.end(),out.begin()))throw std::logic_error("non-slider destinations/order differs");
#endif
    return out;
}

`;

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw Error('non-slider C7 source anchor changed');
  return source.replace(before, after);
}

export function applyC8Geometry(source) {
  if(sha(source)!==C7_SOURCE_SHA256)throw Error('C8 base source changed; review the geometry patch');
  source = replaceOnce(source,
    'void initializeHCE();\nvoid initialize() {initializeHCE();',
    'void initializeHCE();\nvoid initializeNonSlider();\nvoid initialize() {initializeHCE();initializeNonSlider();');
  const before = 'Destinations lineDestinations(const Board& b,const OccupiedBits& occupied,int f,bool captures,int enemyKing){const Piece p=b[f];const int type=p.effective();if(type!=R&&type!=C)return kingHintEnabled?hintDestinations(b,f,captures,enemyKing):pseudoDestinations(b,f,captures);';
  const after = 'Destinations lineDestinations(const Board& b,const OccupiedBits& occupied,int f,bool captures,int enemyKing){const Piece p=b[f];const int type=p.effective();if(type!=R&&type!=C){const int kind=nonSliderKind(type);if(kingHintEnabled&&p.live()&&kind>=0)return nonSliderDestinations(b,f,captures,kind);return kingHintEnabled?hintDestinations(b,f,captures,enemyKing):pseudoDestinations(b,f,captures);}';
  return replaceOnce(source, before, geometry + after);
}

export function c8Source(){return applyC8Geometry(c7Source());}
export function c8UnitSource(source){
 const anchor='void verify(const Packet& p) {',handler='+sharedLineUnits(packet.depth==17);';
 const cpp=c7UnitSource(source);
 if(cpp.split(anchor).length!==2||cpp.split(handler).length!==2)throw Error('C8 unit anchors changed');
 return cpp.replace(anchor,fs.readFileSync(new URL('./c8-test-support.hpp',import.meta.url),'utf8')+'\n'+anchor).replace(handler,'+sharedLineUnits(packet.depth==17)+nonSliderGeometryUnits(packet.depth==17);');
}
