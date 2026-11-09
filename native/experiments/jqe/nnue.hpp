#pragma once
// Portable adaptation of jqe/engine/src/nnue.{h,cpp}, revision
// 331a6e612a038c4a04cf980f7b9482910fd50078. Inference only, not rules/search.
// MIT License
// Copyright (c) 2026 Devin O'Keefe
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace mist_jqe {
constexpr int MAX_FT=1024, QF=254, QA=127;
// Mist type K R N B C A P -> upstream K R N B A C P (zero based).
constexpr int TYPE_MAP[7]={0,1,2,3,5,4,6};
constexpr int SLOT_MAP[6]={0,1,2,4,3,5};
inline int orient(int side,int square) { return side ? square : (9-square/9)*9+square%9; }
struct Model {
    int ft=0,l1=0,l2=0,features=0,buckets=1;
    bool useQuantized=true;
    float outScale=400,outB=0;
    std::vector<float> ftW,ftB,l1W,l1B,l2W,l2B,outW,l1qInv;
    std::vector<int16_t> ftWq,ftBq;
    std::vector<int8_t> l1q;
    bool loaded() const { return ft>0; }
    bool quantized() const { return useQuantized; }
    int ft_size() const { return ft+1; }
    int king_buckets() const { return buckets; }
    // Load into a temporary: errors never replace a valid model. Call only before
    // creating states/starting search threads; mode is immutable during search.
    void load(const char* path,bool quantized=true) {
        if(!path)throw std::runtime_error("JQE model path required");
        std::ifstream in(path,std::ios::binary);
        if(!in)throw std::runtime_error("Cannot open JQE model");
        auto u32=[&]() { unsigned char b[4];in.read(reinterpret_cast<char*>(b),4);
            if(!in)throw std::runtime_error("Truncated JQE model");
            return uint32_t(b[0])|(uint32_t(b[1])<<8)|(uint32_t(b[2])<<16)|(uint32_t(b[3])<<24); };
        auto real=[&]() { uint32_t bits=u32();float f;static_assert(sizeof(f)==4,"32-bit float required");std::memcpy(&f,&bits,4);
            if(!std::isfinite(f)||std::fabs(f)>1.e6f)throw std::runtime_error("Invalid JQE floating-point field");return f; };
        char magic[4];in.read(magic,4);
        if(!in||std::memcmp(magic,"JQN1",4))throw std::runtime_error("Invalid JQE magic");
        const auto version=u32(),nf=u32(),f=u32(),a=u32(),b=u32();
        const auto kb=nf>=30&&(nf-30)%1440==0?(nf-30)/1440:0;
        if(!((version==1&&kb==1)||(version==2&&(kb==3||kb==9)))||f<8||f>MAX_FT||f%8||a<1||a>256||b<1||b>256)
            throw std::runtime_error("Unsupported JQE dimensions/version");
        Model n;n.ft=int(f);n.l1=int(a);n.l2=int(b);n.features=int(nf);n.buckets=int(kb);n.useQuantized=quantized;n.outScale=real();
        if(n.outScale<=0)throw std::runtime_error("Invalid JQE output scale");
        auto read=[&](std::vector<float>& dst,std::size_t count) {dst.resize(count);for(float& v:dst)v=real();};
        read(n.ftW,std::size_t(nf)*(f+1));read(n.ftB,f+1);read(n.l1W,std::size_t(a)*2*f);read(n.l1B,a);
        read(n.l2W,std::size_t(b)*a);read(n.l2B,b);read(n.outW,b);n.outB=real();
        char extra;if(in.get(extra))throw std::runtime_error("Trailing JQE model bytes");
        if(!in.eof())throw std::runtime_error("JQE model read error");
        if(quantized) {
            auto q16=[](float v) {return int16_t(std::lround(std::clamp(v*float(QF),-32767.f,32767.f)));};
            n.ftWq.resize(n.ftW.size());n.ftBq.resize(n.ftB.size());
            std::transform(n.ftW.begin(),n.ftW.end(),n.ftWq.begin(),q16);std::transform(n.ftB.begin(),n.ftB.end(),n.ftBq.begin(),q16);
            n.l1q.resize(n.l1W.size());n.l1qInv.resize(a);
            for(int o=0;o<n.l1;++o) {
                float mx=0;for(int i=0;i<2*n.ft;++i)mx=std::max(mx,std::fabs(n.l1W[o*2*n.ft+i]));
                float scale=mx>0?127.f/mx:1.f;
                if(!std::isfinite(scale)||!std::isfinite(float(QA)*scale))throw std::runtime_error("JQE quantization scale overflow");
                n.l1qInv[o]=1.f/(float(QA)*scale);
                for(int i=0;i<2*n.ft;++i)n.l1q[o*2*n.ft+i]=int8_t(std::clamp(std::lround(n.l1W[o*2*n.ft+i]*scale),-127L,127L));
            }
        }
        *this=std::move(n);
    }
    void load(const std::string& path,bool quantized=true) {load(path.c_str(),quantized);}
};
inline Model model;
struct State {
    std::array<std::array<int,6>,2> stock{}; // Mist order: R N B C A P.
    std::array<std::array<float,MAX_FT+1>,2> accumulator{};
    std::array<std::array<int16_t,MAX_FT+1>,2> quantizedAccumulator{};
    // Public piece encoding: 0 empty, 1..8 red K R N B A C P DARK,
    // 17..24 black. Hidden type and role are deliberately never stored.
    std::array<uint8_t,90> board{};
    std::array<int,2> bucket{};
    bool operator==(const State& other)const {
        return stock==other.stock&&board==other.board&&bucket==other.bucket&&
               accumulator==other.accumulator&&quantizedAccumulator==other.quantizedAccumulator;
    }
};
inline int kingBucket(int side,int square) {
    if(model.buckets==1)return 0;
    const int s=orient(side,square),x=s%9,y=s/9;
    if(x<3||x>5||y>2)throw std::runtime_error("JQE king outside home palace");
    return model.buckets==9?y*3+x-3:x-3;
}
inline int pieceFeature(int code,int square,int perspective,int bucket) {
    return bucket*1440+(((code>>4)==perspective?0:8)+(code&15)-1)*90+orient(perspective,square);
}
inline int stockFeature(int side,int slot,int count,int perspective) {
    return model.buckets*1440+(side==perspective?0:15)+2*SLOT_MAP[slot]+count-1;
}
inline int16_t wrap16(int v) { const uint16_t u=uint16_t(v);return int16_t(u<32768?int(u):int(u)-65536); }
inline void feature(State& state,int perspective,int id,int delta) {
    if(id<0||id>=model.features)throw std::runtime_error("JQE feature out of range");
    const std::size_t start=std::size_t(id)*(model.ft+1);
    if(model.useQuantized)for(int i=0;i<=model.ft;++i)state.quantizedAccumulator[perspective][i]=wrap16(int(state.quantizedAccumulator[perspective][i])+delta*int(model.ftWq[start+i]));
    else for(int i=0;i<=model.ft;++i)state.accumulator[perspective][i]+=delta*model.ftW[start+i];
}
inline void refresh(State& state,int perspective) {
    if(!model.loaded())throw std::runtime_error("JQE model not loaded");
    if(model.useQuantized)std::copy(model.ftBq.begin(),model.ftBq.end(),state.quantizedAccumulator[perspective].begin());
    else std::copy(model.ftB.begin(),model.ftB.end(),state.accumulator[perspective].begin());
    // Match upstream refresh order: red pieces, black pieces, then urn slots.
    for(int side=0;side<2;++side)for(int s=0;s<90;++s)if(state.board[s]&&(state.board[s]>>4)==side)
        feature(state,perspective,pieceFeature(state.board[s],s,perspective,state.bucket[perspective]),1);
    constexpr int upstreamToMist[6]={0,1,2,4,3,5};
    for(int side=0;side<2;++side)for(int slot:upstreamToMist)for(int j=1;j<=state.stock[side][slot];++j)
        feature(state,perspective,stockFeature(side,slot,j,perspective),1);
}
template<class Piece>int publicCode(const Piece& p) {
    if(!p.live())return 0;
    if(p.side<0||p.side>1||(!p.hidden&&(p.type<0||p.type>6)))throw std::runtime_error("Invalid JQE piece");
    return (p.side<<4)+(p.hidden?8:TYPE_MAP[p.type]+1);
}
template<class Piece>void piece(State& state,const Piece& p,int square,int delta) {
    const int code=publicCode(p);if(!code)return;
    if(square<0||square>=90||(delta!=1&&delta!=-1))throw std::runtime_error("Invalid JQE piece update");
    if((delta==1&&state.board[square])||(delta==-1&&state.board[square]!=code))throw std::runtime_error("JQE board update mismatch");
    state.board[square]=delta==1?uint8_t(code):0;
    const int owner=code>>4;
    for(int perspective=0;perspective<2;++perspective) {
        // Retain bucket on removal: a move is remove followed by add. Captured
        // kings terminate search; retained bucket is also safe for that state.
        if(delta==1&&(code&15)==1&&perspective==owner&&state.bucket[owner]!=kingBucket(owner,square)) {
            state.bucket[owner]=kingBucket(owner,square);refresh(state,perspective);
        } else feature(state,perspective,pieceFeature(code,square,perspective,state.bucket[perspective]),delta);
    }
}
inline void changeStock(State& state,int side,int type,int delta) {
    if(side<0||side>1||type<1||type>6)throw std::runtime_error("Invalid JQE inventory index");
    int& count=state.stock[side][type-1];const int next=count+delta,limit=type==6?5:2;
    if(next<0||next>limit)throw std::runtime_error("Invalid JQE inventory count");
    for(int p=0;p<2;++p) {
        for(int j=count+1;j<=next;++j)feature(state,p,stockFeature(side,type-1,j,p),1);
        for(int j=next+1;j<=count;++j)feature(state,p,stockFeature(side,type-1,j,p),-1);
    }
    count=next;
}
inline void changeTurn(State&,int,int) {} // Side to move enters only the output head.
template<class Board>State rebuilt(const State& counts,const Board& board,int /*turn*/,int /*viewer*/) {
    State state;state.stock=counts.stock;
    for(int c=0;c<2;++c)for(int t=0;t<6;++t)if(state.stock[c][t]<0||state.stock[c][t]>(t==5?5:2))throw std::runtime_error("Invalid JQE inventory");
    for(int s=0;s<90;++s) {state.board[s]=uint8_t(publicCode(board[s]));if((state.board[s]&15)==1)state.bucket[state.board[s]>>4]=kingBucket(state.board[s]>>4,s);}
    refresh(state,0);refresh(state,1);return state;
}
inline int correction(const State& state,int side) {
    if(!model.loaded()||side<0||side>1)throw std::runtime_error("Invalid JQE evaluation");
    const int F=model.ft,L1=model.l1,L2=model.l2;
    std::array<float,2*MAX_FT> x{};std::array<float,256> h1{},h2{};
    auto clip=[](float v){return std::clamp(v,0.f,1.f);};
    if(model.useQuantized) {
        for(int half=0;half<2;++half)for(int i=0;i<F;++i)x[half*F+i]=float((std::clamp(int(state.quantizedAccumulator[side^half][i]),0,QF)+1)/2);
        for(int o=0;o<L1;++o) {
            int sum=0;for(int i=0;i<2*F;++i)sum+=int(x[i])*int(model.l1q[o*2*F+i]);
            h1[o]=clip(L1%8==0?std::fma(float(sum),model.l1qInv[o],model.l1B[o]):float(sum)*model.l1qInv[o]+model.l1B[o]);
        }
    } else {
        for(int half=0;half<2;++half)for(int i=0;i<F;++i)x[half*F+i]=clip(state.accumulator[side^half][i]);
        for(int o=0;o<L1;++o) {float v=model.l1B[o];for(int i=0;i<2*F;++i)v+=x[i]*model.l1W[o*2*F+i];h1[o]=clip(v);}
    }
    const bool upstreamFastOutput=model.useQuantized&&((L2+7)/8*8==32);
    for(int o=0;o<L2;++o) {float v=model.l2B[o];for(int i=0;i<L1;++i)v=upstreamFastOutput?std::fma(h1[i],model.l2W[o*L1+i],v):v+h1[i]*model.l2W[o*L1+i];h2[o]=clip(v);}
    float y=model.outB;
    if(upstreamFastOutput) {
        // Match upstream AVX2 32-output reduction, without requiring x86 SIMD.
        std::array<float,32> w{};std::copy(model.outW.begin(),model.outW.end(),w.begin());std::array<float,8> p{};
        for(int i=0;i<8;++i)p[i]=std::fma(h2[i+16],w[i+16],h2[i]*w[i])+std::fma(h2[i+24],w[i+24],h2[i+8]*w[i+8]);
        y+=((p[0]+p[4])+(p[2]+p[6]))+((p[1]+p[5])+(p[3]+p[7]));
    } else for(int o=0;o<L2;++o)y+=model.outW[o]*h2[o];
    y+=model.useQuantized?.5f*float(int(state.quantizedAccumulator[side][F])-int(state.quantizedAccumulator[side^1][F]))/float(QF):.5f*(state.accumulator[side][F]-state.accumulator[side^1][F]);
    return int(std::clamp(y*model.outScale,-19999.f,19999.f));
}
} // namespace mist_jqe
