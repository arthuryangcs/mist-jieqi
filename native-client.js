// Worker-compatible transport. The C++ process runs only in the loopback service.
export class NativeWorker {
 constructor({fetcher=globalThis.fetch.bind(globalThis)}={}){this.fetcher=fetcher;this.engine='cpp-native';this.closed=false;this.controller=new AbortController();this.token=crypto.randomUUID();}
 postMessage(data){if(this.started||this.closed)return;this.started=true;this.run(data);}
 async run(data){
  try{
   const response=await this.fetcher('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:this.token,view:data.view,timeMs:data.timeMs,depthMetrics:true}),signal:this.controller.signal});
   if(!response.ok){let detail;try{detail=(await response.json()).error;}catch{}throw Error(detail||'C++本机服务不可用；请用 npm start 启动，或明确选择JavaScript回退。');}
   if(response.headers.get('X-Engine')!=='cpp-native'||!response.body)throw Error('服务未确认使用C++核心');
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',complete=false;
   while(!this.closed){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let end;while((end=buffer.indexOf('\n'))>=0){if(this.closed)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;const item=JSON.parse(line);if(item.error)throw Error(item.error);const value=item.telemetry||item.result;if(value?.engine!=='cpp-native'||value?.engineVerified!==true&&!(value?.fallbackUsed===true&&value?.depth===0))throw Error('响应缺少C++核心确认');if(item.result&&!item.progress)complete=true;this.onmessage?.({data:{id:data.id,...item}});}if(done)break;}
   if(!this.closed&&!complete)throw Error('C++连接提前结束；未采用不完整结果');
  }catch(error){if(!this.closed&&error.name!=='AbortError')this.onerror?.(error);}
 }
 terminate(){if(this.closed)return;this.closed=true;this.controller.abort();if(this.started)this.fetcher('/api/search/'+this.token,{method:'DELETE',keepalive:true}).catch(()=>{});}
}
