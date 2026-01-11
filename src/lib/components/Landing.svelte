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

  <div class="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
    <h2 class="text-2xl font-bold mb-6 text-gray-800">Sign In</h2>

    <div class="flex flex-col space-y-4">
      <input
        type="text"
        bind:value={handle}
        placeholder="bsky handle (e.g. alice.bsky.social)"
        class="border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
        onkeydown={(e) => e.key === "Enter" && handleLogin()}
      />

      <button
        onclick={handleLogin}
        disabled={loading}
        class="bg-primary text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-600 transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Please wait..." : "Sign In with Bluesky"}
      </button>
    </div>

    <div class="mt-8 text-sm text-gray-500">
      <p>Connect your account to start collecting stickers.</p>
    </div>
  </div>
</div>
