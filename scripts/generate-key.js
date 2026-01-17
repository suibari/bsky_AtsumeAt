import { Secp256k1Keypair } from '@atproto/crypto';
import { randomBytes } from 'crypto';

// Re-implement hex utils
function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

async function generate() {
  // Generate 32 bytes of random entropy
  const privateKeyBytes = randomBytes(32);
  const privateKeyHex = bytesToHex(privateKeyBytes);

  try {
    // Verify it works with AtProto
    const key = await Secp256k1Keypair.import(privateKeyBytes);
    const did = key.did();

    console.log("✅ Keypair Generated Successfully!");
    console.log("---------------------------------------------------");
    console.log(`DID: ${did}`);
    console.log("---------------------------------------------------");
    console.log("Private Key (Hex) - Keep this SECRET! Set this in your .env:");
    console.log(`ISSUER_PRIVATE_KEY_HEX=${privateKeyHex}`);
    console.log("---------------------------------------------------");

  } catch (e) {
    console.error("Failed to verify key generation:", e);
  }
}

generate();
