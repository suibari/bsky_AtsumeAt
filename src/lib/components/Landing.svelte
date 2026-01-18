<script lang="ts">
  import { settings } from "$lib/settings.svelte";
  import LanguageSwitcher from "./LanguageSwitcher.svelte";
  import AboutModal from "./AboutModal.svelte";
  import SignInForm from "./SignInForm.svelte";

  let showAbout = $state(false);
</script>

<div
  class="flex flex-col items-center justify-center min-h-screen bg-surface p-4 text-center relative"
>
  <div class="flex-grow flex flex-col items-center justify-center">
    <h1 class="text-6xl font-bold mb-4 text-primary drop-shadow-md">
      {settings.t.appName}
    </h1>
    <p class="text-xl text-gray-600 mb-12">{settings.t.landing.tagline}</p>

    <div class="card-glass p-12 w-full max-w-md">
      <h2 class="text-2xl font-bold mb-6 text-gray-700">
        {settings.t.landing.signIn}
      </h2>

      <SignInForm />
    </div>
  </div>

  <div class="py-8 flex flex-col items-center gap-4">
    <button
      onclick={() => (showAbout = true)}
      class="text-sm text-gray-500 hover:text-primary transition-colors font-medium"
    >
      {settings.t.header.about}
    </button>
    <LanguageSwitcher />
  </div>

  {#if showAbout}
    <AboutModal onClose={() => (showAbout = false)} />
  {/if}
</div>
