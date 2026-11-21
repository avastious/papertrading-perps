// Cloudflare Pages Function: serves Firebase's sign-in helper (/__/auth/*, /__/firebase/*) from
// aureous.trade itself by passing requests through to aureous-14551.firebaseapp.com.
// Signing in on the same domain as the app is what makes Google sign-in work in the installed app
// (home-screen apps can't use pop-ups, and browsers block the cross-site storage a redirect needs).
// See https://firebase.google.com/docs/auth/web/redirect-best-practices (option 3).
const FIREBASE_HOST = "aureous-14551.firebaseapp.com";

export async function onRequest({request}) {
  const url = new URL(request.url);
  if (!/^\/__\/(auth|firebase)\//.test(url.pathname)) return new Response("Not found", {status: 404});
  const target = new URL(url.pathname + url.search, "https://" + FIREBASE_HOST);
  const headers = new Headers(request.headers);
  headers.delete("host");
  const res = await fetch(target, {
    method: request.method, headers, redirect: "manual",
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
  });
  return new Response(res.body, {status: res.status, statusText: res.statusText, headers: res.headers});
}
