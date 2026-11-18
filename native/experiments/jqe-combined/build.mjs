import{build}from'./common.mjs';console.log(JSON.stringify(build('combined',{sanitize:process.argv.includes('--sanitize')}),(_k,v)=>typeof v==='string'?v.replaceAll(process.cwd(),'<repo>'):v));
