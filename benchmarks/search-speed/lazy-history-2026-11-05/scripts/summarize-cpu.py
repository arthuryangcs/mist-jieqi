from pathlib import Path
import json,statistics
D=Path('.cache/lazy-history-20261105/cpu');r=json.loads((D/'results.json').read_text());assert r['completed'] and len(r['rows'])==24;assert all(z['status']=='ok' for z in r['rows']);out={'source':r['source'],'calibration':r['control'],'method':'search whole own-child-tree CPU minus each-engine median ready-control CPU; startup/close/Node error remains','positions':[],'readiness':{},'allSearchSamples':18}
for name in ['candidate','pika']:
 vals=[z['wholeCpuMs'] for z in r['rows'] if z['name']==name and z['mode']=='ready'];out['readiness'][name]={'samples':len(vals),'medianCpuMs':statistics.median(vals),'min':min(vals),'max':max(vals)}
for pos in dict.fromkeys(z['position'] for z in r['rows'] if z['mode']=='search'):
 item={'position':pos,'engines':{}}
 for name in ['candidate','pika']:
  rows=[z for z in r['rows'] if z['name']==name and z['mode']=='search' and z['position']==pos];base=out['readiness'][name]['medianCpuMs'];values=[max(0,z['wholeCpuMs']-base)/z['searchWallMs'] for z in rows];cpu=[max(0,z['wholeCpuMs']-base) for z in rows];nps=[z['nodes']*1000/z['searchWallMs'] for z in rows];native=[z['selfCpuMs']/z['searchWallMs'] for z in rows if z.get('selfCpuMs') is not None]
  item['engines'][name]={'samples':len(rows),'cores':{'median':statistics.median(values),'min':min(values),'max':max(values)},'estimatedSearchCpuMs':statistics.median(cpu),'nativeNodeNps':statistics.median(nps),'selfReportedCoresMedian':statistics.median(native) if native else None}
 out['positions'].append(item)
(D/'summary.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
