import {analyze as base}from '../../../ai.js';
import {context,selectResult}from './selection.mjs';
export function analyze(view,options={}){
 const c=context(view),onProgress=options.onProgress;
 return selectResult(base(view,{...options,samples:15,onProgress:r=>onProgress?.(selectResult(r,c))}),c);
}
