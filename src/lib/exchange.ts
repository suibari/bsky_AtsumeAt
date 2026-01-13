import { Agent, RichText } from '@atproto/api';
import { TRANSACTION_COLLECTION, STICKER_COLLECTION, type Transaction, type Sticker } from './schemas';
import { type StickerWithProfile, getAllStickerRecords } from './stickers';
import { requestSignature } from './signatures';
import { getPdsEndpoint, publicAgent } from './atproto';

export async function createExchangePost(agent: Agent, targetHandle: string, targetDid: string, offeredStickers: StickerWithProfile[], withPost: boolean = true, message?: string) {
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
      message, // Save the proposal message
      status: 'offered',
      createdAt: new Date().toISOString()
    }
  });


  // 2. Create text with mention (Optional)
  if (withPost) {
    const stickerCount = offeredStickers.length;

    const text = `Let's exchange stickers @${targetHandle}! offering ${stickerCount} sticker${stickerCount > 1 ? 's' : ''} 🍬 #AtsumeAt`;

    const rt = new RichText({ text });
    await rt.detectFacets(agent);

    await agent.post({
      text: rt.text,
      facets: rt.facets,
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

export async function acceptExchange(agent: Agent, partnerDid: string, stickersToGive: string[], message?: string) {
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
    const incomingMessage = offerData.message; // Get the message from the proposal

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
        originalCreator: rOriginalOwner, // Original Issuer
        name: stickerData.name, // Preserve Name
        message: incomingMessage // Apply message to sticker!
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
          name: stickerData.name, // Add Name
          message: incomingMessage, // Add message
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
        message, // Save acceptance message
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
    const incomingMessage = tx.message; // Get acceptance message

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
            originalCreator: rOriginalOwner,
            name: remoteSticker.name, // Preserve Name
            message: incomingMessage // Apply message
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
              name: remoteSticker.name, // Add Name
              message: incomingMessage, // Add message
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
