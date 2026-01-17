<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { getClient, getPdsEndpoint, publicAgent } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import type {
    ProfileView,
    ProfileViewBasic,
    ProfileViewDetailed,
  } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
  import {
    acceptExchange,
    rejectExchange,
    createExchangePost,
    fetchStickersForTransaction,
    findEasyExchangePartner,
    type MatchedPartner,
  } from "$lib/exchange";
  import { getHubUsers } from "$lib/hub"; // Import getHubUsers
  import { getUserStickers, type StickerWithProfile } from "$lib/stickers";
  import {
    STICKER_COLLECTION,
    type Sticker,
    TRANSACTION_COLLECTION,
    type Transaction,
  } from "$lib/schemas";
  import StickerCanvas from "$lib/components/StickerCanvas.svelte";
  import { i18n } from "$lib/i18n.svelte";
  import SignInForm from "$lib/components/SignInForm.svelte";
  import ActorTypeahead from "$lib/components/ActorTypeahead.svelte";

  let agent = $state<Agent | null>(null);
  let targetUserParam = $derived($page.url.searchParams.get("user"));
  let partnerParam = $derived($page.url.searchParams.get("partner"));
  let loading = $state(true);
  let verifying = $state(false);
  let isValidOffer = $state(false);
  let processingAction = $state<"accept" | "reject" | null>(null);
  let incomingStickers = $state<Sticker[]>([]);
  let incomingMessage = $state<string | undefined>(undefined);
  let offererProfile = $state<ProfileViewDetailed | null>(null);

  // Accept Mode State
  let successAccept = $state(false);
  let successReject = $state(false);
  let acceptanceMessage = $state("");

  // Initiate Mode State
  let partnerHandle = $state("");
  let partnerDid = $state<string | null>(null);
  let myStickers = $state<StickerWithProfile[]>([]);
  let selectedStickers = $state<Set<string>>(new Set()); // URIs
  let proposalMessage = $state("");
  let resolveError = $state("");

  // Easy Exchange State
  let matchedPartner = $state<MatchedPartner | null>(null);
  let findingPartner = $state(false);
  let excludeDids = $state<string[]>([]);

  // Valid Tabs
  type Tab = "recommend" | "search" | "easy";
  let activeTab = $state<Tab>("recommend");
  let recommendedUsers = $state<
    (ProfileViewBasic | ProfileView | ProfileViewDetailed)[]
  >([]);
  let recommendationsLoading = $state(false);

  // Settings
  let mentionOnBluesky = $state(true);
  let saveSettings = $state(false);

  onMount(async () => {
    // Load Settings
    const savedMention = localStorage.getItem("mentionOnBluesky");
    if (savedMention !== null) {
      mentionOnBluesky = savedMention === "true";
      saveSettings = true; // If we found settings, assume user wanted them saved (or just default checkbox to true if previously saved?)
      // Let's just restore the value. Should we restore the "saveSettings" checkbox state?
      // Usually "save settings" is an action or persistently checked. Let's make it checked if we loaded something.
      saveSettings = true;
    }

    const c = getClient();
    if (c) {
      const res = await c.init();
      if (res) {
        agent = new Agent(res.session);

        // Always fetch stickers if logged in
        if (agent.assertDid) {
          myStickers = await getUserStickers(agent, agent.assertDid);
        }

        // Verify Offer if targetUserParam exists
        if (targetUserParam) {
          await verifyIncomingOffer(targetUserParam);
        } else if (partnerParam) {
          activeTab = "search";
          partnerHandle = partnerParam;
          await resolvePartner();
        }
      }
    }
    loading = false;
    // Initial fetch for recommendations if user is logged in
    if (agent && agent.assertDid && !targetUserParam) {
      void fetchRecommendations();
    }
  });

  async function fetchRecommendations() {
    if (!agent || !agent.assertDid) return;
    recommendationsLoading = true;
    try {
      // 0. Identify Owned DIDs (Sticker Creators) from valid stickers
      // We only want to recommend people whose stickers we DO NOT have yet.
      const ownedDids = new Set<string>();
      // myStickers are already fetched in onMount
      for (const s of myStickers) {
        // Use subjectDid as the "Main" identifier of the sticker's person
        if (s.subjectDid) ownedDids.add(s.subjectDid);

        // Also exclude original owner if different?
        // User requirements say "that person's sticker unowned".
        // Usually 'subjectDid' is the person.
      }

      // 1. Fetch Follows (Paginated, up to 2000)
      const follows: (ProfileView | ProfileViewBasic)[] = [];
      let cursor: string | undefined;
      let count = 0;
      const MAX_FOLLOWS = 2000;

      while (count < MAX_FOLLOWS) {
        const res = await publicAgent.getFollows({
          actor: agent.assertDid,
          limit: 100, // Max per request usually
          cursor,
        });
        follows.push(...res.data.follows);
        count += res.data.follows.length;
        cursor = res.data.cursor;
        if (!cursor) break;
      }

      // 2. Fetch App Users (Hub)
      // This returns links, we need to extract DIDs
      const hubLinks = await getHubUsers(agent);
      const appUserDids = new Set<string>();
      for (const link of hubLinks) {
        // link.did is the user who created the config record pointing to hub
        if (link.did) {
          appUserDids.add(link.did);
        }
      }

      // 3. Categorize & Prioritize
      // Group 1: Follow & AppUser & !Owned
      // Group 2: Follow & !AppUser & !Owned
      // Group 3: !Follow & AppUser & !Owned

      const g1: (ProfileViewBasic | ProfileView | ProfileViewDetailed)[] = [];
      const g2: (ProfileViewBasic | ProfileView | ProfileViewDetailed)[] = [];

      const followDids = new Set<string>();

      for (const f of follows) {
        followDids.add(f.did);
        if (ownedDids.has(f.did)) continue; // Owned -> Skip

        if (appUserDids.has(f.did)) {
          g1.push(f);
        } else {
          g2.push(f);
        }
      }

      const g3Dids: string[] = [];
      for (const did of appUserDids) {
        if (
          !followDids.has(did) &&
          !ownedDids.has(did) &&
          did !== agent.assertDid
        ) {
          g3Dids.push(did);
        }
      }

      // Randomize helpers
      const shuffle = (array: any[]) => array.sort(() => Math.random() - 0.5);

      shuffle(g1);
      shuffle(g2);
      shuffle(g3Dids);

      const finalSelection: (
        | ProfileViewBasic
        | ProfileView
        | ProfileViewDetailed
      )[] = [];

      // Fill from G1
      finalSelection.push(...g1.slice(0, 6));

      // Fill from G2
      if (finalSelection.length < 6) {
        const needed = 6 - finalSelection.length;
        finalSelection.push(...g2.slice(0, needed));
      }

      // Fill from G3
      if (finalSelection.length < 6) {
        const needed = 6 - finalSelection.length;
        const g3ToFetch = g3Dids.slice(0, needed);

        if (g3ToFetch.length > 0) {
          try {
            const res = await publicAgent.getProfiles({
              actors: g3ToFetch,
            });
            const g3Profiles = res.data.profiles;
            finalSelection.push(...g3Profiles);
          } catch (e) {
            console.warn("Failed to fetch app user profiles", e);
          }
        }
      }

      recommendedUsers = finalSelection.slice(0, 6);
    } catch (e) {
      console.error("Failed to fetch recommendations", e);
    } finally {
      recommendationsLoading = false;
    }
  }

  async function verifyIncomingOffer(did: string) {
    if (!agent || !agent.assertDid) return;
    verifying = true;
    isValidOffer = false;

    // 1. Basic DID check
    if (!did.startsWith("did:")) {
      verifying = false;
      return;
    }

    // 2. Resolve PDS (Robust Cross-PDS)
    let pdsAgent = agent;
    const pdsUrl = await getPdsEndpoint(did);
    if (pdsUrl) {
      // Create unauthenticated agent for that PDS
      pdsAgent = new Agent(pdsUrl);
    }

    // 3. Query Repo for Offer
    try {
      let cursor: string | undefined;
      let count = 0;
      const MAX_SEARCH = 300; // Search up to 300 recent transactions

      while (count < MAX_SEARCH) {
        const res = await pdsAgent.com.atproto.repo.listRecords({
          repo: did, // Now hitting the correct PDS
          collection: TRANSACTION_COLLECTION,
          limit: 100,
          cursor,
        });

        const foundOffer = res.data.records.find((r) => {
          const t = r.value as unknown as Transaction;
          // Verify target matches ME (My Agent's DID)
          return t.partner === agent!.assertDid && t.status === "offered";
        });

        if (foundOffer) {
          // Found it!
          const offer = foundOffer; // Create local reference to break loop logic if I were using 'break' but I can just set it and break.

          // Logic from original code block
          isValidOffer = true;
          incomingStickers = await fetchStickersForTransaction(
            agent!,
            offer.value as unknown as Transaction,
            did,
          );
          const t = offer.value as unknown as Transaction;
          if (t.message) {
            incomingMessage = t.message;
          }

          // Fetch Offerer Profile
          try {
            const profileRes = await publicAgent.getProfile({ actor: did });
            offererProfile = profileRes.data;
          } catch (e) {
            console.warn("Failed to fetch offerer profile", e);
          }
          break; // Stop searching
        }

        cursor = res.data.cursor;
        count += res.data.records.length;
        if (!cursor) break;
      }
    } catch (e) {
      console.error("Failed to verify offer", e);
      // Fallback: If pdsAgent failed, maybe main agent works? (Unlikely if different PDS)
    } finally {
      verifying = false;
    }
  }

  function selectUser(
    user: ProfileViewBasic | ProfileView | ProfileViewDetailed,
  ) {
    partnerHandle = user.handle;
    partnerDid = user.did;
  }

  // Check Partner Handle (Manual fallback)
  async function resolvePartner() {
    if (!agent || !partnerHandle) return;
    resolveError = "";
    try {
      const res = await agent.resolveHandle({ handle: partnerHandle });
      partnerDid = res.data.did;
    } catch (e) {
      resolveError = i18n.t.exchange.userNotFound;
      partnerDid = null;
    }
  }

  function toggleSticker(uri: string) {
    if (selectedStickers.has(uri)) {
      selectedStickers.delete(uri);
    } else {
      selectedStickers.add(uri);
    }
    selectedStickers = new Set(selectedStickers); // Reassign for reactivity
  }

  // Handle Initiate (Send Offer)
  async function handleInitiate() {
    if (!agent || !partnerDid) return;
    if (selectedStickers.size === 0) {
      alert(i18n.t.exchange.selectToGive.replace("{n}", "1")); // Fallback message
      return;
    }

    if (saveSettings) {
      localStorage.setItem("mentionOnBluesky", String(mentionOnBluesky));
    } else {
      localStorage.removeItem("mentionOnBluesky");
    }

    processingAction = "accept"; // Use 'accept' to mean "doing the primary positive action"

    try {
      const stickersToSend = myStickers.filter((s) =>
        selectedStickers.has(s.uri),
      );
      await createExchangePost(
        agent,
        partnerHandle,
        partnerDid,
        stickersToSend,
        mentionOnBluesky, // Pass flag
        proposalMessage, // Pass message
        false, // isEasyExchange = false
      );
      alert(i18n.t.exchange.offerSuccess);
      window.location.href = "/";
    } catch (e) {
      console.error(e);
      alert(i18n.t.exchange.failedToOffer);
    } finally {
      processingAction = null;
    }
  }

  // Handle Accept
  async function handleAccept() {
    if (!agent || !targetUserParam) return;
    if (selectedStickers.size === 0) {
      alert(i18n.t.exchange.selectToGive.replace("{n}", "1"));
      return;
    }

    processingAction = "accept";
    try {
      await acceptExchange(
        agent,
        targetUserParam,
        Array.from(selectedStickers),
        acceptanceMessage, // Pass message
      );
      successAccept = true;
    } catch (e) {
      console.error("Exchange failed", e);
      alert("Failed to accept exchange. See console.");
    } finally {
      processingAction = null;
    }
  }

  // Handle Reject
  async function handleReject() {
    if (!agent || !targetUserParam) return;
    if (!confirm(i18n.t.exchange.rejectConfirm)) return;

    processingAction = "reject";
    try {
      await rejectExchange(agent, targetUserParam);
      successReject = true;
    } catch (e) {
      console.error("Rejection failed", e);
      alert("Failed to reject exchange. See console.");
    } finally {
    }
  }

  // Handle Easy Exchange
  async function startEasyExchange() {
    if (!agent) return;
    if (selectedStickers.size === 0) {
      alert(i18n.t.exchange.selectToGive.replace("{n}", "1"));
      return;
    }

    findingPartner = true;
    matchedPartner = null;

    const count = selectedStickers.size;
    const offeredIds = Array.from(selectedStickers);
    const stickersToSend = myStickers.filter((s) =>
      selectedStickers.has(s.uri),
    );

    try {
      // 1. Search for partner
      const found = await findEasyExchangePartner(
        agent,
        count,
        offeredIds,
        excludeDids,
      );

      if (found) {
        matchedPartner = found;
        partnerDid = found.did; // Set for acceptance context
      } else {
        // 2. No partner -> Create Pending
        await createExchangePost(
          agent,
          null,
          null,
          stickersToSend,
          false, // No post
          undefined,
          true, // isEasyExchange = true
        );
        alert(i18n.t.exchange.easyExchangePending);
        window.location.href = "/";
      }
    } catch (e) {
      console.error(e);
      alert(i18n.t.exchange.failedToOffer);
    } finally {
      findingPartner = false;
    }
  }

  async function acceptEasyExchange() {
    if (!agent || !matchedPartner) return;
    processingAction = "accept";
    try {
      await acceptExchange(
        agent,
        matchedPartner.did,
        Array.from(selectedStickers),
      );
      successAccept = true;
      alert(i18n.t.exchange.acceptedTitle);
      window.location.href = "/";
    } catch (e) {
      console.error(e);
      alert("Failed to exchange.");
    } finally {
      processingAction = null;
    }
  }

  function rejectEasyMatch() {
    if (matchedPartner) {
      excludeDids.push(matchedPartner.did);
      matchedPartner = null;
      startEasyExchange();
    }
  }
