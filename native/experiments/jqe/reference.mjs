import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {cache,hash,upstreamCommit,sourceOf,patch} from './build.mjs';import {remaining} from '../../../ai.js';
export const types='RNB CAP'.replace(' ','');
export function features(view,buckets=1){
 if(view.board.some(p=>p?.hidden&&'type'in p)||view.captured.some(p=>p.hidden&&'type'in p))throw Error('Hidden truth is not an observation');
 const slots=[0,1,2,4,3,5],kind={K:0,R:1,N:2,B:3,A:4,C:5,P:6};
 return ['r','b'].map(perspective=>{
  const orient=s=>perspective==='r'?(9-Math.floor(s/9))*9+s%9:s;
  const king=view.board.findIndex(p=>p&&!p.hidden&&p.type==='K'&&p.side===perspective),sq=king<0?4:orient(king),bucket=buckets===1?0:buckets===9?Math.floor(sq/9)*3+sq%9-3:sq%9-3;
  const ids=[];view.board.forEach((p,s)=>{if(p)ids.push(bucket*1440+((p.side===perspective?0:8)+(p.hidden?7:kind[p.type]))*90+orient(s));});
  for(const side of ['r','b']){const bag=remaining(view,side);for(let t=0;t<6;t++)for(let j=1;j<=bag.filter(x=>x===types[t]).length;j++)ids.push(buckets*1440+(side===perspective?0:15)+2*slots[t]+j-1);}
  return ids.sort((a,b)=>a-b);
 });
}
export function buildReference({sanitize=false}={}){
 const upstream='external/jqe',rev=spawnSync('git',['-C',upstream,'rev-parse','HEAD'],{encoding:'utf8'});
 if(rev.status!==0||rev.stdout.trim()!==upstreamCommit)throw Error(`Reference requires external/jqe at ${upstreamCommit}`);
 const files=['nnue.cpp','nnue.h','position.h','types.h','tables.h','mem.h'];
 const sourceHashes=Object.fromEntries(files.map(f=>[f,hash(`${upstream}/engine/src/${f}`)]));
 const dirty=spawnSync('git',['-C',upstream,'diff','--exit-code','HEAD','--',...files.map(f=>'engine/src/'+f)],{encoding:'utf8'});if(dirty.status!==0)throw Error('Reference sources differ from pinned commit');
 fs.mkdirSync(cache,{recursive:true});fs.copyFileSync('native/experiments/jqe/nnue.hpp',cache+'/nnue.hpp');
 fs.writeFileSync(cache+'/search-audit.cpp',sourceOf().replace(/\n}\s*$/, '\n    return 0;\n}\n'));fs.copyFileSync('native/experiments/jqe/reference.cpp',cache+'/reference.cpp');
 const flags=['-std=c++17','-ffp-contract=off','-mavx2','-mfma',...(sanitize?['-O1','-g','-fsanitize=address,undefined','-fno-omit-frame-pointer']:['-O2']),'-I'+path.resolve(upstream+'/engine/src')];
 if(process.platform==='darwin'){const sdk=spawnSync('xcrun',['--show-sdk-path'],{encoding:'utf8'});if(sdk.status!==0)throw Error(sdk.stderr);flags.push('-isystem',path.join(sdk.stdout.trim(),'usr/include/c++/v1'));}else flags.push('-pthread');
 const binary=path.resolve(cache+'/reference'+(sanitize?'-sanitized':'')),compiler=process.env.CXX||'clang++',r=spawnSync(compiler,[...flags,path.resolve(cache+'/reference.cpp'),'-o',binary],{encoding:'utf8',timeout:120000});if(r.status!==0)throw Error(r.stderr||String(r.error));
 return {binary,upstreamCommit,sourceHashes,compiler,flags,warnings:r.stderr.trim()};
}
