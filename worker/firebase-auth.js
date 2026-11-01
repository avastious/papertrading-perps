// Verifies Firebase Auth ID tokens (the proof of sign-in the website sends with each request).
// A token is accepted only if Google's key signed it, it was issued for our Firebase project,
// and it hasn't expired. https://firebase.google.com/docs/auth/admin/verify-id-tokens

const GOOGLE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const keyCache = {url: null, keys: null, until: 0};

function b64urlBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
const b64urlJSON = s => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function signingKeys(url, force = false) {
  if (!force && keyCache.url === url && keyCache.keys && Date.now() < keyCache.until) return keyCache.keys;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`could not fetch signing keys (${r.status})`);
  const maxAge = +(/max-age=(\d+)/.exec(r.headers.get("cache-control") || "") || [0, 3600])[1];
  keyCache.url = url; keyCache.keys = (await r.json()).keys || []; keyCache.until = Date.now() + Math.min(maxAge, 6 * 3600) * 1000;
  return keyCache.keys;
}

export class AuthError extends Error {}

/** Returns {uid, name, email} for a valid token, or throws AuthError. */
export async function verifyIdToken(token, projectId, jwksUrl = GOOGLE_JWKS) {
  if (!token || token.length > 4096) throw new AuthError("Missing sign-in token.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError("Malformed sign-in token.");
  let header, claims;
  try { header = b64urlJSON(parts[0]); claims = b64urlJSON(parts[1]); } catch { throw new AuthError("Malformed sign-in token."); }
  if (header.alg !== "RS256" || !header.kid) throw new AuthError("Unexpected token algorithm.");

  let jwk = (await signingKeys(jwksUrl)).find(k => k.kid === header.kid);
  if (!jwk) jwk = (await signingKeys(jwksUrl, true)).find(k => k.kid === header.kid);   // keys rotate
  if (!jwk) throw new AuthError("Unknown token signing key.");
  const key = await crypto.subtle.importKey("jwk", {kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true},
                                            {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]),
                                        new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) throw new AuthError("Invalid token signature.");

  const now = Math.floor(Date.now() / 1000), skew = 60;
  if (claims.aud !== projectId) throw new AuthError("Token is for a different project.");
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new AuthError("Token has the wrong issuer.");
  if (!(claims.exp > now - skew)) throw new AuthError("Sign-in expired. Refresh the page.");
  if (!(claims.iat <= now + skew) || (claims.auth_time && claims.auth_time > now + skew)) throw new AuthError("Token is from the future.");
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128) throw new AuthError("Token has no user.");
  return {uid: claims.sub, name: typeof claims.name === "string" ? claims.name : null, email: typeof claims.email === "string" ? claims.email : null,
          emailVerified: claims.email_verified === true};
}
