#!/usr/bin/env node
/* Stub qoderwake CLI untuk test suite workflow (office/test-workflow.js).
   DIPAKAI LEWAT ENV QODERWAKE_BIN — tidak pernah dipakai server produksi.
   Meniru bentuk envelope daemon ({success,data}) dan quirk event stream
   (sequence_num / event_type / payload) supaya dispatcher di server.js
   teruji terhadap kontrak CLI yang sama tanpa membakar kredit QoderWake.
   Perilaku: tiap session menyelesaikan turn pada panggilan events ke-N
   (env STUB_COMPLETE_AT, default 3) dengan event type=result. */
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = process.env.STUB_STATE_DIR || process.cwd();
const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
function log(entry) {
  fs.appendFileSync(path.join(DIR, 'calls.jsonl'), `${JSON.stringify(entry)}\n`);
}
function out(obj) {
  process.stdout.write(JSON.stringify(obj));
}

const cmd = args[0];
const sub = args[1];

if (cmd === 'status') {
  out({ success: true, data: { device: { status: 'online' }, sessions: { total: 1, running: 0 }, agents: 3 } });
} else if (cmd === 'waker' && sub === 'list') {
  out({
    success: true,
    data: [
      { agentId: 'W-INT', name: 'Inta', description: 'intake order pod lengkap duplikat', machine: { online_status: 'online' } },
      { agentId: 'W-REC', name: 'Rekon', description: 'reconciliation cocok selisih toleransi rekonsil', machine: { online_status: 'online' } },
      { agentId: 'W-BIL', name: 'Sari', description: 'billing invoice tagihan denda', machine: { online_status: 'online' } },
    ],
  });
} else if (cmd === 'waker' && sub === 'create') {
  log({ op: 'waker-create', name: flag('--name') });
  out({ success: true, data: { agentId: 'W-NEW' } });
} else if (cmd === 'session' && sub === 'create') {
  const seqFile = path.join(DIR, 'seq.txt');
  const n = (Number(fs.existsSync(seqFile) ? fs.readFileSync(seqFile, 'utf8') : 0) || 0) + 1;
  fs.writeFileSync(seqFile, String(n));
  const sid = `S-${n}`;
  log({ op: 'create', sid, wakerId: flag('--waker-id'), message: flag('--message') });
  out({ success: true, data: { sessionId: sid } });
} else if (cmd === 'session' && sub === 'events') {
  const sid = flag('--session-id');
  const after = Number(flag('--after-sequence-num') || 0);
  const cfile = path.join(DIR, `ev-${sid}.txt`);
  const call = (Number(fs.existsSync(cfile) ? fs.readFileSync(cfile, 'utf8') : 0) || 0) + 1;
  fs.writeFileSync(cfile, String(call));
  const completeAt = Number(process.env.STUB_COMPLETE_AT || 3);
  let events = [];
  if (call === 1) events = [{ sequence_num: 1, event_type: 'runtime.state.changed', payload: { state: 'running' } }];
  else if (call >= completeAt) events = [{ sequence_num: 2, event_type: 'result', payload: { result: 'stub: turn selesai' } }];
  events = events.filter((e) => e.sequence_num > after);
  log({ op: 'events', sid, call, after, returned: events.length });
  out({ success: true, data: events });
} else if (cmd === 'session' && sub === 'stop') {
  log({ op: 'stop', sid: flag('--session-id') });
  out({ success: true, data: {} });
} else if (cmd === 'session' && sub === 'detail') {
  out({ success: true, data: { session: { sessionId: flag('--session-id'), status: 'idle' }, runtimeState: 'idle' } });
} else if (cmd === 'session' && sub === 'send') {
  log({ op: 'send', sid: flag('--session-id'), message: flag('--message') });
  out({ success: true, data: {} });
} else {
  out({ success: true, data: {} });
}
