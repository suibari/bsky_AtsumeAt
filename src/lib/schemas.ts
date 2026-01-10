export const STICKER_COLLECTION = 'blue.bonbondropat.sticker';
export const CONFIG_COLLECTION = 'blue.bonbondropat.config';
export const TRANSACTION_COLLECTION = 'blue.bonbondropat.transaction';

export interface Sticker {
  $type: typeof STICKER_COLLECTION;
  owner: string; // DID of the user depicted
  model: string; // 'default', 'cat', etc. or CID of blob? For now string ID
  shiny: boolean;
  originalOwner?: string;
  obtainedAt: string;
}

export interface Config {
  $type: typeof CONFIG_COLLECTION;
  hubRef: string; // URI of the hub (suibari.com)
}

export interface Transaction {
  $type: typeof TRANSACTION_COLLECTION;
  partner: string; // DID of exchange partner
  stickerIn: string; // CID or ID of sticker received
  stickerOut: string; // CID or ID of sticker sent
  status: 'offered' | 'completed';
  createdAt: string;
}
