// Focused release-build timing regression. Run alone, never beside another benchmark.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {buildC8, cache} from './build-c8.mjs';
import {C8Engine} from './c8-client.mjs';
import {buildC7} from './build-c7.mjs';
import {C7Engine} from './c7-client.mjs';
import {legalMoves} from '../../../engine.js';

const graceMs = 60, cancellationLimitMs = 500;
const moveKey = move => move.from * 90 + move.to;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errorText = error => error?.stack ?? String(error);

function checkRoots(result, legal, label) {
  if (result.terminal) {
    assert.equal(result.move, null, `${label}: terminal result has a move`);
    return;
  }
  const expected = legal.map(moveKey).sort((a, b) => a - b);
  assert(expected.includes(moveKey(result.move ?? {})), `${label}: illegal chosen move`);
  assert(Array.isArray(result.allCandidates), `${label}: missing full root results`);
  assert.deepEqual(result.allCandidates.map(moveKey).sort((a, b) => a - b), expected,
    `${label}: missing, duplicate, or illegal root candidate`);
}

// Capture native elapsedMs before ExperimentalEngine replaces it with host elapsedMs.
// Validation and disk writes happen after search, to minimize timing interference.
function observe(engine) {
  const native = engine.native, request = native.request.bind(native);
  const observed = {native, nativeBudgetMs: null, progress: [], final: null, error: null};
  native.request = (fixture, options = {}) => {
    observed.nativeBudgetMs = options.budget;
    return request(fixture, {...options, onProgress: result => {
      observed.progress.push(result);
      options.onProgress?.(result);
    }}).then(result => {
      observed.final = result;
      return result;
    }, error => {
      observed.error = String(error);
      throw error;
    });
  };
  return observed;
}

function verifySearch(result, observed, view, wallMs, budget, label) {
  const legal = legalMoves(view);
  assert(wallMs <= budget + graceMs, `${label}: ${wallMs.toFixed(1)} ms exceeds ${budget + graceMs} ms`);
  assert(!result.fallbackUsed || result.adjudicated || result.terminal, `${label}: fallback result`);
  checkRoots(result, legal, label);
  for (const [index, progress] of observed.progress.entries())
    checkRoots(progress, legal, `${label}: progress ${index}`);
  if (result.adjudicated) {
    assert.equal(result.terminationReason, 'root-adjudication');
    assert.equal(result.nodes, 0);
    assert.equal(result.visitedNodes, 0);
    assert.equal(result.completedDepth, 0);
    assert.equal(result.threads, 0);
    assert.equal(result.deadlineStop, false);
  } else if (!result.terminal) {
    assert(observed.progress.length > 0, `${label}: no completed full-root progress`);
    assert(result.depth > 0, `${label}: no completed iteration`);
    assert(result.threads >= 1 && result.threads <= 4, `${label}: thread limit differs`);
    assert.equal(result.samples, view.board.some(piece => piece?.hidden) ? 8 : 1,
      `${label}: sample count differs`);
  }
  if (observed.final && !observed.final.terminal) {
    assert.equal(observed.final.ttBudgetBytes, 64 * 1024 * 1024, `${label}: TT budget differs`);
    assert(observed.final.ttAllocatedBytes <= observed.final.ttBudgetBytes, `${label}: TT exceeded budget`);
    assert.equal(observed.final.ttDenied, 0, `${label}: TT allocation denied`);
  }
}

