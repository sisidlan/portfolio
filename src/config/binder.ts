// ============================================================================
// Binder ring layout
// ============================================================================
/**
 * Ring positions are measured against the two-rem paper grid.
 * `startRow` is the horizontal grid line crossed by the first ring's paper
 * attachment. `spacingRows` is the distance between consecutive attachments.
 * `bottomClearanceRows` reserves empty grid rows below the final visible ring.
 * The ring script creates as many complete rings as each page can accommodate.
 */
export const binderRingLayout = {
    startRow: 4,
    spacingRows: 8,
    bottomClearanceRows: 0,
} as const;
