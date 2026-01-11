import { BrowserOAuthClient } from '@atproto/oauth-client-browser';
import type { Agent } from '@atproto/api';

export let client: BrowserOAuthClient | null = null;

const SCOPE = 'atproto transition:generic repo:blue.atsumeat.sticker repo:blue.atsumeat.config repo:blue.atsumeat.transaction';

export function getClient() {
  if (typeof window === 'undefined') return null;
  if (client) return client;

  const enc = encodeURIComponent;
  const origin = window.location.origin;
  // Simple detection for dev/local (custom domain or localhost)
  const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');

  let client_id = `${origin}/client-metadata.json`;
  const redirect_uri = `${origin}/`;

  if (isLocal) {
    // Special loopback client ID for local development
    client_id = `http://localhost?redirect_uri=${enc(redirect_uri)}&scope=${enc(SCOPE)}`;
  }

  client = new BrowserOAuthClient({
    handleResolver: 'https://bsky.social',
    clientMetadata: {
      client_id,
      client_name: 'BonBonDropAt',
      client_uri: origin,
      redirect_uris: [redirect_uri],
      scope: SCOPE,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      dpop_bound_access_tokens: true
    }
  });
  return client;
}

export async function signIn(handle: string) {
  const c = getClient();
  if (!c) return;
  await c.signIn(handle, {
    state: 'undefined',
    prompt: 'login'
  });
}

export async function signOut(did: string) {
  const c = getClient();
  if (!c) return;
  try {
    await c.revoke(did);
  } catch (e) {
    console.warn("Revoke failed", e);
  }
  localStorage.removeItem('atproto-oauth-session');
}
