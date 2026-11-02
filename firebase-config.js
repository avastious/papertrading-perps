// Accounts for the public site.
//
// config:  your Firebase web app config (sign-in). These values are meant to be public: they
//          identify the Firebase project; the trading server checks every sign-in itself.
// apiUrl:  the Aureous trading server (Cloudflare Worker "aureous-api", see worker/ and README).
//          With both set, signing in is required to trade, accounts live on the server, and the
//          leaderboard is shown. Set config to null to run without accounts (guest trading in the
//          browser only).
window.AUREOUS_FIREBASE = {
  config: {
    apiKey: "AIzaSyBx8-kZGmX4KvGFylZBit6MJo49bJPC5CM",
    authDomain: "aureous-14551.firebaseapp.com",
    projectId: "aureous-14551",
    storageBucket: "aureous-14551.firebasestorage.app",
    messagingSenderId: "999259128304",
    appId: "1:999259128304:web:da87db9b207134b101dd35",
  },
  apiUrl: "https://aureous-api.billystorrs15.workers.dev",

  // Sign-in methods to show, in order. Each must also be switched on in
  // Firebase console > Authentication > Sign-in method.  Options: "google", "github", "microsoft", "email"
  providers: ["google", "email"],

  // Optional bot protection (Firebase App Check with reCAPTCHA v3). Paste the reCAPTCHA v3 *site* key
  // here, publish, check requests show as verified in Firebase > App Check, then turn on enforcement.
  appCheckSiteKey: null,
};
