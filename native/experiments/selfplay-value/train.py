"""One prespecified CPU NumPy run. Only terminal-outcome labels, no downloads.

The test file is not opened until selected float32 weights and their immutable
freeze record have been written. A frozen model cannot be overwritten/retrained.
"""
import os
for key in ['OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS']:
    os.environ[key] = '1'
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import time
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
PLAN_PATH = Path(__file__).with_name('plan.json')
PLAN_BYTES = PLAN_PATH.read_bytes()
PLAN = json.loads(PLAN_BYTES)
PLAN_SHA = hashlib.sha256(PLAN_BYTES).hexdigest()
CACHE = ROOT / '.cache/selfplay-value'
OUT = ROOT / 'benchmarks/selfplay-value'
MODEL = ROOT / PLAN['training']['model']
FREEZE = OUT / 'model-frozen.json'
assert not MODEL.exists() and not FREEZE.exists(), 'Never overwrite/retrain a frozen model'
assert not (OUT / 'training.json').exists(), 'This finite training plan already ran'
manifest_bytes = (OUT / 'data-manifest.json').read_bytes()
manifest = json.loads(manifest_bytes)
check = json.loads((OUT / 'data-check.json').read_bytes())
assert check['passed'] and check['dataManifestSha256'] == hashlib.sha256(manifest_bytes).hexdigest()
assert manifest['readyForTraining'] and manifest['planSha256'] == PLAN_SHA
D = PLAN['network']['features']
H = PLAN['network']['hidden']
CAP = PLAN['network']['residualCapCp']
SCALE = PLAN['network']['sigmoidScaleCp']
assert (D, H, CAP, SCALE) == (2597, 16, 256, 600)
read_splits = []


