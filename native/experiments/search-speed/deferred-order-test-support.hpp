int deferredOrderUnits(const Packet& p){
 int n=0;auto require=[&](bool ok){++n;if(!ok)throw std::logic_error("stable deferred order unit "+std::to_string(n));};require(sizeof(ScoredMove)==16);
 uint32_t seed=0x6381b743;auto rng=[&](){seed^=seed<<13;seed^=seed>>17;seed^=seed<<5;return seed;};
 const std::vector<size_t> sizes=p.depth==17?std::vector<size_t>{0,1,2,3,15,16,23,24,25,32,64,128,512,1024,8100}:std::vector<size_t>{0,1,23,24,65};
 for(size_t size:sizes)for(int pattern=0;pattern<7;pattern++){
  std::vector<ScoredMove> scored;for(size_t i=0;i<size;i++){const double specials[]={inf,-inf,0.0,-0.0,10000000.0,1.0/3,-1.0/3};double v=pattern==0?5:pattern==1?double(i):pattern==2?double(size-i):pattern==3?double(int(rng()%17)-8)/3:pattern==4?(i%2?0.0:-0.0):pattern==5?specials[i%7]:double(rng())/4294967296.0;scored.push_back({{int(i/90),int(i%90)},v});}
  auto expected=scored;std::stable_sort(expected.begin(),expected.end(),[](const ScoredMove&a,const ScoredMove&b){return a.score>b.score;});
  for(bool deferred:{false,true}){auto actual=scored;size_t first=deferred?firstStableMaximum(actual):0;if(!deferred)std::stable_sort(actual.begin(),actual.end(),[](const ScoredMove&a,const ScoredMove&b){return a.score>b.score;});for(size_t i=0;i<size;i++)require(nextStableOrdered(actual,i,first,deferred)==expected[i].move);}
 }
 return n;
}
