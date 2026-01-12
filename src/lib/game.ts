import { Agent } from '@atproto/api';
import { STICKER_COLLECTION, CONFIG_COLLECTION, type Sticker, type Config, TRANSACTION_COLLECTION, type Transaction } from './schemas';
import { getPdsEndpoint } from './atproto';

const HUB_HANDLE = 'suibari.com';
let cachedHubDid: string | null = null;

export async function getHubDid(agent: Agent) {
  if (cachedHubDid) return cachedHubDid;
  const res = await agent.resolveHandle({ handle: HUB_HANDLE });
  cachedHubDid = res.data.did;
  return cachedHubDid;
}

export async function initStickers(agent: Agent, userDid: string, onStatus?: (msg: string) => void): Promise<boolean> {
  if (onStatus) onStatus("Initializing...");

  // 1. Check if Config/HubRef exists (Init indicator)
  // This is much more efficient than scanning stickers, as there is only 1 config record.
  const existing = await agent.com.atproto.repo.listRecords({
    repo: userDid,
    collection: CONFIG_COLLECTION,
    limit: 1
  });
  if (existing.data.records.length > 0) return false; // Already initialized

  if (onStatus) onStatus("Generating your sticker...");

  // If config missing, we wipe existing stickers to start fresh
  // This handles the "Reset" case or "Broken State" case.
  let cursor: string | undefined;
  try {
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
  } catch (e) { }

  if (onStatus) onStatus("Creating sticker pack...");

  // 2. Fetch Profile for Avatar
  let avatar = '';
  try {
    const p = await agent.getProfile({ actor: userDid });
    avatar = p.data.avatar || '';
  } catch (e) {
    console.warn("Failed to fetch profile for sticker init", e);
  }

  // 3. Create Self Sticker (Only self for AtsumeAt)
  const selfSticker: Sticker = {
    $type: STICKER_COLLECTION,
    image: avatar, // Snapshot of avatar
    imageType: 'avatar',
    subjectDid: userDid,
    originalOwner: userDid,
    model: 'default',
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
  giverProfile?: {
    displayName?: string;
    handle: string;
  };
  originalOwnerProfile?: {
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

    const batch = res.data.records.map(r => {
      const raw = r.value as any;
      // In-memory migration for old 'owner' field
      if (!raw.subjectDid && raw.owner) raw.subjectDid = raw.owner;
      if (!raw.originalOwner && raw.owner) raw.originalOwner = raw.owner;
      // If image missing but we have old 'model' logic, we might need to fix it, but let's assume image exists or we handle it later

      return {
        ...(raw as Sticker),
        uri: r.uri,
        profile: undefined
      };
    });
    stickers = stickers.concat(batch);
  } while (cursor);

  // 2. Fetch Profiles
  if (stickers.length === 0) return [];

  // Unique DIDs (Subject, Giver, OriginalOwner)
  const dids = new Set<string>();
  stickers.forEach(s => {
    if (s.subjectDid) dids.add(s.subjectDid);
    if (s.obtainedFrom) dids.add(s.obtainedFrom);
    if (s.originalOwner) dids.add(s.originalOwner);
  });

  const didsArray = Array.from(dids);
  const profilesMap = new Map<string, any>();

  // Batch fetch (25 at a time)
  const chunkSize = 25;
  for (let i = 0; i < didsArray.length; i += chunkSize) {
    const chunk = didsArray.slice(i, i + chunkSize);
    try {
      const res = await agent.app.bsky.actor.getProfiles({ actors: chunk });
      for (const p of res.data.profiles) {
        profilesMap.set(p.did, p);
      }
    } catch (e) {
      console.error('Failed to fetch profiles', e);
    }
  }

  // 3. Attach profiles & Handle Images
  stickers.forEach(s => {
    // Subject Profile
    if (s.subjectDid && profilesMap.has(s.subjectDid)) {
      const p = profilesMap.get(s.subjectDid);
      s.profile = {
        handle: p.handle,
        displayName: p.displayName,
        avatar: p.avatar
      };
    }
    // Giver Profile
    if (s.obtainedFrom && profilesMap.has(s.obtainedFrom)) {
      const p = profilesMap.get(s.obtainedFrom);
      s.giverProfile = { handle: p.handle, displayName: p.displayName };
    }
    // Original Owner Profile (Issuer)
    if (s.originalOwner && profilesMap.has(s.originalOwner)) {
      const p = profilesMap.get(s.originalOwner);
      s.originalOwnerProfile = { handle: p.handle, displayName: p.displayName };
    }

    // Image Handling
    if (!s.image) {
      // Fallback for legacy: use avatar if available
      if (s.profile?.avatar) s.image = s.profile.avatar;
    } else if (typeof s.image === 'object' && (s.image as any).ref) {
      // BlobRef -> CDN URL
      // Format: https://cdn.bsky.app/img/feed_fullsize/plain/{did}/{link}@jpeg
      // We need the DID of the repository holding the blob.
      // Assuming originalOwner holds the blob (creator).
      const blobDid = s.originalOwner || userDid;
      const link = (s.image as any).ref.toString();
      s.image = `https://cdn.bsky.app/img/feed_fullsize/plain/${blobDid}/${link}@jpeg`;
    }
  });

  // 4. Update descriptions for 'avatar' type (Latest Post)
  // Only if description is empty? Or always update?
  // Let's keep logic to populate if empty.
  const avatarStickers = stickers.filter(s => s.imageType === 'avatar' && !s.description && s.subjectDid);
  if (avatarStickers.length > 0) {
    const subjects = Array.from(new Set(avatarStickers.map(s => s.subjectDid!)));
    const BATCH_SIZE = 5;
    for (let i = 0; i < subjects.length; i += BATCH_SIZE) {
      const batch = subjects.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (did) => {
        try {
          const feed = await agent.app.bsky.feed.getAuthorFeed({ actor: did, limit: 1, filter: 'posts_no_replies' });
          if (feed.data.feed.length > 0) {
            const post = feed.data.feed[0].post;
            const text = (post.record as any).text;
            // Update in memory
            stickers.filter(s => s.subjectDid === did).forEach(s => {
              if (!s.description) s.description = text;
            });
          }
        } catch { }
      }));
    }
  }

  return stickers;
}