function timings(result, observed, wallMs) {
  const effectiveFallback = !!result.fallbackUsed && !result.adjudicated && !result.terminal;
  return {
    wallMs, hostElapsedMs: result.elapsedMs, nativeElapsedMs: observed.final?.elapsedMs ?? null,
    nativeResponseWallMs: observed.final?.wallMs ?? null, nativeBudgetMs: observed.nativeBudgetMs,
    selfCpuMs: observed.final?.selfCpuMs ?? null, clock: result.clock,
    nodes: result.visitedNodes ?? result.nodes, depth: result.depth,
    completedDepth: result.completedDepth, samples: result.samples, threads: result.threads,
    ttBudgetBytes: observed.final?.ttBudgetBytes ?? null,
    ttAllocatedBytes: observed.final?.ttAllocatedBytes ?? null,
    deadlineStop: !!result.deadlineStop, fallbackUsed: !!result.fallbackUsed, effectiveFallback,
    adjudicated: !!result.adjudicated, terminal: !!result.terminal,
    terminationReason: result.terminationReason, nativeError: observed.error,
    progress: observed.progress.map(row => ({depth: row.depth, nodes: row.visitedNodes ?? row.nodes,
      nativeElapsedMs: row.elapsedMs ?? null, responseWallMs: row.wallMs,
      candidates: row.allCandidates?.length ?? 0})),
  };
}

