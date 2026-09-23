// ============================================================================
// Shared grid measurement
// ============================================================================
/** Resolves the shared rem/px grid token to viewport pixels for DOM measurements. */
export function getRootFontSize() {
    return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

export function getGridSize() {
    const rootStyles = getComputedStyle(document.documentElement);
    const value = rootStyles.getPropertyValue('--grid-size').trim();
    const size = Number.parseFloat(value);

    return value.endsWith('rem') ? size * getRootFontSize() : size;
}
