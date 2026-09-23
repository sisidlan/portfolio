// ============================================================================
// Binder ring bounds
// ============================================================================
import { getGridSize, getRootFontSize } from './paper-grid';

const CONTAINER_SELECTOR = '[data-binder-rings]';
const RING_SELECTOR = '[data-binder-ring]';
const BOUNDS_TOLERANCE = 0.5;

let resizeObservers: ResizeObserver[] = [];

function getTokenPixels(token: string) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    const number = Number.parseFloat(value);

    if (!Number.isFinite(number)) return 0;
    return value.endsWith('rem') ? number * getRootFontSize() : number;
}

function getRingCount(container: HTMLElement) {
    const paperHeight = container.getBoundingClientRect().height;
    const gridSize = getGridSize();
    const visibleHeight = getTokenPixels('--binder-ring-visible-height');
    const anchorY = getTokenPixels('--binder-ring-paper-anchor-y');
    const startRow = Number(container.dataset.startRow) || 0;
    const spacingRows = Number(container.dataset.spacingRows) || 1;
    const bottomClearanceRows = Number(container.dataset.bottomClearanceRows) || 0;
    const firstRingTop = startRow * gridSize - anchorY;
    const finalRingBottom = paperHeight - bottomClearanceRows * gridSize;
    const finalRingTop = finalRingBottom - visibleHeight;
    const step = spacingRows * gridSize;

    if (step <= 0 || firstRingTop > finalRingTop + BOUNDS_TOLERANCE) return 0;
    return Math.floor((finalRingTop - firstRingTop + BOUNDS_TOLERANCE) / step) + 1;
}

function renderRings(container: HTMLElement, count: number) {
    const currentRings = container.querySelectorAll(RING_SELECTOR);
    if (currentRings.length === count) return;

    const startRow = Number(container.dataset.startRow) || 0;
    const spacingRows = Number(container.dataset.spacingRows) || 1;
    const fragment = document.createDocumentFragment();

    for (let index = 0; index < count; index += 1) {
        const ring = document.createElement('span');
        ring.className = 'binder-ring';
        ring.dataset.binderRing = '';
        ring.style.setProperty('--binder-ring-index', String(index));
        ring.style.setProperty('--binder-ring-row', String(startRow + index * spacingRows));
        fragment.append(ring);
    }

    container.replaceChildren(fragment);
    container.dataset.ringCount = String(count);
}

function updateVisibleRings(container: HTMLElement) {
    renderRings(container, getRingCount(container));

    const containerBounds = container.getBoundingClientRect();
    const bottomClearanceRows = Number(container.dataset.bottomClearanceRows) || 0;
    const lowerBoundary = containerBounds.bottom - bottomClearanceRows * getGridSize();
    const visibleHeight = getTokenPixels('--binder-ring-visible-height');

    container.querySelectorAll<HTMLElement>(RING_SELECTOR).forEach((ring) => {
        const ringBounds = ring.getBoundingClientRect();
        const fitsWithinPaper =
            ringBounds.top >= containerBounds.top - BOUNDS_TOLERANCE &&
            ringBounds.top + visibleHeight <= lowerBoundary + BOUNDS_TOLERANCE;

        ring.toggleAttribute('data-out-of-bounds', !fitsWithinPaper);
    });

    container.toggleAttribute('data-bounds-ready', true);
}

function disconnectBinderRings() {
    resizeObservers.forEach((observer) => observer.disconnect());
    resizeObservers = [];
}

function connectBinderRings() {
    disconnectBinderRings();

    document.querySelectorAll<HTMLElement>(CONTAINER_SELECTOR).forEach((container) => {
        const firstRing = container.querySelector<HTMLElement>(RING_SELECTOR);
        const observer = new ResizeObserver(() => updateVisibleRings(container));

        observer.observe(container);
        if (firstRing) observer.observe(firstRing);
        resizeObservers.push(observer);
        updateVisibleRings(container);
    });
}

document.addEventListener('astro:before-swap', disconnectBinderRings);
document.addEventListener('astro:page-load', connectBinderRings);
window.addEventListener('pagehide', disconnectBinderRings);
window.addEventListener('pageshow', connectBinderRings);
connectBinderRings();