def load_split(name, frozen_sha=None):
    if name == 'test':
        assert frozen_sha is not None, 'Test access before model freeze'
        frozen_record = json.loads(FREEZE.read_bytes())
        assert frozen_record['modelSha256'] == frozen_sha
        assert hashlib.sha256(MODEL.read_bytes()).hexdigest() == frozen_sha
        assert 'test' not in read_splits, 'Test is evaluated once only'
    assert name not in read_splits, 'Split already loaded'
    file = manifest['files'][name]
    raw = (ROOT / file['file']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == file['sha256']
    data = json.loads(raw)
    assert data['planSha256'] == PLAN_SHA
    rows = data['rows']
    assert rows
    for row in rows:
        assert set(row) == {'features', 'base', 'target', 'weight'}
        assert len(row['features']) == 2
        assert all(isinstance(i, int) and 0 <= i < D for frame in row['features'] for i in frame)
        assert row['target'] in (0, 0.5, 1)
        assert math.isfinite(row['base']) and math.isfinite(row['weight']) and row['weight'] > 0
    assert abs(sum(row['weight'] for row in rows) - 1) < 1e-11
    length = max(len(frame) for row in rows for frame in row['features'])
    ids = np.full((len(rows), 2, length), D, dtype=np.int32)
    for i, row in enumerate(rows):
        for frame, features in enumerate(row['features']):
            ids[i, frame, :len(features)] = features
    read_splits.append(name)
    return (ids, np.array([r['base'] for r in rows]), np.array([r['target'] for r in rows]),
            np.array([r['weight'] for r in rows]))


def forward(ds, params):
    ids, base, _, _ = ds
    weight, bias, output, intercept = params
    acc = weight[ids].sum(axis=2) + bias
    hidden = np.clip(acc, 0, 1)
    t = np.tanh(hidden @ output + intercept)
    correction = CAP / 2 * (t[:, 0] - t[:, 1])
    logits = (base + correction) / SCALE
    pred = 1 / (1 + np.exp(-np.clip(logits, -60, 60)))
    return pred, (acc, hidden, t, logits)


def metrics(ds, params=None):
    _, base, target, weight = ds
    if params is None:
        logits = base / SCALE
        pred = 1 / (1 + np.exp(-np.clip(logits, -60, 60)))
    else:
        pred, (_, _, _, logits) = forward(ds, params)
    return {'weightedBCE': float(np.sum(weight * (np.logaddexp(0, logits) - target * logits))),
            'weightedBrier': float(np.sum(weight * (pred - target) ** 2)), 'observations': len(target)}


for other in ['generation.lock', 'match.lock']:
    assert not (CACHE / other).exists(), f'Conflicting work lock: {other}'
lock = CACHE / 'training.lock'
fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
os.write(fd, (str(os.getpid()) + '\n').encode())
os.close(fd)
try:
    train = load_split('train')
    validation = load_split('validation')
    rng = np.random.default_rng(PLAN['training']['seed'])
    params = [rng.normal(0, .01, (D + 1, H)), np.full(H, .5), rng.normal(0, .01, H), np.array(0.)]
    params[0][D] = 0
    moment = [np.zeros_like(p) for p in params]
    variance = [np.zeros_like(p) for p in params]
    log = {'planSha256': PLAN_SHA, 'dataManifestSha256': hashlib.sha256(manifest_bytes).hexdigest(),
           'splitSha256': {name: file['sha256'] for name, file in manifest['files'].items()},
           'numpyVersion': np.__version__, 'pythonVersion': sys.version.split()[0],
           'baseline': {'train': metrics(train), 'validation': metrics(validation)},
           'epochs': [], 'selectedEpoch': None, 'testTouchedDuringTraining': False,
           'testReadAfterModelFreeze': False, 'testEvaluationPhases': 0}
    best, best_loss = None, float('inf')
    start = time.monotonic()
    for epoch in range(1, PLAN['training']['epochs'] + 1):
        ids, _, target, weight = train
        pred, (acc, hidden, t, _) = forward(train, params)
        dz = (pred - target)[:, None] * weight[:, None] * (CAP / (2 * SCALE)) * np.array([1, -1])[None, :] * (1 - t * t)
        dacc = (dz[:, :, None] * params[2]) * (acc > 0) * (acc < 1)
        dweight = np.zeros_like(params[0])
        repeated = np.repeat(dacc.reshape(-1, H), ids.shape[2], axis=0)
        np.add.at(dweight, ids.reshape(-1), repeated)
        dweight[D] = 0
        gradients = [dweight, dacc.sum(axis=(0, 1)), (hidden * dz[:, :, None]).sum(axis=(0, 1)), dz.sum()]
        gradients[0] += 2 * PLAN['training']['l2'] * params[0]
        gradients[2] += 2 * PLAN['training']['l2'] * params[2]
        for i, grad in enumerate(gradients):
            moment[i] = .9 * moment[i] + .1 * grad
            variance[i] = .999 * variance[i] + .001 * grad * grad
            params[i] -= PLAN['training']['learningRate'] * (moment[i] / (1 - .9 ** epoch)) / (np.sqrt(variance[i] / (1 - .999 ** epoch)) + 1e-8)
        params[0][D] = 0
        train_metrics, val_metrics = metrics(train, params), metrics(validation, params)
        assert math.isfinite(val_metrics['weightedBCE'])
        if val_metrics['weightedBCE'] < best_loss:
            best_loss = val_metrics['weightedBCE']
            best = [p.copy() for p in params]
            log['selectedEpoch'] = epoch
        row = {'epoch': epoch, 'train': train_metrics, 'validation': val_metrics, 'elapsedSeconds': time.monotonic() - start}
        log['epochs'].append(row)
        if epoch % 10 == 0:
            print(json.dumps(row), flush=True)
        (CACHE / 'training-progress.json').write_text(json.dumps({'epoch': epoch, 'selectedEpoch': log['selectedEpoch'], 'elapsedSeconds': time.monotonic() - start}) + '\n')
    assert read_splits == ['train', 'validation']
    frozen = [p.astype(np.float32).astype(np.float64) for p in best]
    payload = b'JQNNUE1\0' + struct.pack('<IIff', D, H, CAP, SCALE)
    payload += np.asarray(frozen[0][:D], dtype='<f4').tobytes()
    payload += np.asarray(frozen[1], dtype='<f4').tobytes() + np.asarray(frozen[2], dtype='<f4').tobytes() + struct.pack('<f', float(frozen[3]))
    model_sha = hashlib.sha256(payload).hexdigest()
    MODEL.parent.mkdir(parents=True, exist_ok=True)
    with MODEL.open('xb') as file:
        file.write(payload)
    freeze_record = {'planSha256': PLAN_SHA, 'modelSha256': model_sha, 'selectedEpoch': log['selectedEpoch'],
                     'validationSelectionBCE': best_loss, 'testOpened': False,
                     'selection': PLAN['training']['selection'], 'modelFile': PLAN['training']['model'],
                     'dataManifestSha256': log['dataManifestSha256']}
    with FREEZE.open('x') as file:
        file.write(json.dumps(freeze_record, indent=2) + '\n')
    # This is the first and only test-file read. No selection or updates follow.
    test = load_split('test', frozen_sha=model_sha)
    log['testReadAfterModelFreeze'] = True
    log['testEvaluationPhases'] = 1
    log['baseline']['test'] = metrics(test)
    log['frozenModel'] = {name: metrics(ds, frozen) for name, ds in [('train', train), ('validation', validation), ('test', test)]}
    log.update(modelSha256=model_sha, modelBytes=len(payload), elapsedSeconds=time.monotonic() - start,
               modelFile=PLAN['training']['model'], trainableParameters=D * H + 2 * H + 1)
    with (OUT / 'training.json').open('x') as file:
        file.write(json.dumps(log, indent=2) + '\n')
    print(json.dumps({k: v for k, v in log.items() if k != 'epochs'}), flush=True)
finally:
    lock.unlink(missing_ok=True)
