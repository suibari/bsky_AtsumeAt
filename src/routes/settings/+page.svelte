<script lang="ts">
  import { onMount } from "svelte";
  import { getClient } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import { deleteAllData } from "$lib/hub";

  let agent = $state<Agent | null>(null);
  let isDeleting = $state(false);

  onMount(async () => {
    const c = getClient();
    if (c) {
      const res = await c.init();
      if (res) {
        agent = new Agent(res.session);
      }
    }
  });

  async function handleDeleteAll() {
    if (!agent) return;
    const confirmed = window.confirm(
      "Are you sure? This will delete ALL your AtsumeAt data (Stickers, Config, Transactions). This action cannot be undone.",
    );
    if (confirmed) {
      isDeleting = true;
      try {
        await deleteAllData(agent);
        alert("All data deleted. Redirecting to landing page.");
        window.location.href = "/";
      } catch (e) {
        console.error("Failed to delete data", e);
        alert("Failed to delete data. Check console for details.");
        isDeleting = false;
      }
    }
  }
</script>

<div class="min-h-screen bg-surface">
  <header class="bg-white shadow z-20">
    <div class="max-w-6xl mx-auto p-4 flex items-center gap-4">
      <a
        href="/"
        class="text-gray-600 hover:text-primary transition-colors"
        aria-label="Back to home"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
      </a>
      <h1 class="text-xl font-bold text-gray-800">Settings</h1>
    </div>
  </header>

  <main class="max-w-xl mx-auto p-6">
    <div class="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
      <h2 class="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>
      <p class="text-sm text-gray-600 mb-6">
        Once you delete your data, there is no going back. Please be certain.
      </p>

      <button
        onclick={handleDeleteAll}
        disabled={isDeleting}
        class="w-full py-3 px-4 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg border border-red-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {#if isDeleting}
          <div
            class="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600"
          ></div>
          Deleting...
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
          Delete All Data
        {/if}
      </button>
    </div>
  </main>
</div>
