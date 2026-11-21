// Name moderation for leaderboard names, clan names and clan tags, and disposable-email checks.
//
// Names are checked with obscenity (vendor/obscenity.js), which handles l33t-speak, look-alike
// characters and repeated letters, both as written and with spaces/dots/dashes removed (so
// "f u c k" and "s.h.i.t" are caught). Names that pose as Aureous staff are refused too.
import {RegExpMatcher, englishDataset, englishRecommendedTransformers} from "./vendor/obscenity.js";
import DISPOSABLE from "./vendor/disposable-domains.js";

const matcher = new RegExpMatcher({...englishDataset.build(), ...englishRecommendedTransformers});

// Words that suggest an official or staff account (checked as whole words, and inside joined-up names)
const RESERVED = ["aureous", "admin", "administrator", "moderator", "official", "support", "staff", "system", "hyperliquid"];
const RESERVED_WORD = new RegExp(`(^|[^a-z])(${RESERVED.join("|")}|mod)([^a-z]|$)`, "i");
const RESERVED_JOINED = /aureous|hyperliquid|moderator|administrator/i;   // distinctive enough to catch inside joined-up names

const squash = s => s.normalize("NFKC").replace(/[\s._\-]+/g, "");

// -> null if fine, otherwise a message saying why not
export function nameProblem(name, what = "name") {
  const s = String(name || "");
  if (matcher.hasMatch(s) || matcher.hasMatch(squash(s))) return `That ${what} isn't allowed. Please keep it clean: no swearing, slurs or sexual words.`;
  const words = s.replace(/([a-z])([A-Z])/g, "$1 $2");            // "TeamAdmin" -> "Team Admin"
  if (RESERVED_WORD.test(words) || RESERVED_JOINED.test(squash(s))) return `That ${what} looks like an official Aureous account. Please pick another.`;
  return null;
}

// Disposable / throwaway email domains (and their subdomains)
let disposable = null;
export function isDisposableEmail(email) {
  const domain = String(email || "").toLowerCase().trim().split("@")[1];
  if (!domain) return false;
  if (!disposable) disposable = new Set(DISPOSABLE.split("\n"));
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) if (disposable.has(parts.slice(i).join("."))) return true;
  return false;
}

// Free text people post publicly (call theses): no swearing, slurs or sexual words, and no links or contact
// details (they invite spam and scams). Returns a message, or null when it's fine.
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|io|xyz|net|org|gg|me|co|app|trade|link|ly|finance)\b|t\.me\/|discord\.gg|@[a-z0-9_]{3,}\b)/i;
export function textProblem(text) {
  const s = String(text || "");
  if (matcher.hasMatch(s)) return "Please keep it clean: no swearing, slurs or sexual words.";   // not squashed: joined-up words would trip it
  if (LINK.test(s)) return "Links, handles and contact details aren't allowed in calls. Explain your idea in words.";
  return null;
}
