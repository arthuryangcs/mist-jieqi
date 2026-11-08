import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {Native, fixture, observationSeed} from '../../bridge.mjs';
import {legalMoves, move} from '../../../engine.js';
import {seeded} from '../../../ai.js';
import {root, cache, evidence, plan, planSha256, gameFile, hashFile, jsonHash,
  atomicJson, lawfulView, layoutRecords, priorLayouts, gameTasks, initialState, refereeResult,
  replayGame, validateRun, sameMove} from './data.mjs';

const sourceFiles = [
  'engine.js', 'ai.js', 'native/bridge.mjs', 'native/build.mjs', 'native/search.cpp',
  'native/experiments/cluster-tt/table.hpp', 'native/experiments/nnue/features.mjs',
  'native/experiments/nnue/nnue.hpp', 'benchmarks/nnue/data-manifest.json',
  ...['plan.json', 'generate.mjs', 'data.mjs', 'data-check.mjs', 'train.py', 'dataset.test.mjs', 'build.mjs']
    .map(name => 'native/experiments/selfplay-value/' + name),
  '.cache/selfplay-value/control.cpp', '.cache/selfplay-value/control-build.json'
];

export function acquireLock() {
  fs.mkdirSync(cache, {recursive: true});
  for (const other of ['match.lock', 'training.lock']) assert(!fs.existsSync(path.join(cache, other)), `Conflicting work lock: ${other}`);
  const file = path.join(cache, 'generation.lock');
  const fd = fs.openSync(file, 'wx');
  fs.writeFileSync(fd, JSON.stringify({pid: process.pid, startedAt: new Date().toISOString()}) + '\n');
  fs.closeSync(fd);
  const release = () => {
    if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file)).pid === process.pid) fs.unlinkSync(file);
  };
  process.once('exit', release);
  return release;
}

