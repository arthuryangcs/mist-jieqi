# Buffered stable sort experiment

An explicit, isolated implementation experiment on the current production HCE search, with the same existing 64 MiB bounded-map TT normalization in both arms. The candidate only changes internal scored move sorting. It does not change the production source, default engine, UI, rules, probability model, evaluator, root ordering, search windows or deadlines. No server starts from these commands.

The frozen algorithm is bottom-up stable merge sort, insertion runs of 16, left-first ties, and one reusable scratch vector per Search instance. Sorting finishes before child search; concurrent workers have distinct Search objects. Priorities must not be NaN. Infinity, signed zero, subnormal values, duplicate scores and scratch reuse are covered by the oracle. The workspace is outside the TT budget, so equal TT budgets do not mean equal total RSS.

## Reproduce correctness

Run from the repository root with Node.js 20+ and an existing C++17 compiler. No new packages or third-party code are downloaded.

```sh
node --test native/experiments/buffered-sort/source.test.mjs native/experiments/buffered-sort/matches.test.mjs
node native/experiments/buffered-sort/matches.mjs replay
node native/experiments/buffered-sort/sort-probe.mjs
node native/experiments/buffered-sort/check.mjs
node native/experiments/buffered-sort/rules.mjs
node native/experiments/buffered-sort/sort-probe.mjs --sanitize
node native/experiments/buffered-sort/check.mjs --sanitize
node native/experiments/buffered-sort/rules.mjs --sanitize
```

Published-game replay is read-only and starts no engines, including Pika. Run it before regenerating evidence: checks write new platform-specific reports to benchmarks/buffered-sort, so their new hashes will differ from the published frozen round. Builds remain in ignored .cache/buffered-sort. A separate checkout is convenient for reproduction; preserve the original ledger and reports.

## Performance and formal screen

The exact plan is plan.json. After building/checking both arms, benchmark.mjs runs complete-depth, identical-tree pairs serially, followed by independent 2-second timed observations. Do not compile or run other engine jobs concurrently.

```sh
node native/experiments/buffered-sort/benchmark.mjs
```

Formal matches use the existing independently obtained fixed Pika HCE binary documented in THIRD_PARTY_NOTICES.md. The match runner verifies its hash; it never downloads, rebuilds or distributes Pika. On a fresh local round, freeze validates source/evidence hashes and checks layout hashes against existing match and dataset ledgers. It rejects already-used layouts and an existing frozen round. Do not rerun freeze over published outcomes, change seeds based on scores or omit failed games.

```sh
node native/experiments/buffered-sort/matches.mjs freeze
node native/experiments/buffered-sort/matches.mjs run
node native/experiments/buffered-sort/matches.mjs status
node native/experiments/buffered-sort/export.mjs
```

`next` runs one pending game, while `run` continues the finite plan. SIGINT/SIGTERM pause this runner after its current move. A STOP file in its own ignored cache prevents further work. Interrupted games are rebuilt from their public journals; completed results are never replaced. Inspect technical/cleanup failures before removing a STOP marker. Results distinguish technical forfeits, cleanup events, unresolved caps and normal outcomes.

The candidate is experimental only. The completed result and limits are in [the report](../../../docs/experiments/buffered-sort.md).
