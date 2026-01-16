<script lang="ts">
  import type { Achievement } from "$lib/achievements";
  import { i18n } from "$lib/i18n.svelte";

  let { achievements }: { achievements: Achievement[] } = $props();

  function getTierStyles(tier: number) {
    switch (tier) {
      case 1: // Bronze/Start
        return "bg-orange-50 text-orange-800 border-orange-200";
      case 2: // Silver/Blue
        return "bg-blue-50 text-blue-800 border-blue-200";
      case 3: // Gold/Purple
        return "bg-purple-50 text-purple-800 border-purple-200";
      case 4: // Platinum/Rainbow/Gold
        return "bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-900 border-amber-300 shadow-sm";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
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
        title={`Tier ${achievement.tier}`}
      >
        <span>{getIcon(achievement.type)}</span>
        <span>{i18n.resolve(achievement.titleKey)}</span>
      </div>
    {/each}
  </div>
{/if}
