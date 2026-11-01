// Sign-in settings for the public site. Leave `config` as null to run without accounts
// (everyone trades as a guest, saved in their own browser).
//
// To turn accounts on, paste your Firebase web app config below (README: "Accounts").
// These values are meant to be public: they identify your Firebase project, and access to
// account data is controlled by the security rules in firestore.rules.
window.AUREOUS_FIREBASE = {
  config: {
    apiKey: "AIzaSyBx8-kZGmX4KvGFylZBit6MJo49bJPC5CM",
    authDomain: "aureous-14551.firebaseapp.com",
    projectId: "aureous-14551",
    storageBucket: "aureous-14551.firebasestorage.app",
    messagingSenderId: "999259128304",
    appId: "1:999259128304:web:da87db9b207134b101dd35",
  },

  // Sign-in methods to show, in order. Each must also be switched on in
  // Firebase console > Authentication > Sign-in method.  Options: "google", "github", "microsoft", "email"
  providers: ["google", "email"],

  // Optional bot protection (Firebase App Check with reCAPTCHA v3). Paste the reCAPTCHA v3 *site* key
  // here, publish, check requests show as verified in Firebase > App Check, then turn on enforcement.
  appCheckSiteKey: null,
};
