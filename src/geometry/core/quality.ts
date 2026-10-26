export type Quality = 'preview' | 'fabrication';

/** Base angular segment counts; families may round these up (never down). */
export const SEGMENTS: Record<Quality, number> = { preview: 144, fabrication: 360 };
