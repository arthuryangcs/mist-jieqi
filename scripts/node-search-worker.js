import {parentPort} from 'node:worker_threads';import {analyze} from '../ai.js';
parentPort.on('message',data=>{try{let result=analyze(data.view,{timeMs:data.timeMs,onProgress:result=>parentPort.postMessage({id:data.id,progress:true,result})});parentPort.postMessage({id:data.id,result});}catch(error){parentPort.postMessage({id:data.id,error:error.message});}});
parentPort.postMessage({ready:true});
