export function decode(
  data: Uint8Array,
  options?: { useTArray?: boolean; formatAsRGBA?: boolean; tolerantDecoding?: boolean; maxResolutionInMP?: number; maxMemoryUsageInMB?: number },
): { width: number; height: number; data: Uint8Array }
