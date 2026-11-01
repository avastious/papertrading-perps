// Aureous accounts: sign in with Google, GitHub, Microsoft or email (Firebase Auth). Accounts live
// on the Aureous trading server (apiUrl in firebase-config.js), which checks every sign-in, runs
// every trade against live Hyperliquid prices, and keeps the leaderboard honest.
//
// The page (index.html) exposes window.AureousUI; this module drives it. Without a Firebase config
// and an apiUrl this file does nothing and people trade as guests in their own browser.

const FIREBASE_VERSION = "13.1.0";
const UI = window.AureousUI;
const settings = window.AUREOUS_FIREBASE || {};
const API_URL = (settings.apiUrl || "").replace(/\/$/, "");
const SYNC_MS = 15000;

// ------------------------------------------------------------------ Firebase sign-in
async function firebaseBackend(cfg, appCheckSiteKey) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
  const [{initializeApp}, A] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js")]);
  const app = initializeApp(cfg);
  if (appCheckSiteKey) {
    // App Check: proves requests come from this website (reCAPTCHA v3), not a script using the API key.
    const C = await import(base + "firebase-app-check.js");
    C.initializeAppCheck(app, {provider: new C.ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true});
  }
  const auth = A.getAuth(app);
  A.getRedirectResult(auth).catch(() => {});   // completes a redirect sign-in after the page reloads
  const providers = {
    google: () => new A.GoogleAuthProvider(),
    github: () => new A.GithubAuthProvider(),
    microsoft: () => new A.OAuthProvider("microsoft.com"),
  };
  return {
    onUser: cb => A.onAuthStateChanged(auth, u => cb(u && {uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL,
                                                           provider: (u.providerData[0] || {}).providerId || null})),
    token: () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.reject(new Error("You're not signed in.")),
    async signInWith(id) {
      const p = providers[id]();
      try { await A.signInWithPopup(auth, p); }
      catch (e) {
        if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return A.signInWithRedirect(auth, p);
        throw e;
      }
    },
    signInEmail: (email, pw) => A.signInWithEmailAndPassword(auth, email, pw),
    async signUpEmail(email, pw, name) {
      const c = await A.createUserWithEmailAndPassword(auth, email, pw);
      if (name) await A.updateProfile(c.user, {displayName: name});
    },
    resetPassword: email => A.sendPasswordResetEmail(auth, email),
    signOut: () => A.signOut(auth),
    // confirm it's really them before anything is deleted (recent sign-in, password, or provider popup)
    async reauth(password) {
      const user = auth.currentUser;
      const id = (user.providerData[0] || {}).providerId;
      const recent = Date.now() - Date.parse(user.metadata.lastSignInTime || 0) < 4 * 60 * 1000;
      if (id === "password") await A.reauthenticateWithCredential(user, A.EmailAuthProvider.credential(user.email, password || ""));
      else if (!recent && providers[(id || "").replace(".com", "")]) await A.reauthenticateWithPopup(user, providers[id.replace(".com", "")]());
    },
    deleteUser: () => A.deleteUser(auth.currentUser),
  };
}

// ------------------------------------------------------------- friendly errors
const MESSAGES = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "There's no account with that email. Create one instead.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/email-already-in-use": "There's already an account with that email. Sign in instead.",
  "auth/weak-password": "Use a password of at least 6 characters.",
  "auth/password-does-not-meet-requirements": "That password doesn't meet the requirements. Try a longer one.",
  "auth/missing-password": "Enter your password.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/account-exists-with-different-credential": "This email already signed up with a different method. Use that one.",
  "auth/operation-not-allowed": "That sign-in method isn't switched on in Firebase yet.",
  "auth/requires-recent-login": "For your safety, sign out and sign back in, then try again.",
  "auth/configuration-not-found": "Sign-in isn't set up yet. In Firebase, open Authentication, click Get started and enable a sign-in method.",
  "auth/unauthorized-domain": "This website isn't in the Firebase project's authorized domains yet.",
  "auth/network-request-failed": "Couldn't reach the sign-in service. Check your connection.",
};
const SILENT = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);
const friendly = e => MESSAGES[e && e.code] || (e && e.message) || "Something went wrong.";

