# Optional Unix own-child CPU diagnosis; no process listing/attach and no engine modifications.
from pathlib import Path
import os,sys,json,time,signal,subprocess,resource
root=Path(__file__).resolve().parents[3];p=Path(os.environ.get('MIST_C7_CPU_DIR',root/'.cache/native/search-speed/c7/cpu-reproduction'));p.mkdir(parents=True,exist_ok=True);probe=Path(__file__).with_name('cpu-c7-probe.mjs');out=p/'results.json';assert not out.exists()
def cpu():
 r=resource.getrusage(resource.RUSAGE_CHILDREN);return r.ru_utime+r.ru_stime
before=cpu();control_start=time.monotonic();control_child="import subprocess,sys,time,json;x=subprocess.run([sys.executable,'-c','import time;s=time.process_time();sum(i*i for i in range(3000000));print(time.process_time()-s)'],check=True,capture_output=True,text=True);print(json.dumps({'ownCpu':time.process_time(),'grandchildCpu':float(x.stdout)}))";cal=subprocess.run([sys.executable,'-c',control_child],check=True,capture_output=True,text=True,timeout=10);expected=json.loads(cal.stdout);control={'wallSeconds':time.monotonic()-control_start,'childTreeCpuSeconds':cpu()-before,'reported':expected};assert expected['grandchildCpu']>.001 and control['childTreeCpuSeconds']>=.9*(expected['ownCpu']+expected['grandchildCpu']),'descendant CPU accounting not verified'
r={'completed':False,'control':control,'source':'resource.getrusage(RUSAGE_CHILDREN), own waited Node and engine subtree only','limits':['Whole process CPU includes Node, startup and close; readiness controls approximate those costs.','No OS process list or attach; CPU ratio is not node-equivalence or strength.','Do not mix into frozen performance or match outcomes.'],'rows':[]}
def save():out.write_text(json.dumps(r,indent=2)+'\n')
positions=['overlay-holdout/opening/900603/0','overlay-holdout/opening/900617/3','near-confirmation/ending/9711333/0','near-confirmation/ending/9711560/0']
tasks=[(n,positions[0],'ready',i) for i in range(3) for n in ['c6','gather','pika']]
for i in range(3):
 for j,pos in enumerate(positions):
  names=['c6','gather','pika'];o=(i+j)%3
  tasks.extend((n,pos,'search',i) for n in names[o:]+names[:o])
try:
 for name,pos,mode,repeat in tasks:
  if (p/'STOP').exists():break
  before=cpu();start=time.monotonic();child=subprocess.Popen(['node',str(probe),name,pos,mode],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True,cwd=root);row={'name':name,'position':pos,'mode':mode,'repeat':repeat}
  try:
   stdout,stderr=child.communicate(timeout=30);row.update(json.loads(stdout.strip()) if stdout.strip() else {});row['returncode']=child.returncode;row['stderr']=stderr;row['status']='ok' if child.returncode==0 and not stderr else 'technical'
  except subprocess.TimeoutExpired:
   if child.poll() is None:
    try:os.killpg(child.pid,signal.SIGKILL)
    except ProcessLookupError:pass
   stdout,stderr=child.communicate();row.update(status='timeout',returncode=child.returncode,stderr=stderr)
  row.update(wholeWallMs=(time.monotonic()-start)*1000,wholeCpuMs=(cpu()-before)*1000);r['rows'].append(row);save();print(json.dumps({'done':len(r['rows']),**row}),flush=True)
  if row['status']=='timeout' or any(x in row.get('stderr','') for x in ['EACCES','EPERM','Permission denied']):
   r['blocked']='owned child timeout or permission failure; no repeated launches';break
 r['completed']=len(r['rows'])==45
finally:save()
