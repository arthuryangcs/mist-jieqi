# Bounded and clustered transposition tables

Independent experiment; the default uncapped HCE is unchanged. See [the report](../../../docs/experiments/cluster-tt.md), `plan.json`, and the completed synthetic replay evidence under `benchmarks/cluster-tt/`.

Use the existing Node/C++ toolchain. In a clean checkout, build the default and freeze its source/binary once:

```sh
node native/build.mjs
node native/experiments/time-search/build.mjs --freeze
node native/experiments/cluster-tt/build.mjs --control
node native/experiments/cluster-tt/build.mjs
node native/experiments/cluster-tt/build.mjs --trace
node native/experiments/cluster-tt/build.mjs --trace --sanitize
node native/experiments/cluster-tt/table-check.mjs
node native/experiments/cluster-tt/check.mjs
node native/experiments/cluster-tt/check.mjs --sanitize
node native/experiments/cluster-tt/control-saturation.mjs
node native/experiments/cluster-tt/benchmark.mjs
```

The functional snapshot refuses replacement. Reuse a verified matching snapshot instead of overwriting it. Compilation on another platform produces a different binary hash. The control uses the stable search with a bounded arena map and the same 90,000-entry per-world limit; this is a resource-normalized control, not the original executable. The trial uses two-way 64-byte slots with depth-based replacement. Both have a 64 MiB TT allocation ceiling per request; total process RSS is not equalized. Every sampled world has a separate table.

The Pika checks additionally need the previously reviewed fixed local Pika checkout/binary; this code downloads or installs nothing:

```sh
node native/experiments/cluster-tt/protocol-check.mjs
node native/experiments/cluster-tt/verify.mjs
```

The adapter rotates and swaps colors when Pika plays black so its own side is always red. This defines a new canonical-orientation reference using the unchanged binary. It does not repair or prove the cause of upstream evaluation asymmetry. Search roots, six-character reveal/capture tokens, private inventories and move counters are mapped; only filtered observer views enter the adapter. Historical raw-orientation Pika scores must not be pooled with this screen.

`verify.mjs` replays saved moves without launching engines. Never overwrite completed evidence. `matches.mjs freeze` refuses an existing manifest, and `next` resumes the first incomplete game. New experiments require a new directory, fresh layouts and a frozen plan. The run lock prevents overlapping matches; inspect a stale lock and its process before any recovery. No third-party source, binary, weights, credentials, private account/quota records or live process metadata are published. Prior browser restrictions remain in effect; HTTP and DOM checks do not constitute browser visual acceptance.