</script>

<div class="min-h-screen bg-surface">
  <div class="max-w-6xl mx-auto p-4 md:p-8 flex flex-col items-center">
    <header class="w-full flex justify-between items-center mb-8">
      <a href="/" class="text-gray-500 hover:text-primary"
        >← {i18n.t.exchange.backToBook}</a
      >
      <h1 class="text-2xl font-bold text-primary">{i18n.t.exchange.title}</h1>
      <div class="w-20"></div>
    </header>

    {#if loading}
      <div
        class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mt-20"
      ></div>
    {:else if !agent}
      <div class="card-glass max-w-md w-full text-center p-8 mt-10">
        <h2 class="text-2xl font-bold mb-2">
          {i18n.t.exchange.signInRequired}
        </h2>
        <p class="mb-8 text-gray-600 text-sm">
          {i18n.t.exchange.signInMessage}
        </p>
        <SignInForm />
      </div>
    {:else if targetUserParam}
      <!-- ACCEPT MODE -->
      {#if verifying}
        <div class="text-center mt-20">
          <div
            class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"
          ></div>
          <p class="text-gray-500">{i18n.t.exchange.verifying}</p>
        </div>
      {:else if isValidOffer}
        {#if successAccept}
          <div class="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md">
            <h2 class="text-3xl font-bold text-green-500 mb-4">
              {i18n.t.exchange.acceptedTitle}
            </h2>
            <p class="text-gray-600 mb-8">
              {i18n.t.exchange.acceptedMessage}
            </p>
            <a href="/" class="btn-primary">{i18n.t.exchange.viewBook}</a>
          </div>
        {:else if successReject}
          <div class="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md">
            <h2 class="text-3xl font-bold text-gray-500 mb-4">
              {i18n.t.exchange.rejectedTitle}
            </h2>
            <p class="text-gray-600 mb-8">
              {i18n.t.exchange.rejectedMessage}
            </p>
            <a href="/" class="btn-primary">{i18n.t.exchange.viewBook}</a>
          </div>
        {:else}
          <div
            class="bg-white p-8 rounded-2xl shadow-xl max-w-2xl text-center w-full"
          >
            <h2 class="text-2xl font-bold mb-2">
              {i18n.t.exchange.incomingTitle}
            </h2>
            <p class="text-gray-600 mb-6">
              {offererProfile?.displayName ||
                offererProfile?.handle ||
                targetUserParam}
              {i18n.t.exchange.wantsToSwap}
            </p>

            {#if incomingMessage}
              <div
                class="mb-6 p-4 bg-yellow-50 text-gray-700 italic border-l-4 border-yellow-300 rounded-r-lg shadow-sm"
              >
                "{incomingMessage}"
              </div>
            {/if}

            {#if incomingStickers.length > 0}
              <div class="mb-6 text-left">
                <h3 class="text-lg font-bold mb-2">
                  {i18n.t.exchange.willReceive.replace(
                    "{n}",
                    incomingStickers.length.toString(),
                  )}
                </h3>
                <div
                  class="flex gap-2 overflow-x-auto min-h-[160px] p-2 bg-gray-50 rounded-xl"
                >
                  {#each incomingStickers as s}
                    <div class="w-32 h-32 flex-shrink-0 relative">
                      <StickerCanvas
                        avatarUrl={typeof s.image === "string" ? s.image : ""}
                        staticAngle={true}
                      />
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="mb-6 text-left">
              <h3 class="text-lg font-bold mb-2">
                {i18n.t.exchange.selectToGive.replace(
                  "{n}",
                  selectedStickers.size.toString(),
                )}
              </h3>

              {#if myStickers.length === 0}
                <p class="text-gray-500 italic text-center py-4">
                  {i18n.t.exchange.noStickers}
                </p>
              {:else}
                <div
                  class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[300px] overflow-y-auto p-4 border rounded-xl bg-gray-50"
                >
                  {#each myStickers as sticker}
                    <div
                      class="sticker-card-interactive overflow-hidden"
                      onclick={() => toggleSticker(sticker.uri)}
                      role="button"
                      tabindex="0"
                      onkeydown={(e) =>
                        e.key === "Enter" && toggleSticker(sticker.uri)}
                    >
                      <div class="aspect-square w-full max-w-[96px] mx-auto">
                        <StickerCanvas
                          avatarUrl={typeof sticker.image === "string"
                            ? sticker.image
                            : ""}
                          staticAngle={true}
                        />
                      </div>
                      {#if selectedStickers.has(sticker.uri)}
                        <div
                          class="absolute inset-0 bg-primary/10 border-4 border-primary rounded-xl flex items-start justify-end p-2"
                        >
                          <span
                            class="bg-primary text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-sm"
                            >✓</span
                          >
                        </div>
                      {/if}
                      <div
                        class="p-1 text-center text-xs text-gray-500 truncate border-t border-gray-50"
                      >
                        {sticker.name ||
                          (i18n.lang === "ja"
                            ? `${sticker.profile?.displayName || sticker.profile?.handle || "だれか"}のシール`
                            : `${sticker.profile?.displayName || sticker.profile?.handle || "Unknown"}'s sticker`)}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="mb-6 text-left">
              <label
                for="acceptanceMessage"
                class="block text-sm font-medium text-gray-700 mb-1"
                >{i18n.t.exchange.messageLabel}</label
              >
              <input
                id="acceptanceMessage"
                type="text"
                bind:value={acceptanceMessage}
                placeholder={i18n.t.exchange.messagePlaceholder}
                class="input-text w-full"
                maxlength="100"
              />
            </div>

            <div class="flex justify-center space-x-4">
              <a
                href="/"
                class="px-4 py-2 text-gray-500 hover:text-gray-700 self-center"
                >{i18n.t.common.cancel}</a
              >
              <button
                onclick={handleReject}
                disabled={processingAction !== null}
                class="px-4 py-2 text-red-500 hover:text-red-700 font-bold"
              >
                {processingAction === "reject"
                  ? i18n.t.exchange.rejecting
                  : i18n.t.exchange.rejectAction}
              </button>
              <button
                onclick={handleAccept}
                disabled={processingAction !== null ||
                  selectedStickers.size === 0}
                class="btn-secondary"
              >
                {processingAction === "accept"
                  ? i18n.t.exchange.exchanging
                  : i18n.t.exchange.exchangeAction}
              </button>
            </div>
          </div>
        {/if}
      {:else}
        <!-- Invalid Offer -->
        <div class="bg-white p-8 rounded-2xl shadow-xl max-w-md text-center">
          <h2 class="text-xl font-bold text-red-500 mb-4">
            {i18n.t.exchange.invalidLink}
          </h2>
          <p class="text-gray-600 mb-6">
            {i18n.t.exchange.invalidMessage}
          </p>
          <a
            href="/exchange"
            class="bg-gray-100 text-gray-700 font-bold py-2 px-6 rounded-lg hover:bg-gray-200"
          >
            {i18n.t.exchange.startNew}
          </a>
        </div>
      {/if}
    {:else}
      <!-- INITIATE MODE -->
      <div
        class="w-full max-w-4xl card-glass-strong p-8 relative border-2 border-white"
      >
        <h2 class="text-xl font-bold mb-4">{i18n.t.exchange.startNew}</h2>

        <!-- 1. Select Partner -->
        <div class="mb-6 relative z-10">
          <!-- Tabs -->
          <div class="flex gap-4 mb-4 border-b border-gray-200">
            <button
              class="px-4 py-2 font-medium transition-colors border-b-2 {activeTab ===
              'recommend'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'}"
              onclick={() => (activeTab = "recommend")}
            >
              {i18n.t.exchange.recommendTab}
            </button>
            <button
              class="px-4 py-2 font-medium transition-colors border-b-2 {activeTab ===
              'search'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'}"
              onclick={() => (activeTab = "search")}
            >
              {i18n.t.exchange.searchTab}
            </button>
            <button
              class="px-4 py-2 font-medium transition-colors border-b-2 {activeTab ===
              'easy'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'}"
              onclick={() => (activeTab = "easy")}
            >
              {i18n.t.exchange.easyExchangeTab}
            </button>
          </div>

          {#if activeTab === "recommend"}
            <div class="mb-4">
              <h3 class="text-sm font-bold text-gray-700 mb-2">
                {i18n.t.exchange.recommendedUsers}
              </h3>
              {#if recommendationsLoading}
                <div class="flex justify-center p-4">
                  <div
                    class="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"
                  ></div>
                </div>
              {:else if recommendedUsers.length === 0}
                <p class="text-gray-500 text-sm">
                  {i18n.t.exchange.noRecommendations}
                </p>
              {:else}
                <div
                  class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"
                >
                  {#each recommendedUsers as user}
                    <button
                      class="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 hover:border-primary/30 transition-all text-left group"
                      onclick={() => selectUser(user)}
                    >
                      {#if user.avatar}
                        <img
                          src={user.avatar}
                          alt={user.handle}
                          class="w-10 h-10 rounded-full bg-gray-200 object-cover"
                        />
                      {:else}
                        <div class="w-10 h-10 rounded-full bg-gray-200"></div>
                      {/if}
                      <div class="flex-1 min-w-0">
                        <div
                          class="font-bold text-gray-800 text-sm truncate group-hover:text-primary transition-colors"
                        >
                          {user.displayName || user.handle}
                        </div>
                        <div class="text-xs text-gray-500 truncate">
                          @{user.handle}
                        </div>
                      </div>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          {#if activeTab === "search"}
            <label
              for="partnerHandle"
              class="block text-sm font-medium text-gray-700 mb-1"
              >{i18n.t.exchange.partnerLabel}</label
            >
            <div class="flex gap-2">
              <ActorTypeahead
                id="partnerHandle"
                bind:value={partnerHandle}
                onSelect={(user) => {
                  partnerDid = user.did;
                  resolveError = "";
                }}
                onEnter={resolvePartner}
                placeholder={i18n.t.exchange.partnerPlaceholder}
                className="flex-1"
              />
              <button
                onclick={resolvePartner}
                class="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg font-medium text-gray-700"
              >
                {i18n.t.exchange.check}
              </button>
            </div>
          {/if}

          {#if activeTab === "easy"}
            <div class="mb-4">
              <p class="text-sm text-gray-600 mb-4">
                {i18n.t.exchange.easyExchangeDesc}
              </p>

              {#if findingPartner}
                <div
                  class="flex items-center justify-center p-8 bg-gray-50 rounded-xl"
                >
                  <div
                    class="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mr-3"
                  ></div>
                  <span class="text-primary font-bold"
                    >{i18n.t.exchange.searchingPartner}</span
                  >
                </div>
              {:else if matchedPartner}
                <div
                  class="bg-green-50 border border-green-200 p-4 rounded-xl mb-4"
                >
                  <h3 class="font-bold text-green-800 mb-2">
                    {i18n.t.exchange.foundPartner}
                  </h3>
                  <p class="text-green-700 mb-4">
                    {i18n.t.exchange.foundPartnerDesc.replace(
                      "{name}",
                      matchedPartner.profile?.displayName ||
                        matchedPartner.profile?.handle ||
                        matchedPartner.did,
                    )}
                  </p>
                  <!-- Show stickers they offer -->
                  <div
                    class="flex gap-2 overflow-x-auto p-2 bg-white/50 rounded-lg mb-4"
                  >
                    {#each matchedPartner.stickers as s}
                      <div class="w-16 h-16 flex-shrink-0">
                        <StickerCanvas
                          avatarUrl={typeof s.image === "string" ? s.image : ""}
                          staticAngle={true}
                        />
                      </div>
                    {/each}
                  </div>

                  <div class="flex gap-3">
                    <button
                      onclick={rejectEasyMatch}
                      class="bg-white text-gray-500 border border-gray-300 px-4 py-2 rounded-lg font-bold hover:bg-gray-100 flex-1"
                    >
                      {i18n.t.exchange.reject}
                    </button>
                    <button
                      onclick={acceptEasyExchange}
                      disabled={processingAction !== null}
                      class="bg-primary text-white px-4 py-2 rounded-lg font-bold hover:bg-primary-dark flex-1 shadow-md"
                    >
                      {i18n.t.exchange.exchangeAction}
                    </button>
                  </div>
                </div>
              {:else}
                <!-- Initial state for Easy Tab -->
                <!-- Logic: User selects stickers BELOW, then clicks button? -->
                <!-- But the "Select Partner" block is typically Step 1, "Select Stickers" Step 2 -->
                <!-- If Easy Tab is active, we don't need to select partner name. match starts when we click "Start" -->
                <!-- So we should show the "Start" button AFTER selecting stickers? -->
                <!-- Currently the UI flow is Top: Select Partner, Bottom: Select Stickers, Then: Action Button -->

                <!-- We should update the Action Button logic at the bottom to handle easy exchange -->
              {/if}
            </div>
          {/if}

          {#if resolveError}<p class="text-red-500 text-sm mt-1">
              {resolveError}
            </p>{/if}
          {#if partnerDid}<p class="text-green-600 text-sm mt-1">
              {i18n.t.exchange.selectedPartner.replace(
                "{handle}",
                partnerHandle,
              )}
            </p>{/if}
        </div>

        <!-- 2. Select Stickers -->
        {#if partnerDid || activeTab === "easy"}
          <div class="mb-6">
            <h3 class="block text-sm font-bold text-gray-700 mb-2">
              {i18n.t.exchange.selectStickersToOffer.replace(
                "{n}",
                selectedStickers.size.toString(),
              )}
            </h3>
            {#if myStickers.length === 0}
              <p class="text-gray-500 italic">
                You assume to have stickers, but you have none...
              </p>
            {:else}
              <div
                class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-[500px] overflow-y-auto p-4 border rounded-xl bg-gray-50"
              >
                {#each myStickers as sticker}
                  <div
                    class="sticker-card-interactive overflow-hidden"
                    onclick={() => toggleSticker(sticker.uri)}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) =>
                      e.key === "Enter" && toggleSticker(sticker.uri)}
                  >
                    <div class="aspect-square w-full max-w-[128px] mx-auto">
                      <StickerCanvas
                        avatarUrl={sticker.image as string}
                        staticAngle={true}
                      />
                    </div>
                    {#if selectedStickers.has(sticker.uri)}
                      <div
                        class="absolute inset-0 bg-primary/10 border-4 border-primary rounded-xl flex items-start justify-end p-2"
                      >
                        <span
                          class="bg-primary text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-sm"
                          >✓</span
                        >
                      </div>
                    {/if}
                    <div
                      class="p-2 text-center text-xs text-gray-500 truncate border-t border-gray-50"
                    >
                      {sticker.name ||
                        (i18n.lang === "ja"
                          ? `${sticker.profile?.displayName || sticker.profile?.handle || "だれか"}のシール`
                          : `${sticker.profile?.displayName || sticker.profile?.handle || "Unknown"}'s sticker`)}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <div class="mb-4">
            <label
              for="proposalMessage"
              class="block text-sm font-medium text-gray-700 mb-1"
              >{i18n.t.exchange.messageLabel}</label
            >
            <input
              id="proposalMessage"
              type="text"
              bind:value={proposalMessage}
              placeholder={i18n.t.exchange.messagePlaceholder}
              class="input-text w-full"
              maxlength="100"
            />
          </div>

          {#if activeTab !== "easy"}
            <div class="flex flex-col gap-2 mb-4 justify-end items-end">
              <label
                class="flex items-center gap-2 cursor-pointer text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  bind:checked={mentionOnBluesky}
                  class="rounded text-primary focus:ring-primary"
                />
                {i18n.t.exchange.mentionOnBluesky}
              </label>
              <label
                class="flex items-center gap-2 cursor-pointer text-sm text-gray-500"
              >
                <input
                  type="checkbox"
                  bind:checked={saveSettings}
                  class="rounded text-gray-500 focus:ring-gray-400"
                />
                {i18n.t.exchange.saveSettings}
              </label>
            </div>
          {/if}

          <div class="flex justify-end">
            <button
              onclick={activeTab === "easy"
                ? startEasyExchange
                : handleInitiate}
              disabled={processingAction !== null ||
                selectedStickers.size === 0 ||
                (activeTab === "easy" && findingPartner)}
              class="btn-secondary"
            >
              {processingAction === "accept" ||
              (activeTab === "easy" && findingPartner)
                ? activeTab === "easy"
                  ? i18n.t.exchange.searchingPartner
                  : i18n.t.exchange.sending
                : activeTab === "easy"
                  ? i18n.t.exchange.exchangeAction
                  : i18n.t.exchange.createOffer}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
