import {build} from './common.mjs';
const name=process.argv[2];
console.log(JSON.stringify(build(name,{sanitize:process.argv.includes('--sanitize')}),(_k,v)=>typeof v==='string'?v.replaceAll(process.cwd(),'<repo>'):v));
