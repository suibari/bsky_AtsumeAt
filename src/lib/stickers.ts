import { Agent } from '@atproto/api';
import { STICKER_COLLECTION, CONFIG_COLLECTION, type Sticker, STICKER_LIKE_COLLECTION } from './schemas';
import { getPdsEndpoint, publicAgent } from './atproto';
import { type SealVerificationResult, verifySeal, requestSignature } from './signatures';
import { ensureHubRef } from './hub';
import { getBacklinks } from './constellation';

export type StickerWithProfile = Sticker & {
  profile?: {
    did: string;
    avatar?: string;
    displayName?: string;
    handle: string;
  };
  giverProfile?: {
    did: string;
    displayName?: string;
    handle: string;
  };
  originalOwnerProfile?: {
    did: string;
    displayName?: string;
    handle: string;
  };
  verification?: SealVerificationResult; // Added verification status
  uri: string; // Record URI for updates
  cid: string; // Record CID
};

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



  if (onStatus) onStatus("Creating sticker pack...");

  // 2. Fetch Profile for Avatar
  let avatar = '';
  try {
    const p = await publicAgent.getProfile({ actor: userDid });
    avatar = p.data.avatar || '';
  } catch (e) {
    console.warn("Failed to fetch profile for sticker init", e);
  }

  // 3. Create Self Sticker (Only self for AtsumeAt)
  // Payload for Signing
  const infoPayload = {
    model: 'default',
    image: avatar, // We verify the avatar URL logic in verifySeal if needed, but here we just sign it.
    // Self-issued, so obtainedFrom is undefined (implicit)
  };

  // Sign it!
  const sigData = await requestSignature(userDid, { info: infoPayload });

  const selfSticker: Sticker = {
    $type: STICKER_COLLECTION,
    image: avatar, // Snapshot of avatar
    imageType: 'avatar',
    subjectDid: userDid,
    originalOwner: userDid,
    model: 'default',
    obtainedAt: new Date().toISOString(),

    // Add Signature
    signature: sigData?.signature || '',
    signedPayload: sigData?.signedPayload || ''
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

export async function getUserStickers(agent: Agent, userDid: string): Promise<StickerWithProfile[]> {
  // 1. Resolve DID (if handle)
  let did = userDid;
  if (did && !did.startsWith('did:')) {
    try {
      // console.log(`Resolving handle: ${did}`);
      const res = await publicAgent.resolveHandle({ handle: did });
      did = res.data.did;
      // console.log(`Resolved to: ${did}`);
    } catch (e) {
      console.warn('Failed to resolve handle', did, e);
    }
  }

  // 1. Resolve PDS
  let pdsAgent = agent;
  try {
    const pdsUrl = await getPdsEndpoint(did);
    if (pdsUrl) {
      // Use specific PDS agent
      pdsAgent = new Agent(pdsUrl);
    }
  } catch (e) {
    console.warn('Failed to resolve PDS, trying default agent', e);
  }

  // 1. Fetch records
  let stickers: StickerWithProfile[] = [];
  let cursor: string | undefined;

  do {
    const res = await pdsAgent.com.atproto.repo.listRecords({
      repo: did,
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

      // Ensure URI uses DID
      const uri = `at://${did}/${STICKER_COLLECTION}/${r.uri.split('/').pop()}`;

      return {
        ...(raw as Sticker),
        uri,
        cid: r.cid,
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
      const res = await publicAgent.app.bsky.actor.getProfiles({ actors: chunk });
      for (const p of res.data.profiles) {
        profilesMap.set(p.did, p);
      }
    } catch (e) {
      console.error('Failed to fetch profiles', e);
    }
  }

  // 3. Attach profiles & Handle Images & Verify
  await Promise.all(stickers.map(async (s) => {
    // Verify !
    s.verification = await verifySeal(s, userDid, agent);

    // If verified, overwrite display data with TRUSTED data
    if (s.verification.isValid && s.verification.trustedData) {
      const info = s.verification.trustedData.info || s.verification.trustedData; // Support both nested info or flat
      // MAPPING
      if (info.model) s.model = info.model;
      if (info.image) s.image = info.image;
      if (info.obtainedFrom) s.obtainedFrom = info.obtainedFrom;
      // We trust 'obtainedFrom' from signature!
    }

    // Subject Profile
    if (s.subjectDid && profilesMap.has(s.subjectDid)) {
      const p = profilesMap.get(s.subjectDid);
      s.profile = {
        did: p.did,
        handle: p.handle,
        displayName: p.displayName,
        avatar: p.avatar
      };
    }
    // Giver Profile
    if (s.obtainedFrom && profilesMap.has(s.obtainedFrom)) {
      const p = profilesMap.get(s.obtainedFrom);
      s.giverProfile = { did: p.did, handle: p.handle, displayName: p.displayName };
    }
    // Original Owner Profile (Issuer)
    if (s.originalOwner && profilesMap.has(s.originalOwner)) {
      const p = profilesMap.get(s.originalOwner);
      s.originalOwnerProfile = { did: p.did, handle: p.handle, displayName: p.displayName };
    }

    // Image Handling
    if (!s.image) {
      // Fallback for legacy: use avatar if available
      if (s.profile?.avatar) s.image = s.profile.avatar;
    } else if (typeof s.image === 'object' && (s.image as any).ref) {
      // BlobRef -> CDN URL
      // Format: https://cdn.bsky.app/img/feed_fullsize/plain/{did}/{link}@jpeg
      const blobDid = s.originalOwner || did;
      const ref = (s.image as any).ref;
      // Handle standard CID object or IPLD object { $link: "..." }
      const link = ref.$link ? ref.$link : ref.toString();

      if (link !== '[object Object]') {
        s.image = `https://cdn.bsky.app/img/feed_fullsize/plain/${blobDid}/${link}@jpeg`;
      } else {
        console.warn("Could not extract link from ref", ref);
      }
    }
  }));

  // 4. Filter Invalid Seals
  const validStickers = stickers.filter(s => {
    if (!s.verification?.isValid) {
      console.warn("Invalid Seal detected:", {
        uri: s.uri,
        reason: s.verification?.reason,
        verification: s.verification
      });
      return false; // Exclude
    }
    return true; // Keep
  });

  return validStickers;
}

// Helper to fetch all raw sticker records for duplicate checking
export async function getAllStickerRecords(agent: Agent, did: string): Promise<Sticker[]> {
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

export interface LikeState {
  count: number;
  isLiked: boolean; // by current user
  likers: { did: string; avatar?: string; handle?: string }[];
  uri?: string; // URI of the user's like record (if liked)
  targetUri?: string; // The URI of the sticker that is actually liked (Original or Self)
}

// Cache for resolved target URIs to ensure consistency across pages
const resolutionCache = new Map<string, { uri: string, cid: string }>();

// Helper: Resolve the "True" Target for Liking (The Original Sticker)
async function resolveLikeTarget(agent: Agent, sticker: StickerWithProfile): Promise<{ uri: string, cid: string }> {
  // Use cache if available
  if (resolutionCache.has(sticker.uri)) {
    return resolutionCache.get(sticker.uri)!;
  }

  const originalOwner = sticker.originalOwner || sticker.subjectDid;
  const { repo } = getRepoAndRkey(sticker.uri);

  // console.log(`[Like-Resolve] Resolving for ${sticker.uri} (model: ${sticker.model})`);
  // console.log(`[Like-Resolve] repo: ${repo}, originalOwner: ${originalOwner}`);

  // 1. If I am the original owner, the target is ME (this sticker).
  if (repo === originalOwner) {
    const res = { uri: sticker.uri, cid: sticker.cid };
    resolutionCache.set(sticker.uri, res);
    // console.log(`[Like-Resolve] Already on original: ${res.uri}`);
    return res;
  }

  // 2. I am looking at a COPY. I need to find the Original in the Issuer's Repo.
  if (!sticker.model) {
    // console.log("[Like-Resolve] No model ID. Liking local copy.");
    const res = { uri: sticker.uri, cid: sticker.cid };
    resolutionCache.set(sticker.uri, res);
    return res;
  }

  try {
    let pdsAgent = agent;
    const pdsUrl = await getPdsEndpoint(originalOwner!);
    if (pdsUrl) pdsAgent = new Agent(pdsUrl);

    // console.log(`[Like-Resolve] Searching ${originalOwner}'s PDS for model ${sticker.model}...`);

    let cursor;
    do {
      const res = await pdsAgent.com.atproto.repo.listRecords({
        repo: originalOwner!,
        collection: STICKER_COLLECTION,
        limit: 100,
        cursor
      });
      cursor = res.data.cursor;
      for (const r of res.data.records) {
        const val = r.value as any;
        // Match Model AND Subject (especially important for 'default' stickers)
        // Note: migrated subjectDid/originalOwner field handling
        const valSubject = val.subjectDid || val.owner;
        const valOriginal = val.originalOwner || val.owner;

        if (val.model === sticker.model &&
          valSubject === sticker.subjectDid &&
          valOriginal === sticker.originalOwner) {
          // Found the original!
          // Force use originalOwner DID in URI
          const originalUri = `at://${originalOwner}/${STICKER_COLLECTION}/${r.uri.split('/').pop()}`;
          const finalRes = { uri: originalUri, cid: r.cid };
          resolutionCache.set(sticker.uri, finalRes);
          // console.log(`[Like-Resolve] Found original: ${finalRes.uri}`);
          return finalRes;
        }
      }
    } while (cursor);

    console.warn("[Like-Resolve] Original sticker not found in issuer's repo. Fallback to local copy.");
  } catch (e) {
    console.warn("[Like-Resolve] Failed to resolve original sticker", e);
  }

  // Fallback: This sticker
  const fallbackRes = { uri: sticker.uri, cid: sticker.cid };
  resolutionCache.set(sticker.uri, fallbackRes);
  return fallbackRes;
}

async function fetchCid(agent: Agent, uri: string): Promise<string> {
  try {
    const { repo, rkey } = getRepoAndRkey(uri);
    if (!rkey || !repo) return "";

    let pdsAgent = agent;
    const pdsUrl = await getPdsEndpoint(repo);
    if (pdsUrl) pdsAgent = new Agent(pdsUrl);

    const res = await pdsAgent.com.atproto.repo.getRecord({
      repo,
      collection: STICKER_COLLECTION,
      rkey: rkey as string
    });
    return res.data.cid || "";
  } catch (e) {
    console.warn("Could not fetch CID", e);
    return "";
  }
}


// 1. Toggle Like (Create or Delete)
export async function toggleStickerLike(agent: Agent, sticker: StickerWithProfile, currentLikeUri?: string): Promise<string | undefined> {
  const myDid = agent.assertDid;
  if (!myDid) return;

  if (currentLikeUri) {
    // UNLIKE: Delete Existing Record
    const rkey = currentLikeUri.split('/').pop();
    if (rkey) {
      await agent.com.atproto.repo.deleteRecord({
        repo: myDid,
        collection: STICKER_LIKE_COLLECTION,
        rkey
      });
      return undefined;
    }
  } else {
    // LIKE: Create New Record
    // Resolve Target (Original or Self)
    const target = await resolveLikeTarget(agent, sticker);
    if (!target.cid) return; // Can't like without CID

    const res = await agent.com.atproto.repo.createRecord({
      repo: myDid,
      collection: STICKER_LIKE_COLLECTION,
      record: {
        $type: STICKER_LIKE_COLLECTION,
        subject: {
          uri: target.uri,
          cid: target.cid
        },
        createdAt: new Date().toISOString()
      }
    });
    return res.data.uri;
  }
}

// Helper: Extract Repo/Rkey from URI
function getRepoAndRkey(uri: string) {
  const parts = uri.replace('at://', '').split('/');
  return { repo: parts[0], collection: parts[1], rkey: parts[2] };
}

// 5. Update Sticker (Tags, Name, etc.)
export async function updateSticker(agent: Agent, stickerUri: string, updates: Partial<Sticker>) {
  const myDid = agent.assertDid;
  if (!myDid) return;

  const { rkey } = getRepoAndRkey(stickerUri);
  if (!rkey) return;

  try {
    // 1. Fetch current record (for CID and full data)
    const { data: { value: currentRecord, cid: currentCid } } = await agent.com.atproto.repo.getRecord({
      repo: myDid,
      collection: STICKER_COLLECTION,
      rkey
    });

    const sticker = currentRecord as Sticker;
    const newSticker = { ...sticker, ...updates };

    // 2. Data Sanitization
    if (newSticker.tags) {
      // Unique and Trim
      newSticker.tags = Array.from(new Set(newSticker.tags.map(t => t.trim()).filter(t => t)));
    }

    // 3. Re-Signing Logic (If Name Changed)
    if (updates.name !== undefined && updates.name !== sticker.name) {
      // Name is part of the signed payload. We MUST re-sign.
      // We can only re-sign if WE are the original minter (or we have the original signature info? No, we need to request a NEW signature from the server).
      // Wait, if I am just a holder, I cannot change the name and re-sign it as valid unless the server allows "renaming"?
      // The server signs: (model, image, obtainedFrom, originalCreator, name, message).
      // If I change the `name`, valid seal requires a signature over the NEW name.
      // The server `requestSignature` endpoint will sign whatever I send, but `verifySeal` checks:
      // - Payload.sub == Owner (Me) -> YES
      // - Payload.iss == Trusted Key -> YES
      // - Field Matching -> YES (record.name == signed.name)
      // So, YES, I can re-sign it as myself.

      // Preserve original info for the signature payload
      // We need to reconstruct the payload info
      const infoPayload = {
        model: sticker.model,
        // Ensure image is string URL
        image: typeof sticker.image === 'string' ? sticker.image : '', // Fallback? Image should be URL in record usually.
        obtainedFrom: sticker.obtainedFrom,
        originalCreator: sticker.originalOwner,
        name: newSticker.name, // NEW Name
        message: sticker.message
      };

      // If image was blob ref, we might have issues getting the URL back if we don't have it handy?
      // `sticker.image` in the record might be a BlobRef object.
      // But `signatures.ts` expects `image` string for URL matching.
      // If we are just updating metadata, we might need to resolve the blob URL again if it's missing?
      // Actually `initStickers` calculates it.
      // Let's assume for now the user has the 'StickerWithProfile' which has the URL, but here we only fetching the raw record.
      // We should pass the 'current image URL' if possible, or attempt to reconstruct it.

      if (typeof sticker.image === 'object') {
        // Reconstruct URL logic (duplicated from getUserStickers roughly)
        // If we can't reconstruct, we might fail verification on 'image'.
        // But let's try our best.
        const blobDid = sticker.originalOwner || myDid;
        const ref = (sticker.image as any).ref;
        const link = ref.$link ? ref.$link : ref.toString();
        if (link && link !== '[object Object]') {
          infoPayload.image = `https://cdn.bsky.app/img/feed_fullsize/plain/${blobDid}/${link}@jpeg`;
        }
      }

      const sigData = await requestSignature(myDid, { info: infoPayload });
      if (sigData) {
        newSticker.signature = sigData.signature;
        newSticker.signedPayload = sigData.signedPayload;
      } else {
        throw new Error("Failed to re-sign sticker during name update");
      }
    }

    // 4. Perform Update
    await agent.com.atproto.repo.putRecord({
      repo: myDid,
      collection: STICKER_COLLECTION,
      rkey,
      record: newSticker,
      swapRecord: currentCid
    });

  } catch (e) {
    console.error("Failed to update sticker", e);
    throw e;
  }
}

// 4. Delete Sticker
export async function deleteSticker(agent: Agent, stickerUri: string) {
  const myDid = agent.assertDid;
  if (!myDid) return;

  const { rkey } = getRepoAndRkey(stickerUri);
  if (!rkey) return;

  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: myDid,
      collection: STICKER_COLLECTION,
      rkey: rkey as string
    });
  } catch (e) {
    console.error("Failed to delete sticker", e);
    throw e;
  }
}


// 2. Fetch Likes for a Sticker (Using Constellation)
// Returns: List of liker DIDs
export async function getStickerLikes(agent: Agent, stickerUri: string): Promise<string[]> {
  const source = `${STICKER_LIKE_COLLECTION}:subject.uri`;
  const records = await getBacklinks(stickerUri, source);
  return records.map(r => r.did);
}

// 3. Batch Fetch Like States for Multiple Stickers
// To avoid N+1 requests, we hopefully can batch? 
// Constellation might not support batch subject immediately.
// If not, we do it one by one or lazy load.
// For now, let's just expose a function to load state for ONE sticker fully (with profiles).

export async function loadStickerLikeState(agent: Agent, sticker: StickerWithProfile): Promise<LikeState> {
  const myDid = agent.assertDid;

  // Resolve TARGET URI first!
  // We want to see likes on the ORIGINAL, not necessarily this specific record URI if it's a copy.
  let targetUri = sticker.uri;

  // Checking if we are original or copy without network:
  const originalOwner = sticker.originalOwner || sticker.subjectDid;
  const { repo } = getRepoAndRkey(sticker.uri);

  if (repo !== originalOwner && sticker.model) {
    // We SHOULD resolve.
    const resolved = await resolveLikeTarget(agent, sticker);
    targetUri = resolved.uri;
  }

  // Re-impl for efficiency:
  const source = `${STICKER_LIKE_COLLECTION}:subject.uri`;
  const rawRecords = await getBacklinks(targetUri, source);
  const records = rawRecords.map(r => ({ did: r.did, collection: r.collection, rkey: r.rkey }));

  const likers: { did: string; avatar?: string; handle?: string }[] = [];

  let isLiked = false;
  let myLikeUri: string | undefined;

  // Check Status
  for (const r of records) {
    if (myDid && r.did === myDid) {
      isLiked = true;
      myLikeUri = `at://${r.did}/${r.collection}/${r.rkey}`;
    }
    likers.push({ did: r.did });
  }

  // 3. Fetch Profiles for up to 5-10 likers (display limit) or all?
  // Let's fetch last 5 likers for display
  const didsToResolve = likers.slice(0, 5).map(l => l.did);
  if (didsToResolve.length > 0) {
    try {
      const profiles = await publicAgent.app.bsky.actor.getProfiles({ actors: didsToResolve });
      const map = new Map(profiles.data.profiles.map(p => [p.did, p]));

      // Hydrate likers
      for (const l of likers) {
        if (map.has(l.did)) {
          const p = map.get(l.did)!;
          l.avatar = p.avatar;
          l.handle = p.handle;
        }
      }
    } catch (e) { console.warn("Failed profiles for likes", e) }
  }

  return {
    count: likers.length,
    isLiked,
    uri: myLikeUri,
    targetUri, // Return the actual URI we checked
    likers
  };
}
