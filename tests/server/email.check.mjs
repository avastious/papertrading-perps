// Real emails, one-time codes and name filtering. Run against a local server with a .dev.vars that points
// email and Firebase admin at the stand-in (mock-hyperliquid.js), e.g. made with:
//   node -e "const c=require('crypto');const {privateKey}=c.generateKeyPairSync('rsa',{modulusLength:2048});
//     const sa={project_id:'aureous-14551',client_email:'t@x.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})};
//     require('fs').writeFileSync('.dev.vars','RESEND_API_KEY=re_test_key\nRESEND_API_URL=http://127.0.0.1:8500/resend\n'+
//     'GOOGLE_TOKEN_URL=http://127.0.0.1:8500/google/token\nIDENTITY_URL=http://127.0.0.1:8500/identity\n'+
//     'FIREBASE_SERVICE_ACCOUNT=\''+JSON.stringify(sa)+'\'\n')"
const API = process.env.API || 'http://127.0.0.1:8787', MOCK = process.env.MOCK || 'http://127.0.0.1:8500';
let pass = 0, fail = 0;
const ok = (c, l, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); };
const R = Math.random().toString(36).slice(2, 7);
const tok = async q => (await (await fetch(`${MOCK}/token?${new URLSearchParams(q)}`)).json()).token;
const mk = async (q) => fetch(`${MOCK}/fbuser?${new URLSearchParams(q)}`);
const lastCode = async to => { const m = await (await fetch(`${MOCK}/sent?to=${encodeURIComponent(to)}`)).json(); const c = /\b(\d{6})\b/.exec(m.subject || ''); return c && c[1]; };
async function call(path, token, body) {
  const h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: h, body: body && JSON.stringify(body) });
  return { status: r.status, j: await r.json() };
}

ok((await call('/api/auth-config')).j.codes === true, 'server says it can email codes');
ok((await call('/api/email-check', null, { email: 'x@mailinator.com' })).j.disposable === true, 'throwaway domain spotted');
ok((await call('/api/email-check', null, { email: 'x@gmail.com' })).j.disposable === false, 'normal domain fine');

// --- an unconfirmed email/password account can't trade until it enters the emailed code
const ann = { uid: 'e-ann-' + R, email: `ann-${R}@example.com` };
await mk({ ...ann, password: 'pw' });
let annTok = await tok({ ...ann, name: 'Ann E', provider: 'password' });
let r = await call('/api/account', annTok);
ok(r.status === 403 && r.j.code === 'verify_email', 'unconfirmed email account is asked to confirm', r.j.error);
ok((await call('/api/order', annTok, { coin: 'BTC', side: 'buy', size: 100, unit: 'usd' })).j.code === 'verify_email', '...and cannot trade');
r = await call('/api/verify/send', annTok, {});
ok(r.status === 200, 'verification code sent', r.j.messages && r.j.messages[0]);
const code1 = await lastCode(ann.email);
ok(/^\d{6}$/.test(code1 || ''), 'the email holds a 6-digit code');
ok((await call('/api/verify/send', annTok, {})).status === 429, 'a second code within a minute is refused');
ok((await call('/api/verify/confirm', annTok, { code: code1 === '000000' ? '111111' : '000000' })).status === 400, 'wrong code refused');
r = await call('/api/verify/confirm', annTok, { code: code1 });
ok(r.status === 200 && r.j.verified, 'right code confirms the email', r.j.error);
ok((await (await fetch(`${MOCK}/fbuser/get?uid=${ann.uid}`)).json()).emailVerified === true, 'Firebase now has the email as verified');
annTok = await tok({ ...ann, name: 'Ann E', provider: 'password' });          // the refreshed token says verified
ok((await call('/api/account', annTok)).status === 200, 'with a fresh token the account opens');
ok((await call('/api/verify/confirm', annTok, { code: code1 })).status === 200, 'a used code does nothing harmful once verified');

