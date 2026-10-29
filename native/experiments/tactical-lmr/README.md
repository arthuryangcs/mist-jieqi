# Tactical LMR screen

See [the report](../../../docs/experiments/tactical-lmr.md) and the frozen `plan.json`. This prototype is not the default engine. Build the current native core and create the `time-search` functional snapshot first; builds use the existing local C++ toolchain and never download an engine or model.

`check.mjs` and its ASAN/UBSAN run need no third-party process. The tactical fixture is a synthetic legal observation from the older AB comparison, not a user game or a hidden-layout training input. `protocol-check.mjs` and formal Pika matches additionally require the exact, previously reviewed local Pika binary and checkout; the adapter verifies both hashes and never passes referee truth.

Completed evidence must not be overwritten. `matches.mjs freeze` refuses an existing file, `next` continues the first incomplete game, and `verify.mjs` independently replays saved results without running Pika. To conduct a new experiment, use a new output directory and fresh layouts, and freeze the plan before play. The checked-in records identify the measured machine/compiler; recompiled binaries on another platform are not the same fixed binary.

Private quota/account/live-process metadata and all `.cache/` / `external/` contents stay local. Public evidence removes only those metadata fields; move histories and source fingerprints remain intact. Browser visual acceptance is not claimed: the prior browser access restriction was preserved; Node DOM and real HTTP checks have separate scope.
