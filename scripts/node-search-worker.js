import {parentPort,workerData} from 'node:worker_threads';const {analyze}=await import(workerData?.moduleUrl||'../ai.js');
const wire=({allCandidates,...result})=>result;
parentPort.on('message',data=>{try{let result=analyze(data.view,{timeMs:data.timeMs,features:data.features,onProgress:result=>parentPort.postMessage({id:data.id,progress:true,result:wire(result)})});parentPort.postMessage({id:data.id,result:wire(result)});}catch(error){parentPort.postMessage({id:data.id,error:error.message});}});
parentPort.postMessage({ready:true});
