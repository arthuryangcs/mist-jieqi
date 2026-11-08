import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadModel} from '../nnue/reference.mjs';
import {root, evidence, plan, planSha256, sha, hashFile, gameFile, splitNames,
  collectDataset, assertTrainerRows, atomicJson} from './data.mjs';

export function checkDataset({model = false} = {}) {
  const manifestFile = path.join(evidence, 'data-manifest.json'), raw = fs.readFileSync(manifestFile);
  const manifest = JSON.parse(raw), runBytes = fs.readFileSync(gameFile), run = JSON.parse(runBytes);
  const record = {passed: false, planSha256, dataManifestSha256: sha(raw),
    splitDisjoint: false, independentTerminalReplay: false, preMoveFeatures: true,
    allowedTrainerFields: ['features', 'base', 'target', 'weight'], noHiddenTruthOrFutureLeakage: false,
    modelMetricsAudited: model, testMetricUsedForEpochSelection: false};
  try {
    assert.equal(manifest.planSha256, planSha256);
    assert.equal(manifest.gamesSha256, sha(runBytes));
    const expected = collectDataset(run, {isolation: true});
    assert.deepEqual(manifest.splits, expected.counts);
    assert.deepEqual(manifest.outcomes, expected.outcomes);
    assert.deepEqual(manifest.replay, expected.replay);
    assert(expected.replay.oddObservations > 0 && expected.replay.evenObservations > 0, 'Both ply parities must be represented');
    const all = Object.values(manifest.splits).flatMap(s => s.plannedLayoutHashes);
    assert.equal(new Set(all).size, 24);
    record.splitDisjoint = record.independentTerminalReplay = record.noHiddenTruthOrFutureLeakage = true;
    record.replay = expected.replay;
    record.outcomes = expected.outcomes;
    record.splits = expected.counts;
    let trained, training;
    if (model) {
      trained = loadModel(path.join(root, plan.training.model));
      training = JSON.parse(fs.readFileSync(path.join(evidence, 'training.json')));
      const frozen = JSON.parse(fs.readFileSync(path.join(evidence, 'model-frozen.json')));
      assert.equal(hashFile(plan.training.model), training.modelSha256);
      assert.equal(frozen.modelSha256, training.modelSha256);
      assert.equal(frozen.selectedEpoch, training.selectedEpoch);
      assert.equal(training.planSha256, planSha256);
      assert.equal(training.dataManifestSha256, sha(raw));
      assert.equal(training.testTouchedDuringTraining, false);
      assert.equal(training.testReadAfterModelFreeze, true);
      assert.equal(training.testEvaluationPhases, 1);
      assert.equal(training.epochs.length, plan.training.epochs);
      const best = training.epochs.reduce((a, b) => b.validation.weightedBCE < a.validation.weightedBCE ? b : a);
      assert.equal(best.epoch, training.selectedEpoch, 'Epoch was not selected exclusively on validation');
      record.metrics = {};
    }
    for (const name of splitNames) {
      const bytes = fs.readFileSync(path.join(root, manifest.files[name].file));
      assert.equal(sha(bytes), manifest.files[name].sha256);
      const data = JSON.parse(bytes);
      assert.deepEqual(data, expected.splits[name], `${name} differs from independent pre-move replay`);
      assertTrainerRows(data.rows);
      if (model) {
        let bce = 0, brier = 0;
        for (const row of data.rows) {
          const z = row.features.map(ids => {
            const acc = [...trained.bias];
            for (const id of ids) for (let h = 0; h < acc.length; h++) acc[h] += trained.weight[id][h];
            return acc.reduce((total, value, h) => total + Math.max(0, Math.min(1, value)) * trained.output[h], trained.outputBias);
          });
          const correction = trained.cap / 2 * (Math.tanh(z[0]) - Math.tanh(z[1]));
          const logits = (row.base + correction) / trained.scale, pred = 1 / (1 + Math.exp(-logits));
          bce += row.weight * (Math.max(0, logits) + Math.log1p(Math.exp(-Math.abs(logits))) - row.target * logits);
          brier += row.weight * (pred - row.target) ** 2;
        }
        assert(Math.abs(bce - training.frozenModel[name].weightedBCE) < 1e-11);
        assert(Math.abs(brier - training.frozenModel[name].weightedBrier) < 1e-11);
        record.metrics[name] = {bce, brier, observations: data.rows.length};
      }
    }
    record.passed = true;
  } catch (error) {
    record.error = error.stack.replaceAll(root, '<project>/');
    throw error;
  } finally {
    atomicJson(path.join(evidence, model ? 'data-check-model.json' : 'data-check.json'), record);
    console.log(JSON.stringify(record));
  }
  return record;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) checkDataset({model: process.argv.includes('--model')});
