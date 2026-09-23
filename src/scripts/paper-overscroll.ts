import { getRootFontSize } from './paper-grid';

// ============================================================================
// Bottom overscroll backdrop
// ============================================================================
let paper: HTMLElement | null = null;
let reader: HTMLElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let bottomActivationScrollTop = Number.POSITIVE_INFINITY;

function updateBottomState() {
    if (!paper) return;

    const isNearBottom = paper.scrollTop > 0.5 && paper.scrollTop >= bottomActivationScrollTop;
    paper.classList.toggle('paper--near-bottom', isNearBottom);
}

function updateBottomThreshold() {
    if (!paper) return;

    const maximumScrollTop = Math.max(0, paper.scrollHeight - paper.clientHeight);
    const rootFontSize = getRootFontSize();
    const activationLead = Math.min(paper.clientHeight / 2, 20 * rootFontSize);

    bottomActivationScrollTop =
        maximumScrollTop > 0
            ? Math.max(0, maximumScrollTop - activationLead)
            : Number.POSITIVE_INFINITY;
    updateBottomState();
}

function disconnectPaperOverscroll() {
    paper?.removeEventListener('scroll', updateBottomState);
    resizeObserver?.disconnect();
    resizeObserver = null;
    reader = null;
    paper = null;
    bottomActivationScrollTop = Number.POSITIVE_INFINITY;
}

function connectPaperOverscroll() {
    disconnectPaperOverscroll();
    paper = document.querySelector<HTMLElement>('.paper');
    if (!paper) return;

    reader = paper.querySelector<HTMLElement>('.reader');
    paper.addEventListener('scroll', updateBottomState, { passive: true });

    resizeObserver = new ResizeObserver(updateBottomThreshold);
    resizeObserver.observe(paper);
    if (reader) resizeObserver.observe(reader);

    updateBottomThreshold();
}

document.addEventListener('astro:before-swap', disconnectPaperOverscroll);
document.addEventListener('astro:page-load', connectPaperOverscroll);
window.addEventListener('pagehide', disconnectPaperOverscroll);
window.addEventListener('pageshow', connectPaperOverscroll);
connectPaperOverscroll();
