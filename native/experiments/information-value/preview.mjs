import {createLocalServer} from '../../server.mjs';
import {build} from './build.mjs';
const port=Number(process.env.PORT||8767);if(!Number.isInteger(port)||port<1024||port>65535||port===8766)throw Error('Use a separate local port (default 8767); 8766 is reserved for stable');
const built=build(),service=createLocalServer({executable:built.binary,buildInfo:{...built,threads:4,independentWorldSearch:true}});
service.info.experiment='known-piece-bonus-8';await service.listen(port);
console.log(`已知明子 +8 分实验：http://127.0.0.1:${port}/（独立核心，默认8766服务不变）`);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{service.close().then(()=>process.exit(0));});
