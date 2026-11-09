#include "sort.hpp"
#include <cstdint>
#include <cstring>
#include <limits>
#include <iostream>
#include <stdexcept>
struct Item {int id;double score;};
uint64_t bits(double d){uint64_t x;std::memcpy(&x,&d,8);return x;}
int main(){
 std::vector<Item> scratch;uint64_t rng=20261109,cases=0;
 auto next=[&](){rng^=rng<<13;rng^=rng>>7;rng^=rng<<17;return rng;};
 const double edge[]={0.0,-0.0,std::numeric_limits<double>::infinity(),-std::numeric_limits<double>::infinity(),std::numeric_limits<double>::denorm_min(),-std::numeric_limits<double>::denorm_min(),std::numeric_limits<double>::max(),-std::numeric_limits<double>::max()};
 // Ascending then descending lengths stress scratch growth, shrinkage and reuse.
 for(int pass=0;pass<2;pass++)for(int length=0;length<=1024;length++)for(int mode=0;mode<7;mode++){
  const int n=pass?1024-length:length;std::vector<Item>a;
  for(int i=0;i<n;i++){double score=mode==0?1:mode==1?i:mode==2?-i:mode==3?double(next()%7)-3:mode==4?edge[next()%8]:mode==5?double(int64_t(next()%20000001)-10000000):double(int64_t(next()))/4294967296.0;a.push_back({i,score});}
  auto oracle=a;std::stable_sort(oracle.begin(),oracle.end(),[](auto a,auto b){return a.score>b.score;});
  bufferedStableSort(a,scratch);for(int i=0;i<n;i++)if(a[i].id!=oracle[i].id||bits(a[i].score)!=bits(oracle[i].score))throw std::runtime_error("sort oracle mismatch");
  // Scratch overwrites must not modify the sorted source or any other ply buffer.
  const auto saved=a;std::vector<Item>other={{9,-0.0},{8,1}};bufferedStableSort(other,scratch);
  for(int i=0;i<n;i++)if(a[i].id!=saved[i].id||bits(a[i].score)!=bits(saved[i].score))throw std::runtime_error("scratch alias");cases++;
 }
 std::cout<<"{\"passed\":true,\"cases\":"<<cases<<",\"maxLength\":1024,\"scratchCapacity\":"<<scratch.capacity()<<"}\n";
}
