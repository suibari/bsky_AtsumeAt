<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as THREE from "three";

  let { avatarUrl = "", staticAngle = false } = $props();

  let container: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let mesh: THREE.Mesh;
  let animationId: number;

  // Drag State
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };

  function onPointerDown(e: MouseEvent | TouchEvent) {
    if (staticAngle) return;
    isDragging = true;
    const x = "touches" in e ? e.touches[0].clientX : e.clientX;
    const y = "touches" in e ? e.touches[0].clientY : e.clientY;
    previousMousePosition = { x, y };
  }

  function onPointerMove(e: MouseEvent | TouchEvent) {
    if (staticAngle) return;
    if (!isDragging || !mesh) return;

    const x = "touches" in e ? e.touches[0].clientX : e.clientX;
    const y = "touches" in e ? e.touches[0].clientY : e.clientY;

    const deltaMove = {
      x: x - previousMousePosition.x,
      y: y - previousMousePosition.y,
    };

    // Rotate Mesh
    mesh.rotation.y += deltaMove.x * 0.01;

    previousMousePosition = { x, y };
  }

  function onPointerUp() {
    isDragging = false;
  }

  onMount(() => {
    if (!container) return;

    // Scene Setup
    scene = new THREE.Scene();
    // Transparent background
    scene.background = null;

    const width = container.clientWidth;
    const height = container.clientHeight;

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 3.5;

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(2, 2, 5);
    scene.add(directionalLight);

    // Geometry - A "Sticker" (thick card or simple plane)
    // Using a Cylinder for a "coin" or "token" look, or Box for card
    const geometry = new THREE.CylinderGeometry(1, 1, 0.05, 64);
    geometry.rotateX(Math.PI / 2); // Make it face camera

    // Material
    // Load Avatar Texture
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const placeholder = "https://bsky.social/about/images/favicon-32x32.png"; // Fallback
    const rawUrl = avatarUrl || placeholder;
    // Use local proxy to bypass CORS
    const urlToCheck = `/api/proxy?url=${encodeURIComponent(rawUrl)}`;

    loader.load(
      urlToCheck,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.center.set(0.5, 0.5);
        texture.rotation = Math.PI / 2;
        const materials = [
          // Side (Always Gold/Metallic)
          new THREE.MeshStandardMaterial({
            color: 0xffd700,
            metalness: 1.0,
            roughness: 0.3,
          }),
          // Top (Face) - Avatar (Slightly metallic)
          new THREE.MeshStandardMaterial({
            map: texture,
            metalness: 0.5,
            roughness: 0.2,
          }),
          // Bottom (Back)
          new THREE.MeshStandardMaterial({ color: 0xeeeeee }),
        ];
        // Cylinder uses [side, top, bottom]
        // But after rotation, indices might map differently?
        // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)
        // Materials array for Cylinder is [side, top, bottom]

        mesh = new THREE.Mesh(geometry, materials);

        // Future: Add particle system for sparkles here

        scene.add(mesh);
      },
      undefined,
      (err) => {
        console.error("Texture load failed", err);
      },
    );

    // Animation Loop
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      if (mesh) {
        // Gentle float
        mesh.position.y = Math.sin(Date.now() * 0.002) * 0.05;

        // Auto rotate if not dragging
        if (staticAngle) {
          mesh.rotation.y = 0.5; // Fixed angle
          mesh.rotation.x = 0;
        } else if (!isDragging) {
          mesh.rotation.y += 0.01;
          mesh.rotation.x = Math.sin(Date.now() * 0.001) * 0.1;
        } else {
          // Reset tilt or keep it?
          // Letting drag control Y, but maybe auto-tilt is confusing while dragging.
          // Let's just pause auto-tilt during drag to avoid fighting.
        }
      }
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      if (renderer) renderer.dispose();
      if (geometry) geometry.dispose();
      // Disposing materials/textures is also good practice
    };
  });
</script>

<div class="relative w-full h-full">
  <div bind:this={container} class="w-full h-full"></div>

  <!-- Interaction Overlay -->
  <div
    role="application"
    class="absolute inset-0 cursor-grab active:cursor-grabbing touch-none z-10"
    onmousedown={onPointerDown}
    onmousemove={onPointerMove}
    onmouseup={onPointerUp}
    onmouseleave={onPointerUp}
    ontouchstart={onPointerDown}
    ontouchmove={onPointerMove}
    ontouchend={onPointerUp}
  ></div>
</div>
