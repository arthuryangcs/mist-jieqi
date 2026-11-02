import fs from 'node:fs';import {sourceOf as nullSource} from '../verified-null/build.mjs';import {patch} from '../time-search/build.mjs';
const read=n=>fs.readFileSync(new URL(n,import.meta.url),'utf8');
export function compose(){
 let s=nullSource({trial:true,trace:true});
 s='#include "nnue.hpp"\n#include <thread>\n#include <mutex>\n#include <condition_variable>\n#include <queue>\n#include <memory>\n'+s;
 s=patch(s,'uint32_t h1,h2;int turn,c0,v0,c1,v1,extensions;','uint32_t h1,h2;int turn,c0,v0,c1,v1,extensions;std::array<std::array<int,6>,2> inventory;');
 s=patch(s,'extensions==k.extensions;}','extensions==k.extensions&&inventory==k.inventory;}');
 s=patch(s,'return size_t(h);','for(const auto& row:k.inventory)for(int x:row)h^=uint64_t(uint32_t(x))+0x9e3779b97f4a7c15ULL+(h<<6)+(h>>2);return size_t(h);');
 const ta=s.indexOf('struct TTTable {'),tb=s.indexOf('struct State {',ta);if(ta<0||tb<ta)throw Error('TT anchors missing');s=s.slice(0,ta)+read('table.hpp')+'\nstruct PressureCacheEntry {Key key{};double red=0;bool valid=false;};\n'+s.slice(tb);
 s=patch(s,'Board board;int turn=0,viewer=-1,',`observation_nnue::State neural;mutable std::array<PressureCacheEntry,2048> pressureCache{};
    mutable uint64_t evalCalls=0,nnueEvals=0,nnueUpdates=0,pressureHits=0,pressureMisses=0,lazyCuts=0;
    Board board;int turn=0,viewer=-1,`);
 s=patch(s,'return {h1,h2,turn,poolCount[0],poolValue[0],poolCount[1],poolValue[1],ext};','return {h1,h2,turn,poolCount[0],poolValue[0],poolCount[1],poolValue[1],ext,neural.stock};');
 s=patch(s,'for(int t:pool)s.poolValue[side]+=value[t];','for(int t:pool){s.poolValue[side]+=value[t];s.neural.stock[side][t-1]++;}');
 s=patch(s,'s.path.reserve(128);s.path.push_back(s.key());return s;','s.neural=observation_nnue::rebuilt(s.neural,s.board,s.turn,s.viewer);s.path.reserve(128);s.path.push_back(s.key());return s;');
 // Full pressure feature needs friendly-square pseudo attacks. Legal callers retain false.
 s=patch(s,'bool pseudo(const Board& b,int f,int t) {','bool pseudo(const Board& b,int f,int t,bool friendly=false) {');
 s=patch(s,'if(!p.live()||q.side==p.side)return false;','if(!p.live()||(!friendly&&q.side==p.side))return false;');
 const ea=s.indexOf('double evaluate(const State& s,int side) {'),eb=s.indexOf('struct Undo',ea);if(ea<0||eb<ea)throw Error('Evaluation anchors');
 const policy=read('../information-value/policy.hpp').replace('#pragma once','')+'\n'+read('../downside-risk/policy.hpp').replace('#pragma once','');
 s=policy+'\n'+s.slice(0,ea)+'#define MIST_DEFENSE_THREATS 1\n#define MIST_DEFENSE_KING 1\n#define MIST_DEFENSE_CACHE 0\n'+read('../../defense-eval.inc')+'\n'+read('evaluation.hpp')+'\n'+s.slice(eb);
 s=patch(s,'struct Undo {Piece p,q;uint32_t h1,h2;};','struct Undo {Piece p,q;uint32_t h1,h2;observation_nnue::State neural;};');
 s=patch(s,'Undo old={p,q,s.h1,s.h2};',`Undo old={p,q,s.h1,s.h2,s.neural};s.nnueUpdates++;
    observation_nnue::piece(s.neural,p,m.from,-1);observation_nnue::piece(s.neural,q,m.to,-1);Piece shown=p;shown.hidden=false;observation_nnue::piece(s.neural,shown,m.to,1);
    if(p.hidden)observation_nnue::changeStock(s.neural,p.side,p.type,-1);
    if(q.live()&&q.hidden&&p.side==s.viewer)observation_nnue::changeStock(s.neural,q.side,q.type,-1);
    observation_nnue::changeTurn(s.neural,s.turn,1-s.turn);`);
 s=patch(s,'s.turn^=1;return old;','s.turn^=1;auditNeural(s);return old;');
 s=patch(s,'Piece p=old.p,q=old.q;if(!p.hidden','s.neural=old.neural;Piece p=old.p,q=old.q;if(!p.hidden');
 s=patch(s,'s.h1=old.h1;s.h2=old.h2;','s.h1=old.h1;s.h2=old.h2;auditNeural(s);');
 s=patch(s,'const int originalTurn=s.turn;double v;','const int originalTurn=s.turn;const auto originalNeural=s.neural;double v;');
 s=patch(s,'nullSearches++;s.turn=1-s.turn;','nullSearches++;s.turn=1-s.turn;s.nnueUpdates++;observation_nnue::changeTurn(s.neural,originalTurn,s.turn);auditNeural(s);');
 s=patch(s,'catch(...){s.turn=originalTurn;throw;}s.turn=originalTurn;','catch(...){s.turn=originalTurn;s.neural=originalNeural;auditNeural(s);throw;}s.turn=originalTurn;s.neural=originalNeural;auditNeural(s);');
 // LMR is active on real paths; null verification retains its less-selective subtree.
 s=patch(s,'Move best;bool first=true;','Move best;bool first=true;int moveCount=0;');
 s=patch(s,'bool capture=s.board[m.to].live();Undo old=push(s,m);double v;','bool capture=s.board[m.to].live();++moveCount;Undo old=push(s,m);double v;');
 const pvs='else {v=-search(s,depth-1,-alpha-1,-alpha,ply+1,quiet?qleft-1:qleft,extensions,allowNull,nullPlies);if(v>alpha&&v<beta)v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft,extensions,allowNull,nullPlies);}';
 s=patch(s,pvs,`else {int reduction=0;
                if(nullPlies==0&&depth>=3&&!check&&!capture&&moveCount>=4&&std::abs(alpha)<97000&&history[hbase+m.index()]<400&&std::find(killers.at(ply).begin(),killers.at(ply).end(),m)==killers.at(ply).end()&&!inCheck(s.board,s.turn,s.kings[s.turn]))reduction=1+int(depth>=6&&moveCount>=8);
                if(reduction){lmrSearches++;v=-search(s,depth-1-reduction,-alpha-1,-alpha,ply+1,qleft,extensions,allowNull,nullPlies);if(v>alpha){lmrResearches++;v=-search(s,depth-1,-alpha-1,-alpha,ply+1,qleft,extensions,allowNull,nullPlies);}}
                else v=-search(s,depth-1,-alpha-1,-alpha,ply+1,quiet?qleft-1:qleft,extensions,allowNull,nullPlies);
                if(v>alpha&&v<beta)v=-search(s,depth-1,-beta,-alpha,ply+1,quiet?qleft-1:qleft,extensions,allowNull,nullPlies);
            }`);
 s=patch(s,'struct Search {',read('../cycle-parity/cycle.hpp')+'\n'+read('dispatch.hpp')+'\nstruct Search {');
 s=patch(s,'std::find(s.path.begin(),s.path.end(),path)!=s.path.end()','sameTurnCycle(s.path,path)');
 s=patch(s,'uint64_t nullSearches=0,','bool tacticalFocus=false,strictDepth=false;uint64_t lmrSearches=0,lmrResearches=0,quietQueries=0,quietAdded=0,quietSearched=0,tacticalAdded=0;uint64_t nullSearches=0,');
 s=patch(s,'if(entry.depth>=depth){','if(strictDepth?entry.depth==depth:entry.depth>=depth){');
 // One q-check edge per line; critical public king geometry also allows sampled reveal checks.
 s=patch(s,'int extensions=2,bool allowNull=true','int extensions=2,int quietChecks=1,bool allowNull=true');
 s=patch(s,'int extensions,bool allowNull,int nullPlies)','int extensions,int quietChecks,bool allowNull,int nullPlies)');
 s=s.replaceAll('extensions,allowNull,nullPlies)','extensions,quietChecks,allowNull,nullPlies)').replaceAll('extensions,false,nullPlies','extensions,quietChecks,false,nullPlies');
 s=patch(s,'bool capture=s.board[m.to].live();++moveCount;','bool capture=s.board[m.to].live();const int nextChecks=quiet&&!capture?quietChecks-1:quietChecks;if(quiet&&!capture)quietSearched++;++moveCount;');
 // Recursive real edges spend the q-check budget; entry into node keeps it unchanged.
 const lo=s.indexOf('for(Move m:moves) {',s.indexOf('struct Search {')),hi=s.indexOf('void writeMove',lo);let part=s.slice(lo,hi);part=part.replaceAll('extensions,quietChecks,allowNull,nullPlies)','extensions,nextChecks,allowNull,nullPlies)');s=s.slice(0,lo)+part+s.slice(hi);
 s=patch(s,'std::vector<Move>& out,int checked=-1) {','std::vector<Move>& out,int checked=-1,bool brightQuietOnly=false) {');
 s=patch(s,'for(int f=0;f<90;f++)if(b[f].side==side)for(int t:candidates(b,f,captures)) {','for(int f=0;f<90;f++)if(b[f].side==side&&(!brightQuietOnly||!b[f].hidden))for(int t:candidates(b,f,captures)) {');
 s=patch(s,'if(b[t].side==side)continue;const int role=','if(b[t].side==side||(brightQuietOnly&&b[t].live()))continue;const int role=');
 s=patch(s,'double orderingValue(const State& s,Piece p)',read('../../focus-tactics.inc')+'\ndouble orderingValue(const State& s,Piece p)');
 s=patch(s,'bool quiet=depth<=0&&!check;auto& moves=',`bool quiet=depth<=0&&!check;double stand=0;
        if(quiet){stand=evaluateStand(s,s.turn,alpha,beta);if(stand>=beta){auto& probe=probeBuffers.at(ply);legalInto(s.board,s.turn,false,true,s.kings[s.turn],probe,check);if(probe.empty())return -mate+(ply-nullPlies);return stand;}}
        auto& moves=`);
 s=patch(s,'if(quiet){double stand=evaluate(s,s.turn);if(stand>=beta)return stand;alpha=std::max(alpha,stand);if(qleft<=0||moves.empty())return alpha;}',`if(quiet){alpha=std::max(alpha,stand);if(qleft<=0)return alpha;
            if(quietChecks>0){quietQueries++;auto& probe=probeBuffers.at(ply);legalInto(s.board,s.turn,false,false,s.kings[s.turn],probe,check,true);
                for(Move m:probe){Undo u=push(s,m);const bool gives=inCheck(s.board,s.turn,s.kings[s.turn]);pop(s,m,u);if(gives){moves.push_back(m);quietAdded++;}}
                if(depth==0&&tacticalFocus){std::vector<Move> extra;focusedQuietChecks(s,extra);for(Move m:extra)if(std::find(moves.begin(),moves.end(),m)==moves.end()){moves.push_back(m);tacticalAdded++;}}
            }if(moves.empty())return alpha;
        }`);
 s=patch(s,'struct ScoredMove {Move move;double score;};',`struct ScoredMove {Move move;double score;};
void stableMoveSort(std::vector<ScoredMove>& a){for(size_t i=1;i<a.size();i++){auto item=a[i];size_t j=i;while(j&&item.score>a[j-1].score){a[j]=a[j-1];j--;}a[j]=item;}}`);
 s=patch(s,'std::stable_sort(scored.begin(),scored.end(),[](const ScoredMove& a,const ScoredMove& b){return a.score>b.score;});','stableMoveSort(scored);');
 s=patch(s,'Move move;std::vector<double> worldScores;double score=0,spread=0,winRate=0;','Move move;std::vector<double> worldScores;double baseScore=0,tailLoss=0,riskWeight=0,riskPenalty=0;double score=0,spread=0,winRate=0;');
 s=patch(s,'row.spread=std::sqrt(row.spread/scores.size());row.winRate=probability*100;return row;','row.spread=std::sqrt(row.spread/scores.size());row.winRate=probability*100;row.baseScore=row.score;row.tailLoss=uncertain?mist_risk::lowerTailLoss(scores):0;return row;');
 s=patch(s,'if(r.draw)std::cout','std::cout<<",\\\"baseScore\\\":"<<r.baseScore<<",\\\"tailLoss\\\":"<<r.tailLoss<<",\\\"riskWeight\\\":"<<r.riskWeight<<",\\\"riskPenalty\\\":"<<r.riskPenalty;if(r.draw)std::cout');
 return s;
}
