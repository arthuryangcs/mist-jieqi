// Completed confirmation evidence only. Never change source ledgers or frozen files.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const cache='.cache/jqe-confirm',dir='benchmarks/jqe-confirm-2026-11-09',hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const names=['matches','replay','audit','analysis'],raw=Object.fromEntries(names.map(n=>[n,fs.readFileSync(`${cache}/${n}.json`)])),d=Object.fromEntries(names.map(n=>[n,JSON.parse(raw[n])]));
assert(d.matches.completedAt&&d.matches.games.length===32&&d.matches.games.every(g=>g.result));
assert(d.replay.passed&&d.replay.complete&&d.replay.games===32&&d.replay.matchesSha256===hash(raw.matches));
assert(d.audit.passed&&d.audit.complete&&d.audit.auditedGames===32&&d.audit.inputSha256===hash(raw.matches));
assert(d.analysis.complete&&d.analysis.finishedGames===32&&d.analysis.replayPassed&&d.analysis.auditPassed);
for(const[p,h]of Object.entries(d.matches.hashes))assert.equal(hash(fs.readFileSync(p)),h,p);
const forbidden=/\/Users\/|\/home\/|github_pat_|gh[pousr]_[A-Za-z0-9_]{20,}|BEGIN [A-Z ]*PRIVATE KEY/;
function immutableWrite(file,bytes){if(fs.existsSync(file))assert(fs.readFileSync(file).equals(bytes),'Refusing to replace different evidence: '+file);else fs.writeFileSync(file,bytes);}
const files={};for(const name of names){assert(!forbidden.test(raw[name].toString()),name+' privacy scan');const file=`${dir}/${name}.json`;immutableWrite(file,raw[name]);assert(fs.readFileSync(file).equals(raw[name]));files[name+'.json']={sha256:hash(raw[name]),bytes:raw[name].length,byteIdenticalToCache:true};}
const manifest={files,planSha256:d.matches.planSha256,createdAt:d.matches.createdAt,completedAt:d.matches.completedAt,durationHours:(Date.parse(d.matches.completedAt)-Date.parse(d.matches.createdAt))/3600000,layouts:16,games:32,plies:d.replay.moves,summary:d.matches.summary,auditCategories:d.audit.categories,technicalFailures:d.analysis.technicalFailures,cleanupFailures:d.analysis.cleanupFailures,defaultEnable:d.analysis.defaultEnable,exportSourceSha256:hash(fs.readFileSync('native/experiments/jqe-confirm/export.mjs'))};
immutableWrite(dir+'/export-manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n'));console.log(JSON.stringify(manifest,null,2));
