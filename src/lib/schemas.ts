export const STICKER_COLLECTION = 'blue.atsumeat.sticker';
export const CONFIG_COLLECTION = 'blue.atsumeat.config';
export const TRANSACTION_COLLECTION = 'blue.atsumeat.transaction';

import { BlobRef } from '@atproto/api';

export interface Sticker {
  $type: typeof STICKER_COLLECTION;
  owner: string; // DID of the user depicted
  model: string; // 'default', 'cat', etc. or CID of blob? For now string ID
  image?: BlobRef; // proper blob reference for PDS pinning
  description?: string; // Custom text or cached post snippet?
  originalOwner?: string;
  obtainedAt: string;
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
  status: 'offered' | 'completed';
  ref?: string; // URI of the referencing transaction (e.g., the Offer)
  createdAt: string;
  [key: string]: unknown;
}
