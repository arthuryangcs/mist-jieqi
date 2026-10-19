import fs from'node:fs';import path from'node:path';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';
const patch=(s,a,b)=>{if(s.split(a).length!==2)throw Error('non-unique patch '+a.slice(0,80));return s.replace(a,b);};
export function forcingSource(name){let s=fs.readFileSync('benchmarks/quiet-checks/baseline.cpp','utf8');if(createHash('sha256').update(s).digest('hex')!=='eb1c25bbd4209321bbd0a881128bce0de784d300d2aed8abe6c189167ac38698')throw Error('Frozen production baseline changed');if(name==='baseline')return s;const mode={qbright:1,qall:2}[name];if(!mode)throw Error('unknown variant '+name);
 s=s.replace('// Mist Jieqi native search prototype. Default aa7644c semantics, one thread.','// Mist Jieqi: independent sampled worlds, bounded quiet-check quiescence.');
 s=patch(s,'namespace mist {',`namespace mist {\nconstexpr int quietChecksMode=${mode}; // 1: revealed movers; 2: also sampled reveal checks`);
 const helper=`// Conservative geometry prefilter; full own/enemy check tests decide legality.
// Captures remain in the ordinary quiescence list. Quiet checks are appended only
// at depth zero, with the existing qleft, negative-depth and cycle bounds intact.
void quietChecksInto(State& s,std::vector<Move>& out) {
    const int side=s.turn,enemy=side^1,k=s.kings[enemy];if(k<0)return;
    #ifdef MIST_VERIFY_RESTORE
    const Board before=s.board;const Key oldKey=s.key();const auto oldPath=s.path;
    const int oldPopulation=s.population,oldKings[2]={s.kings[0],s.kings[1]};
    #endif
    const int kx=k%9,ky=k/9;const bool alreadyChecked=inCheck(s.board,enemy,k);
    for(int f=0;f<90;f++) {
        const Piece p=s.board[f];if(p.side!=side||(quietChecksMode==1&&p.hidden))continue;
        const int fx=f%9,fy=f/9;
        for(int t:candidates(s.board,f,false)) {
            if(s.board[t].live())continue;
            const int tx=t%9,ty=t/9;
            const bool sensitive=alreadyChecked||fx==kx||fy==ky||(std::abs(fx-kx)==1&&std::abs(fy-ky)==1)||tx==kx||ty==ky||(std::abs(tx-kx)<=2&&std::abs(ty-ky)<=2);
            if(!sensitive||!pseudo(s.board,f,t))continue;
            const Move m={f,t};const Undo old=push(s,m);
            const bool gives=inCheck(s.board,enemy,s.kings[enemy]);
            const bool safe=gives&&!inCheck(s.board,side,s.kings[side]);pop(s,m,old);
            if(safe)out.push_back(m);
        }
    }
    #ifdef MIST_VERIFY_RESTORE
    if(!(s.board==before&&s.key()==oldKey&&s.path==oldPath&&s.population==oldPopulation&&s.kings[0]==oldKings[0]&&s.kings[1]==oldKings[1]))throw std::runtime_error("quiet-check state not restored");
    #endif
}
`;
 s=patch(s,'double orderingValue(const State& s,Piece p)',helper+'double orderingValue(const State& s,Piece p)');
 s=patch(s,'uint64_t nodes=0,nodeLimit=0;double limit=0;', 'uint64_t nodes=0,nodeLimit=0,qChecksSearched=0;double limit=0;');
 s=patch(s,'if(qleft<=0||moves.empty())return alpha;', 'if(qleft<=0)return alpha;if(depth==0)quietChecksInto(s,moves);if(moves.empty())return alpha;');
 s=patch(s,'bool capture=s.board[m.to].live();Undo old=push(s,m);double v;', 'bool capture=s.board[m.to].live();if(quiet&&!capture)qChecksSearched++;Undo old=push(s,m);double v;');
 s=patch(s,'s.nodes=0;for(const auto& worker:workers)s.nodes+=worker.nodes;', 's.nodes=0;s.qChecksSearched=0;for(const auto& worker:workers){s.nodes+=worker.nodes;s.qChecksSearched+=worker.qChecksSearched;}');
 s=patch(s,'std::cout<<",\\"threads\\":"<<lanes;','std::cout<<",\\"threads\\":"<<lanes<<",\\"quietChecksSearched\\":"<<s.qChecksSearched;');
 s=patch(s,'\\"independentWorldSearch\\":true}',`\\"independentWorldSearch\\":true,\\"quietChecksMode\\":${mode}}`);
 const verify='writeMoves(legal(s.board,side,true));std::cout<<\'}\';';
 s=patch(s,verify,'writeMoves(legal(s.board,side,true));const int turn=s.turn;s.turn=side;std::vector<Move> quietChecks;quietChecksInto(s,quietChecks);s.turn=turn;std::cout<<",\\"quietChecks\\":";writeMoves(quietChecks);std::cout<<\'}\';');
 return s;
}
export function compileForcing(name,{sanitize=false}={}){const dir='.cache/quiet';fs.mkdirSync(dir,{recursive:true});const source=forcingSource(name),file=path.join(dir,name+(sanitize?'-sanitized':'')+'.cpp'),binary=path.resolve(file.slice(0,-4));fs.writeFileSync(file,source);let flags=JSON.parse(fs.readFileSync('benchmarks/quiet-checks/baseline-build.json')).flags;if(sanitize)flags=flags.filter(x=>!['-O3','-DNDEBUG'].includes(x)).concat(['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer','-DMIST_VERIFY_RESTORE']);const compiler=process.env.CXX||'clang++',version=spawnSync(compiler,['--version'],{encoding:'utf8'});if(version.status!==0)throw Error(version.stderr);const result=spawnSync(compiler,[...flags,file,'-o',binary],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);const sha=x=>createHash('sha256').update(x).digest('hex');return{name,binary,sourceSha256:sha(source),binarySha256:sha(fs.readFileSync(binary)),flags,compiler:version.stdout.trim(),sanitize,warnings:result.stderr};}
