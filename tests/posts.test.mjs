// Unit tests for the X posts helpers (worker/posts.js): account lists, search queries and post text.
import test from "node:test";
import assert from "node:assert/strict";
import {parseAccounts, queryGroups, segments, DEFAULT_ACCOUNTS} from "../worker/posts.js";

test("account lists accept @names, links and plain names, without duplicates", () => {
  assert.deepEqual(parseAccounts("@elonmusk, https://x.com/federalreserve?s=20\nhttps://twitter.com/saylor/ ELONMUSK").list, ["elonmusk", "federalreserve", "saylor"]);
  assert.match(parseAccounts("good bad-name").error, /isn't an X username/);
  assert.match(parseAccounts(Array.from({length: 41}, (_, i) => "a" + i)).error, /most is 40/);
  assert.deepEqual(parseAccounts("").list, []);
});

test("search queries stay under X's length limit and cover every account", () => {
  const many = Array.from({length: 40}, (_, i) => "account_number" + i);
  const qs = queryGroups(many);
  assert.ok(qs.length > 1);
  for (const q of qs) { assert.ok(q.length <= 480, q.length); assert.match(q, /^\(from:\w+( OR from:\w+)*\) -is:retweet -is:reply$/); }
  assert.equal(qs.join(" ").match(/from:/g).length, 40);
  assert.equal(queryGroups(DEFAULT_ACCOUNTS).length, 1);
});

test("post text becomes safe pieces: links, cashtags, mentions; photos dropped", () => {
  const {segs, media} = segments("Buying $nvda &amp; $BTC, h/t @saylor <3 https://t.co/a1 https://t.co/p2", {urls: [
    {url: "https://t.co/a1", expanded_url: "https://example.com/" + "x".repeat(60), display_url: "example.com/" + "x".repeat(40)},
    {url: "https://t.co/p2", expanded_url: "https://x.com/u/status/1/photo/1", display_url: "pic.x.com/p2", media_key: "3_9"}]});
  assert.equal(media, 1);
  assert.deepEqual(segs.slice(0, 7), ["Buying ", {c: "NVDA"}, " & ", {c: "BTC"}, ", h/t ", {m: "saylor"}, " <3 "]);
  assert.equal(segs[7].u, "https://example.com/" + "x".repeat(60));
  assert.ok(segs[7].d.length <= 40 && segs[7].d.endsWith("…"));
  assert.equal(segs.length, 8);
  assert.deepEqual(segments("$5 off, price $12.50", {}).segs, ["$5 off, price $12.50"]);
  assert.deepEqual(segments("javascript link https://t.co/zz", {urls: [{url: "https://t.co/zz", expanded_url: "javascript:alert(1)", display_url: "x"}]}).segs, ["javascript link"]);
});
