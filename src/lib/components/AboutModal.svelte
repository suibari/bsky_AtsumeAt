<script lang="ts">
  import { fade, scale } from "svelte/transition";

  let { onClose } = $props<{ onClose: () => void }>();
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
  onclick={onClose}
  transition:fade={{ duration: 200 }}
  role="dialog"
  aria-modal="true"
>
  <div
    class="card-glass-strong w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
    onclick={(e) => e.stopPropagation()}
    transition:scale={{ duration: 200, start: 0.95 }}
    role="document"
  >
    <!-- Header -->
    <div
      class="px-8 py-6 border-b border-primary/10 flex justify-between items-center bg-transparent"
    >
      <h2 class="text-2xl font-bold text-gray-700">About AtsumeAt</h2>
      <button
        onclick={onClose}
        class="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition"
        aria-label="Close"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
    </div>

    <!-- Content -->
    <div class="p-8 overflow-y-auto prose prose-sm text-gray-600">
      <p class="text-lg text-center font-medium text-gray-700 mb-6">
        AtsumeAt (あつめあっと) is a sticker collecting and exchanging app built
        on the AT Protocol (Bluesky).
      </p>
      <p>
        Every user gets their own unique sticker based on their profile. You can
        collect other users' stickers by exchanging with them!
      </p>

      <h3 class="text-gray-800 font-bold mt-4 mb-2">How to Play</h3>
      <ul class="list-disc pl-5 space-y-1">
        <li>
          <strong class="text-primary">Create:</strong> Customize your own sticker
          in the "Create Sticker" tab.
        </li>
        <li>
          <strong class="text-primary">Exchange:</strong> Find other users and propose
          an exchange to get their sticker.
        </li>
        <li>
          <strong class="text-primary">Collect:</strong> Build your Sticker Book
          with stickers from friends and the community.
        </li>
      </ul>

      <h3 class="text-gray-800 font-bold mt-4 mb-2">Credits</h3>
      <p>Created by Suibari.</p>

      <div class="mt-8 text-center text-xs text-gray-400">
        Version 0.1.0 Beta
      </div>
    </div>

    <!-- Footer -->
    <div class="p-6 border-t border-primary/10 bg-gray-50/50 flex justify-end">
      <button
        onclick={onClose}
        class="px-6 py-2 bg-white border-2 border-gray-200 rounded-full text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 focus:outline-none transition"
      >
        Close
      </button>
    </div>
  </div>
</div>
