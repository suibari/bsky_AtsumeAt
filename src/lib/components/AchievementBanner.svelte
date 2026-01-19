<script lang="ts">
  import type { Achievement } from "$lib/achievements";
  import { settings } from "$lib/settings.svelte";

  let { achievements }: { achievements: Achievement[] } = $props();

  function getTierStyles(tier: number) {
    switch (tier) {
      case 1: // Mint Gradation (Fresh: Mint -> Teal)
        return "bg-gradient-to-r from-emerald-100 to-teal-300 text-teal-900 border-teal-300";
      case 2: // Sky Gradation (Cool: Sky -> Indigo)
        return "bg-gradient-to-r from-sky-100 to-indigo-300 text-indigo-900 border-indigo-300";
      case 3: // Pink Gradation (Sweet: Pink -> Rose)
        return "bg-gradient-to-r from-pink-100 to-rose-300 text-rose-900 border-rose-300";
      case 4: // Rainbow (Ultimate: Pink -> Yellow -> Sky)
        return "bg-gradient-to-r from-pink-200 via-yellow-200 to-sky-300 text-purple-900 border-purple-300 shadow-md";
      default:
        return "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700";
    }
  }

  function getIcon(type: "created" | "exchanges" | "likes") {
    switch (type) {
      case "created":
        return "🎨";
      case "exchanges":
        return "🤝";
      case "likes":
        return "👍";
    }
  }
  function getCondition(achievement: Achievement) {
    // Derive base key from titleKey (e.g. "achievements.exchange.1" -> "achievements.exchange")
    // This handles the singular/plural mismatch (type is 'exchanges' but key is 'exchange')
    const parts = achievement.titleKey.split(".");
    parts.pop();
    const key = `${parts.join(".")}.condition`;

    const template = settings.resolve(key);
    return template.replace("{n}", achievement.count.toString());
  }
</script>

{#if achievements.length > 0}
  <div class="flex flex-wrap gap-2 justify-center md:justify-start mt-3 mb-2">
    {#each achievements as achievement}
      <div
        class="
          {getTierStyles(achievement.tier)}
          border rounded-full px-3 py-1 text-xs font-bold
          flex items-center gap-1.5 transition hover:scale-105 cursor-default
        "
        title={getCondition(achievement)}
      >
        <span>{getIcon(achievement.type)}</span>
        <span>{settings.resolve(achievement.titleKey)}</span>
      </div>
    {/each}
  </div>
{/if}
