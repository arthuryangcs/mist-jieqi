import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const directory='.cache/movegen';
const patch=(s,a,b)=>{if(s.split(a).length!==2)throw Error('non-unique patch '+a.slice(0,70));return s.replace(a,b);};
const generator=`// Emit exactly the old candidates()+pseudo() sequence, without rescanning rays.
Destinations pseudoDestinations(const Board& b,int f,bool captures) {
    Destinations out;const Piece p=b[f];const int type=p.effective(),x=f%9,y=f/9;
    auto emit=[&](int to){const Piece q=b[to];if(q.side!=p.side&&(!captures||q.live()))out.push_back(to);};
    if(type==R||type==C) {
        for(auto d:rays) {
            bool screen=false;
            for(int u=x+d[0],v=y+d[1];inside(u,v);u+=d[0],v+=d[1]) {
                const int to=v*9+u;const bool occupied=b[to].live();
                if(type==R){emit(to);if(occupied)break;}
                else if(!screen){if(occupied)screen=true;else if(!captures)emit(to);}
                else if(occupied){emit(to);break;}
            }
        }
    }else if(type==N) {
        for(auto d:horses) {
            const int u=x+d[0],v=y+d[1];if(!inside(u,v))continue;
            const int block=(y+(std::abs(d[1])==2?sign(d[1]):0))*9+x+(std::abs(d[0])==2?sign(d[0]):0);
            if(!b[block].live())emit(v*9+u);
        }
    }else if(type==A||type==B) {
        const int distance=type==A?1:2;
        for(int dx:{-distance,distance})for(int dy:{-distance,distance}) {
            const int u=x+dx,v=y+dy;if(!inside(u,v))continue;
            if(type==A){if(!p.hidden||palace(u,v,p.side))emit(v*9+u);}
            else if(!b[(y+dy/2)*9+x+dx/2].live()&&(!p.hidden||(p.side==0?v>=5:v<=4)))emit(v*9+u);
        }
    }else if(type==P) {
        const int v=y+(p.side==0?-1:1);if(inside(x,v))emit(v*9+x);
        if(p.side==0?y<=4:y>=5){if(x<8)emit(f+1);if(x>0)emit(f-1);}
    }else if(type==K) {
        for(auto d:rays){const int u=x+d[0],v=y+d[1];if(inside(u,v)&&(palace(u,v,p.side)||(d[0]==0&&b[v*9+u].type==K)))emit(v*9+u);}
        for(int to=0;to<90;to++)if(b[to].side!=p.side&&b[to].type==K) {
            if(to%9==x&&std::find(out.begin(),out.end(),to)==out.end()) {
                const int step=to>f?9:-9;bool clear=true;
                for(int i=f+step;i!=to;i+=step)if(b[i].live()){clear=false;break;}
                if(clear)emit(to);
            }break;
        }
    }
    return out;
}
`;
export function variantSource(name){
 if(name==='path'||name==='combined'){
  let s=variantSource(name==='combined'?'safe-rays':'baseline');
  s=patch(s,'std::unordered_set<Key,KeyHash> path;','std::vector<Key> path;');
  s=patch(s,'s.path.insert(s.key());return s;','s.path.reserve(128);s.path.push_back(s.key());return s;');
  s=patch(s,'s.path.find(path)!=s.path.end()','std::find(s.path.begin(),s.path.end(),path)!=s.path.end()');
  s=patch(s,'s.path.insert(path);','s.path.push_back(path);');
  if(s.split('s.path.erase(path)').length!==3)throw Error('unexpected path pop sites');
  s=s.replaceAll('s.path.erase(path)','s.path.pop_back()');
  return s;
 }
 let s=fs.readFileSync('benchmarks/native-movegen/baseline.cpp','utf8');
 if(name==='baseline')return s;
 if(name==='rays'||name==='safe-rays')s=patch(s,'if(!pseudo(b,f,t))continue;Piece p=b[f],q=b[t];',
  'if(b[t].side==side)continue;const int role=b[f].effective();if(role!=R&&role!=C&&!pseudo(b,f,t))continue;Piece p=b[f],q=b[t];');
 if(name==='rays')return s;
 if(name==='safe'||name==='safe-rays'){
  s=patch(s,'void legalInto(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out) {\n    if(king==-2)king=kingAt(b,side);out.clear();',`void legalInto(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out,int checked=-1) {
    if(king==-2)king=kingAt(b,side);out.clear();
    const bool noCheck=king>=0&&!(checked<0?inCheck(b,side,king):checked);
    const int kx=king%9,ky=king/9;`);
  s=patch(s,'Piece p=b[f],q=b[t];b[t]=p;b[f]=Piece{};',`Piece p=b[f],q=b[t];
        const int fx=f%9,fy=f/9,tx=t%9,ty=t/9;
        // Removing a ray blocker or a horse/elephant blocker can expose check;
        // adding a ray blocker can create a cannon screen. Keep the full test there.
        const bool sensitive=fx==kx||fy==ky||tx==kx||ty==ky||(std::abs(fx-kx)==1&&std::abs(fy-ky)==1);
        if(noCheck&&!(!p.hidden&&p.type==K)&&!sensitive){out.push_back({f,t});if(first)return;continue;}
        b[t]=p;b[f]=Piece{};`);
  s=patch(s,'legalInto(s.board,s.turn,quiet,false,s.kings[s.turn],moves);','legalInto(s.board,s.turn,quiet,false,s.kings[s.turn],moves,check);');
  s=patch(s,'legalInto(s.board,s.turn,false,true,s.kings[s.turn],probe);','legalInto(s.board,s.turn,false,true,s.kings[s.turn],probe,check);');
  return s;
 }
 if(name!=='direct')throw Error('unknown variant');
 s=patch(s,'void legalInto(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out) {',generator+'void legalInto(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out) {');
 s=patch(s,'for(int f=0;f<90;f++)if(b[f].side==side)for(int t:candidates(b,f,captures)) {\n        if(!pseudo(b,f,t))continue;',
  'for(int f=0;f<90;f++)if(b[f].side==side)for(int t:pseudoDestinations(b,f,captures)) {\n       ');
 return s;
}
export function compileVariant(name,{guard=false}={}){
 fs.mkdirSync(directory,{recursive:true});let s=variantSource(name);
 if(guard){
  if(name==='safe'||name==='safe-rays'||name==='combined'){
   if(name==='combined')s=patch(s,'double elapsed=s.elapsed();const Iteration* last=',`for(size_t i=0;i<s.worlds.size();i++) {
        const State& w=s.worlds[i];int population=0;for(Piece piece:p.worlds[i])if(piece.live()&&(piece.hidden||piece.type!=K))population++;
        if(w.path.size()!=1||!(w.path.front()==w.key())||!(w.board==p.worlds[i])||w.kings[0]!=kingAt(w.board,0)||w.kings[1]!=kingAt(w.board,1)||w.population!=population)throw std::logic_error("search state/path not restored");
    }
    double elapsed=s.elapsed();const Iteration* last=`);
   if(name!=='safe')s=patch(s,'if(role!=R&&role!=C&&!pseudo(b,f,t))continue;',
    'if((role==R||role==C)&&!pseudo(b,f,t))throw std::logic_error("ray skip disagrees with pseudo");if(role!=R&&role!=C&&!pseudo(b,f,t))continue;');
   s=patch(s,'if(noCheck&&!(!p.hidden&&p.type==K)&&!sensitive){out.push_back({f,t});if(first)return;continue;}',`if(noCheck&&!(!p.hidden&&p.type==K)&&!sensitive){
            b[t]=p;b[f]=Piece{};const bool unexpected=inCheck(b,side,king);b[f]=p;b[t]=q;
            if(unexpected)throw std::logic_error("safe check skip disagrees with full check");
            out.push_back({f,t});if(first)return;continue;
        }`);
  }else{
  if(name!=='direct')throw Error('unsupported guard');
  s=patch(s,'for(int f=0;f<90;f++)if(b[f].side==side)for(int t:pseudoDestinations(b,f,captures)) {',`for(int f=0;f<90;f++)if(b[f].side==side) {
        std::vector<int> expected;for(int t:candidates(b,f,captures))if(pseudo(b,f,t))expected.push_back(t);
        auto direct=pseudoDestinations(b,f,captures);if(expected!=std::vector<int>(direct.begin(),direct.end()))throw std::logic_error("pseudo destination order differs");
        for(int t:direct) {`);
  s=patch(s,'if(safe) {out.push_back({f,t});if(first)return;}\n    }\n}', 'if(safe) {out.push_back({f,t});if(first)return;}\n    }}\n}');
  }
 }
 const suffix=name+(guard?'-guard':''),source=path.join(directory,suffix+'.cpp'),binary=path.resolve(directory,suffix),sha=x=>createHash('sha256').update(x).digest('hex');fs.writeFileSync(source,s);
 const flags=JSON.parse(fs.readFileSync('benchmarks/native-movegen/baseline-build.json')).flags,compiler=process.env.CXX||'clang++';
 const version=spawnSync(compiler,['--version'],{encoding:'utf8'});if(version.status!==0)throw Error(version.stderr);
 const r=spawnSync(compiler,[...flags,source,'-o',binary],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);
 return{name:suffix,binary,sourceSha256:sha(s),binarySha256:sha(fs.readFileSync(binary)),compiler:version.stdout.trim(),flags,warnings:r.stderr};
}
