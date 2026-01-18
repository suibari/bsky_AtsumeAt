<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { settings } from "$lib/settings.svelte";

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
      <h2 class="text-2xl font-bold text-gray-700">{settings.t.info.title}</h2>
      <button
        onclick={onClose}
        class="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition"
        aria-label={settings.t.common.back}
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
        {settings.t.info.description}
      </p>

      <ul class="list-none pl-0 space-y-4">
        <li class="flex gap-3">
          <div
            class="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold"
          >
            1
          </div>
          <div>
            <strong class="text-primary block text-base"
              >{settings.t.info.step1}</strong
            >
            <span class="text-sm">{settings.t.info.step1Desc}</span>
          </div>
        </li>
        <li class="flex gap-3">
          <div
            class="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold"
          >
            2
          </div>
          <div>
            <strong class="text-primary block text-base"
              >{settings.t.info.step2}</strong
            >
            <span class="text-sm">{settings.t.info.step2Desc}</span>
          </div>
        </li>
        <li class="flex gap-3">
          <div
            class="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold"
          >
            3
          </div>
          <div>
            <strong class="text-primary block text-base"
              >{settings.t.info.step3}</strong
            >
            <span class="text-sm">{settings.t.info.step3Desc}</span>
          </div>
        </li>
        <li class="flex gap-3">
          <div
            class="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold"
          >
            4
          </div>
          <div>
            <strong class="text-primary block text-base"
              >{settings.t.info.step4}</strong
            >
            <span class="text-sm">{settings.t.info.step4Desc}</span>
          </div>
        </li>
      </ul>
    </div>

    <!-- Footer -->
    <div class="p-6 border-t border-primary/10 bg-gray-50/50 flex justify-end">
      <button
        onclick={onClose}
        class="px-6 py-2 bg-white border-2 border-gray-200 rounded-full text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 focus:outline-none transition"
      >
        {settings.t.common.ok}
      </button>
    </div>
  </div>
</div>
