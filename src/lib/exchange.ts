import { Agent, RichText } from '@atproto/api';
import { TRANSACTION_COLLECTION, STICKER_COLLECTION, type Transaction, type Sticker } from './schemas';
import { type StickerWithProfile, getAllStickerRecords } from './stickers';
import { requestSignature } from './signatures';
import { getPdsEndpoint, publicAgent } from './atproto';
import { getBacklinks, type ConstellationRecord } from './constellation';
import { getHubUsers } from './hub';
import { settings } from './settings.svelte';

export async function createExchangePost(agent: Agent, targetHandle: string | null, targetDid: string | null, offeredStickers: StickerWithProfile[], withPost: boolean = true, message?: string, isEasyExchange: boolean = false) {
  const origin = window.location.origin;
  const myDid = agent.assertDid;

  // 1. Create Transaction Record (Offered)
  await agent.com.atproto.repo.createRecord({
    repo: myDid!,
    collection: TRANSACTION_COLLECTION,
    record: {
      $type: TRANSACTION_COLLECTION,
      partner: targetDid || undefined,
      isEasyExchange: isEasyExchange,
      refPartner: targetDid ? `at://${targetDid}/app.bsky.actor.profile/self` : undefined, // Reference Profile URI for Constellation
      stickerIn: [], // We don't know what we get yet
      stickerOut: offeredStickers.map(s => s.uri),
      message, // Save the proposal message
      status: 'offered',
      createdAt: new Date().toISOString()
    }
  });


  // 2. Create text with mention (Optional)
  if (withPost && targetHandle && !isEasyExchange) {
    const stickerCount = offeredStickers.length;

    const text = settings.t.exchange.offerPost
      .replace('{handle}', targetHandle)
      .replace('{n}', stickerCount.toString())
      .replace('{s}', stickerCount > 1 ? 's' : '');

    const rt = new RichText({ text });
    await rt.detectFacets(agent);

    await agent.post({
      text: rt.text,
      facets: rt.facets,
      embed: {
        $type: 'app.bsky.embed.external',
        external: {
          uri: `${origin}/exchange?user=${myDid}`,
          title: settings.t.exchange.embedTitle,
          description: settings.t.exchange.embedDescription,
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

    let cursor;
    let validOffer: { uri: string, value: unknown } | undefined;

    // Pagination loop to find the offer
    do {
      const partnerOffers = await pdsAgent.com.atproto.repo.listRecords({
        repo: partnerDid,
        collection: TRANSACTION_COLLECTION,
        limit: 100,
        cursor
      });
      cursor = partnerOffers.data.cursor;

      validOffer = partnerOffers.data.records.find(r => {
        const t = r.value as unknown as Transaction;
        // Check if targeted to me OR if it is an Easy Exchange (open to anyone)
        const isTargetedToMe = t.partner === myDid;
        const isEasyEx = t.isEasyExchange === true && !t.partner;
        return (isTargetedToMe || isEasyEx) && t.status === 'offered';
      });

      if (validOffer) break;
    } while (cursor);

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
        return sSubject === rSubject && s.model === stickerData.model && s.shape === stickerData.shape;
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
        shape: stickerData.shape, // Preserve Shape
        message: incomingMessage // Apply message to sticker!
      };

      let sigData: { signature?: string, signedPayload?: string } = {};
      try {
        // console.log("Requesting signature for exchange sticker:", infoPayload);
        // We sign that we obtained this info from 'partnerDid'
        const res = await requestSignature(myDid, { info: infoPayload });
        // console.log("Signature response:", res);
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
          shape: stickerData.shape, // Add Shape
          message: incomingMessage, // Add message
          obtainedFrom: partnerDid,
          obtainedAt: new Date().toISOString(),

          // Signed Data
          signature: sigData.signature || '',
          signedPayload: sigData.signedPayload || ''
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

export async function rejectExchange(agent: Agent, partnerDid: string, offerUri?: string) {
  const myDid = agent.assertDid;
  if (!myDid) return;

  // 0. Verify VALID Offer exists in Partner's Repo
  let pdsAgent = agent;
  try {
    const pdsUrl = await getPdsEndpoint(partnerDid);
    if (pdsUrl) {
      pdsAgent = new Agent(pdsUrl);
    }

    let validOffer: { uri: string, value: unknown } | undefined;

    if (offerUri) {
      // Target specific offer
      const rkey = offerUri.split('/').pop();
      if (rkey) {
        try {
          const res = await pdsAgent.com.atproto.repo.getRecord({
            repo: partnerDid,
            collection: TRANSACTION_COLLECTION,
            rkey
          });
          const t = res.data.value as unknown as Transaction;
          if (t.partner === myDid && t.status === 'offered') {
            validOffer = { uri: offerUri, value: res.data.value };
          }
        } catch (e) {
          console.warn(`Failed to verify specific offer ${offerUri}`, e);
        }
      }
    }

    // Fallback: Find ANY active offer (Backwards compatibility or if specific verify failed)
    if (!validOffer) {
      let cursor;
      do {
        const partnerOffers = await pdsAgent.com.atproto.repo.listRecords({
          repo: partnerDid,
          collection: TRANSACTION_COLLECTION,
          limit: 100,
          cursor,
        });
        cursor = partnerOffers.data.cursor;

        validOffer = partnerOffers.data.records.find(r => {
          const t = r.value as unknown as Transaction;
          return t.partner === myDid && t.status === 'offered';
        });

        if (validOffer) break;
      } while (cursor);
    }

    if (!validOffer) {
      throw new Error("No active exchange offer found from this user.");
    }

    // 1. Create Transaction (Rejected)
    await agent.com.atproto.repo.createRecord({
      repo: myDid,
      collection: TRANSACTION_COLLECTION,
      record: {
        $type: TRANSACTION_COLLECTION,
        partner: partnerDid,
        stickerIn: [], // No stickers received
        stickerOut: [], // No stickers given
        message: "",
        status: 'rejected',
        refTransaction: validOffer.uri,
        createdAt: new Date().toISOString()
      }
    });

  } catch (e) {
    console.error("Rejection failed", e);
    throw new Error("Could not reject exchange offer.");
  }
}

export async function resolvePendingExchanges(agent: Agent, onStatus?: (msg: string) => void) {
  const myDid = agent.assertDid;
  if (!myDid) return;

  if (onStatus) onStatus(settings.t.exchange.checkingExchanges);

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
      limit: 100,
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
    let partnerDid = offer.value.partner;
    if (!partnerDid) {
      // Handle Easy Exchange (No partner defined yet)
      if (offer.value.isEasyExchange) {
        // Search for WHO accepted it via Backlinks
        const links = await getBacklinks(offer.uri, `${TRANSACTION_COLLECTION}:refTransaction`);

        for (const link of links) {
          const responderDid = link.did || (link.author && link.author.did);
          if (!responderDid) continue;

          // Check if this user actually completed it
          const claimed = await checkInverseExchange(agent, responderDid, offer.uri);

          if (claimed === 'completed') {
            // Found the mystery partner!
            partnerDid = responderDid;
            // Continue to update logic below...
            break;
          }
        }
      }

      if (!partnerDid) continue; // Still no partner found
    }

    let partnerName = partnerDid;
    if (onStatus) {
      try {
        // Optimistic fetching
        const profile = await publicAgent.getProfile({ actor: partnerDid });
        partnerName = profile.data.displayName || profile.data.handle || partnerDid;
      } catch (e) { }
      onStatus(settings.t.exchange.checkingWithPartner.replace('{name}', partnerName));
    }

    const claimed = await checkInverseExchange(agent, partnerDid, offer.uri);

    if (claimed === 'completed') {
      if (onStatus) onStatus(settings.t.exchange.receivedFromServer.replace('{name}', partnerName));
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
    } else if (claimed === 'rejected') {
      // User requested NO notification for rejection
      // if (onStatus) onStatus(settings.t.exchange.rejectedByPartner.replace('{name}', partnerName));
      // await new Promise(r => setTimeout(r, 1000));

      // Update MY transaction to rejected
      const rkey = offer.uri.split('/').pop();
      if (rkey) {
        await agent.com.atproto.repo.putRecord({
          repo: myDid,
          collection: TRANSACTION_COLLECTION,
          rkey: rkey,
          record: {
            ...offer.value,
            status: 'rejected',
            updatedAt: new Date().toISOString()
          }
        });
      }
    }
  }
}

export async function checkInverseExchange(agent: Agent, partnerDid: string, offerUri: string): Promise<'completed' | 'rejected' | false> {
  const myDid = agent.assertDid;
  if (!myDid) return false;

  try {
    let pdsAgent = agent;
    const pdsUrl = await getPdsEndpoint(partnerDid);
    if (pdsUrl) {
      pdsAgent = new Agent(pdsUrl);
    }

    // We need to find B's transaction that references A's offerUri.
    let cursor;
    let txRecord: { value: unknown } | undefined;

    do {
      const res = await pdsAgent.com.atproto.repo.listRecords({
        repo: partnerDid,
        collection: TRANSACTION_COLLECTION,
        limit: 100,
        cursor
      });
      cursor = res.data.cursor;

      // Find transaction where ref matches offerUri and status is completed OR rejected
      txRecord = res.data.records.find(r => {
        const t = r.value as unknown as Transaction;
        return (t.status === 'completed' || t.status === 'rejected') && t.refTransaction === offerUri;
      });

      if (txRecord) break;
    } while (cursor);

    if (!txRecord) return false;
    const tx = txRecord.value as unknown as Transaction;

    if (tx.status === 'rejected') {
      return 'rejected';
    }

    const incomingUris = tx.stickerOut;
    const incomingMessage = tx.message; // Get acceptance message

    // If no stickers to receive, effectively we are done?
    if (!incomingUris || incomingUris.length === 0) return 'completed'; // Mark as done even if empty?

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
          return sSubject === rSubject && s.model === remoteSticker.model && s.shape === remoteSticker.shape;
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
            shape: remoteSticker.shape, // Preserve Shape
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
              shape: remoteSticker.shape, // Add Shape
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
    return addedCount > 0 ? 'completed' : false;

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
  const subject = `at://${myDid}/app.bsky.actor.profile/self`;
  const source = `${TRANSACTION_COLLECTION}:refPartner`;
  const links = await getBacklinks(subject, source, 100);

  const results: IncomingOffer[] = [];

  // Optimize: Fetch my recent transactions to filter out already-responded offers
  const myRespondedOfferUris = new Set<string>();
  try {
    let cursor;
    do {
      const myRes = await agent.com.atproto.repo.listRecords({
        repo: agent.assertDid!,
        collection: TRANSACTION_COLLECTION,
        limit: 100,
        cursor
      });
      cursor = myRes.data.cursor;

      for (const r of myRes.data.records) {
        const t = r.value as unknown as Transaction;
        if (t.refTransaction) {
          myRespondedOfferUris.add(t.refTransaction);
        }
      }
    } while (cursor);
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
    if (!authorDid) return; // Skip if no DID

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
          // console.log("Fetching from PDS Direct:", directUrl);
          const res = await fetch(directUrl);
          if (res.ok) {
            const data = await res.json();
            t = data.value as unknown as Transaction;
            uri = data.uri || `at://${authorDid}/${TRANSACTION_COLLECTION}/${rkey}`;
            // console.log("Fetched record from PDS Direct:", t);
            fetched = true;
          } else {
            console.warn(`[Exchange] PDS Direct fetch failed: ${res.status}`, directUrl);
          }
        }

        // Strategy 2: AppView (Secondary - Public API)
        if (!fetched) {
          const appViewUrl = `https://public.api.bsky.app/xrpc/com.atproto.repo.getRecord?repo=${authorDid}&collection=${TRANSACTION_COLLECTION}&rkey=${rkey}`;
          // console.log("Fetching from AppView (Fallback):", appViewUrl);
          const res = await fetch(appViewUrl);
          if (res.ok) {
            const data = await res.json();
            t = data.value as unknown as Transaction;
            uri = data.uri;
            // console.log("Fetched record from AppView:", t);
            fetched = true;
          } else {
            console.warn(`[Exchange] AppView fetch failed: ${res.status}`, appViewUrl);
          }
        }
      } catch (e) {
        console.warn("Failed to fetch record (PDS/AppView)", e);
        // Record might be deleted or inaccessible
        return;
      }
    }

    if (t && t.status === 'offered') {
      if (!uri) {
        uri = `at://${authorDid}/${TRANSACTION_COLLECTION}/${rkey}`;
      }

      // Check if I have already responded (does a transaction exist that references this offer?)
      if (myRespondedOfferUris.has(uri)) {
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
                const ext = s.shape === 'transparent' ? 'png' : 'jpeg';
                s.image = `https://cdn.bsky.app/img/feed_fullsize/plain/${partnerDid}/${link}@${ext}`;
              }
            }

            // Verify Seal for Incoming Offer Stickers
            // NOTE: We use the partner's DID as the repo owner (subject to change if it's a stolen sticker, verifySeal handles it)
            const { verifySeal } = await import('./signatures');
            const verification = await verifySeal(s, partnerDid, agent);
            if (!verification.isValid) {
              console.warn(`[Exchange] Invalid sticker seal detected for ${sUri}: ${verification.reason}`);
              return null; // Skip invalid stickers
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

export interface MatchedPartner {
  did: string;
  offer: Transaction;
  stickers: Sticker[];
  profile?: {
    displayName?: string;
    handle: string;
    avatar?: string;
  };
}

export async function findEasyExchangePartner(agent: Agent, offeredStickers: StickerWithProfile[], excludeDids: string[] = []): Promise<MatchedPartner | null> {
  const myDid = agent.assertDid;
  if (!myDid) return null;



  // 1. Get all Hub Users
  const hubUsers = await getHubUsers(agent);
  const candidates = hubUsers.filter(u => u.did !== myDid && !excludeDids.includes(u.did));

  // Randomize
  const shuffledCandidates = candidates.sort(() => Math.random() - 0.5);
  let fallbackMatch: MatchedPartner | undefined;

  // Concurrency Control
  const CONCURRENCY_LIMIT = 10;
  const SEARCH_LIMIT = 200;
  const relevantCandidates = shuffledCandidates.slice(0, SEARCH_LIMIT);

  let candidatesChecked = 0;
  let activePromises: Promise<void>[] = [];
  let foundPerfectMatch: MatchedPartner | null = null;

  // Helper to process one candidate
  const checkCandidate = async (user: { did: string }) => {
    if (foundPerfectMatch) return; // Stop if already found

    let pdsAgent = agent;
    try {
      const pdsUrl = await getPdsEndpoint(user.did);
      if (pdsUrl) pdsAgent = new Agent(pdsUrl);

      // Timeout for operations to prevent hanging
      const timeoutMs = 5000;
      const timeoutPromise = new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs));

      const checkPromise = (async () => {
        let cursor;
        let matchingOffer: { value: Transaction, uri: string } | undefined;
        let fetchCount = 0;
        const MAX_FETCH = 50;

        // 1. Find matching offer
        do {
          const res = await pdsAgent.com.atproto.repo.listRecords({
            repo: user.did,
            collection: TRANSACTION_COLLECTION,
            limit: 100,
            cursor
          });
          cursor = res.data.cursor;
          fetchCount += res.data.records.length;

          matchingOffer = res.data.records.find(r => {
            const t = r.value as unknown as Transaction;
            return t.status === 'offered' &&
              t.isEasyExchange === true &&
              (!t.partner) &&
              t.stickerOut && t.stickerOut.length > 0;
          }) as { value: Transaction, uri: string } | undefined;

          if (matchingOffer) break;
          if (fetchCount >= MAX_FETCH) break;
        } while (cursor);

        if (matchingOffer) {
          const t = matchingOffer.value;

          // 1.5 Check Re-Entrancy / Double Matching
          // Has someone else already COMPLETED this easy exchange?
          // We check backlinks for any transaction pointing to this offer with status 'completed'
          let isAlreadyTaken = false;
          try {
            const backlinks = await getBacklinks(matchingOffer.uri as string, `${TRANSACTION_COLLECTION}:refTransaction`);
            isAlreadyTaken = backlinks.some(l => {
              const val = l.value as Transaction;
              // If we have value, identifying status is easy. 
              // If not hydrated, we might need to fetch, but usually recent ones are indexed.
              // Safest is to check if ANY 'completed' transaction references this.
              if (val && val.status === 'completed') return true;
              return false;
            });
          } catch (e) { }

          if (isAlreadyTaken) {
            // console.log("Skipping taken offer", matchingOffer.uri);
            return;
          }

          const stickers = await fetchStickersForTransaction(agent, t, user.did);

          // 2. Check Ownership (Does partner need my stickers?)
          const targetDid = user.did;
          let partnerHasMySticker = true;
          try {
            // Optimisation: Limit sticker fetch or rely on partial check?
            // We stick to getAllStickerRecords but maybe we should rely on a simpler check if possible.
            // For now, let's just run it but wrapped in the timeout which applies to the whole function.
            const partnerStickers = await getAllStickerRecords(pdsAgent, targetDid);
            partnerHasMySticker = partnerStickers.some(p =>
              offeredStickers.some(offered => {
                const offeredSub = offered.subjectDid || (offered as any).owner;
                const pSub = p.subjectDid || (p as any).owner;
                return p.model === offered.model && pSub === offeredSub;
              })
            );
          } catch { }

          // 3. Fetch Profile
          let profile: MatchedPartner['profile'] | undefined;
          try {
            const pRes = await publicAgent.getProfile({ actor: user.did });
            profile = {
              displayName: pRes.data.displayName,
              handle: pRes.data.handle,
              avatar: pRes.data.avatar
            };
          } catch { }

          const match: MatchedPartner = {
            did: user.did,
            offer: t,
            stickers,
            profile
          };

          if (!partnerHasMySticker) {
            foundPerfectMatch = match;
            return;
          }

          if (!fallbackMatch) {
            fallbackMatch = match;
          }
        }
      })();

      await Promise.race([checkPromise, timeoutPromise]);

    } catch (e) {
      // console.warn("Failed to check candidate (or timeout)", user.did, e);
    }
  };

  // Execution Loop
  for (const candidate of relevantCandidates) {
    if (foundPerfectMatch) break;

    const p = checkCandidate(candidate).finally(() => {
      activePromises = activePromises.filter(ap => ap !== p);
    });
    activePromises.push(p);

    if (activePromises.length >= CONCURRENCY_LIMIT) {
      await Promise.race(activePromises);
    }
  }

  // Wait for remaining
  await Promise.all(activePromises);

  return foundPerfectMatch || fallbackMatch || null;
}

export interface MyOpenOffer {
  uri: string;
  transaction: Transaction;
  stickers: Sticker[];
  partnerProfile?: {
    displayName?: string;
    handle: string;
    avatar?: string;
  };
}

export async function getMyOpenOffers(agent: Agent): Promise<MyOpenOffer[]> {
  const myDid = agent.assertDid;
  if (!myDid) return [];

  const openOffers: MyOpenOffer[] = [];
  let cursor;

  try {
    do {
      const res = await agent.com.atproto.repo.listRecords({
        repo: myDid,
        collection: TRANSACTION_COLLECTION,
        limit: 100,
        cursor
      });
      cursor = res.data.cursor;

      for (const r of res.data.records) {
        const t = r.value as unknown as Transaction;
        if (t.status === 'offered') {
          // Identify Partner Profile for Display
          let partnerProfile: { displayName?: string, handle: string, avatar?: string } | undefined;

          if (t.partner) {
            try {
              const p = await publicAgent.getProfile({ actor: t.partner });
              partnerProfile = {
                displayName: p.data.displayName,
                handle: p.data.handle,
                avatar: p.data.avatar
              };
            } catch (e) {
              partnerProfile = { handle: t.partner }; // Fallback
            }
          }

          // Fetch My Own Stickers (that are offered)
          // We use fetchStickersForTransaction but pointing to SELF (agent.assertDid)
          const stickers = await fetchStickersForTransaction(agent, t, myDid);

          openOffers.push({
            uri: r.uri,
            transaction: t,
            stickers,
            partnerProfile
          });
        }
      }
    } while (cursor);
  } catch (e) {
    console.error("Failed to fetch my open offers", e);
  }

  return openOffers;
}

export async function withdrawExchangeOffer(agent: Agent, offerUri: string) {
  const myDid = agent.assertDid;
  if (!myDid) return;

  const rkey = offerUri.split('/').pop();
  if (!rkey) return;

  await agent.com.atproto.repo.deleteRecord({
    repo: myDid,
    collection: TRANSACTION_COLLECTION,
    rkey
  });
}

