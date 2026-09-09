import test from "node:test";
import assert from "node:assert/strict";
import { matchesTargetUrl } from "../lib/target.js";

test("target matching ignores hash, query noise, and a trailing slash", () => {
  assert.equal(
    matchesTargetUrl(
      "https://docs.google.com/document/d/abc/edit?tab=t.0#heading=h.1",
      "https://docs.google.com/document/d/abc/edit",
    ),
    true,
  );
  assert.equal(
    matchesTargetUrl("https://example.com/manuscript/", "https://example.com/manuscript"),
    true,
  );
});

test("target matching rejects other documents, origins, and invalid URLs", () => {
  assert.equal(
    matchesTargetUrl(
      "https://docs.google.com/document/d/def/edit",
      "https://docs.google.com/document/d/abc/edit",
    ),
    false,
  );
  assert.equal(matchesTargetUrl("https://elsewhere.example/manuscript", "https://example.com/manuscript"), false);
  assert.equal(matchesTargetUrl("not-a-url", "https://example.com/manuscript"), false);
});
