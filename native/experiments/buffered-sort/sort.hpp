// Frozen bottom-up stable merge sort, insertion base 16. No score arithmetic.
// Priorities must not be NaN: operator> must be a strict weak ordering.
// Scratch belongs to one Search; sorting is complete before recursive search.
#include <algorithm>
#include <vector>
template<class T> void bufferedStableSort(std::vector<T>& a,std::vector<T>& scratch) {
    const size_t n=a.size();
    constexpr size_t base=16;
    for(size_t lo=0;lo<n;lo+=base) {
        const size_t hi=std::min(n,lo+base);
        for(size_t i=lo+1;i<hi;++i) {
            const T item=a[i];size_t j=i;
            while(j>lo&&item.score>a[j-1].score){a[j]=a[j-1];--j;}
            a[j]=item;
        }
    }
    if(n<=base)return;
    scratch.resize(n);
    auto* src=&a;auto* dst=&scratch;
    for(size_t width=base;width<n;width*=2) {
        for(size_t lo=0;lo<n;lo+=2*width) {
            const size_t mid=std::min(n,lo+width),hi=std::min(n,lo+2*width);
            size_t l=lo,r=mid,k=lo;
            while(l<mid&&r<hi)(*dst)[k++]=(*src)[r].score>(*src)[l].score?(*src)[r++]:(*src)[l++];
            while(l<mid)(*dst)[k++]=(*src)[l++];
            while(r<hi)(*dst)[k++]=(*src)[r++];
        }
        std::swap(src,dst);
    }
    if(src!=&a)std::copy(src->begin(),src->end(),a.begin());
}
