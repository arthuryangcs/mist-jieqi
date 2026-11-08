import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {initial, publicState, move, legalMoves, positionKey} from '../../../engine.js';
import {seeded} from '../../../ai.js';
import {observationSeed} from '../../bridge.mjs';
import {featureIndices} from '../nnue/features.mjs';
import {plan, jsonHash, initialState, lawfulView, layoutRecords, gameTasks,
  refereeResult, observationsAt, checkObservationIsolation, replayGame, assertTrainerRows} from './data.mjs';
import {rankedCompleted} from './generate.mjs';

const piece = (side, type, hidden = false, role = type) => ({side, type, hidden, role});
function darkCaptureState() {
  const board = Array(90).fill(null);
  board[3] = piece('b', 'K'); board[85] = piece('r', 'K');
  board[45] = piece('r', 'R'); board[46] = piece('b', 'N', true, 'P');
  const s = {board, turn: 'r', captured: [], ply: 8, quiet: 0, result: null, positions: []};
  s.positions = [positionKey(s)];
  return s;
}
function syntheticJournal(plies = 16) {
  const task = gameTasks()[0], game = {...task, log: []};
  let s = initialState(task.seed);
  const rng = seeded(task.policySeed);
  for (let i = 0; i < plies && !s.result; i++) {
    const view = lawfulView(s, s.turn), legal = legalMoves(view);
    const topMoves = legal.slice(0, 3), chosenRank = i < 8 ? Math.floor(rng() * topMoves.length) : 0;
    const selected = topMoves[chosenRank], n = move(s, selected), shared = lawfulView(n, null);
    game.log.push({ply: s.ply, side: s.turn, applied: true, move: selected,
      viewSha256: jsonHash(view), viewHashes: Object.fromEntries(['r', 'b'].map(v => [v, jsonHash(lawfulView(s, v))])),
      nativeSeed: observationSeed(view), topMoves, chosenRank, completedDepth: 1,
      nodes: 1, threads: 1, terminationReason: 'depth-limit',
      revealed: s.board[selected.from].hidden ? n.board[selected.to].type : null,
      captured: s.board[selected.to] ? shared.captured.at(-1) : null,
      afterPublicSha256: jsonHash(shared)});
    s = n;
  }
  game.logSha256 = jsonHash(game.log);
  game.result = refereeResult(s) ?? {status: 'technical', winner: null, technicalForfeit: true, reason: 'synthetic-test-stop'};
  return game;
}

test('finite 24-layout, 48-game plan is grouped by unique initial-board hash', () => {
  const layouts = layoutRecords(), tasks = gameTasks(layouts);
  assert.equal(layouts.length, 24); assert.equal(tasks.length, 48);
  for (const [split, count] of [['train', 16], ['validation', 4], ['test', 4]]) assert.equal(layouts.filter(r => r.split === split).length, count);
  for (const layout of layouts) {
    const group = tasks.filter(g => g.layoutSha256 === layout.layoutSha256);
    assert.deepEqual(group.map(g => g.policySeed), plan.generation.policySeeds);
    assert(group.every(g => g.split === layout.split));
  }
});

test('engine observations strip arbitrary referee metadata and every dark identity', () => {
  const s = initialState(2026110801);
  s.layoutSeed = 2026110801; s.trueBoard = structuredClone(s.board); s.future = ['R'];
  assert('layoutSeed' in publicState(s, 'r'), 'Regression probe must exercise the broad publicState spread');
  for (const viewer of ['r', 'b']) {
    const view = lawfulView(s, viewer);
    assert.deepEqual(Object.keys(view), ['board', 'turn', 'captured', 'ply', 'quiet', 'result', 'positions', 'viewer']);
    assert(!JSON.stringify(view).includes('layoutSeed'));
    checkObservationIsolation(s, viewer);
    assert.deepEqual(featureIndices(view), featureIndices(lawfulView(initialState(2026110801), viewer)));
  }
});

test('dark captured identity is private to captor and never exported in public journal', () => {
  const before = darkCaptureState(), next = move(before, {from: 45, to: 46});
  assert.equal(lawfulView(next, 'r').captured[0].type, 'N');
  assert.equal(lawfulView(next, 'b').captured[0].type, undefined);
  assert.equal(lawfulView(next, null).captured[0].type, undefined);
  checkObservationIsolation(next, 'r'); checkObservationIsolation(next, 'b');
  const variant = structuredClone(next); variant.captured[0].type = 'C';
  assert.deepEqual(lawfulView(next, 'b'), lawfulView(variant, 'b'));
  assert.notDeepEqual(featureIndices(lawfulView(next, 'r')), featureIndices(lawfulView(variant, 'r')));
});

