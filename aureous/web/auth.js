// Aureous accounts: sign in with Google, GitHub, Microsoft or email (Firebase Auth), and keep
// each person's paper account in Firestore so it follows them across devices.
//
// Without a Firebase config (firebase-config.js) this file does nothing and everyone trades
// as a guest. The page (index.html) exposes window.AureousUI; this module drives it.

const FIREBASE_VERSION = "13.1.0";
const UI = window.AureousUI;
const settings = window.AUREOUS_FIREBASE || {};

// ------------------------------------------------------------------ Firebase backend
async function firebaseBackend(cfg) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
  const [{initializeApp}, A, F] = await Promise.all([
    import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js"),
  ]);
  const app = initializeApp(cfg);
  const auth = A.getAuth(app), db = F.getFirestore(app);
  A.getRedirectResult(auth).catch(() => {});   // completes a redirect sign-in after the page reloads
  const providers = {
    google: () => new A.GoogleAuthProvider(),
    github: () => new A.GithubAuthProvider(),
    microsoft: () => new A.OAuthProvider("microsoft.com"),
  };
  const ref = uid => F.doc(db, "accounts", uid);
  return {
    onUser: cb => A.onAuthStateChanged(auth, u => cb(u && {uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL})),
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
    async load(uid) { const s = await F.getDoc(ref(uid)); return s.exists() ? s.data().state : null; },
    save: (uid, json, session) => F.setDoc(ref(uid), {state: json, session, updated: F.serverTimestamp()}),
    // calls cb(json) when another tab or device saves this account
    watch: (uid, session, cb) => F.onSnapshot(ref(uid), s => {
      if (!s.metadata.hasPendingWrites && s.exists() && s.data().session !== session) cb(s.data().state);
    }, () => {}),
  };
}

// ------------------------------------------------- a store that saves to the cloud
// The engine saves after every tick; this only writes when the account actually changed,
// at most every 5 s (2 s after a change), and right away when the page is being hidden.
class CloudStore {
  constructor(backend, uid, session, json) {
    Object.assign(this, {backend, uid, session, value: json, written: json, timer: null, lastWrite: 0, closed: false, status: "saved"});
  }
  getItem() { return this.value; }
  setItem(_key, v) { this.value = v; if (v !== this.written) this.schedule(); }
  schedule() {
    if (this.timer || this.closed) return;
    const wait = Math.max(2000, 5000 - (Date.now() - this.lastWrite));
    this.timer = setTimeout(() => this.flush(), wait);
  }
  async flush() {
    clearTimeout(this.timer); this.timer = null;
    if (this.closed || this.value === this.written) return;
    const v = this.value;
    this.lastWrite = Date.now();
    try {
      await this.backend.save(this.uid, v, this.session);
      this.written = v; this.setStatus("saved");
    } catch (e) {
      this.setStatus("error", e.message); this.schedule();
    }
  }
  setStatus(s, msg) { if (s !== this.status) { this.status = s; UI.saveStatus(s, msg); } }
}

// ------------------------------------------------------------- friendly errors
const MESSAGES = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "There's no account with that email. Create one instead.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/email-already-in-use": "There's already an account with that email. Sign in instead.",
  "auth/weak-password": "Use a password of at least 6 characters.",
  "auth/missing-password": "Enter your password.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/account-exists-with-different-credential": "This email already signed up with a different method. Use that one.",
  "auth/operation-not-allowed": "That sign-in method isn't switched on in Firebase yet.",
  "auth/unauthorized-domain": "This website isn't in the Firebase project's authorized domains yet.",
  "auth/network-request-failed": "Couldn't reach the sign-in service. Check your connection.",
};
const SILENT = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);
function friendly(e) { return MESSAGES[e && e.code] || (e && e.message) || "Something went wrong."; }

// --------------------------------------------------------------------- wiring
async function main() {
  if (!UI || UI.mode !== "browser") return;                         // local Python server: no accounts
  const backend = window.AUREOUS_TEST_BACKEND || (settings.config ? await firebaseBackend(settings.config).catch(e => {
    UI.toast("Sign-in is unavailable right now: " + e.message, "error"); return null;
  }) : null);
  if (!backend) return;

  const session = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let current = null;         // {uid, store, unwatch}
  let generation = 0;

  UI.enableAccounts({
    providers: (settings.providers || ["google", "email"]),
    async signInWith(id) {   // true when signed in, false when the person closed the popup
      try { await backend.signInWith(id); return true; }
      catch (e) { if (SILENT.has(e.code)) return false; throw new Error(friendly(e)); }
    },
    async signInEmail(email, pw) { try { await backend.signInEmail(email, pw); } catch (e) { throw new Error(friendly(e)); } },
    async signUpEmail(email, pw, name) { try { await backend.signUpEmail(email, pw, name); } catch (e) { throw new Error(friendly(e)); } },
    async resetPassword(email) { try { await backend.resetPassword(email); } catch (e) { throw new Error(friendly(e)); } },
    async signOut() { if (current) await current.store.flush(); await backend.signOut(); },
  });

  const leave = async () => {
    if (!current) return;
    await current.store.flush();
    current.store.closed = true;
    if (current.unwatch) current.unwatch();
    current = null;
  };
  const flushNow = () => { if (current) current.store.flush(); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushNow(); });
  window.addEventListener("pagehide", flushNow);

  backend.onUser(async user => {
    const gen = ++generation;
    await leave();
    if (!user) { UI.setUser(null); await UI.useStorage(UI.guestStorage, null); return; }
    UI.setUser(user, "loading");
    let json;
    try { json = await backend.load(user.uid); }
    catch (e) {
      UI.toast("Couldn't load your account: " + friendly(e) + " You're trading as a guest for now.", "error");
      UI.setUser(user, "error"); return;
    }
    if (gen !== generation) return;
    const store = new CloudStore(backend, user.uid, session, json);
    const guest = UI.guestState();
    const carry = !json && guest && guest.active;
    const created = await UI.useStorage(store, carry ? guest.state : null);
    if (created && carry) {
      UI.clearGuest();
      UI.toast(`Your guest account is now saved to ${user.email || "your account"}.`);
    }
    await store.flush();
    current = {uid: user.uid, store, unwatch: backend.watch(user.uid, session, remote => {
      if (!current || current.store !== store || remote === store.value) return;
      store.value = store.written = remote;
      UI.adopt(remote);
    })};
    UI.setUser(user, "ready");
  });
}
main();
