export const STICKER_COLLECTION = 'com.suibari.atsumeat.sticker';
export const CONFIG_COLLECTION = 'com.suibari.atsumeat.config';
export const TRANSACTION_COLLECTION = 'com.suibari.atsumeat.transaction';
export const STICKER_LIKE_COLLECTION = 'com.suibari.atsumeat.stickerLike';

import { BlobRef } from '@atproto/api';

export interface Sticker {
  $type: typeof STICKER_COLLECTION;
  name?: string; // Name of the sticker
  message?: string; // Optional sticker message
  image: string | BlobRef; // Avatar URL or BlobRef
  imageType?: 'avatar' | 'custom';
  subjectDid?: string; // DID of the user depicted (if applicable)
  originalOwner: string; // DID of the creator/minter
  model: string; // 'default', 'cat', etc.
  obtainedFrom?: string; // The user who gave this sticker (DID)
  obtainedAt: string;

  // Verification
  signature?: string;       // Server signature (base64)
  signedPayload?: string;   // JSON string that was signed
  [key: string]: unknown;
}

export interface Config {
  $type: typeof CONFIG_COLLECTION;
  hubRef: string; // URI of the hub (suibari.com)
  [key: string]: unknown;
}

export interface Transaction {
  $type: typeof TRANSACTION_COLLECTION;
  partner: string; // DID of exchange partner
  stickerIn: string[]; // CIDs or IDs
  stickerOut: string[]; // CIDs or IDs
  message?: string; // Optional exchange message
  status: 'offered' | 'completed' | 'rejected';
  refPartner?: string; // URI of partner's profile (for Constellation)
  refTransaction?: string; // URI of the referencing transaction (e.g., the Offer)
  createdAt: string;
  [key: string]: unknown;
}

export interface StickerLike {
  $type: typeof STICKER_LIKE_COLLECTION;
  subject: {
    uri: string;
    cid: string;
  };
  createdAt: string;
  [key: string]: unknown;
}
