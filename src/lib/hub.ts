import { Agent } from '@atproto/api';
import { CONFIG_COLLECTION, STICKER_COLLECTION, TRANSACTION_COLLECTION } from './schemas';

const HUB_HANDLE = 'suibari.com';
let cachedHubDid: string | null = null;

export async function getHubDid(agent: Agent) {
  if (cachedHubDid) return cachedHubDid;
  const res = await agent.resolveHandle({ handle: HUB_HANDLE });
  cachedHubDid = res.data.did;
  return cachedHubDid;
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
  did: string;
  collection: string;
  rkey: string;
}

export async function getHubUsers(agent: Agent) {
  const hubDid = await getHubDid(agent);
  const subject = encodeURIComponent(`at://${hubDid}/app.bsky.actor.profile/self`);
  const source = encodeURIComponent(`${CONFIG_COLLECTION}:hubRef`);

  const url = `https://constellation.microcosm.blue/xrpc/blue.microcosm.links.getBacklinks?subject=${subject}&source=${source}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Constellation API error');
    const data = await res.json();
    return (data.records || []) as LinkRecord[];
  } catch (e) {
    console.error('Failed to get hub users', e);
    return [];
  }
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
