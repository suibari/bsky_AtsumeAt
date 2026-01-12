<script lang="ts">
  import { signIn } from "$lib/atproto";
  import { onMount } from "svelte";

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
  class="flex flex-col items-center justify-center min-h-screen bg-surface p-4 text-center"
>
  <h1 class="text-6xl font-bold mb-4 text-primary drop-shadow-md">
    あつめあっと
  </h1>
  <p class="text-xl text-gray-600 mb-12">Avatar Sticker Exchange on Bluesky</p>

  <div class="card-glass p-12 w-full max-w-md">
    <h2 class="text-2xl font-bold mb-6 text-gray-700">Sign In</h2>

    <div class="flex flex-col space-y-4">
      <input
        type="text"
        bind:value={handle}
        placeholder="bsky handle (e.g. alice.bsky.social)"
        class="input-text"
        onkeydown={(e) => e.key === "Enter" && handleLogin()}
      />

      <button
        onclick={handleLogin}
        disabled={loading}
        class="btn-primary hover:shadow-lg"
      >
        {loading ? "Please wait..." : "Sign In with Bluesky"}
      </button>
    </div>

    <div class="mt-8 text-sm text-gray-500">
      <p>Connect your account to start collecting stickers.</p>
    </div>
  </div>
</div>
