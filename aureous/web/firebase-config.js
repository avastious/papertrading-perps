// Sign-in settings for the public site. Leave `config` as null to run without accounts
// (everyone trades as a guest, saved in their own browser).
//
// To turn accounts on, paste your Firebase web app config below (README: "Accounts").
// These values are meant to be public: they identify your Firebase project, and access to
// account data is controlled by the security rules in firestore.rules.
window.AUREOUS_FIREBASE = {
  config: null,
  // e.g. config: {apiKey: "AIza...", authDomain: "your-project.firebaseapp.com", projectId: "your-project", appId: "1:123:web:abc"},

  // Sign-in methods to show, in order. Each must also be switched on in
  // Firebase console > Authentication > Sign-in method.  Options: "google", "github", "microsoft", "email"
  providers: ["google", "email"],
};
