import type { Agent } from '@atproto/api';
import { STICKER_COLLECTION, CONFIG_COLLECTION, type Sticker, type Config, TRANSACTION_COLLECTION } from './schemas';

const HUB_HANDLE = 'suibari.com';
let cachedHubDid: string | null = null;

export async function getHubDid(agent: Agent) {
  if (cachedHubDid) return cachedHubDid;
  const res = await agent.resolveHandle({ handle: HUB_HANDLE });
  cachedHubDid = res.data.did;
  return cachedHubDid;
}

export async function initStickers(agent: Agent, userDid: string): Promise<boolean> {
  // 1. Check if Config/HubRef exists (Init indicator)
  // This is much more efficient than scanning stickers, as there is only 1 config record.
  const existing = await agent.com.atproto.repo.listRecords({
    repo: userDid,
    collection: CONFIG_COLLECTION,
    limit: 1
  });
  if (existing.data.records.length > 0) return false; // Already initialized

  // If config missing, we wipe existing stickers to start fresh
  // This handles the "Reset" case or "Broken State" case.
  let cursor: string | undefined;
  do {
    const stale = await agent.com.atproto.repo.listRecords({
      repo: userDid,
      collection: STICKER_COLLECTION,
      limit: 100,
      cursor
    });
    cursor = stale.data.cursor;

    // Delete batch
    for (const r of stale.data.records) {
      await agent.com.atproto.repo.deleteRecord({
        repo: userDid,
        collection: STICKER_COLLECTION,
        rkey: r.uri.split('/').pop()!
      });
    }
  } while (cursor);
  // 2. Create Self Sticker (Only self for AtsumeAt)
  const selfSticker: Sticker = {
    $type: STICKER_COLLECTION,
    owner: userDid,
    model: 'default',
    shiny: false,
    obtainedAt: new Date().toISOString()
  };

  await agent.com.atproto.repo.createRecord({
    repo: userDid,
    collection: STICKER_COLLECTION,
    record: selfSticker
  });

  // 5. Create Config/HubRef
  await ensureHubRef(agent, userDid);
  return true;
}

export async function ensureHubRef(agent: Agent, userDid: string) {
  const hubDid = await getHubDid(agent);

  // Check if exists
  const existing = await agent.com.atproto.repo.listRecords({
    repo: userDid,
    collection: CONFIG_COLLECTION,
    limit: 1
  });

  if (existing.data.records.length > 0) return;

  await agent.com.atproto.repo.createRecord({
    repo: userDid,
    collection: CONFIG_COLLECTION,
    record: {
      $type: CONFIG_COLLECTION,
      hubRef: `at://${hubDid}/app.bsky.actor.profile/self`
    }
  });
}

// Interface for Constellation response
interface LinkRecord {
  cid: string;
  uri: string;
  value: any;
  author: {
    did: string;
  };
}

export async function getHubUsers(agent: Agent) {
  const hubDid = await getHubDid(agent);
  const subject = encodeURIComponent(`at://${hubDid}/app.bsky.actor.profile/self`);
  const source = encodeURIComponent(`${CONFIG_COLLECTION}:.hubRef`);

  const url = `https://constellation.microcosm.blue/xrpc/blue.microcosm.links.getBacklinks?subject=${subject}&source=${source}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Constellation API error');
    const data = await res.json();
    return (data.frames || data.links || []) as LinkRecord[];
  } catch (e) {
    console.error('Failed to get hub users', e);
    return [];
  }
}

export type StickerWithProfile = Sticker & {
  profile?: {
    avatar?: string;
    displayName?: string;
    handle: string;
  };
  uri: string; // Record URI for updates
};

export async function getUserStickers(agent: Agent, userDid: string): Promise<StickerWithProfile[]> {
  // 1. Fetch records
  let stickers: StickerWithProfile[] = [];
  let cursor: string | undefined;

  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: userDid,
      collection: STICKER_COLLECTION,
      limit: 100,
      cursor
    });
    cursor = res.data.cursor;

    const batch = res.data.records.map(r => ({
      ...(r.value as unknown as Sticker),
      uri: r.uri,
      profile: undefined
    }));
    stickers = stickers.concat(batch);
  } while (cursor);

  // 2. Fetch Profiles
  if (stickers.length === 0) return [];

  // Unique DIDs
  const dids = Array.from(new Set(stickers.map(s => s.owner)));
  const profilesMap = new Map<string, any>();

  // Batch fetch (25 at a time)
  const chunkSize = 25;
  for (let i = 0; i < dids.length; i += chunkSize) {
    const chunk = dids.slice(i, i + chunkSize);
    try {
      const res = await agent.app.bsky.actor.getProfiles({ actors: chunk });
      for (const p of res.data.profiles) {
        profilesMap.set(p.did, p);
      }
    } catch (e) {
      console.error('Failed to fetch profiles', e);
    }
  }

  // 3. Attach profiles & Handle Custom Images
  stickers.forEach(s => {
    // Attach profile info
    if (profilesMap.has(s.owner)) {
      const p = profilesMap.get(s.owner);
      s.profile = {
        handle: p.handle,
        displayName: p.displayName,
        avatar: p.avatar
      };
    }

    // Override Avatar if Custom Sticker
    if (s.model && s.model.startsWith('cid:')) {
      const cid = s.model.split(':')[1];
      // Use fullsize for better quality on sticker
      const customUrl = `https://cdn.bsky.app/img/feed_fullsize/plain/${s.owner}/${cid}@jpeg`;

      if (!s.profile) {
        s.profile = { handle: 'unknown', avatar: customUrl };
      } else {
        s.profile.avatar = customUrl;
      }
    }
  });

  return stickers;
}

