// Two-way bounded TT. Full NNUE inventory key needs a 128-byte slot.
struct TTTable {
    struct alignas(64) Slot {Key key{};Entry entry{};uint32_t generation=0;};
    static_assert(sizeof(Slot)==128,"full inventory slot budget changed");
    Slot* slots=nullptr;size_t count=0,live=0;uint32_t generation=1;
    mutable uint64_t probes=0,hits=0;uint64_t stores=0,replacements=0,clears=0;
    void configure(size_t worlds){size_t target=TTArena::budget/worlds/sizeof(Slot);count=2;while(count*2<=target)count*=2;slots=static_cast<Slot*>(activeTTArena->allocate(count*sizeof(Slot),alignof(Slot)));for(size_t i=0;i<count;i++)new(slots+i)Slot{};}
    size_t bucket(const Key& k)const{uint64_t h=KeyHash{}(k);h^=h>>30;h*=0xbf58476d1ce4e5b9ULL;h^=h>>27;h*=0x94d049bb133111ebULL;h^=h>>31;return (size_t(h)&(count/2-1))*2;}
    const Entry* probe(const Key& k)const{probes++;if(!count)return nullptr;size_t i=bucket(k);for(size_t j=i;j<i+2;j++)if(slots[j].generation==generation&&slots[j].key==k){hits++;return &slots[j].entry;}return nullptr;}
    void store(const Key& k,const Entry& e){if(!count)return;stores++;size_t i=bucket(k),victim=i;for(size_t j=i;j<i+2;j++){if(slots[j].generation!=generation||slots[j].key==k){if(slots[j].generation!=generation)live++;slots[j]={k,e,generation};return;}if(slots[j].entry.depth<slots[victim].entry.depth)victim=j;}if(e.depth>=slots[victim].entry.depth){slots[victim]={k,e,generation};replacements++;}}
    void clear(){clears++;live=0;if(++generation==0){for(size_t i=0;i<count;i++)slots[i].generation=0;generation=1;}}
    size_t size()const{return live;}
};
