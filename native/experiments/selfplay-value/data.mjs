import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {initial, publicState, positionKey, move, legalMoves, inCheck, other} from '../historical/referee.mjs';
import {seeded} from '../../../ai.js';
import {observationSeed} from '../../bridge.mjs';
import {featureIndices, redBase, D} from '../nnue/features.mjs';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const cache = path.join(root, '.cache/selfplay-value');
export const evidence = path.join(root, 'benchmarks/selfplay-value');
export const planFile = fileURLToPath(new URL('./plan.json', import.meta.url));
export const plan = JSON.parse(fs.readFileSync(planFile));
export const sha = value => createHash('sha256').update(value).digest('hex');
export const hashFile = file => sha(fs.readFileSync(path.resolve(root, file)));
export const jsonHash = value => sha(JSON.stringify(value));
export const planSha256 = hashFile(planFile);
export const gameFile = path.join(evidence, 'games.json');
export const sameMove = (a, b) => a?.from === b?.from && a?.to === b?.to;
export const splitNames = ['train', 'validation', 'test'];

export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value) + '\n');
  fs.renameSync(tmp, file);
}

export function initialState(seed) {
  const s = initial(seeded(seed));
  s.positions = [positionKey(s)];
  return s;
}

// publicState's spread preserves arbitrary top-level properties. Explicitly strip
// those before any engine or feature call; referee metadata lives outside state.
export function lawfulView(s, viewer) {
  const p = publicState(s, viewer);
  const view = {board: p.board, turn: p.turn, captured: p.captured, ply: p.ply,
    quiet: p.quiet, result: p.result, positions: p.positions, viewer: p.viewer};
  for (const piece of [...view.board, ...view.captured]) {
    assert(!piece?.hidden || !('type' in piece), 'Hidden truth in observation');
  }
  return view;
}

let priorLayoutCache;
export function priorLayouts() {
  if (priorLayoutCache) return priorLayoutCache;
  const files = [], hashes = new Set(), seeds = new Set();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory() && file !== evidence) walk(file);
      else if (entry.isFile() && entry.name === 'matches.json') files.push(path.relative(root, file));
    }
  }
  walk(path.join(root, 'benchmarks'));
  for (const file of files) {
    const report = JSON.parse(fs.readFileSync(path.join(root, file)));
    for (const item of [...(report.games ?? []), ...(report.tasks ?? []), ...(report.initials ?? [])]) {
      if (Number.isSafeInteger(item.seed)) seeds.add(item.seed);
      if (Array.isArray(item.trueInitialBoard)) hashes.add(jsonHash(item.trueInitialBoard));
    }
    for (const seed of report.seeds ?? []) if (Number.isSafeInteger(seed)) seeds.add(seed);
  }
  for (const seed of seeds) hashes.add(jsonHash(initial(seeded(seed)).board));
  priorLayoutCache = {files: files.sort(), hashes, seeds};
  return priorLayoutCache;
}

export function layoutRecords() {
  const records = plan.generation.layoutSeeds.map((seed, i) => ({seed,
    layoutSha256: jsonHash(initial(seeded(seed)).board),
    split: i < plan.data.trainingLayouts ? 'train' :
      i < plan.data.trainingLayouts + plan.data.validationLayouts ? 'validation' : 'test'}));
  assert.equal(records.length, 24);
  assert.equal(new Set(records.map(r => r.layoutSha256)).size, 24, 'Repeated initial layout');
  const old = JSON.parse(fs.readFileSync(path.join(root, 'benchmarks/nnue/data-manifest.json')));
  const used = new Set([...Object.values(old.splits).flatMap(s => s.layoutHashes), ...priorLayouts().hashes]);
  for (const r of records) assert(!used.has(r.layoutSha256), 'Previously benchmarked or old NNUE layout reused');
  const matchHashes = plan.matches.seeds.map(seed => jsonHash(initial(seeded(seed)).board));
  assert.equal(new Set(matchHashes).size, plan.matches.seeds.length);
  for (const hash of matchHashes) assert(!used.has(hash) && !records.some(r => r.layoutSha256 === hash), 'Held-out match overlaps data');
  return records;
}

export function gameTasks(layouts = layoutRecords()) {
  const tasks = layouts.flatMap(layout => plan.generation.policySeeds.map(policySeed => ({
    ...layout, policySeed
  })));
  assert.equal(tasks.length, plan.generation.games);
  return tasks.map((task, index) => ({index, ...task}));
}

// Deliberately derive the result from the replayed board/history, not g.result or
// state.result. engine.js uses the same text for quiet draw and the 400-ply cap.
export function refereeResult(s) {
  if (!legalMoves(s).length) return {status: 'decided', winner: other(s.turn),
    reason: inCheck(s.board, s.turn) ? 'mate' : 'stalemate', technicalForfeit: false};
  const key = positionKey(s);
  if (s.positions.filter(x => x === key).length >= 3) return {
    status: 'decided', winner: s.turn, reason: 'third-public-repetition', technicalForfeit: false};
  if (s.quiet >= 120) return {status: 'draw', winner: null, reason: '120-quiet-plies', technicalForfeit: false};
  if (s.ply >= plan.generation.maxPlies) return {status: 'unresolved', winner: null, reason: '400-ply-cap', technicalForfeit: false};
  return null;
}

