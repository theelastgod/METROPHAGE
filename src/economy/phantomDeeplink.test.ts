import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { buildConnectUrl, buildSignMessageUrl, openPayload, sealPayload } from "./phantomDeeplink";

describe("phantom deeplink envelopes", () => {
  it("seals and opens a payload with a shared x25519 secret (round trip)", () => {
    const us = nacl.box.keyPair();
    const phantom = nacl.box.keyPair();
    const ourShared = nacl.box.before(phantom.publicKey, us.secretKey);
    const theirShared = nacl.box.before(us.publicKey, phantom.secretKey);

    const { nonce, data } = sealPayload({ message: "hello", session: "s1" }, ourShared);
    // Phantom's side decrypts what we sealed…
    const seen = openPayload<{ message: string; session: string }>(data, nonce, theirShared);
    expect(seen).toEqual({ message: "hello", session: "s1" });
    // …and we decrypt what Phantom seals back (the response path).
    const reply = sealPayload({ signature: bs58.encode(nacl.randomBytes(64)) }, theirShared);
    const opened = openPayload<{ signature: string }>(reply.data, reply.nonce, ourShared);
    expect(opened?.signature).toBeTruthy();
  });

  it("rejects a tampered box instead of returning garbage", () => {
    const us = nacl.box.keyPair();
    const phantom = nacl.box.keyPair();
    const shared = nacl.box.before(phantom.publicKey, us.secretKey);
    const { nonce, data } = sealPayload({ v: 1 }, shared);
    const bytes = bs58.decode(data);
    bytes[0] ^= 0xff;
    expect(openPayload(bs58.encode(bytes), nonce, shared)).toBeNull();
  });

  it("builds connect/sign URLs with every field Phantom requires", () => {
    const connect = new URL(
      buildConnectUrl("https://metrophagev1.pages.dev", "DAppPub58", "https://metrophagev1.pages.dev/?phantom_action=connect", "mainnet-beta"),
    );
    expect(connect.origin + connect.pathname).toBe("https://phantom.app/ul/v1/connect");
    for (const k of ["app_url", "dapp_encryption_public_key", "redirect_link", "cluster"]) {
      expect(connect.searchParams.get(k), k).toBeTruthy();
    }
    const sign = new URL(buildSignMessageUrl("DAppPub58", "https://x/?phantom_action=sign", "Nonce58", "Payload58"));
    expect(sign.origin + sign.pathname).toBe("https://phantom.app/ul/v1/signMessage");
    for (const k of ["dapp_encryption_public_key", "redirect_link", "nonce", "payload"]) {
      expect(sign.searchParams.get(k), k).toBeTruthy();
    }
  });
});
