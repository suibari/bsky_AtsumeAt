<script lang="ts">
	import "../app.css";

	let { children } = $props();
	import ShapeDefinitions from "$lib/components/ShapeDefinitions.svelte";
</script>

<ShapeDefinitions />
{@render children()}
