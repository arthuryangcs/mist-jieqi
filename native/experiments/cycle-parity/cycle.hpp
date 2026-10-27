// Inserted within namespace mist. Every real search edge toggles turn.
bool sameTurnCycle(const std::vector<Key>& history,const Key& key) {
#ifdef MIST_VERIFY_RESTORE
    for(size_t j=1;j<history.size();j++)
        if(history[j].turn==history[j-1].turn)
            throw std::runtime_error("non-alternating search path");
#endif
    const size_t first=history.empty()||history.front().turn==key.turn?0:1;
    bool found=false;
    for(size_t i=first;i<history.size();i+=2)if(history[i]==key){found=true;break;}
#ifdef MIST_VERIFY_RESTORE
    const bool reference=std::find(history.begin(),history.end(),key)!=history.end();
    if(found!=reference)throw std::runtime_error("cycle parity differs from full scan");
#endif
    return found;
}
