import { verifySignature } from '@atproto/crypto';
import type { Sticker } from './schemas';
import { Agent } from '@atproto/api';

// Polyfill/Helper for base64
export function base64ToBytes(base64: string): Uint8Array {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
}

export interface SealVerificationResult {
  isValid: boolean;
  isTampered: boolean;
  isStolen: boolean; // Owner mismatch
  reason?: string;
  trustedData?: any;
}

// Global cache for Issuer Public Key
let cachedIssuerKey: string | null = null; // Store as multibase string (did:key)

// Fetch DID Doc and extracting Signing Key
export async function getIssuerPublicKey(did: string): Promise<string | null> {
  if (cachedIssuerKey) return cachedIssuerKey;

  try {
    // 1. Resolve DID Doc
    let doc: any;
    if (did.startsWith('did:key:')) {
      return did; // The DID itself IS the public key multibase in did:key format (mostly)
    } else if (did.startsWith('did:plc:')) {
      const res = await fetch(`https://plc.directory/${did}`);
      doc = await res.json();
    } else if (did.startsWith('did:web:')) {
      const domain = did.replace('did:web:', '');
      const res = await fetch(`https://${domain}/.well-known/did.json`);
      doc = await res.json();
    }

    if (!doc) return null;

    // 2. Find Verification Method (assume #atproto or first verificationMethod)
    const vm = doc.verificationMethod?.find((v: any) =>
      v.id.endsWith('#atproto') || v.publicKeyMultibase
    );

    if (vm && vm.publicKeyMultibase) {
      cachedIssuerKey = vm.publicKeyMultibase;
      return vm.publicKeyMultibase;
    }
  } catch (e) { console.error(e); }
  return null;
}

export async function verifySeal(sticker: Sticker, ownerDid: string, agent: Agent): Promise<SealVerificationResult> {
  if (!sticker.signedPayload || !sticker.signature) {
    return { isValid: false, isTampered: false, isStolen: false, reason: "No signature" };
  }

  try {
    const payload = JSON.parse(sticker.signedPayload);

    // 1. Check Owner (Anti-Theft)
    if (payload.sub !== ownerDid) {
      return { isValid: false, isTampered: true, isStolen: true, reason: `Owner mismatch: Data is for ${payload.sub}, but found in ${ownerDid}'s repo.` };
    }

    // 2. Check Issuer (Authority)
    // Currently only supporting Test Issuer (did:key)
    const isTrustedIssuer =
      payload.iss === 'did:key:zQ3shfXiLQXAAsFs11dKdVErBus4vUZ6vGeJ9Eo5BGV7Z6379'; // Test Public Key

    if (!isTrustedIssuer) {
      return { isValid: false, isTampered: true, isStolen: false, reason: `Unknown Issuer: ${payload.iss}` };
    }

    // 3. Verify Signature
    const key = await getIssuerPublicKey(payload.iss);
    if (!key) {
      return { isValid: false, isTampered: true, isStolen: false, reason: "Could not resolve Issuer Key" };
    }

    const data = new TextEncoder().encode(sticker.signedPayload);
    const sig = base64ToBytes(sticker.signature);

    try {
      // @atproto/crypto verifySignature(didKey, data, sig)
      const valid = await verifySignature(key, data, sig);
      if (valid) {
        return { isValid: true, isTampered: false, isStolen: false, trustedData: payload };
      } else {
        return { isValid: false, isTampered: true, isStolen: false, reason: "Invalid Signature" };
      }
    } catch (e) {
      console.error(e);
      // Some crypto errors might be due to invalid key format, assume invalid signature
      return { isValid: false, isTampered: true, isStolen: false, reason: `Crypto Error: ${(e as Error).message}` };
    }

  } catch (e) {
    return { isValid: false, isTampered: true, isStolen: false, reason: "Malformed Payload" };
  }
}

// Helper to request signature from server
export async function requestSignature(userDid: string, payload: any): Promise<{ signedPayload: string, signature: string } | null> {
  try {
    const res = await fetch('/api/sign-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userDid, payload })
    });
    if (!res.ok) throw new Error('Sign API error');
    return await res.json();
  } catch (e) {
    console.error('Failed to get signature', e);
    return null;
  }
}