export function observationsAt(s) {
  if (s.result || s.ply < plan.data.firstPly || s.ply % plan.data.stride) return [];
  return plan.data.viewers.map(viewer => {
    const view = lawfulView(s, viewer);
    return {features: featureIndices(view), base: redBase(view)};
  });
}

export function checkObservationIsolation(s, viewer) {
  const view = lawfulView(s, viewer), altered = structuredClone(s);
  altered.refereeLayoutSeed = 123456;
  altered.futureMoves = [{from: 0, to: 1}];
  for (const p of altered.board) if (p?.hidden) p.type = p.type === 'R' ? 'P' : 'R';
  for (const p of altered.captured) if (p.hidden && p.capturedBy !== viewer) p.type = p.type === 'R' ? 'P' : 'R';
  const counterfactual = lawfulView(altered, viewer);
  assert.deepEqual(counterfactual, view, 'Unknown truth or metadata leaked');
  assert.deepEqual(featureIndices(counterfactual), featureIndices(view));
  assert.equal(redBase(counterfactual), redBase(view));
  assert.equal(observationSeed(counterfactual), observationSeed(view));
}

export function replayGame(game, {requireComplete = true, collectRows = true, isolation = false} = {}) {
  let s = initialState(game.seed);
  assert.equal(jsonHash(s.board), game.layoutSha256);
  const rng = seeded(game.policySeed), rows = [];
  let odd = 0, even = 0;
  for (const entry of game.log) {
    assert(!s.result && !refereeResult(s), 'Move after terminal result');
    assert.equal(entry.ply, s.ply);
    assert.equal(entry.side, s.turn);
    assert.equal(entry.applied, true);
    const view = lawfulView(s, s.turn);
    assert.equal(entry.viewSha256, jsonHash(view), 'Pre-move observation mismatch');
    assert.equal(entry.nativeSeed, observationSeed(view), 'Native seed is not observation-derived');
    for (const viewer of plan.data.viewers) {
      assert.equal(entry.viewHashes[viewer], jsonHash(lawfulView(s, viewer)));
      if (isolation) checkObservationIsolation(s, viewer);
    }
    assert(legalMoves(view).some(m => sameMove(m, entry.move)), 'Illegal recorded move');
    assert(Number.isInteger(entry.completedDepth) && entry.completedDepth >= 1 && entry.completedDepth <= plan.generation.depth);
    assert(['depth-limit', 'node-limit', 'terminal'].includes(entry.terminationReason), 'Nondeterministic or failed search accepted');
    assert.equal(entry.threads, 1, 'Node-limited generation must be single-threaded');
    assert(Number.isInteger(entry.nodes) && entry.nodes >= 0 && entry.nodes <= plan.generation.nodeLimit + 1);
    assert(entry.topMoves.length >= 1 && entry.topMoves.length <= plan.generation.openingTopK);
    for (const m of entry.topMoves) assert(legalMoves(view).some(x => sameMove(x, m)));
    const chosenRank = s.ply < plan.generation.openingPlies ? Math.floor(rng() * entry.topMoves.length) : 0;
    assert.equal(entry.chosenRank, chosenRank, 'Opening RNG replay mismatch');
    assert(sameMove(entry.move, entry.topMoves[chosenRank]));
    if (collectRows) {
      const pending = observationsAt(s);
      rows.push(...pending);
      if (pending.length) { if (s.ply % 2) odd += pending.length; else even += pending.length; }
    }
    const before = s, captured = !!s.board[entry.move.to];
    s = move(s, entry.move);
    const shared = lawfulView(s, null);
    assert.equal(entry.revealed, before.board[entry.move.from].hidden ? s.board[entry.move.to].type : null);
    assert.deepEqual(entry.captured, captured ? shared.captured.at(-1) : null, 'Journal leaks or changes captured identity');
    assert.equal(entry.afterPublicSha256, jsonHash(shared));
  }
  assert.equal(game.logSha256, jsonHash(game.log), 'Journal checksum mismatch');
  if (requireComplete) assert(game.result, 'Unfinished game');
  const derived = refereeResult(s);
  if (game.result?.technicalForfeit) {
    assert(!derived, 'Technical result hides a real terminal outcome');
    assert.equal(game.result.status, 'technical');
    assert.equal(game.result.winner, null);
  } else if (game.result) assert.deepEqual(game.result, derived, 'Recorded result differs from independent replay');
  const eligible = !!derived && ['decided', 'draw'].includes(derived.status) && !game.result?.technicalForfeit;
  if (eligible) {
    const target = derived.winner === 'r' ? 1 : derived.winner === 'b' ? 0 : 0.5;
    for (const row of rows) row.target = target;
  }
  return {state: s, result: derived, eligible, rows, odd, even};
}

