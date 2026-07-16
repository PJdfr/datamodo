// Unit tests for the MCP OAuth pure core (lib/datamodo/oauth.ts) and the
// combined bearer resolution rules (lib/datamodo/mcp-auth.ts, local branch
// only — the DB-backed dmo_ path is covered by the E2E flow). Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  randomToken,
  hashToken,
  pkceChallenge,
  pkceVerify,
  isValidRedirectUri,
  parseClientRegistration,
  signConsent,
  verifyConsent,
  type ConsentPayload,
} from "../lib/datamodo/oauth.ts";

/* ---- tokens ---- */

test("randomToken: prefixed, unique, url-safe", () => {
  const a = randomToken("dmo");
  const b = randomToken("dmo");
  assert.ok(a.startsWith("dmo_"));
  assert.notEqual(a, b);
  assert.match(a, /^dmo_[A-Za-z0-9_-]{40,}$/);
  assert.ok(randomToken("dmr").startsWith("dmr_"));
  assert.ok(randomToken("dmc").startsWith("dmc_"));
});

test("hashToken: sha256 hex, deterministic", () => {
  const t = "dmo_abc";
  assert.equal(hashToken(t), createHash("sha256").update(t).digest("hex"));
  assert.equal(hashToken(t), hashToken(t));
  assert.notEqual(hashToken(t), hashToken("dmo_abd"));
});

/* ---- PKCE (RFC 7636 appendix B vector) ---- */

test("pkceChallenge: matches the RFC 7636 test vector", () => {
  assert.equal(
    pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("pkceVerify: accepts the right verifier, rejects everything else", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = pkceChallenge(verifier);
  assert.equal(pkceVerify(verifier, challenge), true);
  assert.equal(pkceVerify(verifier + "x", challenge), false);
  assert.equal(pkceVerify("short", challenge), false); // < 43 chars, spec minimum
  assert.equal(pkceVerify(undefined, challenge), false);
  assert.equal(pkceVerify(verifier, undefined), false);
  assert.equal(pkceVerify(verifier, "not-the-challenge"), false);
});

/* ---- redirect URIs ---- */

test("isValidRedirectUri: https anywhere, http only on loopback", () => {
  assert.equal(isValidRedirectUri("https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(isValidRedirectUri("http://localhost:3000/cb"), true);
  assert.equal(isValidRedirectUri("http://127.0.0.1:8976/cb"), true);
  assert.equal(isValidRedirectUri("http://evil.com/cb"), false);
  assert.equal(isValidRedirectUri("javascript:alert(1)"), false);
  assert.equal(isValidRedirectUri("not a url"), false);
  assert.equal(isValidRedirectUri(""), false);
});

test("parseClientRegistration: normalizes, dedupes, rejects junk", () => {
  const ok = parseClientRegistration({
    client_name: "  Claude  ",
    redirect_uris: ["https://claude.ai/cb", "https://claude.ai/cb"],
  });
  assert.ok(!("error" in ok));
  assert.equal(ok.clientName, "Claude");
  assert.deepEqual(ok.redirectUris, ["https://claude.ai/cb"]);

  assert.ok("error" in parseClientRegistration({}));
  assert.ok("error" in parseClientRegistration({ redirect_uris: [] }));
  assert.ok("error" in parseClientRegistration({ redirect_uris: ["http://evil.com/cb"] }));
  const noName = parseClientRegistration({ redirect_uris: ["https://a.example/cb"] });
  assert.ok(!("error" in noName));
  assert.equal(noName.clientName, "MCP client");
});

/* ---- consent signing (CSRF shield for the approve POST) ---- */

const payload: ConsentPayload = {
  userId: "u-1",
  clientId: "cid_x",
  redirectUri: "https://claude.ai/cb",
  codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  scope: "vault",
  state: "s1",
  exp: Date.now() + 60_000,
};

test("consent: round-trips under the right secret", () => {
  const token = signConsent(payload, "secret-a");
  assert.deepEqual(verifyConsent(token, "secret-a"), payload);
});

test("consent: rejects wrong secret, tampering, expiry, junk", () => {
  const token = signConsent(payload, "secret-a");
  assert.equal(verifyConsent(token, "secret-b"), null);
  assert.equal(verifyConsent(token.slice(0, -2) + "xx", "secret-a"), null);
  const expired = signConsent({ ...payload, exp: Date.now() - 1 }, "secret-a");
  assert.equal(verifyConsent(expired, "secret-a"), null);
  assert.equal(verifyConsent("", "secret-a"), null);
  assert.equal(verifyConsent("garbage", "secret-a"), null);
  assert.equal(verifyConsent(token, ""), null);
});

/* ---- bearer resolution: the local branch ---- */

test("resolveMcpBearer: local mode admits without a token, as LOCAL_USER", async () => {
  process.env.DATAMODO_LOCAL = "1";
  try {
    const { resolveMcpBearer } = await import("../lib/datamodo/mcp-auth.ts");
    const { LOCAL_USER } = await import("../lib/local/config.ts");
    const r = await resolveMcpBearer(undefined);
    assert.ok(r);
    assert.equal(r!.extra.userId, LOCAL_USER.id);
  } finally {
    delete process.env.DATAMODO_LOCAL;
  }
});