test('samples are pre-move, both viewpoints and both odd/even plies', () => {
  const s = darkCaptureState(), pre = observationsAt(s);
  assert.equal(pre.length, 2);
  const n = move(s, {from: 45, to: 46});
  assert.equal(n.ply, 9); assert.equal(observationsAt(n).length, 2);
  assert.deepEqual(observationsAt(s), pre, 'Future capture changed pre-move features');
  s.ply = 7; assert.equal(observationsAt(s).length, 0);
  s.ply = 8; s.result = {winner: 'r'}; assert.equal(observationsAt(s).length, 0);
});

test('terminal adjudication has mate, repetition, quiet, cap precedence', () => {
  const s = initialState(1);
  s.ply = 400; assert.equal(refereeResult(s).status, 'unresolved');
  s.quiet = 120; assert.equal(refereeResult(s).status, 'draw');
  s.positions = [positionKey(s), positionKey(s), positionKey(s)];
  assert.deepEqual(refereeResult(s), {status: 'decided', winner: s.turn, reason: 'third-public-repetition', technicalForfeit: false});
  s.board = Array(90).fill(null); s.board[4] = piece('b', 'K');
  assert.equal(refereeResult(s).reason, 'mate'); assert.equal(refereeResult(s).winner, 'b');
});

test('replay validates checksum, legality, result and observation-derived seeds', () => {
  const game = syntheticJournal(), replay = replayGame(game, {isolation: true});
  assert(replay.odd > 0 && replay.even > 0);
  assert.equal(replay.eligible, false); assert(game.result.technicalForfeit);
  for (const row of replay.rows) assert.equal(row.target, undefined, 'Technical game assigned a label');
  const badSeed = structuredClone(game); badSeed.log[0].nativeSeed++;
  badSeed.logSha256 = jsonHash(badSeed.log); assert.throws(() => replayGame(badSeed), /observation-derived/);
  const badMove = structuredClone(game); badMove.log[0].move = {from: 0, to: 89};
  badMove.logSha256 = jsonHash(badMove.log); assert.throws(() => replayGame(badMove), /Illegal/);
  const badLabel = structuredClone(game); badLabel.result = {status: 'decided', winner: 'r', reason: 'mate', technicalForfeit: false};
  assert.throws(() => replayGame(badLabel), /Recorded result/);
  const badChecksum = structuredClone(game); badChecksum.logSha256 = '0';
  assert.throws(() => replayGame(badChecksum), /checksum/);
  const badView = structuredClone(game); badView.log[0].viewHashes.b = 'future';
  badView.logSha256 = jsonHash(badView.log); assert.throws(() => replayGame(badView));
});

test('completed candidates use deterministic score/from/to ranking, reject timeouts and fallbacks', () => {
  const legal = [{from: 4, to: 5}, {from: 1, to: 2}];
  const result = {completedDepth: 2, terminationReason: 'depth-limit', threads: 1, safetyCutoffs: 0, nodes: 20,
    ttBudgetBytes: 67108864, ttAllocatedBytes: 100, allCandidates: legal.map(m => ({...m, score: 10}))};
  assert.deepEqual(rankedCompleted(result, legal).map(({from, to}) => ({from, to})), legal.toReversed());
  assert.throws(() => rankedCompleted({...result, terminationReason: 'time-budget'}, legal));
  assert.throws(() => rankedCompleted({...result, completedDepth: 0}, legal));
  assert.throws(() => rankedCompleted({...result, allCandidates: result.allCandidates.slice(0, 1)}, legal));
});

test('trainer fields cannot contain seeds, future information, or invalid weights', () => {
  const row = {...observationsAt(darkCaptureState())[0], target: 1, weight: 1};
  assertTrainerRows([row]);
  assert.throws(() => assertTrainerRows([{...row, layoutSeed: 123}]));
  assert.throws(() => assertTrainerRows([{...row, weight: 0.5}]));
  assert.throws(() => assertTrainerRows([{...row, target: 0.8}]));
  const source = fs.readFileSync(new URL('./train.py', import.meta.url), 'utf8');
  assert(source.indexOf("test = load_split('test', frozen_sha=model_sha)") > source.indexOf("with FREEZE.open('x')"));
  assert.equal((source.match(/test = load_split\('test'/g) || []).length, 1);
});