export function validateRun(run, {verifySources = true} = {}) {
  assert.equal(run.planSha256, planSha256, 'Frozen plan changed');
  assert.deepEqual(run.layouts, layoutRecords());
  assert.deepEqual(run.tasks, gameTasks(run.layouts));
  assert.equal(new Set(run.games.map(g => g.index)).size, run.games.length);
  for (const game of run.games) {
    assert(run.tasks[game.index]);
    for (const [key, value] of Object.entries(run.tasks[game.index])) assert.equal(game[key], value, `Game task changed: ${key}`);
  }
  if (verifySources) {
    for (const [file, hash] of Object.entries(run.sourceHashes)) assert.equal(hashFile(file), hash, `Frozen source changed: ${file}`);
    assert.equal(hashFile(plan.generation.binary), run.control.binarySha256, 'Control binary changed');
  }
}

export function collectDataset(run, {isolation = false} = {}) {
  validateRun(run);
  assert.equal(run.games.length, run.tasks.length, 'Not all prescribed games were generated');
  const groups = new Map(), outcomes = {redWins: 0, blackWins: 0, draws: 0, technical: 0, unresolved: 0};
  const replay = {games: 0, plies: 0, oddObservations: 0, evenObservations: 0, eligibleGames: 0, excludedGames: []};
  for (const game of [...run.games].sort((a, b) => a.index - b.index)) {
    const result = replayGame(game, {isolation});
    replay.games++; replay.plies += game.log.length;
    const status = game.result.status;
    if (status === 'technical') outcomes.technical++;
    else if (status === 'unresolved') outcomes.unresolved++;
    else if (status === 'draw') outcomes.draws++;
    else if (game.result.winner === 'r') outcomes.redWins++;
    else outcomes.blackWins++;
    if (!result.eligible || !result.rows.length) {
      replay.excludedGames.push({index: game.index, reason: result.eligible ? 'no-post-opening-observations' : game.result.reason});
      continue;
    }
    replay.eligibleGames++; replay.oddObservations += result.odd; replay.evenObservations += result.even;
    if (!groups.has(game.layoutSha256)) groups.set(game.layoutSha256, []);
    groups.get(game.layoutSha256).push(result.rows);
  }
  const splits = {}, counts = {};
  for (const split of splitNames) {
    const planned = run.layouts.filter(x => x.split === split).map(x => x.layoutSha256);
    const eligible = planned.filter(id => groups.has(id));
    const rows = [];
    for (const id of eligible) {
      const games = groups.get(id);
      for (const gameRows of games) for (const row of gameRows) rows.push({...row, weight: 1 / (eligible.length * games.length * gameRows.length)});
    }
    splits[split] = {planSha256, rows};
    counts[split] = {plannedLayoutHashes: planned, layoutHashes: eligible,
      missingLayoutHashes: planned.filter(id => !groups.has(id)),
      plannedLayouts: planned.length, eligibleLayouts: eligible.length,
      games: eligible.reduce((n, id) => n + groups.get(id).length, 0), observations: rows.length};
  }
  return {splits, counts, outcomes, replay};
}

export function assertTrainerRows(rows) {
  assert(rows.length, 'Empty split cannot train or evaluate');
  let total = 0;
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['base', 'features', 'target', 'weight']);
    assert.equal(row.features.length, 2);
    for (const ids of row.features) assert(ids.every(i => Number.isInteger(i) && i >= 0 && i < D));
    assert(Number.isFinite(row.base));
    assert([0, 0.5, 1].includes(row.target));
    assert(Number.isFinite(row.weight) && row.weight > 0);
    total += row.weight;
  }
  assert(Math.abs(total - 1) < 1e-11, 'Weights must sum to one per split');
}

export function createDataset() {
  const runBytes = fs.readFileSync(gameFile), run = JSON.parse(runBytes);
  const result = collectDataset(run, {isolation: true});
  const manifestFile = path.join(evidence, 'data-manifest.json');
  assert(!fs.existsSync(manifestFile), 'Never overwrite frozen dataset');
  const files = {};
  for (const split of splitNames) {
    const file = path.join(root, plan.data.files[split]);
    assert(!fs.existsSync(file), 'Never overwrite frozen split');
    const bytes = JSON.stringify(result.splits[split]) + '\n';
    fs.writeFileSync(file, bytes, {flag: 'wx'});
    files[split] = {file: plan.data.files[split], sha256: sha(bytes)};
  }
  const manifest = {planSha256, gamesFile: 'benchmarks/selfplay-value/games.json', gamesSha256: sha(runBytes),
    provenance: plan.provenance, labelSource: 'Independent terminal replay; never engine search output',
    sources: run.sourceHashes, files, splits: result.counts, outcomes: result.outcomes, replay: result.replay,
    readyForTraining: splitNames.every(name => result.splits[name].rows.length > 0),
    noLayoutOrSeedInTrainerFiles: true, separateTestFile: true};
  atomicJson(manifestFile, manifest);
  console.log(JSON.stringify(manifest));
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) createDataset();
