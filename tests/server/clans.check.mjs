// Clans. Run against a local server (any state) started with --var ADMIN_EMAILS:owner@example.com (see README > Tests).
const API = process.env.API || 'http://127.0.0.1:8787', MOCK = process.env.MOCK || 'http://127.0.0.1:8500';
let pass = 0, fail = 0;
const ok = (c, l, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tok = async q => (await (await fetch(`${MOCK}/token?${new URLSearchParams(q)}`)).json()).token;
async function call(path, token, body) {
  const h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: h, body: body && JSON.stringify(body) });
  return { status: r.status, j: await r.json() };
}
const run = Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
const TAG = ('Q' + run).slice(0, 5), TAG2 = ('Z' + run).slice(0, 5);
const user = async (id, name) => { const t = await tok({ uid: `c-${id}-${run}`, name }); await call('/api/account', t); return t; };
const [ana, ben, cal, dee, eve] = await Promise.all([user('ana', 'Ana Alpha'), user('ben', 'Ben Bravo'), user('cal', 'Cal Charlie'), user('dee', 'Dee Delta'), user('eve', 'Eve Echo')]);

ok((await call('/api/clan/create', null, { name: 'Nope', tag: 'NOPE' })).status === 401, 'starting a clan needs sign-in');
ok((await call('/api/clan/create', ana, { name: 'Night Shift', tag: 'a!' })).status === 400, 'bad tag refused');
ok((await call('/api/clan/create', ana, { name: 'x', tag: TAG })).status === 400, 'bad clan name refused');
let r = await call('/api/clan/create', ana, { name: 'Night Shift', tag: TAG.toLowerCase() });
ok(r.status === 200 && r.j.clan === TAG && r.j.profile.clan && r.j.profile.clan.owner === true, 'clan created; tag upper-cased; creator leads it', JSON.stringify(r.j.profile && r.j.profile.clan));
ok((await call('/api/clan/create', ben, { name: 'Copycats', tag: TAG })).status === 409, 'tags are unique');
ok((await call('/api/clan/create', ana, { name: 'Second Clan', tag: TAG2 })).status === 400, 'one clan per trader');

let info = (await call('/api/clan/' + TAG, ana)).j;
const code = info.me && info.me.invite;
ok(info.ok && info.me && info.me.leader && /^[a-z0-9]{10}$/.test(code || ''), 'members see the invite code');
ok(!(await call('/api/clan/' + TAG, ben)).j.me, "non-members don't see it");
ok(!(await call('/api/clan/' + TAG)).j.me && (await call('/api/clan/' + TAG)).j.ok, 'clan pages are public');
const pv = (await call('/api/invite/' + code)).j;
ok(pv.ok && pv.tag === TAG && pv.members === 1 && pv.leader === 'Ana A.', 'invite preview shows the clan', JSON.stringify(pv));
ok((await call('/api/invite/zzzzzzzzzz')).status === 404, 'unknown invite -> 404');

ok((await call('/api/clan/join', ben, { code })).j.clan === TAG, 'second trader joins with the code');
ok((await call('/api/clan/join', cal, { code: code.toUpperCase() })).status === 200, 'third joins (code is case-insensitive)');
ok(/already in/.test((await call('/api/clan/join', cal, { code })).j.messages[0]), 'joining twice is harmless');
await call('/api/clan/create', dee, { name: 'Dee Squad', tag: TAG2 });
ok((await call('/api/clan/join', dee, { code })).status === 400, "can't join while in another clan");

await call('/api/order', ana, { coin: 'BTC', side: 'buy', size: 20000, unit: 'usd', leverage: 10 });
await sleep(21000);                                                  // past the leaderboard's 20 s cache
info = (await call('/api/clan/' + TAG, ana)).j;
ok(info.members.length === 3 && info.members[0].leader !== undefined && info.rank >= 1, 'clan page ranks 3 members and the clan is ranked', `rank ${info.rank}`);
ok(Math.abs(info.average - info.members.reduce((s, m) => s + m.equity, 0) / 3) < 1e-6, 'average value is the members\' average');
const cl = (await call('/api/clans', ben)).j;
const row = cl.rows.find(c => c.tag === TAG), row2 = cl.rows.find(c => c.tag === TAG2);
ok(row && row.members === 3 && row.ranked && row.rank, 'clan leaderboard lists the clan as ranked');
ok(row2 && !row2.ranked && row2.rank === null, 'a 1-member clan is listed but not ranked');
ok(cl.me && cl.me.tag === TAG, "the board shows the viewer's own clan");
const lb = (await call('/api/leaderboard')).j;
ok(lb.rows.filter(x => x.clan === TAG).length === 3, 'trader leaderboard shows clan tags');
const pid = r => r.j.profile.pid;
const benPid = pid(await call('/api/account', ben)), calPid = pid(await call('/api/account', cal));
ok((await call('/api/trader/' + benPid)).j.clan.tag === TAG, "a trader's profile shows their clan");

ok((await call('/api/clan/kick', ben, { pid: calPid })).status === 403, 'only the leader can remove members');
ok((await call('/api/clan/kick', ana, { pid: calPid })).status === 200, 'leader removes a member');
const calAcct = (await call('/api/account', cal)).j;
ok(!calAcct.profile.clan && calAcct.events.some(e => /removed from the clan/.test(e.msg)), 'removed member is told');
ok((await call('/api/clan/rename', ben, { name: 'Hijack' })).status === 403, 'only the leader can rename');
ok((await call('/api/clan/rename', ana, { name: 'Night Owls' })).status === 200, 'leader renames the clan');
await call('/api/clan/invite', ana, {});
ok((await call('/api/clan/join', cal, { code })).status === 404, 'a new invite link retires the old one');

ok((await call('/api/clan/leave', ana, {})).status === 200, 'leader leaves');
info = (await call('/api/clan/' + TAG, ben)).j;
ok(info.me && info.me.leader && info.members.length === 1, 'leadership passes to the longest-standing member');
r = await call('/api/clan/leave', ben, {});
ok(/closed/.test(r.j.messages[0]) && (await call('/api/clan/' + TAG)).status === 404, 'last member leaving closes the clan');

// deleting your account hands the clan on too
const code2 = (await call('/api/clan/' + TAG2, dee)).j.me.invite;
await call('/api/clan/join', eve, { code: code2 });
await call('/api/delete', dee, {});
ok((await call('/api/clan/' + TAG2, eve)).j.me.leader === true, 'deleting the leader account hands the clan on');

const owner = await tok({ uid: 'c-owner', name: 'Owner', email: 'owner@example.com', verified: '1' });
ok((await call('/api/admin/overview', owner)).j.clans.some(c => c.tag === TAG2), 'admin sees clans');
ok((await call('/api/admin/clan-remove', ana, { tag: TAG2 })).status === 403, 'only the owner can close clans');
ok((await call('/api/admin/clan-remove', owner, { tag: TAG2 })).status === 200, 'owner closes an offensive clan');
ok(!(await call('/api/account', eve)).j.profile.clan, "its members are clan-less again");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