export async function createExchangePost(agent: Agent, targetHandle: string, targetDid: string, offeredStickers: StickerWithProfile[]) {
  const origin = window.location.origin;
  const myDid = agent.assertDid;

  // 1. Create Transaction Record (Offered)
  await agent.com.atproto.repo.createRecord({
    repo: myDid!,
    collection: TRANSACTION_COLLECTION,
    record: {
      $type: TRANSACTION_COLLECTION,
      partner: targetDid,
      refPartner: `at://${targetDid}/app.bsky.actor.profile/self`, // Reference Profile URI for Constellation
      stickerIn: [], // We don't know what we get yet
      stickerOut: offeredStickers.map(s => s.uri),
      status: 'offered',
      createdAt: new Date().toISOString()
    }
  });


  // 2. Create text with mention
  const stickerCount = offeredStickers.length;
  const text = `Let's exchange stickers @${targetHandle}! offering ${stickerCount} sticker${stickerCount > 1 ? 's' : ''} 🍬 #AtsumeAt`;

  // Facets for mention and tag
  const facets = [
    {
      index: { byteStart: text.indexOf('@'), byteEnd: text.indexOf('@') + 1 + targetHandle.length },
      features: [{ $type: 'app.bsky.richtext.facet#mention', did: targetDid }]
    },
    {
      index: { byteStart: text.indexOf('#'), byteEnd: text.indexOf('#') + 9 },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'AtsumeAt' }]
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

// Helper to fetch all raw sticker records for duplicate checking
async function getAllStickerRecords(agent: Agent, did: string): Promise<Sticker[]> {
  let cursor;
  const records: Sticker[] = [];
  try {
    do {
      const res = await agent.com.atproto.repo.listRecords({
        repo: did,
        collection: STICKER_COLLECTION,
        limit: 100,
        cursor
      });
      cursor = res.data.cursor;
      for (const r of res.data.records) {
        records.push(r.value as unknown as Sticker);
      }
    } while (cursor);
  } catch (e) {
    console.warn("Failed to list stickers for dup check", e);
  }
  return records;
}

export async function acceptExchange(agent: Agent, partnerDid: string, stickersToGive: string[]) {
  const myDid = agent.assertDid;
  if (!myDid) return;

  // 0. Verify VALID Offer exists in Partner's Repo
  let offeredStickerUris: string[] = [];
  try {
    let pdsAgent = agent;
    const pdsUrl = await getPdsEndpoint(partnerDid);
    if (pdsUrl) {
      pdsAgent = new Agent(pdsUrl);
    }

    const partnerOffers = await pdsAgent.com.atproto.repo.listRecords({
      repo: partnerDid,
      collection: TRANSACTION_COLLECTION,
      limit: 20,
    });

    const validOffer = partnerOffers.data.records.find(r => {
      const t = r.value as unknown as Transaction;
      return t.partner === myDid && t.status === 'offered';
    });

    if (!validOffer) {
      throw new Error("No active exchange offer found from this user.");
    }

    const offerData = validOffer.value as unknown as Transaction;
    offeredStickerUris = offerData.stickerOut;

    // 1. Fetch Details of Offered Stickers
    const receivedStickersData = await Promise.all(offeredStickerUris.map(async (uri) => {
      const rkey = uri.split('/').pop();
      if (!rkey) return null;
      try {
        const res = await pdsAgent.com.atproto.repo.getRecord({
          repo: partnerDid,
          collection: STICKER_COLLECTION,
          rkey
        });
        return res.data.value as unknown as Sticker;
      } catch (e) {
        console.error(`Failed to fetch sticker ${uri}`, e);
        return null;
      }
    }));

    // 2. Clone to My Repo
    const myStickers = await getAllStickerRecords(agent, myDid);

    for (const stickerData of receivedStickersData) {
      if (!stickerData) continue;

      const r = stickerData as any;
      const rSubject = r.subjectDid || r.owner;
      const rOriginalOwner = r.originalOwner || r.owner;

      const alreadyHas = myStickers.some(s => {
        const sSubject = s.subjectDid || (s as any).owner;
        return sSubject === rSubject && s.model === stickerData.model;
      });
      if (alreadyHas) continue;

      // Image Resolution (Blob -> URL)
      let imageToSave = stickerData.image;
      if (typeof imageToSave === 'object' && (imageToSave as any).ref) {
        const blobDid = rOriginalOwner || partnerDid;
        const link = (imageToSave as any).ref.toString();
        imageToSave = `https://cdn.bsky.app/img/feed_fullsize/plain/${blobDid}/${link}@jpeg`;
      }

      await agent.com.atproto.repo.createRecord({
        repo: myDid,
        collection: STICKER_COLLECTION,
        record: {
          $type: STICKER_COLLECTION,
          image: imageToSave,
          imageType: stickerData.imageType || 'avatar',
          subjectDid: rSubject,
          originalOwner: rOriginalOwner,
          model: stickerData.model,
          description: stickerData.description,
          obtainedFrom: partnerDid,
          obtainedAt: new Date().toISOString()
        } as Sticker
      });
    }

    // 3. Create Completed Transaction
    await agent.com.atproto.repo.createRecord({
      repo: myDid,
      collection: TRANSACTION_COLLECTION,
      record: {
        $type: TRANSACTION_COLLECTION,
        partner: partnerDid,
        stickerIn: offeredStickerUris,
        stickerOut: stickersToGive,
        status: 'completed',
        refTransaction: validOffer.uri,
        createdAt: new Date().toISOString()
      }
    });

  } catch (e) {
    console.error("Verification failed", e);
    throw new Error("Could not verify exchange offer. User may not have offered a sticker.");
  }
}

export async function resolvePendingExchanges(agent: Agent, onStatus?: (msg: string) => void) {
  const myDid = agent.assertDid;
  if (!myDid) return;

  if (onStatus) onStatus("Checking for pending exchanges...");

  // 1. Get MY open offers
  let cursor;
  const myOffers: { uri: string, value: Transaction }[] = [];
  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: myDid,
      collection: TRANSACTION_COLLECTION,
      limit: 50,
      cursor
    });
    cursor = res.data.cursor;
    for (const r of res.data.records) {
      const t = r.value as unknown as Transaction;
      if (t.status === 'offered') {
        myOffers.push({ uri: r.uri, value: t });
      }
    }
  } while (cursor);

  // 2. Check each partner
  for (const offer of myOffers) {
    const partnerDid = offer.value.partner;

    let partnerName = partnerDid;
    if (onStatus) {
      try {
        // Optimistic fetching
        const profile = await agent.getProfile({ actor: partnerDid });
        partnerName = profile.data.displayName || profile.data.handle || partnerDid;
      } catch (e) { }
      onStatus(`Checking exchange with ${partnerName}...`);
    }

    // PASS URI
    const claimed = await checkInverseExchange(agent, partnerDid, offer.uri);

    if (claimed) {
      if (onStatus) onStatus(`Received sticker from ${partnerName}!`);
      await new Promise(r => setTimeout(r, 1000));

      // 3. Update MY transaction to completed
      const rkey = offer.uri.split('/').pop();
      if (rkey) {
        await agent.com.atproto.repo.putRecord({
          repo: myDid,
          collection: TRANSACTION_COLLECTION,
          rkey: rkey,
          record: {
            ...offer.value,
            status: 'completed',
            updatedAt: new Date().toISOString()
          }
        });
      }
    }
  }
}

