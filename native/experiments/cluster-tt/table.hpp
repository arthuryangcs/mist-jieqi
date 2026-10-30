// Own experimental code. One bounded TT arena per request, separate per-world tables.
struct TTArena {
    static constexpr size_t budget=64*1024*1024;
    void* data=::operator new(budget,std::align_val_t(64));
    std::atomic<size_t> used{0},denied{0};
    ~TTArena(){::operator delete(data,std::align_val_t(64));}
    void* allocate(size_t bytes,size_t align){
        size_t old=used.load();
        for(;;){size_t at=(old+align-1)&~(align-1);if(bytes>budget-at){denied.fetch_add(1);throw std::bad_alloc();}
            if(used.compare_exchange_weak(old,at+bytes))return static_cast<char*>(data)+at;}
    }
};
TTArena* activeTTArena=nullptr;
struct TTScope {TTArena* old;explicit TTScope(TTArena& a):old(activeTTArena){activeTTArena=&a;}~TTScope(){activeTTArena=old;}};
template<class T> struct TTAllocator {
    using value_type=T;TTArena* arena=activeTTArena;
    TTAllocator()=default;template<class U>TTAllocator(const TTAllocator<U>& a):arena(a.arena){}
    T* allocate(size_t n){if(!arena||n>SIZE_MAX/sizeof(T))throw std::bad_alloc();return static_cast<T*>(arena->allocate(n*sizeof(T),alignof(T)));}
    void deallocate(T*,size_t){}
    template<class U>bool operator==(const TTAllocator<U>& a)const{return arena==a.arena;}
    template<class U>bool operator!=(const TTAllocator<U>& a)const{return !(*this==a);}
};
struct TTTable {
#ifdef MIST_CLUSTER_TT
    struct alignas(64) Slot {Key key{};Entry entry{};bool occupied=false;};
    static_assert(sizeof(Slot)==64,"TT slot budget changed");
    Slot* slots=nullptr;size_t count=0;uint64_t replacements=0;
    void configure(size_t worlds,size_t overrideSlots=0){
        size_t target=overrideSlots?overrideSlots:TTArena::budget/worlds/sizeof(Slot);count=2;while(count*2<=target)count*=2;
        slots=static_cast<Slot*>(activeTTArena->allocate(count*sizeof(Slot),alignof(Slot)));
        for(size_t i=0;i<count;i++)new(slots+i)Slot{};
    }
    size_t bucket(const Key& k)const{uint64_t h=KeyHash{}(k);h^=h>>30;h*=0xbf58476d1ce4e5b9ULL;h^=h>>27;h*=0x94d049bb133111ebULL;h^=h>>31;return (size_t(h)&(count/2-1))*2;}
    const Entry* probe(const Key& k)const{if(!count)return nullptr;size_t i=bucket(k);for(size_t j=i;j<i+2;j++)if(slots[j].occupied&&slots[j].key==k)return &slots[j].entry;return nullptr;}
    void store(const Key& k,const Entry& e){if(!count)return;size_t i=bucket(k),victim=i;
        for(size_t j=i;j<i+2;j++){if(!slots[j].occupied||slots[j].key==k){slots[j]={k,e,true};return;}if(slots[j].entry.depth<slots[victim].entry.depth)victim=j;}
        if(e.depth>=slots[victim].entry.depth){slots[victim]={k,e,true};replacements++;}
    }
#else
    using Map=std::unordered_map<Key,Entry,KeyHash,std::equal_to<Key>,TTAllocator<std::pair<const Key,Entry>>>;
    Map map;bool reserved=false;
    void configure(size_t,size_t=0){}
    const Entry* probe(const Key& k)const{auto i=map.find(k);return i==map.end()?nullptr:&i->second;}
    void store(const Key& k,const Entry& e){auto i=map.find(k);if(i!=map.end()){i->second=e;return;}if(map.size()>=90000)return;
        try{if(!reserved){map.reserve(90000);reserved=true;}map.emplace(k,e);}catch(const std::bad_alloc&){/* Safe cache miss; counted by arena. */}
    }
#endif
};
