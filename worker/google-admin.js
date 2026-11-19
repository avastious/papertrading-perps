// Firebase Authentication admin calls from the Worker, using a service account (no Admin SDK needed):
// look up an email/password account, mark its email verified, set a new password.
// Needs the FIREBASE_SERVICE_ACCOUNT secret: the JSON key from Firebase console > Project settings >
// Service accounts > Generate new private key (see README > Email codes).
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const IDENTITY = "https://identitytoolkit.googleapis.com/v1";
const SCOPE = "https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform";

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlText = s => b64url(new TextEncoder().encode(s));

export class GoogleAdmin {
  constructor(env) {
    this.sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    if (!this.sa.client_email || !this.sa.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT is missing client_email or private_key");
    this.project = env.FIREBASE_PROJECT_ID || this.sa.project_id;
    this.tokenUrl = env.GOOGLE_TOKEN_URL || TOKEN_URL;
    this.identity = env.IDENTITY_URL || IDENTITY;
    this.cached = null;
  }
  static configured(env) {
    if (!env.FIREBASE_SERVICE_ACCOUNT) return false;
    try { const j = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); return !!(j.client_email && j.private_key); } catch { return false; }
  }
  async token() {
    if (this.cached && this.cached.exp > Date.now() + 60000) return this.cached.token;
    const now = Math.floor(Date.now() / 1000);
    const head = b64urlText(JSON.stringify({alg: "RS256", typ: "JWT"}));
    const claims = b64urlText(JSON.stringify({iss: this.sa.client_email, scope: SCOPE, aud: this.tokenUrl, iat: now, exp: now + 3600}));
    const pem = this.sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("pkcs8", der, {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["sign"]);
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claims}`));
    const r = await fetch(this.tokenUrl, {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams({grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${b64url(sig)}`})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(`Google token ${r.status}: ${j.error_description || j.error || ""}`);
    this.cached = {token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000};
    return j.access_token;
  }
  async call(method, body) {
    const r = await fetch(`${this.identity}/projects/${this.project}/accounts:${method}`, {
      method: "POST", headers: {Authorization: "Bearer " + await this.token(), "Content-Type": "application/json"}, body: JSON.stringify(body)});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error((j.error && j.error.message) || `Identity Toolkit ${r.status}`); e.code = j.error && j.error.message; throw e; }
    return j;
  }
  // -> {uid, email, emailVerified, hasPassword} or null
  async byEmail(email) {
    const j = await this.call("lookup", {email: [email]});
    const u = (j.users || [])[0];
    if (!u) return null;
    return {uid: u.localId, email: u.email, emailVerified: !!u.emailVerified,
            hasPassword: (u.providerUserInfo || []).some(p => p.providerId === "password") || !!u.passwordHash};
  }
  update(uid, fields) { return this.call("update", {localId: uid, ...fields}); }
}
