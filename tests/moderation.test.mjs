// Name rules and throwaway-email detection (worker/moderation.js)
import {test} from "node:test";
import assert from "node:assert/strict";
import {nameProblem, isDisposableEmail} from "../worker/moderation.js";
test("clean names pass, including ones with rude-looking pieces", () => {
  for (const n of ["Satoshi N.", "Billy S.", "Scunthorpe FC", "Classic Trader", "Assassin", "Bass Hitter", "Cato", "NIGHT", "Moderate Risk",
                   "Supportive Sam", "Glasshouse", "Sussex", "Therapist", "Cockburn", "Badminton Bob", "Officially Rich", "Staffordshire"])
    assert.equal(nameProblem(n), null, n);
});
test("swearing, slurs and disguised spellings are refused", () => {
  for (const n of ["f u c k", "fvck boy", "s.h.i.t", "sh1tlord", "b1tch", "FVCK"]) assert.match(nameProblem(n) || "", /isn't allowed/, n);
});
test("names posing as staff are refused", () => {
  for (const n of ["Aureous Admin", "admin", "Official Aureous", "aureous_staff", "Mod Team", "HyperliquidSupport", "TeamAdmin"]) assert.match(nameProblem(n) || "", /official/, n);
});
test("throwaway email domains (and their subdomains)", () => {
  assert.equal(isDisposableEmail("a@mailinator.com"), true);
  assert.equal(isDisposableEmail("b@x.guerrillamail.com"), true);
  assert.equal(isDisposableEmail("c@gmail.com"), false);
  assert.equal(isDisposableEmail("not-an-email"), false);
});
