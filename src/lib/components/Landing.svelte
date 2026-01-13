<script lang="ts">
  import { signIn } from "$lib/atproto";
  import { i18n } from "$lib/i18n.svelte";
  import LanguageSwitcher from "./LanguageSwitcher.svelte";

  let handle = $state("");
  let loading = $state(false);

  async function handleLogin() {
    if (!handle) return;
    loading = true;
    try {
      // Normalize handle if user entered @
      const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;

      if (window.location.pathname !== "/") {
        localStorage.setItem(
          "returnUrl",
          window.location.pathname + window.location.search,
        );
      }

      await signIn(cleanHandle);
    } catch (e) {
      console.error(e);
      alert("Sign in failed. Check console.");
    } finally {
      loading = false;
    }
  }
</script>

<div
  class="flex flex-col items-center justify-center min-h-screen bg-surface p-4 text-center relative"
>
  <div class="flex-grow flex flex-col items-center justify-center">
    <h1 class="text-6xl font-bold mb-4 text-primary drop-shadow-md">
      {i18n.t.appName}
    </h1>
    <p class="text-xl text-gray-600 mb-12">{i18n.t.landing.tagline}</p>

    <div class="card-glass p-12 w-full max-w-md">
      <h2 class="text-2xl font-bold mb-6 text-gray-700">
        {i18n.t.landing.signIn}
      </h2>

      <div class="flex flex-col space-y-4">
        <input
          type="text"
          bind:value={handle}
          placeholder={i18n.t.landing.handlePlaceholder}
          class="input-text"
          onkeydown={(e) => e.key === "Enter" && handleLogin()}
        />

        <button
          onclick={handleLogin}
          disabled={loading}
          class="btn-primary hover:shadow-lg"
        >
          {loading ? i18n.t.common.loading : i18n.t.landing.signInWithBluesky}
        </button>
      </div>

      <div class="mt-8 text-sm text-gray-500">
        <p>{i18n.t.landing.connectMessage}</p>
      </div>
    </div>
  </div>

  <div class="py-8">
    <LanguageSwitcher />
  </div>
</div>
