// Unit tests for the X and Truth Social posts helpers (worker/posts.js): account lists, search queries and post text.
import test from "node:test";
import assert from "node:assert/strict";
import {parseAccounts, queryGroups, segments, htmlSegments, parseArchiveFeed, DEFAULT_ACCOUNTS} from "../worker/posts.js";

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

test("Truth Social account lists accept links and @names", () => {
  assert.deepEqual(parseAccounts("https://truthsocial.com/@realDonaldTrump, @WhiteHouse whitehouse", true).list, ["realDonaldTrump", "WhiteHouse"]);
  assert.match(parseAccounts("bad-name", true).error, /isn't a Truth Social username/);
  assert.match(parseAccounts(Array.from({length: 21}, (_, i) => "a" + i), true).error, /most is 20/);
});

test("Truth Social HTML becomes safe pieces: paragraphs, links, mentions, cashtags; tags and scripts dropped", () => {
  const html = '<p>Tariffs on China are DONE &amp; markets love it. $SPY up, $btc too!</p><p>Read: <a href="https://www.whitehouse.gov/briefings-statements/2026/11/fact-sheet-very-long-address-here/" rel="nofollow noopener" target="_blank">' +
    '<span class="invisible">https://www.</span><span class="ellipsis">whitehouse.gov/briefings-statem</span><span class="invisible">ents/2026/11/fact-sheet</span></a> h/t ' +
    '<span class="h-card"><a href="https://truthsocial.com/@WhiteHouse" class="u-url mention">@<span>WhiteHouse</span></a></span><br/>Thank you!&#39;s &#x1F1FA;&#x1F1F8;</p>';
  const segs = htmlSegments(html);
  assert.deepEqual(segs.slice(0, 5), ["Tariffs on China are DONE & markets love it. ", {c: "SPY"}, " up, ", {c: "BTC"}, " too!\n\nRead: "]);
  assert.deepEqual(segs[5], {u: "https://www.whitehouse.gov/briefings-statements/2026/11/fact-sheet-very-long-address-here/", d: "whitehouse.gov/briefings-statem…"});
  assert.deepEqual(segs[7], {u: "https://truthsocial.com/@WhiteHouse", d: "@WhiteHouse"});
  assert.equal(segs[8], "\nThank you!'s \u{1F1FA}\u{1F1F8}");
  assert.deepEqual(htmlSegments('<p><script>alert(1)</script><a href="javascript:alert(1)">click</a> <img src=x onerror=alert(1)>hi</p>'), ["alert(1)click hi"]);
  assert.deepEqual(htmlSegments(""), []);
});

test("trumpstruth.org's feed becomes posts: text, pictures as a marker, quotes, reposts and removals flagged", () => {
  // shaped like the real feed at https://www.trumpstruth.org/feed (Nov 2026)
  const item = (id, type, desc, extra = "") => `<item><title><![CDATA[Post]]></title><link>https://www.trumpstruth.org/statuses/1</link>
    <description><![CDATA[${desc}]]></description><dc:creator>Donald J. Trump</dc:creator><pubDate>Wed, 25 Nov 2026 01:02:33 +0000</pubDate>
    <truth:originalUrl>https://truthsocial.com/@realDonaldTrump/${id}</truth:originalUrl><truth:originalId>${id}</truth:originalId>
    <archive:postType>${type}</archive:postType><archive:removed>${extra === "removed" ? "true" : "false"}</archive:removed>${extra === "removed" ? "" : extra}</item>`;
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
    ${item("117674380753944672", "original", '<p>Stocks are UP! $SPY <a href="https://vimeo.com/1249782646/7e27022b54" rel="nofollow"><span class="invisible">https://</span><span class="ellipsis">vimeo.com/1249782646/7e27022b5</span><span class="invisible">4</span></a></p>')}
    ${item("117674363024208708", "original", '<p></p><p><a href="https://truth-archive.us-iad-1.linodeobjects.com/attachments/1/a.png">View image</a></p>', '<media:content url="https://truth-archive.us-iad-1.linodeobjects.com/attachments/1/a.png" medium="image"></media:content>')}
    ${item("117665529427047942", "quote", '<p><span><br />RT: https://truthsocial.com/users/realDonaldTrump/statuses/117665528575591688</span></p><p>So true!</p><p>Quoted <a href="https://www.trumpstruth.org/statuses/43713">Donald J. Trump</a></p><blockquote><p>the quoted words</p></blockquote>',
      '<archive:reference type="quote" originalId="117665528575591688"><media:content url="https://x/v.mov" medium="video"></media:content></archive:reference>')}
    ${item("117674361691359583", "repost", '<p>RT someone</p>')}
    ${item("117600000000000000", "original", "<p>deleted</p>", "removed")}
  </channel></rss>`;
  const [a, b, c, d, e] = parseArchiveFeed(xml);
  assert.equal(a.id, "117674380753944672");
  assert.equal(a.at, Date.parse("2026-11-25T01:02:33Z"));
  assert.deepEqual(a.segs, ["Stocks are UP! ", {c: "SPY"}, " ", {u: "https://vimeo.com/1249782646/7e27022b54", d: "vimeo.com/1249782646/7e27022b5…"}]);
  assert.ok(!a.media && a.name === "Donald J. Trump" && a.type === "original");
  assert.deepEqual(b.segs, []); assert.ok(b.media);
  assert.deepEqual(c.segs, ["So true!"]); assert.equal(c.quote, "117665528575591688"); assert.ok(!c.media, "the quoted post's video isn't this post's");
  assert.equal(d.type, "repost");
  assert.ok(e.removed);
  assert.deepEqual(parseArchiveFeed("<html>not a feed</html>"), []);
});
