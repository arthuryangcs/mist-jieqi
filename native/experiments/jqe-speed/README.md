# Isolated JQE speed experiments

Isolated experiments for the frozen current-rule JQE build. Completed-run evidence is local under `.cache/jqe-speed/`: `profile-summary.json`, `summary.json`, and (after all checks finish) `validation.json`. Raw sample reports remain local and are not suitable for publication.

All runtime entry points refuse an existing `.cache/jqe-retest/match.lock` or `.cache/jqe-confirm/match.lock`, missing/incomplete 144-game retest ledger, an existing but incomplete confirmation ledger, or changed frozen hashes. Do not remove another job's lock. Run only after the parent explicitly confirms matches are finished. Never use these tools against a service process or port 8766. Outputs are confined to `.cache/jqe-speed`; source/header changes are generated there, never in `jqe-current`. Do not publish raw sample reports: they contain local paths and host details. `profile-summary.json` is sanitized; review before publication.

Postmeasurement safety amendment: the confirmation lock/ledger guard was added after the reported measurements, while the new confirmation batch was running. Only guard source and this README changed; measured binaries, generated engine sources and JSON evidence remain unchanged. This amendment does not change any speed claim. Only a syntax check was run for the amendment.

From the repository root, after authorization:

1. `node native/experiments/jqe-speed/run.mjs profile`
2. Read the three raw sample reports locally and sanitized summary. The sample windows are three seconds, with engine requests capped at five seconds. Opening, 20-ply reveal-heavy middle game and all-known endgame come from the existing fixed benchmark corpus. Waiting stacks are not CPU hotspots. Profile result is not a benchmark.
3. `node native/experiments/jqe-speed/build.mjs baseline`
4. `node native/experiments/jqe-speed/build.mjs snapshot`
5. `node native/experiments/jqe-speed/build.mjs integer`
6. Repeat those three build commands with `--sanitize`.
7. `node native/experiments/jqe-speed/run.mjs verify snapshot`
8. `node native/experiments/jqe-speed/run.mjs verify integer`
9. `node native/experiments/jqe-speed/run.mjs bench snapshot`
10. `node native/experiments/jqe-speed/run.mjs bench integer`

Before benchmarking/deployment, also run `node native/experiments/jqe-speed/suite.mjs snapshot rules`, repeat with `--sanitize`, and run `node native/experiments/jqe-speed/suite.mjs snapshot thread-check`. Repeat all three for `integer`. This adapts the unchanged current rule/thread suite into isolated cache paths, including the existing 127-ply async undo, 1/4-worker parity, concurrent inference and sanitizer recovery checks. The adaptation itself is unexecuted until the match-completion gate permits it. An upstream-oracle adaptation is deliberately not provided here because its original helper writes into the frozen cache; use a separately isolated implementation before deployment if required.

Snapshot is only active-mode, active-width snapshot copying; integer is only removal of the float activation roundtrip in quantized L1. Neither includes the other. After actual sampling exposed FMA library overhead, a third independent `fma` variant was added: only `correction` receives `__attribute__((target("fma")))`, with `-ffp-contract=off` retained and no fast-math. This is for the verified x86 FMA-capable host, not a portable default binary. Substitute `fma` for the candidate name in the build, verify, suite and benchmark commands. Float and quantized output must match the frozen baseline exactly. Snapshot leaves unused arrays/tails at their initial zero values and retains whole-State equality checks and heap-backed recursion undo. No inverse arithmetic undo is used.

Verification covers all five original positions, both modes, normal/sanitized builds, every legal one-ply transition with whole-State restore, exact depth-two iterations/nodes/candidates and sanitizer timeout recovery. The provided suite adaptation additionally covers current rules, 1/4-worker parity, 127-ply async undo and concurrent inference. This does not add alternate dimension/bucket model fixtures or rerun the upstream oracle. Do not weaken equality to the upstream check's ±1 tolerance.

Benchmark uses serial ABBA/BAAB ordering (three blocks per position), identical fixed observations/worlds, the same model, TT budget and compiler flags, fresh processes with an untimed depth-one request before each measured request, and exact full-depth parity. Default depth is three; optionally set `JQE_SPEED_DEPTH` before the whole run, not after inspecting selective results. Any incomplete depth/parity failure aborts; preserve partial output. Report per-position ratios and variability, no claimed strength improvement. These scripts do not collect process CPU time; add a validated counter if needed instead of labeling wall time CPU time.

The completed measurement used `JQE_SPEED_DEPTH=4` for all three candidates. `summarize.mjs` reports per-position min/median/max and adjacent-pair ratio ranges. These are descriptive variability, not confidence intervals. `finalize.mjs` verifies result identities and records the complete validation manifest. Integer results near 1.0 should not be promoted as a speed gain. No variants are combined and no strength gain follows from exact-tree speed measurements.

Only `node --check` is safe while the retest is running. Importing/running `run.mjs` starts work after its guard. No commits or default activation are performed.
