import {TYPES,legalMoves,inCheck,other,positionKey,readPositionKey,repetitionStatus}from '../../../engine.js';

const same=(a,b)=>a?.from===b?.from&&a?.to===b?.to;
const clone=x=>structuredClone(x);
const kinds=['R','N','B','A','C','P'];
export function shared(view){
 if(!['r','b'].includes(view.turn)||view.board?.length!==90)throw Error('Invalid public board');
 const board=view.board.map(p=>{if(!p)return null;if(p.hidden&&Object.hasOwn(p,'type'))throw Error('Hidden truth rejected');return{side:p.side,hidden:p.hidden,role:p.role??p.type,...(!p.hidden?{type:p.type}:{})};});
 const captured=(view.captured??[]).map(p=>{if(p.hidden&&Object.hasOwn(p,'type'))throw Error('Hidden capture truth rejected');return p.wasHidden||p.hidden?{side:p.side,hidden:true}:{side:p.side,hidden:false,type:p.type};});
 return{board,captured,turn:view.turn,positions:[...(view.positions??[])],quiet:view.quiet??0,ply:view.ply??0,result:null,viewer:null};
}
function poolTypes(s,side){const pool=[...TYPES];for(const p of [...s.board,...s.captured])if(p?.side===side&&!p.hidden&&p.type!=='K'){const i=pool.indexOf(p.type);if(i>=0)pool.splice(i,1);}return kinds.filter(k=>pool.includes(k));}
function simulate(s,m,type){const board=s.board.map(p=>p?{...p}:null),p=board[m.from];board[m.to]={...p,hidden:false,type:p.hidden?type:p.type};board[m.from]=null;return{board,turn:other(p.side),captured:s.captured,quiet:0,ply:0,positions:[],result:null};}
function measure(s,side,limit){
 const legal=legalMoves(s,side),actions=[];legal.sort((a,b)=>Number(!!s.board[b.to])-Number(!!s.board[a.to])||a.from-b.from||a.to-b.to);
 for(const m of legal){if(limit.expired())return{complete:false,actions};const p=s.board[m.from],q=s.board[m.to];if(q?.type==='K')continue;
  const feasible=p.hidden?poolTypes(s,side):[p.type],identities=p.hidden?kinds:[p.type],branches=[];if(!feasible.length)throw Error('Empty public identity domain');
  for(const identity of identities){if(limit.expired())return{complete:false,actions};const n=simulate(s,m,identity),check=inCheck(n.board,other(side));let replies;
   if(check||q&&!q.hidden)replies=legalMoves(n,other(side));
   const mate=check&&replies.length===0,recaptures=q&&!q.hidden?replies.filter(r=>r.to===m.to):[];
   branches.push({identity,inventoryFeasible:feasible.includes(identity),check,mate,...(q&&!q.hidden?{directRecaptures:recaptures,noImmediateRecapture:recaptures.length===0}:{})});
  }
  if(branches.some(b=>b.mate&&b.inventoryFeasible)||q&&!q.hidden)actions.push({move:m,moverHidden:p.hidden,identityBasis:p.hidden?'six-kind-geometry-superset-with-shared-inventory-feasibility-not-probabilities':'revealed',target:q?{side:q.side,hidden:q.hidden,...(!q.hidden?{type:q.type}:{})}:null,branches});
 }
 return{complete:true,actions};
}
const possible=a=>a.branches.filter(b=>b.inventoryFeasible),all=(a,k)=>possible(a).length>0&&possible(a).every(b=>b[k]),some=(a,k)=>possible(a).some(b=>b[k]);
const aggregate=(a,k)=>({quantifier:a.branches.every(b=>b[k])?'all-enumerated-identities':a.branches.some(b=>b[k])?'some-enumerated-identities':'none',identities:a.branches.filter(b=>b[k]).map(b=>b.identity),enumeratedIdentities:a.branches.map(b=>b.identity),inventoryFeasibleIdentities:possible(a).map(b=>b.identity),feasibleQuantifier:all(a,k)?'all-feasible-identities':some(a,k)?'some-feasible-identities':'none'});
export function transitionEvidence(before,played,{after,maxMs=Infinity}={}){
 const start=performance.now(),s=shared(before),side=s.turn,expired=()=>performance.now()-start>maxMs,limit={expired};
 if(!legalMoves(s).some(m=>same(m,played)))throw Error('Illegal public transition');
 if(s.board[played.from].hidden||s.board[played.to])return{available:false,complete:true,reason:'only-reversible-revealed-moves-supported',signalOnly:true,adjudicationChanged:false};
 const n=simulate(s,played);if(after&&positionKey(n)!==positionKey(shared(after)))throw Error('Public transition mismatch');
 const wasInCheck=inCheck(s.board,side),givesCheck=inCheck(n.board,other(side));
 const a=measure(s,side,limit),b=measure(n,side,limit);
 const signature=(action,isAfter)=>JSON.stringify([isAfter&&action.move.from===played.to?played.from:action.move.from,action.move.to,action.target?.type??null]);
 const prior=new Map(a.actions.map(x=>[signature(x,false),x]));
 const threats=b.actions.map(x=>{const old=prior.get(signature(x,true)),mate=aggregate(x,'mate'),noRecapture=x.target&&!x.target.hidden?aggregate(x,'noImmediateRecapture'):null;
  const novelty=kind=>!old||!some(old,kind)?'new-action':all(old,kind)?'continued-action':all(x,kind)?'strengthened-identity-coverage':'continued-or-changed-identity-coverage';
  return{...x,mate,noImmediateRecapture:noRecapture,mateNovelty:some(x,'mate')?(a.complete?novelty('mate'):'unknown-prior-scan-incomplete'):null,captureNovelty:noRecapture&&some(x,'noImmediateRecapture')?(a.complete?novelty('noImmediateRecapture'):'unknown-prior-scan-incomplete'):null};});
 return{available:true,coverage:'last-reversible-public-transition-only',complete:a.complete&&b.complete,signalOnly:true,adjudicationChanged:false,played,side,wasInCheck,givesCheck,isEvasion:wasInCheck,
  beforeMateAvailable:a.complete||a.actions.some(x=>some(x,'mate'))?a.actions.some(x=>some(x,'mate')):null,afterMateAvailable:b.complete||b.actions.some(x=>some(x,'mate'))?b.actions.some(x=>some(x,'mate')):null,
  newlyAvailableMate:!a.complete||!b.complete?null:!a.actions.some(x=>some(x,'mate'))&&b.actions.some(x=>some(x,'mate')),
  localNoncheckingRiskCandidate:!a.complete||!b.complete?null:!wasInCheck&&!givesCheck&&threats.some(x=>x.mateNovelty==='new-action'||x.captureNovelty==='new-action'),
  threats,elapsedMs:performance.now()-start,semantics:'Hypothetical next attacker move after no defender response; no-immediate-recapture is only a local fact, not proof of material profit, long-chase liability or an unavoidable kill.',
  missingEvidence:['Longer continuous-check mating sequences and actual defender responses' ,'Stable target/piece identity over the full cycle','Immediate counter-mate after capture, complete exchanges, protected-piece, pawn/king and other2020exceptions','Both sides responsibility and relative duties','Actual adjudicator notice and two-round change record','Hidden-piece branch-specific rule interpretation']};
}
export function inspectCycle(view,{maxMs=100,enabled=true}={}){
 if(!enabled)return{enabled:false,available:false,reason:'disabled',signalOnly:true,adjudicationChanged:false};
 const started=performance.now(),s=shared(view),ps=s.positions;if(ps.length<2||ps.at(-1)!==positionKey(s))return{enabled:true,available:false,reason:'no-canonical-last-transition',signalOnly:true,adjudicationChanged:false};
 const ruling=repetitionStatus(s);if(!ruling)return{enabled:true,available:false,reason:'no-supported-repetition-gate',signalOnly:true,adjudicationChanged:false};
 const before=readPositionKey(ps.at(-2));if(!before)return{enabled:true,available:false,reason:'bad-public-history',signalOnly:true,adjudicationChanged:false};before.captured=s.captured;before.positions=ps.slice(0,-1);before.quiet=Math.max(0,s.quiet-1);before.ply=Math.max(0,s.ply-1);
 const piece=p=>p?[p.side,p.hidden?p.role:p.type,p.hidden]:null,changed=s.board.map((p,i)=>JSON.stringify(piece(p))!==JSON.stringify(piece(before.board[i]))?i:-1).filter(i=>i>=0),from=changed.find(i=>before.board[i]?.side===before.turn&&!s.board[i]),to=changed.find(i=>s.board[i]?.side===before.turn);
 if(changed.length!==2||from===undefined||to===undefined)return{enabled:true,available:false,reason:'ambiguous-transition',signalOnly:true,adjudicationChanged:false};
 return{enabled:true,existingRuling:ruling,...transitionEvidence(before,{from,to},{after:s,maxMs:Math.max(0,maxMs-(performance.now()-started))})};
}
