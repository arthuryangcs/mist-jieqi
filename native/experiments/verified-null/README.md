# Protected null-move experiment

Independent selective-search prototype; the production uncapped HCE stays unchanged. See [the report](../../../docs/experiments/verified-null.md), the frozen `plan.json`, and synthetic replay evidence under `benchmarks/verified-null/`.

Use the existing Node/C++ toolchain. In a clean checkout, first build the current native core and freeze its functional snapshot once. An existing snapshot must match the recorded source; do not overwrite it.

```sh
node native/build.mjs
node native/experiments/time-search/build.mjs --freeze
node native/experiments/verified-null/build.mjs --control
node native/experiments/verified-null/build.mjs
node native/experiments/verified-null/build.mjs --trace
node native/experiments/verified-null/build.mjs --trace --sanitize
node native/experiments/verified-null/null-check.mjs
node native/experiments/verified-null/check.mjs
node native/experiments/verified-null/check.mjs --sanitize
node native/experiments/verified-null/control-saturation.mjs
node native/experiments/verified-null/cancel-check.mjs
node native/experiments/verified-null/benchmark.mjs
```

Control and trial share the bounded arena unordered_map from the previous resource-control experiment, not its clustered replacement table. The control disables the new policy. Fixed-node parity with the original stable HCE is tested; its executable remains unchanged. A 64 MiB TT allocation ceiling does not equal total process RSS or equal actual use.

The null policy is a heuristic, not a zugzwang or mate proof. It requires two publicly revealed own rooks/cannons/horses, depth at least three, multiple legal moves, no check, a finite non-mate beta, and static evaluation above beta. Deeper or low-population cutoffs need reduced legal-position verification. Synthetic subtrees cannot probe/store real TT entries, claim real-history repetition, update killers/history or perform another null move. Extra buffer frames are subtracted from actual move-depth and mate distance; stack/time/cancellation guards remain.

The exact local Pika binary/checkout must already be present and approved for execution. No script downloads an engine, dependency or model. Its canonical own-red adapter is unchanged from the October 30 reference:

```sh
node native/experiments/verified-null/protocol-check.mjs
node native/experiments/verified-null/search-preflight.mjs
node native/experiments/verified-null/verify.mjs
node native/experiments/verified-null/summarize.mjs
```

`verify.mjs` replays saved moves without running engines. Completed evidence is immutable: `freeze` rejects an existing manifest, `next` continues the first incomplete game, and a run lock prevents overlap. New experiments need a new output directory, fresh layouts and a frozen plan; never overwrite or rerun finished games. The old qcheck-filter STOP, lock and 4/12 results are unrelated and stay paused.

Only filtered observer views enter either engine; referee layouts/seeds are replay evidence, never engine inputs. Public artifacts exclude credentials, private quota/account/runtime metadata, third-party source/binaries/weights and builds. Prior browser restrictions remain; HTTP/DOM results do not constitute visual browser acceptance.
