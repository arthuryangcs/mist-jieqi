// Normalize local paths only; preserve the diagnostic text and all results/hashes.
import fs from 'node:fs';import assert from 'node:assert/strict';
const file='benchmarks/insertion-sort/sort-probe.json',raw=fs.readFileSync(file,'utf8'),r=JSON.parse(raw),backup='.cache/insertion-sort/sort-probe-raw.json';
assert(r.passed);if(!fs.existsSync(backup))fs.writeFileSync(backup,raw);
for(const row of r.rows)row.warnings=row.warnings.replaceAll(process.cwd(),'<project>');
r.diagnosticPathsNormalized=true;fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');
console.log(JSON.stringify({diagnosticPathsNormalized:true,sourceAndBinaryHashesUnchanged:true}));
