// Isolated exact-move-generation experiment; never overwrites the playable core.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {compile} from '../downside-risk/build.mjs';
export const cache='.cache/king-geometry',dir='benchmarks/king-geometry';
export const baseline=path.resolve('.cache/native/mist-core');
export const stableSource='94dab5ee87ff8996fcf9e8f93070a8012866926822611eb0f84f6bd3607e1b2c';
export const stableBinary='5c68913e2035093465cb3807ea81604839023daa884d0c0c66ba65f5958a2d23';
export const sha=x=>createHash('sha256').update(x).digest('hex');
export const hash=p=>sha(fs.readFileSync(p));
export function sourceOf(){
 let s=fs.readFileSync('native/search.cpp','utf8');
 if(sha(s)!==stableSource)throw Error('Stable source changed: review the isolated patch');
 const patch=(a,b)=>{if(s.split(a).length!==2)throw Error('Ambiguous geometry patch');s=s.replace(a,b);};
 patch('std::array<std::vector<Leap>,90> checks;',`std::array<std::vector<Leap>,90> checks;
// Bit 1: king ray; bit 2: diagonal vacated blocker. Public geometry only.
std::array<std::array<uint8_t,90>,90> kingGeometry{};`);
 patch('int x=k%9,y=k/9;\n        for(auto d:horses)',`int x=k%9,y=k/9;
        for(int i=0;i<90;i++)kingGeometry[k][i]=uint8_t((i%9==x||i/9==y?1:0)|(std::abs(i%9-x)==1&&std::abs(i/9-y)==1?2:0));
        for(auto d:horses)`);
 patch('const int kx=king%9,ky=king/9;','const auto& geometry=kingGeometry[king>=0?king:0];');
 patch('const int fx=f%9,fy=f/9,tx=t%9,ty=t/9;\n        // Removing', '// Removing');
 patch('const bool sensitive=fx==kx||fy==ky||tx==kx||ty==ky||(std::abs(fx-kx)==1&&std::abs(fy-ky)==1);','const bool sensitive=geometry[f]||(geometry[t]&1);');
 return s;
}
export function build({sanitize=false}={}){
 if(hash(baseline)!==stableBinary)throw Error('Stable binary changed');
 fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(dir,{recursive:true});
 const suffix=sanitize?'-sanitized':'',source=path.resolve(cache+'/search.cpp'),binary=path.resolve(cache+'/mist-geometry'+suffix);
 const s=sourceOf();fs.writeFileSync(source,s);const compiler=compile(source,binary,{sanitize});
 const record={stableSourceSha256:stableSource,stableBinarySha256:stableBinary,sourceSha256:sha(s),binarySha256:hash(binary),sanitize,...compiler};
 fs.writeFileSync(cache+'/build'+suffix+'.json',JSON.stringify(record,null,2)+'\n');return {binary,...record};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(build({sanitize:process.argv.includes('--sanitize')}),null,2));
