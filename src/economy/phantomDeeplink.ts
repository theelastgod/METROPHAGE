// METROPHAGE — Phantom mobile deeplinks (connect + signMessage).
//
// The old mobile path shipped the ENTIRE game into Phantom's in-app browser
// (`phantom.app/ul/browse/<url>`), which is portrait-locked — the landscape gate
// makes the game unplayable there. Phantom's deeplink protocol instead keeps the
// game in the player's own browser and round-trips ONLY the approval through the
// Phantom app: we redirect to `phantom.app/ul/v1/<method>` with an x25519 public
// key, Phantom redirects straight back to `redirect_link` with an encrypted
// response (x25519-xsalsa20-poly1305 box), and the page resumes where it left off.
//
// State that must survive the app round-trip (the page fully reloads) lives in
// sessionStorage. Nothing here is authoritative — the server still verifies the
// ed25519 signature exactly like any other login proof.

import nacl from "tweetnacl";
import bs58 from "bs58";

const PHANTOM_BASE = "https://phantom.app/ul/v1";
const K_SECRET = "ph_dl_secret"; // our x25519 secret key (b58)
const K_PUBLIC = "ph_dl_public"; // our x25519 public key (b58)
const K_PHANTOM_PUB = "ph_dl_phantom_pub"; // phantom's encryption pubkey (b58)
const K_SESSION = "ph_dl_session"; // phantom session token
const K_WALLET = "ph_dl_wallet"; // connected solana address (b58)
const K_PENDING_META = "ph_dl_pending"; // JSON {kind, ts, wallet} for an in-flight sign
const K_PROOF = "ph_dl_proof"; // JSON {kind, wallet, sig, ts} after a sign round-trip

function ss(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Cluster for the connect handshake — mirrors the client's baked settlement target. */
function cluster(): string {
  return ((import.meta.env as Record<string, string | undefined>).VITE_METRO_CLUSTER || "mainnet-beta").trim();
}

// ── envelope helpers (pure; unit-tested) ────────────────────────────────────

export function sealPayload(
  payload: unknown,
  sharedSecret: Uint8Array,
): { nonce: string; data: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const boxed = nacl.box.after(bytes, nonce, sharedSecret);
  return { nonce: bs58.encode(nonce), data: bs58.encode(boxed) };
}

export function openPayload<T>(data: string, nonce: string, sharedSecret: Uint8Array): T | null {
  try {
    const opened = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), sharedSecret);
    if (!opened) return null;
    return JSON.parse(new TextDecoder().decode(opened)) as T;
  } catch {
    return null;
  }
}

export function buildConnectUrl(appUrl: string, dappPubB58: string, redirect: string, clusterName: string): string {
  const q = new URLSearchParams({
    app_url: appUrl,
    dapp_encryption_public_key: dappPubB58,
    redirect_link: redirect,
    cluster: clusterName,
  });
  return `${PHANTOM_BASE}/connect?${q.toString()}`;
}

export function buildSignMessageUrl(dappPubB58: string, redirect: string, nonceB58: string, payloadB58: string): string {
  const q = new URLSearchParams({
    dapp_encryption_public_key: dappPubB58,
    redirect_link: redirect,
    nonce: nonceB58,
    payload: payloadB58,
  });
  return `${PHANTOM_BASE}/signMessage?${q.toString()}`;
}

// ── session plumbing ────────────────────────────────────────────────────────

function sharedSecret(): Uint8Array | null {
  const s = ss();
  const sec = s?.getItem(K_SECRET);
  const ph = s?.getItem(K_PHANTOM_PUB);
  if (!sec || !ph) return null;
  try {
    return nacl.box.before(bs58.decode(ph), bs58.decode(sec));
  } catch {
    return null;
  }
}

/** A completed connect round-trip left us a Phantom session on this tab. */
export function phantomDeeplinkSession(): { wallet: string; session: string } | null {
  const s = ss();
  const wallet = s?.getItem(K_WALLET);
  const session = s?.getItem(K_SESSION);
  return wallet && session ? { wallet, session } : null;
}

/** Deeplinks only make sense on a public https origin (Phantom must redirect back). */
export function phantomDeeplinkUsable(): boolean {
  try {
    return typeof location !== "undefined" && location.protocol === "https:";
  } catch {
    return false;
  }
}

function redirectUrl(action: string): string {
  return `${location.origin}${location.pathname}?phantom_action=${action}`;
}

