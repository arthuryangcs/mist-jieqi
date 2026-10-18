import {analyze} from './ai.js';
self.onmessage=({data})=>{try{let result=analyze(data.view,{timeMs:data.timeMs,onProgress:result=>self.postMessage({id:data.id,progress:true,result})});self.postMessage({id:data.id,result});}catch(e){self.postMessage({id:data.id,error:e.message});}};
