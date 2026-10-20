import fs from 'node:fs';import path from 'node:path';
import {appSource,clientSource as priorClient,previewModule} from './focus-web.mjs';import {patch} from './focus-variants.mjs';
export {previewModule};
export function clientSource(){return patch(priorClient(),'if(!item.progress)complete=true;',`if(item.result?.depth>0&&item.result.minimumComparisonRoots!==undefined){const r=item.result;if(!Number.isInteger(r.minimumComparisonRoots)||r.minimumComparisonRoots<Math.min(2,r.rootCount)||r.minimumComparisonRoots>r.rootCount||r.comparedCount<r.minimumComparisonRoots)throw Error('候选比较范围无效，已停止');}if(!item.progress)complete=true;`);}
export function writePreview(){
 const root=path.resolve('.cache/frontier-web');fs.mkdirSync(root,{recursive:true});
 for(const f of ['index.html','style.css','board.svg','engine.js','ai.js','editor.js','worker.js','deadline-search.js'])fs.copyFileSync(f,path.join(root,f));
 fs.writeFileSync(path.join(root,'app.js'),appSource());fs.writeFileSync(path.join(root,'native-client.js'),clientSource());
 let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 html=patch(html,'<footer>','<details class="card"><summary>C++实战与分析范围</summary><p>实战可集中精算部分候选。候选主深度只代表标出的精算走法，全候选层数单独显示；未显示的走法仍可能更好。手动分析仍为全候选搜索。这是覆盖与封顶补算实验，不代表已验证棋力提升。</p></details><footer>覆盖与封顶实验 · 尚未作为默认启用 · ');
 fs.writeFileSync(path.join(root,'index.html'),html);return root;
}
