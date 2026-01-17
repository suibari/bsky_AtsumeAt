import { Agent } from '@atproto/api';
import { getAllStickerRecords } from './stickers';
import { STICKER_LIKE_COLLECTION, TRANSACTION_COLLECTION, type Transaction } from './schemas';

export interface Achievement {
  id: string;
  type: 'created' | 'exchanges' | 'likes';
  tier: number; // 1, 2, 3, 4
  count: number; // The threshold met
  titleKey: string; // Key for translation
}

export interface UserStats {
  stickersCreated: number;
  exchangesCount: number;
  likesGivenCount: number;
}

export const ACHIEVEMENT_DEFINITIONS = {
  created: [
    { count: 1, tier: 1, id: 'created_1', titleKey: 'achievements.created.1' },
    { count: 10, tier: 2, id: 'created_10', titleKey: 'achievements.created.10' },
    { count: 50, tier: 3, id: 'created_50', titleKey: 'achievements.created.50' },
    { count: 100, tier: 4, id: 'created_100', titleKey: 'achievements.created.100' },
  ],
  exchanges: [
    { count: 1, tier: 1, id: 'exchange_1', titleKey: 'achievements.exchange.1' },
    { count: 10, tier: 2, id: 'exchange_10', titleKey: 'achievements.exchange.10' },
    { count: 50, tier: 3, id: 'exchange_50', titleKey: 'achievements.exchange.50' },
    { count: 100, tier: 4, id: 'exchange_100', titleKey: 'achievements.exchange.100' },
  ],
  likes: [
    { count: 10, tier: 1, id: 'likes_10', titleKey: 'achievements.likes.10' },
    { count: 100, tier: 2, id: 'likes_100', titleKey: 'achievements.likes.100' },
    { count: 500, tier: 3, id: 'likes_500', titleKey: 'achievements.likes.500' },
    { count: 1000, tier: 4, id: 'likes_1000', titleKey: 'achievements.likes.1000' },
  ]
};

import { getPdsEndpoint } from './atproto';

export async function getUserStats(agent: Agent, did: string): Promise<UserStats> {
  const stats: UserStats = {
    stickersCreated: 0,
    exchangesCount: 0,
    likesGivenCount: 0
  };

  // Resolve PDS for the target user to ensure we can read their records
  // even if they are not the current user / on a different instance.
  let pdsAgent = agent;
  try {
    const pdsUrl = await getPdsEndpoint(did);
    if (pdsUrl) {
      pdsAgent = new Agent(pdsUrl);
    }
  } catch (e) {
    console.warn("Failed to resolve PDS for stats", e);
  }

  try {
    // 1. Stickers Created
    // Use the PDS agent for fetching records
    const stickers = await getAllStickerRecords(pdsAgent, did);
    stats.stickersCreated = stickers.filter(s =>
      s.originalOwner === did || s.subjectDid === did
    ).length;

    // 2. Exchange Count
    let cursor: string | undefined;
    let exchangeCount = 0;
    const MAX_PAGE_EXCHANGE = 10;
    let pageEx = 0;

    do {
      const res = await pdsAgent.com.atproto.repo.listRecords({
        repo: did,
        collection: TRANSACTION_COLLECTION,
        limit: 100,
        cursor
      });
      cursor = res.data.cursor;

      for (const r of res.data.records) {
        const t = r.value as unknown as Transaction;
        if (t.status === 'completed') {
          exchangeCount++;
        }
      }
      pageEx++;
    } while (cursor && pageEx < MAX_PAGE_EXCHANGE);
    stats.exchangesCount = exchangeCount;

    // 3. Likes Given Count
    let cursorLike: string | undefined;
    let likeCount = 0;
    const MAX_PAGE_LIKE = 20;
    let pageLike = 0;

    do {
      const res = await pdsAgent.com.atproto.repo.listRecords({
        repo: did,
        collection: STICKER_LIKE_COLLECTION,
        limit: 100,
        cursor: cursorLike
      });
      cursorLike = res.data.cursor;

      likeCount += res.data.records.length;
      pageLike++;
    } while (cursorLike && pageLike < MAX_PAGE_LIKE);
    stats.likesGivenCount = likeCount;

  } catch (e) {
    console.warn("Failed to fetch user stats", e);
  }

  return stats;
}

export function calculateAchievements(stats: UserStats): Achievement[] {
  const earned: Achievement[] = [];

  // Created
  // Find the highest tier met
  const createdTier = ACHIEVEMENT_DEFINITIONS.created.slice().reverse().find(d => stats.stickersCreated >= d.count);
  if (createdTier) earned.push({ ...createdTier, type: 'created' });

  // Exchanges
  const exchangeTier = ACHIEVEMENT_DEFINITIONS.exchanges.slice().reverse().find(d => stats.exchangesCount >= d.count);
  if (exchangeTier) earned.push({ ...exchangeTier, type: 'exchanges' });

  // Likes
  const likesTier = ACHIEVEMENT_DEFINITIONS.likes.slice().reverse().find(d => stats.likesGivenCount >= d.count);
  if (likesTier) earned.push({ ...likesTier, type: 'likes' });

  return earned;
}
