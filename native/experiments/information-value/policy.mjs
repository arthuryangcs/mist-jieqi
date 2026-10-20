export const points=8,limit=8;
// Experimental proxy for identity certainty, not a proven value of information.
// Captured pieces, kings and sampled hidden identities never earn this bonus.
export function informationBonus(view,side){
 if(!['r','b'].includes(side))throw Error('Invalid side');
 const counts={r:0,b:0};for(const p of view.board)if(p&&!p.hidden&&p.type!=='K')counts[p.side]++;
 return points*(Math.min(limit,counts[side])-Math.min(limit,counts[side==='r'?'b':'r']));
}