function releaseDeadLock() {
  const file = path.join(cache, 'generation.lock');
  const lock = JSON.parse(fs.readFileSync(file));
  let alive = true;
  try { process.kill(lock.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
  assert(!alive, 'Lock owner is still alive; do not run concurrent generation');
  fs.unlinkSync(file);
  console.log(JSON.stringify({releasedDeadLock: lock.pid}));
}

export function freeze() {
  const release = acquireLock();
  try {
    assert(!fs.existsSync(gameFile), 'Never overwrite the frozen self-play run');
    const control = JSON.parse(fs.readFileSync(path.join(cache, 'control-build.json')));
    assert.equal(control.trial, false);
    assert.equal(control.sanitize, false);
    assert.equal(control.binarySha256, hashFile(plan.generation.binary));
    assert.equal(control.sourceSha256, hashFile('.cache/selfplay-value/control.cpp'));
    const layouts = layoutRecords();
    const run = {experiment: plan.experiment, planSha256, provenance: plan.provenance,
      frozenAt: new Date().toISOString(), baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
      sourceHashes: Object.fromEntries([...sourceFiles, ...priorLayouts().files].map(file => [file, hashFile(file)])), control,
      layouts, tasks: gameTasks(layouts), games: []};
    atomicJson(gameFile, run);
    console.log(JSON.stringify({frozen: true, planSha256, layouts: layouts.length, games: run.tasks.length}));
    return run;
  } finally { release(); }
}

export function rankedCompleted(result, legal) {
  assert(result.completedDepth >= 1 && result.completedDepth <= plan.generation.depth, 'No completed root iteration');
  assert(['depth-limit', 'node-limit', 'terminal'].includes(result.terminationReason), `Rejected search termination: ${result.terminationReason}`);
  assert.equal(result.threads, 1, 'Generation must not search in parallel');
  assert.equal(result.safetyCutoffs, 0, 'Search safety cutoff');
  assert(result.nodes <= plan.generation.nodeLimit + 1, 'Node limit not honored');
  assert(result.ttBudgetBytes === 64 * 1024 * 1024 && result.ttAllocatedBytes <= result.ttBudgetBytes, 'TT budget mismatch');
  assert.equal(result.allCandidates.length, legal.length, 'Incomplete root candidates');
  assert.equal(new Set(result.allCandidates.map(m => m.from * 90 + m.to)).size, legal.length);
  for (const candidate of result.allCandidates) {
    assert(legal.some(m => sameMove(m, candidate)), 'Illegal candidate');
    assert(Number.isFinite(candidate.score));
  }
  return [...result.allCandidates].sort((a, b) => b.score - a.score || a.from - b.from || a.to - b.to);
}

function summary(run) {
  const result = {completed: 0, total: run.tasks.length, redWins: 0, blackWins: 0, draws: 0, unresolved: 0, technical: 0, plies: 0};
  for (const game of run.games) {
    result.plies += game.log.length;
    if (!game.result) continue;
    result.completed++;
    if (game.result.status === 'technical') result.technical++;
    else if (game.result.status === 'unresolved') result.unresolved++;
    else if (game.result.status === 'draw') result.draws++;
    else if (game.result.winner === 'r') result.redWins++;
    else result.blackWins++;
  }
  return result;
}

export async function generate({all = false} = {}) {
  const release = acquireLock();
  let stopped = false;
  const stop = () => { stopped = true; };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    const run = JSON.parse(fs.readFileSync(gameFile));
    validateRun(run);
    do {
      if (stopped || fs.existsSync(path.join(cache, 'STOP'))) break;
      const task = run.tasks.find(t => !run.games.some(g => g.index === t.index && g.result));
      if (!task) break;
      let game = run.games.find(g => g.index === task.index);
      if (!game) {
        game = {...task, startedAt: new Date().toISOString(), log: [], logSha256: jsonHash([])};
        run.games.push(game);
      }
      let state = replayGame(game, {requireComplete: false, collectRows: false}).state;
      const rng = seeded(game.policySeed);
      for (let i = 0; i < Math.min(state.ply, plan.generation.openingPlies); i++) rng();
      const persist = () => {
        game.logSha256 = jsonHash(game.log);
        run.summary = summary(run);
        atomicJson(gameFile, run);
      };
      persist();
      let native;
      try {
        game.result = refereeResult(state);
        if (!game.result) {
          native = new Native({binary: path.join(root, plan.generation.binary)});
          await native.ready;
        }
        while (!game.result && !stopped && !fs.existsSync(path.join(cache, 'STOP'))) {
          assert(!state.result && !refereeResult(state));
          const view = lawfulView(state, state.turn), nativeSeed = observationSeed(view);
          const legal = legalMoves(view), start = performance.now();
          const result = await native.request(fixture(view, {seed: nativeSeed, samples: plan.generation.samples}), {
            mode: 'SEARCH', depth: plan.generation.depth, nodeLimit: plan.generation.nodeLimit, budget: plan.generation.budgetMs
          });
          const ranked = rankedCompleted(result, legal);
          const topMoves = ranked.slice(0, plan.generation.openingTopK).map(({from, to}) => ({from, to}));
          const chosenRank = state.ply < plan.generation.openingPlies ? Math.floor(rng() * topMoves.length) : 0;
          const selected = topMoves[chosenRank];
          assert(legal.some(m => sameMove(m, selected)));
          const after = move(state, selected), shared = lawfulView(after, null);
          game.log.push({ply: state.ply, side: state.turn, applied: true, move: selected,
            viewSha256: jsonHash(view), viewHashes: Object.fromEntries(plan.data.viewers.map(v => [v, jsonHash(lawfulView(state, v))])),
            nativeSeed, topMoves, chosenRank, completedDepth: result.completedDepth, nodes: result.nodes,
            samples: result.samples, threads: result.threads, terminationReason: result.terminationReason,
            elapsedMs: performance.now() - start, ttAllocatedBytes: result.ttAllocatedBytes,
            revealed: state.board[selected.from].hidden ? after.board[selected.to].type : null,
            captured: state.board[selected.to] ? shared.captured.at(-1) : null,
            afterPublicSha256: jsonHash(shared)});
          state = after;
          game.result = refereeResult(state);
          persist();
          atomicJson(path.join(cache, 'generation-progress.json'), {index: game.index, ply: state.ply, summary: run.summary});
          if (state.ply % 40 === 0) console.log(JSON.stringify({index: game.index, ply: state.ply, summary: run.summary}));
        }
      } catch (error) {
        game.result = {status: 'technical', winner: null, technicalForfeit: true,
          reason: 'process-protocol-or-search-failure', atPly: state.ply,
          error: String(error.message).replaceAll(root, '<project>/')};
      } finally {
        if (native) await native.close();
      }
      if (game.result) game.finishedAt = new Date().toISOString();
      else game.pausedAt = new Date().toISOString();
      persist();
      console.log(JSON.stringify({index: game.index, plies: state.ply, result: game.result, summary: run.summary}));
      if (!all) break;
    } while (true);
    if (run.games.filter(g => g.result).length === run.tasks.length) {
      run.completedAt ??= new Date().toISOString();
      atomicJson(gameFile, run);
    }
    return run.summary ?? summary(run);
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop); release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'status';
  if (mode === 'freeze') freeze();
  else if (mode === 'next' || mode === 'run') await generate({all: mode === 'run'});
  else if (mode === 'status') console.log(JSON.stringify(summary(JSON.parse(fs.readFileSync(gameFile)))));
  else if (mode === 'release-dead-lock') releaseDeadLock();
  else throw Error('Use freeze, next, run, status, or release-dead-lock');
}
