import { Agent } from '@atproto/api';
import { STICKER_COLLECTION, CONFIG_COLLECTION, type Sticker, type Config, TRANSACTION_COLLECTION, type Transaction } from './schemas';
import { getPdsEndpoint } from './atproto';
import { verifySignature } from '@atproto/crypto';

// Polyfill/Helper for base64
function base64ToBytes(base64: string): Uint8Array {
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
async function getIssuerPublicKey(did: string): Promise<string | null> {
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

export const publicAgent = new Agent('https://public.api.bsky.app');

const HUB_HANDLE = 'suibari.com';
let cachedHubDid: string | null = null;

export async function getHubDid(agent: Agent) {
  if (cachedHubDid) return cachedHubDid;
  const res = await agent.resolveHandle({ handle: HUB_HANDLE });
  cachedHubDid = res.data.did;
  return cachedHubDid;
}

// Helper to request signature from server
async function requestSignature(userDid: string, payload: any): Promise<{ signedPayload: string, signature: string } | null> {
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
    // Self-issued, so obtainedFrom is self or null?
    // Let's say obtainedFrom = userDid (Self-Mint)
    obtainedFrom: userDid
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
    signature: sigData?.signature,
    signedPayload: sigData?.signedPayload
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
  verification?: SealVerificationResult; // Added verification status
  uri: string; // Record URI for updates
};

export async function getUserStickers(agent: Agent, userDid: string): Promise<StickerWithProfile[]> {
  // 1. Resolve PDS
  let pdsAgent = agent;
  try {
    const pdsUrl = await getPdsEndpoint(userDid);
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
      const blobDid = s.originalOwner || userDid;
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

export async function createExchangePost(agent: Agent, targetHandle: string, targetDid: string, offeredStickers: StickerWithProfile[], withPost: boolean = true) {
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


  // 2. Create text with mention (Optional)
  if (withPost) {
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
        // BlobRef -> CDN URL (Using original creator's DID)
        const blobDid = rOriginalOwner || partnerDid;
        const ref = (imageToSave as any).ref;
        // Check for IPLD $link
        const link = ref.$link ? ref.$link : ref.toString();
        // Construct canonical URL
        imageToSave = `https://cdn.bsky.app/img/feed_fullsize/plain/${blobDid}/${link}@jpeg`;
      }

      // Request Signature for Provenance
      const infoPayload = {
        model: stickerData.model,
        image: imageToSave, // Signed Image URL
        obtainedFrom: partnerDid, // The GIVER is the partner
        originalCreator: rOriginalOwner // Original Issuer
      };

      let sigData: { signature?: string, signedPayload?: string } = {};
      try {
        console.log("Requesting signature for exchange sticker:", infoPayload);
        // We sign that we obtained this info from 'partnerDid'
        const res = await requestSignature(myDid, { info: infoPayload });
        console.log("Signature response:", res);
        if (res) sigData = res;
      } catch (e) { console.error("Signing failed in exchange", e); }


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
          obtainedAt: new Date().toISOString(),

          // Signed Data
          signature: sigData.signature,
          signedPayload: sigData.signedPayload
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

  // Resolve PDS
  let pdsAgent = agent;
  try {
    const pdsUrl = await getPdsEndpoint(myDid);
    if (pdsUrl) {
      pdsAgent = new Agent(pdsUrl);
      // We need to set the auth token if we want to write?
      // Wait, listRecords is public but if we want to write later (acceptExchange does writes),
      // we generally use the main agent for writes (authenticated).
      // But the USER said "L627 agent needs to be getPDS agent".
      // L627 is listRecords.
      // Reading one's own repo should be possible via public PDS agent or main agent.
      // If the user insists, I will change it for reading.
    }
  } catch (e) {
    console.warn('Failed to resolve PDS', e);
  }

  // 1. Get MY open offers
  let cursor;
  const myOffers: { uri: string, value: Transaction }[] = [];
  do {
    const res = await pdsAgent.com.atproto.repo.listRecords({
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
        const profile = await publicAgent.getProfile({ actor: partnerDid });
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

          // Construct info payload for signing
          // We must sign that we obtained this sticker from partnerDid
          const infoPayload = {
            model: remoteSticker.model,
            image: imageToSave,
            obtainedFrom: partnerDid,
            originalCreator: rOriginalOwner
          };

          let sigData: { signature?: string, signedPayload?: string } = {};
          try {
            // Request signature from our own server
            const res = await requestSignature(myDid, { info: infoPayload });
            if (res) sigData = res;
          } catch (e) { console.error("Signing failed in inverse exchange", e); }

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
              obtainedAt: new Date().toISOString(),

              // Signed Data
              signature: sigData.signature,
              signedPayload: sigData.signedPayload
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
  stickers?: Sticker[];
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
        const profileRes = await publicAgent.getProfile({ actor: authorDid });
        p = profileRes.data;
      } catch { }

      // Fetch Offered Stickers Details
      const stickers = await fetchStickersForTransaction(agent, t, authorDid);


      results.push({
        partnerDid: authorDid,
        offer: t,
        uri: uri!,
        profile: p ? {
          avatar: p.avatar,
          displayName: p.displayName,
          handle: p.handle
        } : undefined,
        stickers
      });
    }
  }));

  return results;
}

export async function fetchStickersForTransaction(agent: Agent, t: Transaction, partnerDid: string): Promise<Sticker[]> {
  let stickers: Sticker[] = [];
  if (t.stickerOut && t.stickerOut.length > 0) {
    try {
      const pds = await getPdsEndpoint(partnerDid);
      if (pds) {
        const results = await Promise.all(t.stickerOut.map(async (sUri) => {
          const rkey = sUri.split('/').pop();
          if (!rkey) return null;
          const url = `${pds}/xrpc/com.atproto.repo.getRecord?repo=${partnerDid}&collection=${STICKER_COLLECTION}&rkey=${rkey}`;
          const res = await fetch(url);
          if (res.ok) {
            const d = await res.json();
            const s = d.value as Sticker;
            // Image Resolution (Blob -> CDN URL)
            // We assume the blob is hosted in the author's PDS/Repo
            if (s.image && typeof s.image === 'object') {
              const blob = s.image as any;
              let link = '';
              // Handle IPLD JSON format { ref: { $link: "cid" } }
              if (blob.ref && blob.ref['$link']) {
                link = blob.ref['$link'];
              } else if (blob.ref) {
                link = blob.ref.toString();
              }

              if (link && link !== '[object Object]') {
                s.image = `https://cdn.bsky.app/img/feed_fullsize/plain/${partnerDid}/${link}@jpeg`;
              }
            }
            return s;
          }
          return null;
        }));
        stickers = results.filter((s): s is Sticker => s !== null);
      }
    } catch (e) {
      console.warn("Failed to fetch offered stickers", e);
    }
  }
  return stickers;
}

export async function deleteAllData(agent: Agent) {
  const myDid = agent.assertDid;
  if (!myDid) return;

  const collections = [STICKER_COLLECTION, TRANSACTION_COLLECTION, CONFIG_COLLECTION];

  for (const col of collections) {
    let cursor: string | undefined;
    do {
      const res = await agent.com.atproto.repo.listRecords({
        repo: myDid,
        collection: col,
        limit: 50,
        cursor
      });
      cursor = res.data.cursor;
      for (const r of res.data.records) {
        const rkey = r.uri.split('/').pop();
        if (rkey) {
          await agent.com.atproto.repo.deleteRecord({
            repo: myDid,
            collection: col,
            rkey
          });
        }
      }
    } while (cursor);
  }
}



