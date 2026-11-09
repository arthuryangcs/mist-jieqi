# Optional JQE launcher: HCE remains the default

The independent 16-layout/32-game confirmation did not pass its prespecified
superiority gate: 16 wins, 13 losses, 3 unresolved; paired layouts 4 positive,
4 negative and 8 ties; one-sided paired sign p = 0.63671875; worst-case score
50%. Therefore `package.json` continues to start the unchanged HCE server.
JQE has NOT been activated as the default. The earlier 144 exploratory games
are not confirmation evidence. Passing deployment checks does not establish
superiority or override this decision.

For an explicitly requested JQE session, run `node native/jqe-server.mjs`.
If the ordinary HCE server is already running, use a separate port, for example
`PORT=8767 node native/jqe-server.mjs`, and open that address manually. This
does not stop or refresh the running ordinary app. Stop the optional JQE server
with Ctrl+C; return to the existing HCE page, or run `npm start` if it is not
already running. No package edit is needed for this opt-in workflow.

## Design

`native/jqe-server.mjs` is inert when imported. It explicitly uses quantized,
incremental it014 with the tested generated source ending `459352`. It verifies
model, source, neural header, transport and recipe hashes, and the local binary
against its build manifest before probing. An entirely absent JQE cache is built
using the frozen portable baseline recipe. A partial cache or changed artifact
stops startup with a relative-file diagnostic; it never silently repairs an
existing cache or substitutes HCE.
Model settings are captured by the existing audited JQE transport, ignoring
ambient model/quantization/full-rebuild overrides. Status and search frames
include `evaluation`, `model`, model hash, binary hash and upstream provenance.
No local absolute paths or compiler flags are exposed by status.

The ordinary repository UI is served byte-for-byte. No experiment page is
written, no browser is opened, and no existing service is stopped or refreshed.
Existing deadline/legal-move fallback is still explicitly marked; this is not
an HCE evaluation fallback. JavaScript remains an explicit UI choice. The
original native diagnostic scripts and HCE launcher remain unchanged.

## Deployment validation

1. During matches, syntax checks only:
   `node --check native/jqe-server.mjs` and
   `node --check native/jqe-default-check.mjs`.
2. Once granted a CPU slot, run
   `node --test native/jqe-default-check.mjs`. It listens on an ephemeral port,
   never 8766, and checks pins, failure handling, ordinary page bytes, status,
   HTTP boundaries and one legal 2-second JQE result under hostile environment
   overrides. Mock coverage checks a fresh build, different-platform binary,
   partial cache, compile failure and nonportable flags without compiling.
   Separately, with CPU permission, run
   `MIST_JQE_TEST_FRESH=1 node --test native/jqe-default-check.mjs`
   for an actual fresh-cache build and HTTP startup in a disposable copy. It
   never overwrites the existing cache. Run current service/regression checks as directed by the
   confirmation audit. These checks do not replace the confirmation gate.
3. On 2026-11-09 the full explicit command with `MIST_JQE_TEST_FRESH=1`
   passed all 4 tests (0 failures, 0 skips), including a fresh baseline compile,
   ephemeral HTTP startup and ordinary UI bytes. Evidence is recorded in
   `benchmarks/jqe-confirm-2026-11-09/deployment-check.json`.
4. The confirmation gate failed, so no default-launcher change is authorized.
   Leave `package.json` unchanged. Never kill/restart 8766 or refresh the user's
   UI without direction. The optional launcher is available only by explicit
   command; HCE remains `npm start` or `node native/server.mjs`.

## Reproduction and portability

The reviewed build recipe is `native/experiments/jqe-current/build.mjs`, with
source, model and upstream hashes in its candidate manifest and experiment
evidence. Reproduction uses a separate checkout/cache, never overwriting frozen
replay artifacts during auditing. Generated source, header, model and build
recipe identities are platform independent. The compiler output hash is local:
the executable must match its own manifest, and that manifest must match the
tested source/model/header and portable flags. No global Mac binary pin is
required. If the whole cache is absent, startup compiles the baseline recipe
after checking its generated source hash; the result is verified and probed.
A partial or corrupt cache is an error, not permission to rebuild over evidence.
The compiler defaults to clang++ (or explicit CXX), using the existing platform
system headers/thread flag. No FMA, native-architecture or snapshot variants
are enabled. The first start on a fresh checkout requires a C++17 toolchain.
