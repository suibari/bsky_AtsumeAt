<script lang="ts">
	import "../app.css";
	import { settings } from "$lib/settings.svelte";

	let { children } = $props();
	import ShapeDefinitions from "$lib/components/ShapeDefinitions.svelte";
</script>

<ShapeDefinitions />
{@render children()}