export async function createExchangePost(agent: Agent, targetHandle: string, targetDid: string) {
  const origin = window.location.origin;
  const myDid = agent.assertDid;

  // Create text with mention
  const text = `Let's exchange stickers @${targetHandle}! 🍬 #BonBonDropAt`;

  // Facets for mention and tag
  const facets = [
    {
      index: { byteStart: text.indexOf('@'), byteEnd: text.indexOf('@') + 1 + targetHandle.length },
      features: [{ $type: 'app.bsky.richtext.facet#mention', did: targetDid }]
    },
    {
      index: { byteStart: text.indexOf('#'), byteEnd: text.indexOf('#') + 13 },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'BonBonDropAt' }]
    }
  ];

  await agent.post({
    text,
    facets,
    embed: {
      $type: 'app.bsky.embed.external',
      external: {
        uri: `${origin}/exchange?user=${myDid}`,
        title: 'Exchange Stickers',
        description: 'Click to accept the sticker exchange!',
      }
    }
  });
}

export async function acceptExchange(agent: Agent, partnerDid: string) {
  const myDid = agent.assertDid;
  if (!myDid) return;

  // 1. Give Sticker (Create record of Partner in My Repo)
  const existingSticker = await agent.com.atproto.repo.listRecords({
    repo: myDid,
    collection: STICKER_COLLECTION,
    limit: 100
  });

  const alreadyHas = existingSticker.data.records.some(r => (r.value as unknown as Sticker).owner === partnerDid);

  if (!alreadyHas) {
    await agent.com.atproto.repo.createRecord({
      repo: myDid,
      collection: STICKER_COLLECTION,
      record: {
        $type: STICKER_COLLECTION,
        owner: partnerDid,
        model: 'default',
        shiny: Math.random() < 0.1,
        obtainedAt: new Date().toISOString()
      }
    });
  }

  // 2. Create Transaction to signal completion
  await agent.com.atproto.repo.createRecord({
    repo: myDid,
    collection: TRANSACTION_COLLECTION,
    record: {
      $type: TRANSACTION_COLLECTION,
      partner: partnerDid,
      stickerIn: 'pending',
      stickerOut: 'pending',
      status: 'completed',
      createdAt: new Date().toISOString()
    }
  });
}

export async function checkInverseExchange(agent: Agent, partnerDid: string) {
  // Check if Partner has a transaction with Me
  const myDid = agent.assertDid;
  if (!myDid) return false;

  try {
    const res = await agent.com.atproto.repo.listRecords({
      repo: partnerDid,
      collection: TRANSACTION_COLLECTION,
      limit: 20
    });

    // Find transaction where partner is Me
    const tx = res.data.records.find(r => (r.value as any).partner === myDid && (r.value as any).status === 'completed');

    if (tx) {
      // Found! Ensure I have Partner's sticker
      const existingSticker = await agent.com.atproto.repo.listRecords({
        repo: myDid,
        collection: STICKER_COLLECTION,
        limit: 100
      });
      const alreadyHas = existingSticker.data.records.some(r => (r.value as unknown as Sticker).owner === partnerDid);

      if (!alreadyHas) {
        await agent.com.atproto.repo.createRecord({
          repo: myDid,
          collection: STICKER_COLLECTION,
          record: {
            $type: STICKER_COLLECTION,
            owner: partnerDid,
            model: 'default',
            shiny: Math.random() < 0.1,
            obtainedAt: new Date().toISOString()
          }
        });
        return true; // Finalized
      }
    }
  } catch (e) {
    console.warn('Check inverse failed', e);
  }
  return false;
}