export async function checkInverseExchange(agent: Agent, partnerDid: string, offerUri: string): Promise<boolean> {
  const myDid = agent.assertDid;
  if (!myDid) return false;

  try {
    let pdsAgent = agent;
    const pdsUrl = await getPdsEndpoint(partnerDid);
    if (pdsUrl) {
      pdsAgent = new Agent(pdsUrl);
    }

    // We need to find B's transaction that references A's offerUri.
    // Since we can't query by field easily without an AppView, we must list and filter.

    const res = await pdsAgent.com.atproto.repo.listRecords({
      repo: partnerDid,
      collection: TRANSACTION_COLLECTION,
      limit: 20
    });

    // Find transaction where ref matches offerUri and status is completed
    const txRecord = res.data.records.find(r => {
      const t = r.value as unknown as Transaction;
      return t.status === 'completed' && t.refTransaction === offerUri;
    });

    if (!txRecord) return false;
    const tx = txRecord.value as unknown as Transaction;
    const incomingUris = tx.stickerOut;

    // If no stickers to receive, effectively we are done?
    if (!incomingUris || incomingUris.length === 0) return true; // Mark as done even if empty?

    let addedCount = 0;

    // Optimisation: Fetch myStickers thoroughly
    const myStickers = await getAllStickerRecords(agent, myDid);

    for (const uri of incomingUris) {
      const rkey = uri.split('/').pop();
      if (!rkey) continue;

      try {
        const remoteStickerRes = await pdsAgent.com.atproto.repo.getRecord({
          repo: partnerDid,
          collection: STICKER_COLLECTION,
          rkey
        });
        const remoteSticker = remoteStickerRes.data.value as unknown as Sticker;

        const r = remoteSticker as any;
        const rSubject = r.subjectDid || r.owner;
        const rOriginalOwner = r.originalOwner || r.owner;

        // Check duplicate
        const alreadyHas = myStickers.some(s => {
          const sSubject = s.subjectDid || (s as any).owner;
          return sSubject === rSubject && s.model === remoteSticker.model;
        });

        if (!alreadyHas) {
          // Image Resolution
          let imageToSave = remoteSticker.image;
          if (typeof imageToSave === 'object' && (imageToSave as any).ref) {
            const blobDid = rOriginalOwner || partnerDid;
            const link = (imageToSave as any).ref.toString();
            imageToSave = `https://cdn.bsky.app/img/feed_fullsize/plain/${blobDid}/${link}@jpeg`;
          }

          await agent.com.atproto.repo.createRecord({
            repo: myDid,
            collection: STICKER_COLLECTION,
            record: {
              $type: STICKER_COLLECTION,
              image: imageToSave,
              imageType: remoteSticker.imageType || 'avatar',
              subjectDid: rSubject,
              originalOwner: rOriginalOwner,
              model: remoteSticker.model,
              description: remoteSticker.description,
              obtainedFrom: partnerDid,
              obtainedAt: new Date().toISOString()
            } as Sticker
          });
          addedCount++;
        } else {
          // If already has, considered success
          addedCount++;
        }
      } catch (e) {
        console.warn("Failed to fetch/add inverse sticker", e);
      }
    }

    // If we processed stickers (added or skipped duplicates), we considered it success
    return addedCount > 0;

  } catch (e) {
    console.warn('Check inverse failed', e);
  }
  return false;
}

