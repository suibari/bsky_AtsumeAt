import { json } from '@sveltejs/kit';
import { Buffer } from 'node:buffer';
import { ISSUER_PRIVATE_KEY_HEX } from '$env/static/private';
import { Secp256k1Keypair } from '@atproto/crypto';

// Polyfill for text encoder in node environment if needed (usually global in SvelteKit/Node 20)
// import { TextEncoder } from 'util';

// 1. Prepare Issuer Key (Single Instance)
let issuerKeyPromise: Promise<Secp256k1Keypair> | null = null;

async function getIssuerKey() {
  if (!issuerKeyPromise) {
    issuerKeyPromise = (async () => {
      if (!ISSUER_PRIVATE_KEY_HEX) {
        throw new Error('Server Config Error: ISSUER_PRIVATE_KEY_HEX not set');
      }

      const privateKeyBytes = Buffer.from(ISSUER_PRIVATE_KEY_HEX, 'hex');
      return Secp256k1Keypair.import(privateKeyBytes);
    })();
  }
  return issuerKeyPromise;
}

export async function POST({ request }) {
  try {
    const { payload, userDid } = await request.json();

    if (!payload || !userDid) {
      return json({ error: 'Missing payload or userDid' }, { status: 400 });
    }

    // Security Note: In a real app, verify the session here!
    // For MVP/BonBonDrop, we assume the client is honest about "who they are",
    // but we sign the 'sub' (Owner) as 'userDid'.

    // 1. Enforce Server Authority
    // The server overwrites critical fields to ensure trust.
    // 'iss' -> Server DID
    // 'iat' -> Now
    // 'sub' -> The target user

    const key = await getIssuerKey();
    const serverDid = key.did();

    const finalPayload = {
      ...payload,
      iss: serverDid,
      sub: userDid,
      iat: Math.floor(Date.now() / 1000), // JWT style timestamp
      jti: crypto.randomUUID(), // Unique Nonce
    };

    // 2. Sign
    // We treat payload as JSON string
    const payloadString = JSON.stringify(finalPayload);
    const data = new TextEncoder().encode(payloadString);

    // Sign using Keypair (wrapper) or raw Secp256k1
    // Secp256k1Keypair.sign() returns Uint8Array signature
    const signatureBytes = await key.sign(data);
    const signatureBase64 = Buffer.from(signatureBytes).toString('base64');

    return json({
      signedPayload: payloadString,
      signature: signatureBase64,
      issuerDid: serverDid
    });

  } catch (e) {
    console.error('Signing failed:', e);
    return json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