// --------------------------------------------------------------------- wiring
async function main() {
  if (!UI || UI.mode !== "browser" || !API_URL) return;
  const backend = window.AUREOUS_TEST_BACKEND || (settings.config ? await firebaseBackend(settings.config, settings.appCheckSiteKey).catch(e => {
    UI.toast("Sign-in is unavailable right now: " + e.message, "error"); return null;
  }) : null);
  if (!backend) return;

  let signedIn = false, syncTimer = null, generation = 0;

  // talk to the trading server; the sign-in token proves who is asking
  async function call(path, body, withAuth = true) {
    const headers = {"Content-Type": "application/json"};
    if (withAuth) headers.Authorization = "Bearer " + await backend.token();
    let r;
    try { r = await fetch(API_URL + path, {method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body)}); }
    catch { throw new Error("Couldn't reach the Aureous server. Check your connection."); }
    const j = await r.json().catch(() => ({ok: false, error: `Server error (${r.status})`}));
    if (!r.ok || j.ok === false) { const e = new Error(j.error || `Server error (${r.status})`); e.response = j; throw e; }
    return j;
  }
  const remote = async (path, body) => {
    try { return await call(path, {...body, since: UI.serverEvent()}); }
    catch (e) { if (e.response && e.response.state) UI.adoptRemote(e.response); throw e; }
  };
  const sync = async () => {
    if (!signedIn || document.visibilityState !== "visible") return;
    try { UI.adoptRemote(await call(`/api/account?since=${UI.serverEvent()}`)); UI.syncStatus("ok"); }
    catch (e) { UI.syncStatus("error", e.message); }
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); });

  UI.enableAccounts({
    providers: settings.providers || ["google", "email"],
    async signInWith(id) {   // true when signed in, false when the person closed the popup
      try { await backend.signInWith(id); return true; }
      catch (e) { if (SILENT.has(e.code)) return false; throw new Error(friendly(e)); }
    },
    async signInEmail(email, pw) { try { await backend.signInEmail(email, pw); } catch (e) { throw new Error(friendly(e)); } },
    async signUpEmail(email, pw, name) { try { await backend.signUpEmail(email, pw, name); } catch (e) { throw new Error(friendly(e)); } },
    async resetPassword(email) { try { await backend.resetPassword(email); } catch (e) { throw new Error(friendly(e)); } },
    async signOut() { await backend.signOut(); },
    async setName(name) { const r = await call("/api/profile", {name}); UI.adoptRemote(r); return r; },
    async deleteAccount(password) {
      try { await backend.reauth(password); }
      catch (e) { throw new Error(SILENT.has(e.code) ? "Account not deleted." : friendly(e)); }
      signedIn = false; clearInterval(syncTimer);            // stop syncing so nothing re-creates the account
      await call("/api/delete", {});                          // trading data first, then the login
      try { await backend.deleteUser(); }
      catch (e) { await backend.signOut().catch(() => {}); throw new Error("Your trading data was deleted, but removing the login failed: " + friendly(e)); }
    },
    leaderboard: () => call("/api/leaderboard", undefined, signedIn),
    trader: pid => call(`/api/trader/${encodeURIComponent(pid)}`, undefined, signedIn),
    async setPrivate(priv) { const r = await call("/api/privacy", {private: !!priv}); UI.adoptRemote(r); return r; },
  });

  backend.onUser(async user => {
    const gen = ++generation;
    clearInterval(syncTimer); syncTimer = null;
    if (!user) { signedIn = false; UI.setRemote(null); UI.setUser(null); return; }
    UI.setUser(user, "loading");
    try {
      signedIn = true;
      const r = await call("/api/account?since=0");
      if (gen !== generation) return;
      UI.setRemote(remote);
      UI.adoptRemote(r, {silent: true});                     // don't replay old notifications
      UI.setUser(user, "ready");
      syncTimer = setInterval(sync, SYNC_MS);
    } catch (e) {
      if (gen !== generation) return;
      signedIn = false;
      UI.setUser(user, "error");
      UI.toast("Couldn't load your account: " + e.message, "error");
    }
  });
}
main();