/** Kick off the connect approval in the Phantom APP (page navigates away). */
export function beginPhantomConnect(): void {
  const s = ss();
  if (!s) return;
  const kp = nacl.box.keyPair();
  s.setItem(K_SECRET, bs58.encode(kp.secretKey));
  s.setItem(K_PUBLIC, bs58.encode(kp.publicKey));
  location.href = buildConnectUrl(location.origin, bs58.encode(kp.publicKey), redirectUrl("connect"), cluster());
}

/** Kick off a signMessage approval in the Phantom APP (page navigates away).
 *  `meta` is what the resume needs to hand the caller a complete proof. */
export function beginPhantomSign(message: string, meta: { kind: "login" | "retire"; ts: number; wallet: string }): boolean {
  const s = ss();
  const shared = sharedSecret();
  const session = s?.getItem(K_SESSION);
  const pub = s?.getItem(K_PUBLIC);
  if (!s || !shared || !session || !pub) return false;
  s.setItem(K_PENDING_META, JSON.stringify(meta));
  const { nonce, data } = sealPayload(
    { message: bs58.encode(new TextEncoder().encode(message)), session, display: "utf8" },
    shared,
  );
  location.href = buildSignMessageUrl(pub, redirectUrl("sign"), nonce, data);
  return true;
}

/** Take (and clear) a finished sign proof — {wallet, sig, ts} ready for the server. */
export function takePhantomProof(kind: "login" | "retire", wallet?: string): { wallet: string; sig: string; ts: number } | null {
  const s = ss();
  const raw = s?.getItem(K_PROOF);
  if (!s || !raw) return null;
  try {
    const p = JSON.parse(raw) as { kind: string; wallet: string; sig: string; ts: number };
    if (p.kind !== kind) return null;
    if (wallet && p.wallet !== wallet) return null;
    // One shot — and only within the server's freshness window.
    s.removeItem(K_PROOF);
    if (Math.abs(Date.now() - p.ts) > 85_000) return null;
    return { wallet: p.wallet, sig: p.sig, ts: p.ts };
  } catch {
    s.removeItem(K_PROOF);
    return null;
  }
}

export type PhantomRedirectResult =
  | { kind: "connect"; wallet: string }
  | { kind: "sign"; wallet: string }
  | { kind: "error"; detail: string }
  | null;

/** Handle a `?phantom_action=` return. Call ONCE at startup, before wallet UI reads
 *  connection state. Cleans the query string either way. */
export function handlePhantomRedirect(): PhantomRedirectResult {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(location.search);
  } catch {
    return null;
  }
  const action = params.get("phantom_action");
  if (!action) return null;
  const s = ss();
  const scrub = () => {
    try {
      history.replaceState(null, "", location.pathname);
    } catch {
      /* ignore */
    }
  };
  if (params.get("errorCode")) {
    scrub();
    s?.removeItem(K_PENDING_META);
    return { kind: "error", detail: `${params.get("errorCode")}: ${params.get("errorMessage") ?? "phantom rejected"}` };
  }
  if (action === "connect") {
    const phantomPub = params.get("phantom_encryption_public_key");
    const nonce = params.get("nonce");
    const data = params.get("data");
    scrub();
    if (!s || !phantomPub || !nonce || !data) return { kind: "error", detail: "phantom connect response incomplete" };
    s.setItem(K_PHANTOM_PUB, phantomPub);
    const shared = sharedSecret();
    if (!shared) return { kind: "error", detail: "phantom connect keys lost (new tab?) — tap connect again" };
    const payload = openPayload<{ public_key?: string; session?: string }>(data, nonce, shared);
    if (!payload?.public_key || !payload.session) return { kind: "error", detail: "phantom connect payload unreadable" };
    s.setItem(K_WALLET, payload.public_key);
    s.setItem(K_SESSION, payload.session);
    return { kind: "connect", wallet: payload.public_key };
  }
  if (action === "sign") {
    const nonce = params.get("nonce");
    const data = params.get("data");
    const metaRaw = s?.getItem(K_PENDING_META);
    scrub();
    s?.removeItem(K_PENDING_META);
    const shared = sharedSecret();
    if (!s || !nonce || !data || !metaRaw || !shared) return { kind: "error", detail: "phantom sign response incomplete" };
    const payload = openPayload<{ signature?: string }>(data, nonce, shared);
    if (!payload?.signature) return { kind: "error", detail: "phantom sign payload unreadable" };
    try {
      const meta = JSON.parse(metaRaw) as { kind: "login" | "retire"; ts: number; wallet: string };
      s.setItem(K_PROOF, JSON.stringify({ ...meta, sig: payload.signature }));
      return { kind: "sign", wallet: meta.wallet };
    } catch {
      return { kind: "error", detail: "phantom sign context lost" };
    }
  }
  scrub();
  return null;
}
