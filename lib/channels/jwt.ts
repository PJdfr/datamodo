import { createPublicKey, createVerify } from "node:crypto";

// Minimal RS256 JWT verification against a remote JWKS — enough to authenticate
// inbound Bot Framework (Teams) requests. Not a general-purpose JWT library:
// RS256 only, with issuer/audience/expiry checks. Keys are cached per JWKS URL.

interface Jwk { kid?: string; kty?: string; use?: string; n?: string; e?: string; [k: string]: unknown }

interface JwksCache { keys: Jwk[]; fetchedAt: number }
const cache = new Map<string, JwksCache>();
const JWKS_TTL_MS = 12 * 60 * 60 * 1000; // refresh keys twice a day

function b64urlToJson(seg: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
}

async function getKeys(openIdConfigUrl: string): Promise<Jwk[]> {
  const cached = cache.get(openIdConfigUrl);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  const cfgRes = await fetch(openIdConfigUrl);
  if (!cfgRes.ok) throw new Error(`openid config ${cfgRes.status}`);
  const cfg = (await cfgRes.json()) as { jwks_uri?: string };
  if (!cfg.jwks_uri) throw new Error("openid config missing jwks_uri");
  const jwksRes = await fetch(cfg.jwks_uri);
  if (!jwksRes.ok) throw new Error(`jwks ${jwksRes.status}`);
  const jwks = (await jwksRes.json()) as { keys?: Jwk[] };
  const keys = jwks.keys ?? [];
  cache.set(openIdConfigUrl, { keys, fetchedAt: Date.now() });
  return keys;
}

export interface VerifyOptions {
  openIdConfigUrl: string;
  issuer: string;
  audience: string;
}

/**
 * Verify an RS256 JWT's signature and its iss/aud/exp claims. Returns the
 * decoded payload on success, or null if anything fails to check out.
 */
export async function verifyJwt(token: string, opts: VerifyOptions): Promise<Record<string, unknown> | null> {
  try {
    const [headerB64, payloadB64, sigB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !sigB64) return null;
    const header = b64urlToJson(headerB64) as { alg?: string; kid?: string };
    if (header.alg !== "RS256") return null;

    let keys = await getKeys(opts.openIdConfigUrl);
    let jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      // Unknown kid — keys may have rotated; force a refresh once.
      cache.delete(opts.openIdConfigUrl);
      keys = await getKeys(opts.openIdConfigUrl);
      jwk = keys.find((k) => k.kid === header.kid);
    }
    if (!jwk) return null;

    const pubKey = createPublicKey(
      { key: jwk, format: "jwk" } as unknown as Parameters<typeof createPublicKey>[0],
    );
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    if (!verifier.verify(pubKey, Buffer.from(sigB64, "base64url"))) return null;

    const payload = b64urlToJson(payloadB64) as { iss?: string; aud?: string; exp?: number };
    if (payload.iss !== opts.issuer) return null;
    if (payload.aud !== opts.audience) return null;
    if (typeof payload.exp === "number" && Date.now() / 1000 > payload.exp + 60) return null;

    return payload;
  } catch (e) {
    console.error("[channels] jwt verify error", e);
    return null;
  }
}
