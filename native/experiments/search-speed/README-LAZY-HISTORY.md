# Optional lazy private-history experiment

This is an isolated HCE/eight-world/full-root experiment. It does not replace the production engine or UI. A shared immutable zero table contains no game information; each Search allocates a private original uint32 history table on its first update. Updates, frozen move order, root coverage, node counting and safety controls are unchanged.

Build and validate in an independent checkout, while your own interactive searches are idle:

```sh
node native/experiments/search-speed/build-lazy-history.mjs
node --test native/experiments/search-speed/lazy-history-source.test.mjs
node native/experiments/search-speed/check-lazy-history.mjs search
node native/experiments/search-speed/check-lazy-history.mjs rules
node native/experiments/search-speed/check-lazy-history.mjs reference
```

Append `--sanitize` or `--tsan` to a check command for address/undefined-behavior or thread sanitizer builds. A suitable local C++17 toolchain is required; no build touches the default core. The build reports its exact source and binary hash. Match the published source hashes; binary hashes depend on OS/toolchain.

After building, an explicitly configured C7Engine may use the reported `binary` path; no automatic default is changed. Rejected history16 and occupied-generation derivatives remain checksum-guarded source exports in `lazy-history-source.mjs`, not switches in the retained candidate.

The [report](../../../docs/experiments/lazy-history.md) records all predetermined positions, distributions, failures and undecided games. It distinguishes setup latency from long-search throughput and playing strength. Replaying synthetic evidence never starts an engine:

```sh
node native/experiments/search-speed/replay-lazy-history.mjs
```

The common referee is evidence-limited `cn2020-evidence-v1`, not complete competition adjudication. Unsupported complex cycles remain unresolved. Legacy internal engine cycle estimates are not a proof of full competition-rule compliance. Preserve old result files with their recorded referee version; never silently rescore them.
