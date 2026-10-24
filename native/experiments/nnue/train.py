"""CPU-only NumPy residual NNUE. No external models, downloads, or cloud calls."""
import os
for key in ['OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','VECLIB_MAXIMUM_THREADS']:
    os.environ[key]='1'
import json,hashlib,struct,time,sys
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[3]
PLAN=json.loads((Path(__file__).with_name('plan.json')).read_text())
CACHE=ROOT/'.cache/nnue'; OUT=ROOT/'benchmarks/nnue'; MODEL=ROOT/'models/experimental/observation-nnue-v1.bin'
assert not MODEL.exists(), 'Do not overwrite the frozen model'
data_bytes=(CACHE/'data.json').read_bytes(); data=json.loads(data_bytes)
manifest=json.loads((OUT/'data-manifest.json').read_text())
assert hashlib.sha256(data_bytes).hexdigest()==manifest['dataSha256']
D=PLAN['network']['features']; H=PLAN['network']['hidden']; CAP=PLAN['network']['residualCapCp']; SCALE=PLAN['network']['sigmoidScaleCp']

def arrays(name):
    rows=data['splits'][name]; length=max(len(f) for r in rows for f in r['features'])
    ids=np.full((len(rows),2,length),D,dtype=np.int32)
    for i,r in enumerate(rows):
        for f,features in enumerate(r['features']): ids[i,f,:len(features)]=features
    return ids,np.array([r['base']for r in rows]),np.array([r['target']for r in rows]),np.array([r['weight']for r in rows])

train=arrays('train'); val=arrays('validation')
rng=np.random.default_rng(PLAN['training']['seed'])
params=[rng.normal(0,.01,(D+1,H)),np.full(H,.5),rng.normal(0,.01,H),np.array(0.)]
params[0][D]=0

def forward(ds,p):
    ids,base,y,weight=ds; W,b,V,c=p
    acc=W[ids].sum(axis=2)+b; hidden=np.clip(acc,0,1); z=hidden@V+c; t=np.tanh(z)
    correction=CAP/2*(t[:,0]-t[:,1]); logits=(base+correction)/SCALE
    pred=1/(1+np.exp(-np.clip(logits,-60,60)))
    return pred,(acc,hidden,t,logits)

def metrics(ds,p=None):
    ids,base,y,w=ds
    if p is None:
        logits=base/SCALE; pred=1/(1+np.exp(-np.clip(logits,-60,60)))
    else: pred,(_,_,_,logits)=forward(ds,p)
    return {'weightedBCE':float(np.sum(w*(np.logaddexp(0,logits)-y*logits))), 'weightedBrier':float(np.sum(w*(pred-y)**2)), 'observations':len(y)}

moment=[np.zeros_like(x)for x in params]; variance=[np.zeros_like(x)for x in params]
log={'planSha256':data['planSha256'],'dataSha256':manifest['dataSha256'],'numpyVersion':np.__version__,'pythonVersion':sys.version.split()[0], 'baseline':{'train':metrics(train),'validation':metrics(val)},'epochs':[],'selectedEpoch':None,'testTouchedDuringTraining':False}
best=None;best_loss=float('inf');start=time.monotonic()
for epoch in range(1,PLAN['training']['epochs']+1):
    ids,base,y,w=train; pred,(acc,h,t,logits)=forward(train,params)
    dz=(pred-y)[:,None]*w[:,None]*(CAP/(2*SCALE))*np.array([1,-1])[None,:]*(1-t*t)
    dacc=(dz[:,:,None]*params[2])*(acc>0)*(acc<1)
    gW=np.zeros_like(params[0]); repeated=np.repeat(dacc.reshape(-1,H),ids.shape[2],axis=0)
    np.add.at(gW,ids.reshape(-1),repeated);gW[D]=0
    gradients=[gW,dacc.sum(axis=(0,1)),(h*dz[:,:,None]).sum(axis=(0,1)),dz.sum()]
    gradients[0]+=2*PLAN['training']['l2']*params[0];gradients[2]+=2*PLAN['training']['l2']*params[2]
    for i,g in enumerate(gradients):
        moment[i]=.9*moment[i]+.1*g;variance[i]=.999*variance[i]+.001*g*g
        params[i]-=PLAN['training']['learningRate']*(moment[i]/(1-.9**epoch))/(np.sqrt(variance[i]/(1-.999**epoch))+1e-8)
    params[0][D]=0
    a=metrics(train,params);b=metrics(val,params)
    if b['weightedBCE']<best_loss:
        best_loss=b['weightedBCE'];best=[p.copy()for p in params];log['selectedEpoch']=epoch
    row={'epoch':epoch,'train':a,'validation':b,'elapsedSeconds':time.monotonic()-start};log['epochs'].append(row)
    if epoch%10==0: print(json.dumps(row),flush=True)
    (CACHE/'training-progress.json').write_text(json.dumps({'epoch':epoch,'selectedEpoch':log['selectedEpoch'],'elapsedSeconds':time.monotonic()-start})+'\n')

# Store quantized float32 weights; all reported final metrics use these actual weights.
frozen=[x.astype(np.float32).astype(np.float64)for x in best]
payload=b'JQNNUE1\0'+struct.pack('<IIff',D,H,CAP,SCALE)
payload+=np.asarray(frozen[0][:D],dtype='<f4').tobytes()+np.asarray(frozen[1],dtype='<f4').tobytes()+np.asarray(frozen[2],dtype='<f4').tobytes()+struct.pack('<f',float(frozen[3]))
MODEL.parent.mkdir(parents=True,exist_ok=True);MODEL.write_bytes(payload)
test=arrays('test')
log['baseline']['test']=metrics(test)
log['frozenModel']={name:metrics(ds,frozen)for name,ds in [('train',train),('validation',val),('test',test)]}
log.update(modelSha256=hashlib.sha256(payload).hexdigest(),modelBytes=len(payload),elapsedSeconds=time.monotonic()-start,modelFile=str(MODEL.relative_to(ROOT)),trainableParameters=D*H+2*H+1)
(OUT/'training.json').write_text(json.dumps(log,indent=2)+'\n')
print(json.dumps({k:v for k,v in log.items()if k!='epochs'}),flush=True)
