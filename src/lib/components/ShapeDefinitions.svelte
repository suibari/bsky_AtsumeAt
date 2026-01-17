<script lang="ts">
  import { SVG_DEFS } from "$lib/shapes";
</script>

<!-- Global Definitions for complex shapes -->
<!-- We use a size 0x0 svg that just defines the clipPaths -->
<!-- Note: We use scale(1/24) because our paths are 24x24 but visual is 0..1 bounding box -->
<svg
  width="0"
  height="0"
  class="absolute pointer-events-none opacity-0"
  aria-hidden="true"
>
  <defs>
    {#each Object.entries(SVG_DEFS) as [name, def]}
      <clipPath id="shape-{name}" clipPathUnits="objectBoundingBox">
        <path
          d={def.d}
          transform="scale({1 / def.viewBox[0]}, {1 / def.viewBox[1]})"
        />
      </clipPath>
    {/each}
  </defs>
</svg>
