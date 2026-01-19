<script lang="ts">
  import { settings } from "$lib/settings.svelte";

  const options = [
    {
      value: "system",
      label: settings.t.settings.themeSystem,
      icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5",
    },
    {
      value: "light",
      label: settings.t.settings.themeLight,
      icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
    },
    {
      value: "dark",
      label: settings.t.settings.themeDark,
      icon: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z",
    },
  ];
</script>

<div
  class="flex items-center bg-gray-100 dark:bg-gray-800 rounded-full p-1 w-full"
>
  {#each options as option}
    <button
      onclick={() =>
        (settings.theme = option.value as "system" | "light" | "dark")}
      class={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-full text-sm font-medium transition-all duration-200 ${
        settings.theme === option.value
          ? "bg-white dark:bg-gray-600 text-primary shadow-sm"
          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      }`}
      aria-label={option.label}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d={option.icon} />
      </svg>
      <span class="hidden sm:inline">{option.label}</span>
    </button>
  {/each}
</div>
