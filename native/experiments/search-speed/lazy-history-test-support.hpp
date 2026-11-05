 Search a,b;require(!a.history.owned&&!b.history.owned);for(int i=0;i<16200;i++)require(a.history[i]==0&&b.history[i]==0);
 a.history.writable(0)=0;for(int i=0;i<16200;i++)require(a.history[i]==0);
 for(uint32_t v=0;v<=2000;v++)for(uint64_t depth:{0ULL,1ULL,2ULL,44ULL,45ULL,127ULL,32767ULL,65535ULL,1000000ULL,2147483646ULL}){
  const uint32_t expected=std::min(uint32_t(2000),v+uint32_t(std::min(uint64_t(2000),depth*depth)));
  auto& h=a.history.writable(v);h=v;h=std::min(uint32_t(2000),h+uint32_t(std::min(uint64_t(2000),depth*depth)));require(a.history[v]==expected);require(b.history[v]==0);
 }
 require(a.history.owned!=nullptr&&!b.history.owned);require(a.history.values!=b.history.values);require(b.history.values==SearchHistory::zero.data());