export async function checkDeadlineC8() {
  const poses = JSON.parse(fs.readFileSync(new URL('./benchmark-fixtures.json', import.meta.url))).positions;
  const selected = process.env.MIST_C8_CLOCK_FIXTURE;
  const fixture = poses.find(position => selected ? position.name === selected : position.name.includes('54546'));
  assert(fixture, `clock fixture not found: ${selected ?? '54546'}`);
  assert(legalMoves(fixture.view).length > 0, 'timing fixture must have legal moves');
  const made = {c7: buildC7(), c8: buildC8()};
  const engines = {c7: C7Engine, c8: C8Engine};
  const createdAt = new Date().toISOString();
  const directory = path.join(cache, `timing-check-${createdAt.replace(/[:.]/g, '-')}-${process.pid}`);
  fs.mkdirSync(directory); // A collision fails rather than overwriting an earlier run.
  const output = path.join(directory, 'results.json');
  const record = {passed: false, completed: false, createdAt, fixture: fixture.name,
    graceMs, cancellationLimitMs, budgetsMs: [75, 150, 500, 2000], repeats: 2,
    threadsMaximum: 4, ttMiBMaximum: 64, builds: made,
    note: 'Sequential release-build checks on one known fixture; not a fresh holdout or a speed claim.',
    rows: [], cancellation: [], adjudication: [], failures: []};
  const persist = () => {
    fs.writeFileSync(output + '.tmp', JSON.stringify(record, null, 2) + '\n');
    fs.renameSync(output + '.tmp', output);
  };
  const fail = (row, error) => {
    row.passed = false;
    row.error = errorText(error);
    record.failures.push({engine: row.engine, kind: row.kind, budgetMs: row.budgetMs ?? null, error: row.error});
  };
  const close = async (engine, observed, row) => {
    try {
      await engine.close();
      if (observed) assert.equal(observed.native.stderr, '', 'native stderr was not empty');
    } catch (error) { fail(row, error); }
  };

  async function searchCase(name, view, budget, row) {
    const engine = new engines[name]({binary: made[name].binary});
    let observed;
    try {
      await engine.ready();
      assert.equal(engine.native.capabilities.threads, 4);
      observed = observe(engine);
      const start = performance.now(), result = await engine.search(view, budget);
      const wallMs = performance.now() - start;
      Object.assign(row, timings(result, observed, wallMs));
      verifySearch(result, observed, view, wallMs, budget, `${name}/${row.kind}/${budget}`);
      if (row.kind === 'root-adjudication') assert.equal(result.adjudicated, true);
      row.passed = true;
    } catch (error) { fail(row, error); }
    finally { await close(engine, observed, row); }
  }

  async function cancelCase(name, immediate) {
    const row = {engine: name, kind: immediate ? 'immediate-cancel' : 'active-cancel', passed: false};
    record.cancellation.push(row);
    const engine = new engines[name]({binary: made[name].binary});
    let observed;
    try {
      await engine.ready();
      observed = observe(engine);
      let settled = false;
      const start = performance.now();
      // Install both handlers immediately so cancellation cannot cause an unhandled rejection.
      const pending = engine.search(fixture.view, 6000).then(
        result => { settled = true; return {result}; },
        error => { settled = true; return {error}; });
      if (!immediate) await sleep(25);
      const settledBeforeStop = settled, stopStart = performance.now();
      row.requestAgeAtStopMs = stopStart - start;
      await engine.stop();
      row.stopMs = performance.now() - stopStart;
      const outcome = await pending;
      row.cancellationMs = performance.now() - stopStart;
      assert(!settledBeforeStop, 'search finished before requested cancellation');
      assert(outcome.error && /cancelled/.test(String(outcome.error)), 'cancelled search did not reject as cancelled');
      assert(row.cancellationMs < cancellationLimitMs,
        `cancellation took ${row.cancellationMs.toFixed(1)} ms, expected < ${cancellationLimitMs} ms`);
      assert.equal(observed.native.stderr, '', 'cancelled native process emitted stderr');
      await engine.ready();
      observed = observe(engine);
      const restartStart = performance.now(), result = await engine.search(fixture.view, 250);
      const wallMs = performance.now() - restartStart;
      row.restart = timings(result, observed, wallMs);
      verifySearch(result, observed, fixture.view, wallMs, 250, `${name}/${row.kind}/restart`);
      row.passed = true;
    } catch (error) { fail(row, error); }
    finally { await close(engine, observed, row); }
  }

  persist();
  try {
    // Each budget has C7 first once and C8 first once. Every request is awaited and reaped.
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const [index, budget] of record.budgetsMs.entries()) {
        const order = (repeat + index) % 2 ? ['c8', 'c7'] : ['c7', 'c8'];
        for (const name of order) {
          const row = {engine: name, kind: 'deadline', repeat, budgetMs: budget, passed: false};
          record.rows.push(row);
          await searchCase(name, fixture.view, budget, row);
          persist();
        }
      }
    }
    for (const name of ['c7', 'c8']) for (const immediate of [false, true]) {
      await cancelCase(name, immediate);
      persist();
    }
    const adjudication = JSON.parse(fs.readFileSync(new URL(
      '../../../benchmarks/search-speed/c6-2026-11-03/root-adjudication-view.json', import.meta.url)));
    for (const name of ['c7', 'c8']) {
      const row = {engine: name, kind: 'root-adjudication', budgetMs: 2000, passed: false};
      record.adjudication.push(row);
      await searchCase(name, adjudication, 2000, row);
      persist();
    }
    record.summary = Object.fromEntries(['c7', 'c8'].map(name => {
      const rows = record.rows.filter(row => row.engine === name);
      return [name, {requests: rows.length, hostStops: rows.filter(row => row.deadlineStop).length,
        fallbacks: rows.filter(row => row.effectiveFallback).length,
        failures: rows.filter(row => !row.passed).length,
        maximumWallMs: Math.max(...rows.map(row => row.wallMs ?? 0)),
        maximumOverBudgetMs: Math.max(0, ...rows.map(row => (row.wallMs ?? 0) - row.budgetMs))}];
    }));
    record.comparison = {
      hostStopDelta: record.summary.c8.hostStops - record.summary.c7.hostStops,
      fallbackDelta: record.summary.c8.fallbacks - record.summary.c7.fallbacks,
    };
    if (record.comparison.hostStopDelta > 0)
      record.failures.push({kind: 'host-stop-regression', error: 'C8 used the host deadline fallback more often than C7'});
    if (record.comparison.fallbackDelta > 0)
      record.failures.push({kind: 'fallback-regression', error: 'C8 returned fallback results more often than C7'});
    record.completed = true;
    record.passed = record.failures.length === 0;
  } catch (error) {
    record.failures.push({kind: 'checker', error: errorText(error)});
  } finally {
    persist();
    console.log(JSON.stringify({passed: record.passed, completed: record.completed, output,
      summary: record.summary ?? null, comparison: record.comparison ?? null, failures: record.failures.length}));
  }
  assert(record.passed, `C8 deadline checks failed; see ${output}`);
  return record;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await checkDeadlineC8();
