import {analyze} from './ai.js';
// The UI needs five candidates; keep the complete root table inside the search worker.
const wire=({allCandidates,...result})=>({...result,engine:'javascript',engineVerified:true});
self.onmessage=({data})=>{try{let result=analyze(data.view,{timeMs:data.timeMs,onProgress:result=>self.postMessage({id:data.id,progress:true,result:wire(result)})});self.postMessage({id:data.id,result:wire(result)});}catch(e){self.postMessage({id:data.id,error:e.message});}};
