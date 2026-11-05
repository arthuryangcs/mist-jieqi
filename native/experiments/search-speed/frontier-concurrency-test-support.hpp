int deferredOrderUnits(const Packet& p){
 int n=0;auto require=[&](bool ok){++n;if(!ok)throw std::logic_error("stable deferred order unit "+std::to_string(n));};require(sizeof(ScoredMove)==16);
 {
  TTArena arena(1024*1024);TTScope scope(arena);TTTable owner,child,other;owner.entryLimit=1024;child.sharing=std::make_shared<TTTable::Shared>(owner);
  const Key one{91,813},missing{91,814};owner.store(one,{4,0,17,{2,3}});require(child.probe(one)&&child.probe(one)->score==17);require(!child.probe(missing));require(!other.probe(one));
  child.store(one,{5,1,23,{3,4}});require(owner.probe(one)->score==23);require(child.map.empty());
  std::vector<std::future<void>> tasks;
  for(int lane=0;lane<4;lane++)tasks.push_back(std::async(std::launch::async,[&,lane]{for(int i=0;i<128;i++){const Key k{uint64_t(1000+lane*128+i),991};const int v=lane*1000+i;child.store(k,{v,i%3,double(v),{lane,i%90}});const Entry* p=child.probe(k);if(!p||p->depth!=v||p->score!=v||p->best.from!=lane)throw std::logic_error("shared TT snapshot mismatch");}}));
  for(auto& f:tasks)f.get();tasks.clear();n+=512;
  const Key same{7001,9001};child.store(same,{0,0,0,{0,0}});
  for(int lane=0;lane<4;lane++)tasks.push_back(std::async(std::launch::async,[&,lane]{for(int i=0;i<1000;i++){const int v=lane*1000+i;child.store(same,{v,v%3,double(v),{v%90,(v/90)%90}});const Entry* p=child.probe(same);if(!p||p->score!=p->depth||p->flag!=p->depth%3||p->best.from!=p->depth%90||p->best.to!=(p->depth/90)%90)throw std::logic_error("torn shared TT entry");}}));
  for(auto& f:tasks)f.get();n+=4000;require(owner.map.size()==514);require(child.map.empty());require(arena.used.load()<=arena.capacity);
 }
 uint32_t seed=0x6381b743;auto rng=[&](){seed^=seed<<13;seed^=seed>>17;seed^=seed<<5;return seed;};
 const std::vector<size_t> sizes=p.depth==17?std::vector<size_t>{0,1,2,3,15,16,23,24,25,32,64,128,512,1024,8100}:std::vector<size_t>{0,1,23,24,65};
 for(size_t size:sizes)for(int pattern=0;pattern<7;pattern++){
  std::vector<ScoredMove> scored;for(size_t i=0;i<size;i++){const double specials[]={inf,-inf,0.0,-0.0,10000000.0,1.0/3,-1.0/3};double v=pattern==0?5:pattern==1?double(i):pattern==2?double(size-i):pattern==3?double(int(rng()%17)-8)/3:pattern==4?(i%2?0.0:-0.0):pattern==5?specials[i%7]:double(rng())/4294967296.0;scored.push_back({{int(i/90),int(i%90)},v});}
  auto expected=scored;std::stable_sort(expected.begin(),expected.end(),[](const ScoredMove&a,const ScoredMove&b){return a.score>b.score;});
  for(bool deferred:{false,true}){auto actual=scored;size_t first=deferred?firstStableMaximum(actual):0;if(!deferred)std::stable_sort(actual.begin(),actual.end(),[](const ScoredMove&a,const ScoredMove&b){return a.score>b.score;});for(size_t i=0;i<size;i++)require(nextStableOrdered(actual,i,first,deferred)==expected[i].move);}
 }
 return n;
}
