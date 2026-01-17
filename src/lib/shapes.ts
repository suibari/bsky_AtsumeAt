export type StickerShape = "circle" | "square" | "star" | "heart" | "diamond" | "butterfly";

// Pure CSS clip-path shapes
export const CSS_SHAPES: Record<string, string> = {
  circle: "circle(50% at 50% 50%)",
  square: "inset(0% 0% 0% 0% round 15%)",
  star: "polygon(50% 0%, 66% 32%, 98% 35%, 72% 57%, 79% 91%, 50% 74%, 21% 91%, 28% 57%, 2% 35%, 34% 32%)",
  diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
};

// Complex shapes defined as SVG paths with their ViewBox dimensions
// We scale these down to 0..1 in the consuming component
export const SVG_DEFS: Record<string, { d: string; viewBox: [number, number] }> = {
  heart: {
    d: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
    viewBox: [24, 24],
  },
  butterfly: {
    d: "M3.468 1.948C5.303 3.325 7.276 6.118 8 7.616c.725-1.498 2.698-4.29 4.532-5.668C13.855.955 16 .186 16 2.632c0 .489-.28 4.105-.444 4.692-.572 2.04-2.653 2.561-4.504 2.246 3.236.551 4.06 2.375 2.281 4.2-3.376 3.464-4.852-.87-5.23-1.98-.07-.204-.103-.3-.103-.218 0-.081-.033.014-.102.218-.379 1.11-1.855 5.444-5.231 1.98-1.778-1.825-.955-3.65 2.28-4.2-1.85.315-3.932-.205-4.503-2.246C.28 6.737 0 3.12 0 2.632 0 .186 2.145.955 3.468 1.948",
    viewBox: [16, 16],
  },
};

// Backwards compatibility helper if needed, or just remove
// export const SVG_PATHS = ... derived? Better to update consumers.
