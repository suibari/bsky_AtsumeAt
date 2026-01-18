<script lang="ts">
  import { signIn } from "$lib/atproto";
  import { settings } from "$lib/settings.svelte";
  import ActorTypeahead from "./ActorTypeahead.svelte";

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

<div class="flex flex-col space-y-4">
  <ActorTypeahead
    bind:value={handle}
    placeholder={settings.t.landing.handlePlaceholder}
    onEnter={handleLogin}
  />

  <button
    onclick={handleLogin}
    disabled={loading}
    class="btn-primary hover:shadow-lg w-full"
  >
    {loading ? settings.t.common.loading : settings.t.landing.signInWithBluesky}
  </button>

  <div class="mt-4 text-sm text-gray-500 text-center">
    <p>{settings.t.landing.connectMessage}</p>
  </div>
</div>
