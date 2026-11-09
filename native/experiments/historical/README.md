# Historical evidence boundary

`engine-9602155.js` and `search-9602155.cpp` are byte-for-byte copies from
commit `9602155a214aeebf3ca622db7401e964e5410f03`. They intentionally retain the
superseded mover-loses repetition referee and approximate internal cycle draw.
They are not the current competition rules or evidence of current playing strength.

The selfplay-value, buffered-sort and JQE source builders reproduce their frozen
historical experiments. Their source pins must not be relabeled as current production.
Historical JQE/buffered-sort match commands allow only status and offline replay;
selfplay-value generation/match launching is disabled. JQE preview generation and
service launch explicitly refuse the incompatible frozen core before starting it. New tournaments require a
new plan and the production referee, search and protocol. Do not use these frozen
binaries with the current bridge's repetition-win root outcome (3).

JQE follow-up audits and search-speed public replays use the archived referee to
verify the original recorded results, without rewriting or re-adjudicating ledgers.
Selfplay-value dataset replay also retains the original referee and row hashes.
`provenance.mjs` checks changed source pins against explicit archival blobs in
`sources.json`, and unchanged source pins against working-tree files. This proves
historical source provenance, not equality to the current production tree.

No original benchmark JSON is modified by this migration. Archived sources are
inert evidence, not imported modules. The two explicitly named referee/search
snapshots are the only executable/buildable archival sources.
