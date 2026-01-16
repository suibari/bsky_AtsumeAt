export interface ConstellationRecord {
  did: string;
  collection: string;
  rkey: string;
  uri?: string;
  cid?: string;
  value?: unknown; // Hydrated record value
  author?: { did: string; handle?: string; avatar?: string }; // For frames/links format
  [key: string]: unknown;
}

export async function getBacklinks(
  subject: string,
  source?: string,
  limit: number = 100
): Promise<ConstellationRecord[]> {
  const allRecords: ConstellationRecord[] = [];
  let cursor: string | undefined;

  // Encode subject
  try {
    do {
      // Manual query string construction to avoid unwanted encoding of at-uri
      let queryString = `subject=${subject}&limit=${limit}`;

      if (source) {
        queryString += `&source=${source}`;
      }

      if (cursor) {
        queryString += `&cursor=${cursor}`;
      }

      const url = `https://constellation.microcosm.blue/xrpc/blue.microcosm.links.getBacklinks?${queryString}`;
      // console.log(`[Constellation] Fetching: ${url}`);

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();

        // Handle varied response formats (records, frames, links)
        const batch = (data.records || data.frames || data.links || []) as ConstellationRecord[];
        allRecords.push(...batch);
        // console.log(`[Constellation] Found ${batch.length} records. Cursor: ${data.cursor ? 'YES' : 'NO'}`);

        cursor = data.cursor;
      } else {
        console.warn(`[Constellation] Fetch failed: ${res.status}`, await res.text());
        break;
      }
    } while (cursor);
  } catch (e) {
    console.error('[Constellation] Network error', e);
  }

  return allRecords;
}
