// Independent piece-square mask experiment. Stable core is read-only.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {compile,patch,hash,sha,stableSource,stableBinary,baseline} from '../standpat/build.mjs';
export {compile,patch,hash,sha,stableSource,stableBinary,baseline};
export const cache='.cache/piece-mask',dir='benchmarks/piece-mask';
export function sourceOf(){
 const original=fs.readFileSync('native/search.cpp','utf8');if(sha(original)!==stableSource)throw Error('Review changed stable source first');let s=original;
 const a=original.indexOf('void legalInto('),b=original.indexOf('std::vector<Move> legal(',a);if(a<0||b<0)throw Error('Legal function anchors missing');
 const masked=original.slice(a,b).replace('void legalInto(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out,int checked=-1)', 'void legalMaskedImpl(Board& b,int side,bool captures,bool first,int king,std::vector<Move>& out,const SquareBits& active,int checked=-1)').replace('for(int f=0;f<90;f++)if(b[f].side==side)','for(int f:active)');
 s=patch(s,'struct State {',`struct SquareBits {
    std::array<uint64_t,2> words{};
    void toggle(int square){words[square>>6]^=uint64_t(1)<<(square&63);}
    bool operator==(const SquareBits& other)const{return words==other.words;}
    struct Iterator {
        uint64_t low,high;
        int operator*()const{return low?__builtin_ctzll(low):64+__builtin_ctzll(high);}
        Iterator& operator++(){if(low)low&=low-1;else high&=high-1;return *this;}
        bool operator!=(const Iterator& x)const{return low!=x.low||high!=x.high;}
    };
    Iterator begin()const{return {words[0],words[1]};}Iterator end()const{return {0,0};}
};
struct State {`);
 s=patch(s,'    Board board;int turn=0,viewer=-1,','    std::array<SquareBits,2> occupied{};\n    Board board;int turn=0,viewer=-1,');
 const helpers=masked+`std::array<SquareBits,2> rebuiltMasks(const Board& b){
    std::array<SquareBits,2> masks{};for(int i=0;i<90;i++)if(b[i].live())masks[b[i].side].toggle(i);return masks;
}
void legalMaskedInto(State& s,int side,bool captures,bool first,int king,std::vector<Move>& out,int checked=-1){
#ifdef MIST_VERIFY_RESTORE
    if(s.occupied!=rebuiltMasks(s.board))throw std::runtime_error("piece mask stale before generation");
#endif
    legalMaskedImpl(s.board,side,captures,first,king,out,s.occupied[side],checked);
#ifdef MIST_VERIFY_RESTORE
    std::vector<Move> reference;legalInto(s.board,side,captures,first,king,reference,checked);
    if(out!=reference)throw std::runtime_error("masked legal order differs from scan");
#endif
}
std::vector<Move> maskedLegal(State& s,int side,bool captures=false){
    std::vector<Move> out;out.reserve(48);legalMaskedInto(s,side,captures,false,-2,out);return out;
}
`;
 s=patch(s,'void xorPiece(State& s,Piece p,int i) {',helpers+'void xorPiece(State& s,Piece p,int i) {');
 s=patch(s,'xorPiece(s,p,i);if(!p.hidden&&p.type==K)','s.occupied[p.side].toggle(i);xorPiece(s,p,i);if(!p.hidden&&p.type==K)');
 s=patch(s,'Piece p=s.board[m.from],q=s.board[m.to];Undo old={p,q,s.h1,s.h2};','Piece p=s.board[m.from],q=s.board[m.to];Undo old={p,q,s.h1,s.h2};\n    s.occupied[p.side].toggle(m.from);s.occupied[p.side].toggle(m.to);if(q.live())s.occupied[q.side].toggle(m.to);');
 s=patch(s,'Piece p=old.p,q=old.q;if(!p.hidden','Piece p=old.p,q=old.q;\n    s.occupied[p.side].toggle(m.from);s.occupied[p.side].toggle(m.to);if(q.live())s.occupied[q.side].toggle(m.to);\n    if(!p.hidden');
 s=patch(s,'legalInto(s.board,s.turn,quiet,false,s.kings[s.turn],moves,check);','legalMaskedInto(s,s.turn,quiet,false,s.kings[s.turn],moves,check);');
 s=patch(s,'legalInto(s.board,s.turn,false,true,s.kings[s.turn],probe,check);','legalMaskedInto(s,s.turn,false,true,s.kings[s.turn],probe,check);');
 s=patch(s,'w.kings[0]==expected.kings[0]&&w.kings[1]==expected.kings[1]','w.kings[0]==expected.kings[0]&&w.kings[1]==expected.kings[1]&&w.occupied==expected.occupied');
 // VERIFY deliberately exercises the cached path, with the scan retained as oracle.
 s=patch(s,'State s=stateOf(p.worlds[0],p.captured,p.turn,p.viewer);std::cout', 'State s=stateOf(p.worlds[0],p.captured,p.turn,p.viewer);if(s.occupied!=rebuiltMasks(s.board))throw std::runtime_error("initial mask mismatch");std::cout');
 s=patch(s,'writeMoves(legal(s.board,side));','writeMoves(maskedLegal(s,side));');
 s=patch(s,'writeMoves(legal(s.board,side,true));','writeMoves(maskedLegal(s,side,true));');
 s=patch(s,'auto moves=legal(s.board,s.turn);','auto moves=maskedLegal(s,s.turn);');
 s=patch(s,'Undo u=push(s,m);std::cout','Undo u=push(s,m);if(s.occupied!=rebuiltMasks(s.board))throw std::runtime_error("pushed mask mismatch");std::cout');
 s=patch(s,'writeMoves(legal(s.board,s.turn));','writeMoves(maskedLegal(s,s.turn));');
 s=patch(s,'s.kings[0]==oldKings[0]&&s.kings[1]==oldKings[1])?', 's.kings[0]==oldKings[0]&&s.kings[1]==oldKings[1]&&s.occupied==rebuiltMasks(before))?');
 return s;
}
export function build({sanitize=false}={}){
 if(hash(baseline)!==stableBinary)throw Error('Stable binary changed');fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});
 const source=path.resolve(cache+'/search.cpp'),binary=path.resolve(cache+'/mist-mask'+(sanitize?'-sanitized':''));fs.writeFileSync(source,sourceOf());
 const compiler=compile(source,binary,{sanitize}),record={stableSourceSha256:stableSource,stableBinarySha256:stableBinary,sourceSha256:hash(source),binarySha256:hash(binary),sanitize,...compiler};
 fs.writeFileSync(cache+`/build${sanitize?'-sanitized':''}.json`,JSON.stringify(record,null,2)+'\n');return {binary,...record};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize')}),null,2));
