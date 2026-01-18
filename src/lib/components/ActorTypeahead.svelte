<script lang="ts">
  import { publicAgent } from "$lib/atproto";
  import type { ProfileViewBasic } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
  import { settings } from "$lib/settings.svelte";
  import { fly } from "svelte/transition";

  interface Props {
    id?: string;
    value: string;
    placeholder?: string;
    onSelect?: (user: ProfileViewBasic) => void;
    onEnter?: () => void;
    className?: string;
  }

  let {
    id,
    value = $bindable(),
    placeholder = "",
    onSelect,
    onEnter,
    className = "",
  }: Props = $props();

  let searchResults = $state<ProfileViewBasic[]>([]);
  let showDropdown = $state(false);
  let searchTimeout: ReturnType<typeof setTimeout>;

  function handleInput(e: Event) {
    const inputValue = (e.target as HTMLInputElement).value;
    value = inputValue;
    showDropdown = true;

    clearTimeout(searchTimeout);
    if (!inputValue) {
      searchResults = [];
      return;
    }

    searchTimeout = setTimeout(async () => {
      try {
        const res = await publicAgent.searchActorsTypeahead({
          term: inputValue,
          limit: 5,
        });
        searchResults = res.data.actors;
      } catch (e) {
        console.error("Typeahead search failed", e);
      }
    }, 300);
  }

  function selectUser(user: ProfileViewBasic) {
    value = user.handle;
    showDropdown = false;
    searchResults = [];
    onSelect?.(user);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      onEnter?.();
      showDropdown = false;
    }
  }

  // Click outside to close
  function handleOuterClick() {
    showDropdown = false;
  }
</script>

<div class="relative w-full {className}">
  <input
    {id}
    type="text"
    {value}
    oninput={handleInput}
    onkeydown={handleKeydown}
    {placeholder}
    class="input-text w-full"
  />

  {#if showDropdown && searchResults.length > 0}
    <!-- Backdrop to capture click outside -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-40" onclick={handleOuterClick}></div>

    <div
      class="absolute top-full left-0 w-full bg-white border border-gray-200 rounded-lg shadow-xl mt-1 max-h-60 overflow-y-auto z-50 text-left"
      transition:fly={{ y: -5, duration: 150 }}
    >
      {#each searchResults as user}
        <button
          class="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2 border-b last:border-b-0"
          onclick={() => selectUser(user)}
        >
          {#if user.avatar}
            <img
              src={user.avatar}
              alt={user.handle}
              class="w-8 h-8 rounded-full object-cover"
            />
          {:else}
            <div class="w-8 h-8 rounded-full bg-gray-200"></div>
          {/if}
          <div class="flex-1 min-w-0">
            <div class="font-bold text-sm truncate">
              {user.displayName || user.handle}
            </div>
            <div class="text-xs text-gray-500 truncate">@{user.handle}</div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>
