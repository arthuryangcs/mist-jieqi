import fs from 'node:fs';import {D,H,featureIndices,redBase} from './features.mjs';
export function loadModel(file){
 const bytes=fs.readFileSync(file);if(bytes.subarray(0,8).toString('binary')!=='JQNNUE1\0'||bytes.readUInt32LE(8)!==D||bytes.readUInt32LE(12)!==H)throw Error('Bad model');let offset=24;
 const read=()=>{const v=bytes.readFloatLE(offset);offset+=4;return v;};
 const weight=Array.from({length:D},()=>Array.from({length:H},read)),bias=Array.from({length:H},read),output=Array.from({length:H},read),outputBias=read();if(offset!==bytes.length)throw Error('Model size mismatch');
 return {weight,bias,output,outputBias,cap:bytes.readFloatLE(16),scale:bytes.readFloatLE(20)};
}
export function forward(view,model){
 const features=featureIndices(view),accumulators=features.map(ids=>{const a=[...model.bias];for(const id of ids)for(let h=0;h<H;h++)a[h]+=model.weight[id][h];return a;});
 const z=accumulators.map(a=>a.reduce((s,x,h)=>s+Math.max(0,Math.min(1,x))*model.output[h],model.outputBias));
 const correction=model.cap*.5*(Math.tanh(z[0])-Math.tanh(z[1]));return {features,accumulators,correction,score:redBase(view)+correction};
}
