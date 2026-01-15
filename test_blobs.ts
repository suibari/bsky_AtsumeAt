import { Agent } from '@atproto/api';

async function main() {
  const agent = new Agent('https://bsky.social');
  // did:plc:oc6vwdlmk2qqyjqtdpt2bd2w (Bluesky Support)
  const did = 'did:plc:oc6vwdlmk2qqyjqtdpt2bd2w';
  
  try {
    console.log("Calling listBlobs...");
    const res = await agent.com.atproto.sync.listBlobs({ did, limit: 10 });
    console.log("Success:", res.success);
    console.log("CIDs:", res.data.cids);
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
