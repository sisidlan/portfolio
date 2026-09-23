import { getGridSize } from './paper-grid';

// ============================================================================
// Work-entry text alignment
// ============================================================================
const CONTENT_SELECTOR = '.work-entry__content';
const ROW_SELECTOR = '.work-entry';

let workResizeObserver: ResizeObserver | null = null;
let alignmentFrame: number | null = null;

function alignWorkText() {
    alignmentFrame = null;

    const reader = document.querySelector<HTMLElement>('.reader');
    const contentBlocks = document.querySelectorAll<HTMLElement>(CONTENT_SELECTOR);
    if (!reader || contentBlocks.length === 0) return;

    const gridSize = getGridSize();
    const readerTop = reader.getBoundingClientRect().top;

    const offsets = [...contentBlocks].map((content) => {
        const currentOffset = Number.parseFloat(
            content.style.getPropertyValue('--work-content-grid-offset') || '0',
        );
        const relativeTop = content.getBoundingClientRect().top - readerTop - currentOffset;
        // Snap upward when the centered block falls between grid lines, keeping odd-height
        // text groups on the preceding row instead of nudging them below center.
        const previousGridLine = Math.floor(relativeTop / gridSize) * gridSize;
        return { content, offset: previousGridLine - relativeTop };
    });

    // Measure all rows before writing offsets to avoid repeated synchronous layouts.
    for (const { content, offset } of offsets) {
        // This is measured viewport geometry, so px avoids rem rounding drift.
        content.style.setProperty('--work-content-grid-offset', String(offset) + 'px');
    }
}

function scheduleWorkAlignment() {
    if (alignmentFrame === null) {
        alignmentFrame = requestAnimationFrame(alignWorkText);
    }
}

function disconnectWorkAlignment() {
    workResizeObserver?.disconnect();
    workResizeObserver = null;

    if (alignmentFrame !== null) cancelAnimationFrame(alignmentFrame);
    alignmentFrame = null;
}

function connectWorkAlignment() {
    disconnectWorkAlignment();

    const rows = document.querySelectorAll<HTMLElement>(ROW_SELECTOR);
    if (rows.length === 0) return;

    workResizeObserver = new ResizeObserver(scheduleWorkAlignment);
    for (const row of rows) workResizeObserver.observe(row);

    scheduleWorkAlignment();
    void document.fonts.ready.then(scheduleWorkAlignment);
}

document.addEventListener('astro:before-swap', disconnectWorkAlignment);
document.addEventListener('astro:page-load', connectWorkAlignment);
window.addEventListener('pagehide', disconnectWorkAlignment);
window.addEventListener('pageshow', connectWorkAlignment);
connectWorkAlignment();
