<script lang="ts">
  import { i18n } from "$lib/i18n.svelte";

  function setLanguage(lang: "ja" | "en") {
    i18n.lang = lang;
  }
</script>

<div
  class="flex items-center gap-1 bg-white/50 backdrop-blur-sm p-1 rounded-full border border-primary/10 shadow-sm w-fit"
>
  <button
    onclick={() => setLanguage("ja")}
    class="px-3 py-1 rounded-full text-xs font-bold transition-all {i18n.lang ===
    'ja'
      ? 'bg-primary text-white shadow-md'
      : 'text-gray-500 hover:text-primary'}"
  >
    日本語
  </button>
  <button
    onclick={() => setLanguage("en")}
    class="px-3 py-1 rounded-full text-xs font-bold transition-all {i18n.lang ===
    'en'
      ? 'bg-primary text-white shadow-md'
      : 'text-gray-500 hover:text-primary'}"
  >
    EN
  </button>
</div>
