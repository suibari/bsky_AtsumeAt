<script lang="ts">
  import { onMount } from "svelte";
  import { getClient } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import { deleteAllData } from "$lib/hub";
  import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
  import ThemeSwitcher from "$lib/components/ThemeSwitcher.svelte";
  import { settings } from "$lib/settings.svelte";

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
    const confirmed = window.confirm(settings.t.settings.confirmDelete);
    if (confirmed) {
      isDeleting = true;
      try {
        await deleteAllData(agent);
        alert(settings.t.settings.deleteSuccess);
        window.location.href = "/";
      } catch (e) {
        console.error("Failed to delete data", e);
        alert("Failed to delete data. Check console for details.");
        isDeleting = false;
      }
    }
  }
</script>

<div class="min-h-screen bg-background text-text-primary">
  <header
    class="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md shadow-sm border-b border-primary/20 z-20 sticky top-0"
  >
    <div class="max-w-6xl mx-auto p-4 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <a
          href="/"
          class="text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-primary transition-colors"
          aria-label={settings.t.common.back}
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
        <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100">
          {settings.t.settings.title}
        </h1>
      </div>
      <div class="w-8"></div>
    </div>
  </header>

  <main class="max-w-xl mx-auto p-6 space-y-6">
    <div
      class="bg-white dark:bg-gray-900 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-800"
    >
      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
        {settings.t.settings.language}
      </h2>
      <div
        class="flex justify-center p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-primary/5 dark:border-gray-700"
      >
        <LanguageSwitcher />
      </div>
    </div>

    <div
      class="bg-white dark:bg-gray-900 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-800"
    >
      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
        {settings.t.settings.displaySettings}
      </h2>
      <div
        class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-primary/5 dark:border-gray-700"
      >
        <span class="text-gray-700 font-medium dark:text-gray-200"
          >{settings.t.settings.disableRotation}</span
        >
        <label class="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            class="sr-only peer"
            checked={settings.disableRotation}
            onchange={(e) =>
              settings.setDisableRotation(e.currentTarget.checked)}
          />
          <div
            class="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"
          ></div>
        </label>
      </div>

      <div class="mt-6">
        <h3
          class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider"
        >
          {settings.t.settings.theme}
        </h3>
        <ThemeSwitcher />
      </div>
    </div>

    <div
      class="bg-white dark:bg-gray-900 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-800"
    >
      <h2 class="text-lg font-semibold text-red-600 dark:text-red-400 mb-4">
        {settings.t.settings.dangerZone}
      </h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
        {settings.t.settings.dangerMessage}
      </p>

      <button
        onclick={handleDeleteAll}
        disabled={isDeleting}
        class="w-full py-3 px-4 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 font-bold rounded-lg border border-red-200 dark:border-red-900/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {#if isDeleting}
          <div
            class="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600 dark:border-red-400"
          ></div>
          {settings.t.settings.deleting}
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
          {settings.t.settings.deleteAll}
        {/if}
      </button>
    </div>
  </main>
</div>