// --- Google accounts aren't asked; throwaway inboxes are refused
ok((await call('/api/account', await tok({ uid: 'e-g-' + R, name: 'Gee', email: `g-${R}@gmail.com`, provider: 'google.com', verified: '1' }))).status === 200, 'Google account opens directly');
const junk = await tok({ uid: 'e-junk-' + R, name: 'Junk', email: `j-${R}@mailinator.com`, provider: 'password', verified: '1' });
r = await call('/api/account', junk);
ok(r.status === 403 && r.j.code === 'disposable_email', 'throwaway-inbox account refused even if verified', r.j.error);
ok((await call('/api/verify/send', junk, {})).j.code === 'disposable_email', 'and gets no code');

// --- forgotten password: code by email, then a new password
const bob = { uid: 'e-bob-' + R, email: `bob-${R}@example.com` };
await mk({ ...bob, password: 'old-password' });
r = await call('/api/reset/send', null, { email: bob.email });
ok(r.status === 200 && /code is on its way/.test(r.j.messages[0]), 'reset code requested');
const code2 = await lastCode(bob.email);
ok(/^\d{6}$/.test(code2 || ''), 'reset email holds a code');
const before = await lastCode(`nobody-${R}@example.com`);
r = await call('/api/reset/send', null, { email: `nobody-${R}@example.com` });
ok(r.status === 200 && r.j.messages[0] === 'If there\'s an Aureous account with a password for that email, a code is on its way.', 'unknown email gets the same answer');
ok(!(await lastCode(`nobody-${R}@example.com`)) && !before, '...but no email is sent');
ok((await call('/api/reset/confirm', null, { email: bob.email, code: code2, password: 'short' })).status === 400, 'too-short new password refused');
for (let i = 0; i < 5; i++) await call('/api/reset/confirm', null, { email: bob.email, code: String((+code2 + 1 + i) % 1e6).padStart(6, '0'), password: 'new-password-1' });
r = await call('/api/reset/confirm', null, { email: bob.email, code: code2, password: 'new-password-1' });
ok(r.status === 429, 'after 5 wrong tries even the right code is refused', r.j.error);
// a fresh code works (wait out the 1-minute resend limit by using another account)
const cat = { uid: 'e-cat-' + R, email: `cat-${R}@example.com` };
await mk({ ...cat, password: 'old-password' });
await call('/api/reset/send', null, { email: cat.email });
const code3 = await lastCode(cat.email);
r = await call('/api/reset/confirm', null, { email: cat.email, code: code3, password: 'brand-new-pass' });
ok(r.status === 200, 'right code + new password changes it', r.j.error);
const catUser = await (await fetch(`${MOCK}/fbuser/get?uid=${cat.uid}`)).json();
ok(catUser.password === 'brand-new-pass' && catUser.emailVerified === true, 'Firebase has the new password (and a verified email)');
ok((await call('/api/reset/confirm', null, { email: cat.email, code: code3, password: 'another-pass' })).status === 400, 'a code works only once');

// --- names
r = await call('/api/profile', annTok, { name: 'f u c k' });
ok(r.status === 400 && /isn't allowed/.test(r.j.error), 'swearing (even spaced out) refused as a name', r.j.error);
r = await call('/api/profile', annTok, { name: 'Aureous Admin' });
ok(r.status === 400 && /official/.test(r.j.error), 'staff-looking name refused', r.j.error);
ok((await call('/api/profile', annTok, { name: 'Scunthorpe Sam' })).status === 200, 'innocent name with a rude-looking substring allowed');
ok((await call('/api/clan/create', annTok, { name: 'Sh1t Squad', tag: 'OK' + R.slice(0, 3).toUpperCase() })).status === 400, 'rude clan name refused');
ok((await call('/api/clan/create', annTok, { name: 'Good Clan', tag: 'FVCK' })).status === 400, 'rude clan tag refused');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
