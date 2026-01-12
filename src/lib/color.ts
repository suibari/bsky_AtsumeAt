// Utility to extract dominant color from an image URL
// Optimized for performance:
// 1. Scaled down to 50x50
// 2. Client-side caching
// 3. Simple bucket sort for dominant color

const colorCache = new Map<string, string>();

export async function getDominantColor(imageUrl: string): Promise<string> {
  if (!imageUrl) return '#fbbf24'; // default yellow
  if (colorCache.has(imageUrl)) return colorCache.get(imageUrl)!;

  // Create an image element
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imageUrl;

  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
  } catch (e) {
    console.warn("Failed to load image for color extraction", e);
    return '#fbbf24';
  }

  // Draw to small canvas
  const size = 50;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '#fbbf24';

  ctx.drawImage(img, 0, 0, size, size);

  try {
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    // Bucket sort (quantize to 20x20x20 colors approx)
    // Actually, simple RGB quantization.
    // Let's use a step of 32 (8 buckets per channel) -> 512 total buckets
    // Key format: "r,g,b" (r,g,b are quantized)

    const buckets: Record<string, { r: number, g: number, b: number, count: number }> = {};
    const step = 20;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a < 128) continue; // Skip transparent

      // Skip near-white (background)
      // Threshold: if r,g,b are all > 230
      if (r > 230 && g > 230 && b > 230) continue;

      // Quantize
      const qr = Math.floor(r / step) * step;
      const qg = Math.floor(g / step) * step;
      const qb = Math.floor(b / step) * step;

      const key = `${qr},${qg},${qb}`;
      if (!buckets[key]) {
        buckets[key] = { r: 0, g: 0, b: 0, count: 0 };
      }

      // Sum up actual colors in the bucket for better Average
      buckets[key].r += r;
      buckets[key].g += g;
      buckets[key].b += b;
      buckets[key].count++;
    }

    // Find max
    let maxCount = 0;
    let bestKey = "";

    // Fallback if empty image
    if (Object.keys(buckets).length === 0) return '#fbbf24';

    for (const k in buckets) {
      if (buckets[k].count > maxCount) {
        maxCount = buckets[k].count;
        bestKey = k;
      }
    }

    const best = buckets[bestKey];
    const avgR = Math.round(best.r / best.count);
    const avgG = Math.round(best.g / best.count);
    const avgB = Math.round(best.b / best.count);

    // Convert to hex
    const hex = `#${((1 << 24) + (avgR << 16) + (avgG << 8) + avgB).toString(16).slice(1)}`;

    colorCache.set(imageUrl, hex);
    return hex;

  } catch (e) {
    console.warn("CORS error usually", e);
    return '#fbbf24';
  }
}
