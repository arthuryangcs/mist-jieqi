import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
export const sha=x=>createHash('sha256').update(x).digest('hex');
export function patch(s,a,b){assert.equal(s.split(a).length,2,'Default bundle anchor: '+a.slice(0,100));return s.replace(a,b);}
export function sourceOf(){
 let s=read('base.cpp');assert.equal(sha(s),JSON.parse(read('inventory.json')).baseSha256);
 s=patch(s,'outcome>2','outcome>4');
 s=patch(s,'bool draw=false,repetitionLoss=false;','bool draw=false,repetitionLoss=false,repetitionWin=false;');
 s=patch(s,'if(r.repetitionLoss)std::cout<<",\\\"repetitionLoss\\\":true";','if(r.repetitionLoss)std::cout<<",\\\"repetitionLoss\\\":true";if(r.repetitionWin)std::cout<<",\\\"repetitionWin\\\":true";');
 s=patch(s,'Key path=s.key();if(sameTurnCycle(s.path,path)){s.cycles++;return 0;}',`Key path=s.key();if(sameTurnCycle(s.path,path)){s.cycles++;auto& probe=probeBuffers.at(ply);legalMaskedInto(s,s.turn,false,true,s.kings[s.turn],probe);if(probe.empty())return -mate+(ply-nullPlies);/* Heuristic cutoff, not formal repetition adjudication. */return evaluate(s,s.turn)-(inCheck(s.board,s.turn,s.kings[s.turn])?180:0);}`);
 s=patch(s,'if(p.outcomes[m.index()]){bool loss=p.outcomes[m.index()]==2;Row r=summarize(m,{loss?-mate+1.0:0.0},uncertain);r.draw=!loss;r.repetitionLoss=loss;r.repetitions=p.repetitions[m.index()];return r;}',`if(p.outcomes[m.index()]==4){std::vector<double> scores;for(State& world:s.worlds){Undo u=push(world,m);std::vector<Move> replies;try{legalMaskedInto(world,world.turn,false,true,world.kings[world.turn],replies);}catch(...){pop(world,m,u);throw;}pop(world,m,u);scores.push_back(replies.empty()?mate-1.0:0.0);}Row r=summarize(m,scores,uncertain);r.draw=std::all_of(scores.begin(),scores.end(),[](double x){return x==0;});r.repetitions=p.repetitions[m.index()];return r;}
        if(p.outcomes[m.index()]){const int outcome=p.outcomes[m.index()];Row r=summarize(m,{outcome==2?-mate+1.0:outcome==3?mate-1.0:0.0},uncertain);r.draw=outcome==1;r.repetitionLoss=outcome==2;r.repetitionWin=outcome==3;r.repetitions=p.repetitions[m.index()];return r;}`);
 // Use the newer stable hybrid buffer sorter, retaining the historical helper for oracle tests.
 s=patch(s,'struct Search {',read('../buffered-sort/sort.hpp')+'\nstruct Search {\n    std::vector<ScoredMove> sortScratch;');
 s=patch(s,'stableMoveSort(scored);','bufferedStableSort(scored,sortScratch);');
 // Exact rule outcomes bypass heuristic downside penalties. In uncertain
 // worlds summarize() may use a logistic score, but its value stays intact.
 s=patch(s,'accepted=rows;mist_risk::rank(accepted,uncertain);std::stable_sort', 'accepted=rows;mist_risk::rank(accepted,uncertain);for(auto& row:accepted)if(row.draw||row.repetitionLoss||row.repetitionWin){row.score=row.baseScore;row.riskWeight=0;row.riskPenalty=0;}std::stable_sort');
 s=patch(s,'initialize();observation_nnue::model.load', 'try {initialize();observation_nnue::model.load');
 s=patch(s,'    try {Packet packet;', '    Packet packet;');
 s=patch(s,'\\\"allFeatures\\\":true,','\\\"allFeatures\\\":true,\\\"defaultPreset\\\":\\\"all-compatible-v2\\\",\\\"currentRootResponsibility\\\":true,\\\"bufferedStableSort\\\":true,');
 return s;
}