export interface IncomingOffer {
  partnerDid: string;
  offer: Transaction;
  uri: string;
  profile?: {
    avatar?: string;
    displayName?: string;
    handle: string;
  };
}

export async function checkIncomingOffers(agent: Agent): Promise<IncomingOffer[]> {
  const myDid = agent.assertDid;
  if (!myDid) return [];

  // Strategy: Use Constellation (Backlinks) to find who is effectively "pointing" to me via transaction.refPartner
  const subject = encodeURIComponent(`at://${myDid}/app.bsky.actor.profile/self`);
  const source = encodeURIComponent(`${TRANSACTION_COLLECTION}:refPartner`);
  const url = `https://constellation.microcosm.blue/xrpc/blue.microcosm.links.getBacklinks?subject=${subject}&source=${source}`;

  let links: any[] = [];
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      // Support multiple formats (frames, links, records)
      links = (data.records || data.frames || data.links || []);
    }
  } catch (e) {
    console.warn("Constellation check failed", e);
  }

  const results: IncomingOffer[] = [];

  // Optimize: Fetch my recent transactions to filter out already-responded offers
  const myRespondedOfferUris = new Set<string>();
  try {
    const myRes = await agent.com.atproto.repo.listRecords({
      repo: agent.assertDid!,
      collection: TRANSACTION_COLLECTION,
      limit: 50
    });
    for (const r of myRes.data.records) {
      const t = r.value as unknown as Transaction;
      if (t.refTransaction) {
        myRespondedOfferUris.add(t.refTransaction);
      }
    }
  } catch (e) {
    console.warn("Failed to fetch my transactions", e);
  }

  // Process links (parallel fetch for missing records)
  await Promise.all(links.map(async (link) => {
    let t: Transaction | undefined;

    // Normalize fields
    // 'records' format: { did, collection, rkey }
    // 'frames'/'links' format: { author: { did }, value: ... }
    const authorDid = link.did || (link.author && link.author.did);
    const rkey = link.rkey;
    let uri = link.uri;

    if (link.value) {
      // Hydrated
      t = link.value as unknown as Transaction;
      uri = link.uri;
    } else if (authorDid && rkey && link.collection === TRANSACTION_COLLECTION) {
      // Not hydrated - Fetch from PDS
      try {
        let fetched = false;

        // Strategy 1: PDS Direct (Primary - Federation Aware)
        // User requested to try this IMMEDIATELY without waiting for local Agent failure.
        const pdsUrl = await getPdsEndpoint(authorDid);
        if (pdsUrl) {
          const directUrl = `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${authorDid}&collection=${TRANSACTION_COLLECTION}&rkey=${rkey}`;
          console.log("Fetching from PDS Direct:", directUrl);
          const res = await fetch(directUrl);
          if (res.ok) {
            const data = await res.json();
            t = data.value as unknown as Transaction;
            uri = data.uri || `at://${authorDid}/${TRANSACTION_COLLECTION}/${rkey}`;
            console.log("Fetched record from PDS Direct:", t);
            fetched = true;
          }
        }

        // Strategy 2: AppView (Secondary - Public API)
        if (!fetched) {
          const appViewUrl = `https://public.api.bsky.app/xrpc/com.atproto.repo.getRecord?repo=${authorDid}&collection=${TRANSACTION_COLLECTION}&rkey=${rkey}`;
          console.log("Fetching from AppView (Fallback):", appViewUrl);
          const res = await fetch(appViewUrl);
          if (res.ok) {
            const data = await res.json();
            t = data.value as unknown as Transaction;
            uri = data.uri;
            console.log("Fetched record from AppView:", t);
            fetched = true;
          }
        }
      } catch (e) {
        console.warn("Failed to fetch record (PDS/AppView)", e);
        // Record might be deleted or inaccessible
        return;
      }
    }

    if (t && t.status === 'offered') {
      // Check if I have already responded (does a transaction exist that references this offer?)
      if (uri && myRespondedOfferUris.has(uri)) {
        console.log("Skipping already responded offer:", uri);
        return;
      }


      // Fetch Profile
      let p;
      try {
        const profileRes = await agent.getProfile({ actor: authorDid });
        p = profileRes.data;
      } catch { }

      results.push({
        partnerDid: authorDid,
        offer: t,
        uri: uri!,
        profile: p ? {
          avatar: p.avatar,
          displayName: p.displayName,
          handle: p.handle
        } : undefined
      });
    }
  }));

  return results;
}



