import { navigate, swapFunctions } from 'astro:transitions/client';

// ============================================================================
// Selectors, URL parameters, and history state
// ============================================================================
const CONTACT_LINK_SELECTOR = 'a[href="#contact"]';
const BINDER_NAV_LINK_SELECTOR = 'a.tab-home, a.tab-work, a.tab-about';
const CASE_STUDY_LINK_SELECTOR = 'a[data-case-study-link]';
const CASE_STUDY_CLOSE_SELECTOR = 'a[data-case-study-close]';
const RETURN_PATH_PARAM = 'returnTo';
const RETURN_SCROLL_PARAM = 'returnScroll';
const RESTORE_SCROLL_PARAM = 'restoreScroll';
const RELOAD_POSITION_KEY = 'portfolio:reload-position';
const HOME_INTRO_STORAGE_KEY = 'portfolio:home-intro-seen';
const PAGE_ENTRY_PENDING_ATTRIBUTE = 'data-page-entry-pending';

type BinderHistoryState = Record<string, unknown> & {
    binderScroll?: {
        path: string;
        top: number;
    };
    binderReturn?: {
        source: string;
        destination: string;
    };
};

const returnLabels = new Map([
    ['/', 'Home'],
    ['/work/', 'Work'],
]);

let trackedPaper: HTMLElement | null = null;
let trackedPath: string | null = null;
let scrollStateTimer: number | null = null;
let finishCloseTabExit: (() => void) | null = null;
let cancelPaperScroll: (() => void) | null = null;

// ============================================================================
// Shared navigation helpers
// ============================================================================
function getPageKind(pathname = location.pathname) {
    if (pathname === '/') return 'home';
    if (pathname === '/work' || pathname === '/work/') return 'work';
    if (pathname.startsWith('/work/')) return 'case-study';
    if (pathname === '/about' || pathname === '/about/') return 'about';
    return 'other';
}

function synchronizePageMotionState() {
    const pageKind = getPageKind();
    document.body?.setAttribute('data-page-kind', pageKind);
    document.querySelector<HTMLElement>('.page')?.setAttribute('data-page-kind', pageKind);

    const root = document.documentElement;
    if (pageKind !== 'home' || root.dataset.homeEntry !== 'first') {
        root.dataset.homeEntry = 'regular';
        return;
    }

    // The inline layout script reserves the first-visit sequence before the body is parsed.
    // Keep it only for that first home render; every later navigation uses the regular reveal.
    try {
        if (sessionStorage.getItem(HOME_INTRO_STORAGE_KEY)) return;
    } catch {
        root.dataset.homeEntry = 'regular';
    }
}

function beginPageEntryMotion(incomingDocument: Document) {
    // Astro replaces the root attributes during the swap, so the gate belongs
    // to the incoming document rather than the page being left behind.
    const root = incomingDocument.documentElement;
    root.removeAttribute(PAGE_ENTRY_PENDING_ATTRIBUTE);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        root.setAttribute(PAGE_ENTRY_PENDING_ATTRIBUTE, 'true');
    }
}

function releasePageEntryMotion() {
    const root = document.documentElement;
    if (!root.hasAttribute(PAGE_ENTRY_PENDING_ATTRIBUTE)) return;

    // Flush the hidden incoming state before enabling its animation. This prevents
    // Safari from resolving an animation while Astro is still upgrading the new page.
    void root.offsetWidth;
    root.removeAttribute(PAGE_ENTRY_PENDING_ATTRIBUTE);
}

function getHistoryState(): BinderHistoryState {
    return history.state && typeof history.state === 'object' ? history.state : {};
}

function getPaper() {
    return document.querySelector<HTMLElement>('.paper');
}

function getLocalPath(url: URL | Location = location) {
    return url.pathname + url.search + url.hash;
}

function getReturnUrl(value: string | null) {
    if (!value) return null;

    try {
        const url = new URL(value, location.origin);
        return url.origin === location.origin && returnLabels.has(url.pathname) ? url : null;
    } catch {
        return null;
    }
}

function getScrollPosition(value: string | null) {
    if (value === null || value.trim() === '') return null;
    const position = Number(value);
    return Number.isFinite(position) && position >= 0 ? position : null;
}

// ============================================================================
// Scroll checkpoint persistence
// ============================================================================
function normalizeContactHash() {
    if (location.hash !== '#contact') return;

    const cleanPath = location.pathname + location.search;
    const navigation = performance.getEntriesByType('navigation')[0] as
        PerformanceNavigationTiming | undefined;
    const state = getHistoryState();

    if (navigation?.type === 'reload') {
        const { binderScroll: _discardedPosition, ...remainingState } = state;
        history.replaceState(remainingState, '', cleanPath);

        const paper = getPaper();
        if (paper) {
            paper.style.scrollBehavior = 'auto';
            paper.scrollTop = 0;
            requestAnimationFrame(() => paper.style.removeProperty('scroll-behavior'));
        }
        return;
    }

    const storedPosition = state.binderScroll;
    history.replaceState(
        {
            ...state,
            ...(storedPosition && {
                binderScroll: { ...storedPosition, path: cleanPath },
            }),
        },
        '',
        cleanPath,
    );

    requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('#contact')?.scrollIntoView({ block: 'start' });
    });
}

function savePaperPosition() {
    if (scrollStateTimer !== null) window.clearTimeout(scrollStateTimer);
    scrollStateTimer = null;
    if (!trackedPaper || trackedPath !== getLocalPath()) return;

    const path = getLocalPath();
    const top = Math.max(0, trackedPaper.scrollTop);
    const state = getHistoryState();
    const storedPosition = state.binderScroll;
    if (storedPosition?.path === path && Math.abs(storedPosition.top - top) < 0.5) return;

    history.replaceState({ ...state, binderScroll: { path, top } }, '', location.href);
}

function schedulePaperPositionSave() {
    // History updates are rate-limited in browsers, including Safari. Navigation flushes
    // the exact position; continuous scrolling needs at most two checkpoints per second.
    if (scrollStateTimer === null) scrollStateTimer = window.setTimeout(savePaperPosition, 500);
}

function saveReloadPosition() {
    if (!trackedPaper || trackedPath !== getLocalPath()) return;
    try {
        // Chromium can snapshot history before pagehide's replaceState is committed.
        // This one-use, per-tab checkpoint covers a reload between throttled writes.
        sessionStorage.setItem(
            RELOAD_POSITION_KEY,
            JSON.stringify({
                path: trackedPath,
                top: Math.max(0, trackedPaper.scrollTop),
                index: getHistoryState().index,
            }),
        );
    } catch {
        // Storage may be unavailable; the last history checkpoint remains usable.
    }
}

function restoreReloadPosition() {
    try {
        const stored = sessionStorage.getItem(RELOAD_POSITION_KEY);
        sessionStorage.removeItem(RELOAD_POSITION_KEY);
        const navigation = performance.getEntriesByType('navigation')[0] as
            PerformanceNavigationTiming | undefined;
        if (!stored || navigation?.type !== 'reload') return;

        const position = JSON.parse(stored);
        const state = getHistoryState();
        if (
            position?.path !== getLocalPath() ||
            position.index !== state.index ||
            typeof position.top !== 'number' ||
            !Number.isFinite(position.top) ||
            position.top < 0
        )
            return;

        history.replaceState(
            { ...state, binderScroll: { path: position.path, top: position.top } },
            '',
            location.href,
        );
    } catch {
        // An unavailable or invalid checkpoint never prevents normal history restoration.
    }
}

function disconnectPaperPositionTracking() {
    cancelPaperScroll?.();
    trackedPaper?.removeEventListener('scroll', schedulePaperPositionSave);
    if (scrollStateTimer !== null) window.clearTimeout(scrollStateTimer);
    scrollStateTimer = null;
    trackedPaper = null;
    trackedPath = null;
}

function connectPaperPositionTracking() {
    disconnectPaperPositionTracking();
    if (!returnLabels.has(location.pathname)) return;

    trackedPaper = getPaper();
    trackedPath = getLocalPath();
    trackedPaper?.addEventListener('scroll', schedulePaperPositionSave, { passive: true });
    savePaperPosition();
}

// ============================================================================
// Case-study return routing
// ============================================================================
function prepareCaseStudyLink(link: HTMLAnchorElement) {
    const source = getReturnUrl(location.href);
    const paper = getPaper();
    if (!source || !paper || link.hasAttribute('download')) return null;

    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin) return null;

    // Safari can report negative scroll positions while the paper bounces at its upper edge.
    const scrollTop = Math.max(0, paper.scrollTop);
    destination.searchParams.set(RETURN_PATH_PARAM, getLocalPath(source));
    destination.searchParams.set(RETURN_SCROLL_PARAM, String(scrollTop));
    link.href = getLocalPath(destination);
    return { source: getLocalPath(source), destination: getLocalPath(destination), scrollTop };
}

function configureCloseTab() {
    const closeTab = document.querySelector<HTMLAnchorElement>(
        `.tab-close-stage ${CASE_STUDY_CLOSE_SELECTOR}`,
    );
    if (!closeTab) return;

    const currentUrl = new URL(location.href);
    const fallbackUrl =
        getReturnUrl(currentUrl.searchParams.get(RETURN_PATH_PARAM)) ??
        new URL('/work/', location.origin);
    const returnLabel = returnLabels.get(fallbackUrl.pathname)!;
    const scrollTop = getScrollPosition(currentUrl.searchParams.get(RETURN_SCROLL_PARAM));

    if (scrollTop !== null) {
        fallbackUrl.searchParams.set(RESTORE_SCROLL_PARAM, String(scrollTop));
    }

    closeTab.href = getLocalPath(fallbackUrl);
    closeTab.setAttribute('aria-label', `Close case study and return to ${returnLabel}`);
}

function restorePaperPosition() {
    const paper = getPaper();
    if (!paper) return;

    const currentUrl = new URL(location.href);
    const queryPosition = getScrollPosition(currentUrl.searchParams.get(RESTORE_SCROLL_PARAM));
    const storedPosition = getHistoryState().binderScroll;
    const historyPosition = storedPosition?.path === getLocalPath() ? storedPosition.top : null;
    const scrollTop = queryPosition ?? historyPosition;

    if (scrollTop === null) return;

    paper.style.scrollBehavior = 'auto';

    const applyPosition = () => {
        if (paper.isConnected) paper.scrollTop = scrollTop;
    };

    applyPosition();
    requestAnimationFrame(() => {
        applyPosition();
        paper.style.removeProperty('scroll-behavior');
    });

    if (queryPosition !== null) {
        currentUrl.searchParams.delete(RESTORE_SCROLL_PARAM);
        const cleanPath = getLocalPath(currentUrl);
        history.replaceState(
            {
                ...getHistoryState(),
                binderScroll: {
                    path: cleanPath,
                    top: scrollTop,
                },
            },
            '',
            cleanPath,
        );
    }
}

// ============================================================================
// Direct in-page navigation
// ============================================================================
function isPlainPrimaryClick(event: MouseEvent) {
    return (
        event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    );
}

function targetsCurrentPage(link: HTMLAnchorElement) {
    return (!link.target || link.target === '_self') && !link.hasAttribute('download');
}

function getElementScrollTop(element: HTMLElement, paper: HTMLElement) {
    const elementBounds = element.getBoundingClientRect();
    const paperBounds = paper.getBoundingClientRect();
    return paper.scrollTop + elementBounds.top - paperBounds.top;
}

function animatePaperScroll(targetTop: number) {
    cancelPaperScroll?.();
    const paper = getPaper();
    if (!paper) return;

    const endTop = Math.min(
        Math.max(0, paper.scrollHeight - paper.clientHeight),
        Math.max(0, targetTop),
    );
    if (Math.abs(paper.scrollTop - endTop) < 0.5) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        paper.scrollTo({ top: endTop, behavior: 'instant' });
        return;
    }

    // Let the browser animate; explicitly yield to user input because native
    // smooth scrolling is not consistently interrupted by wheel input in Chromium.
    const controller = new AbortController();
    const options = { passive: true, signal: controller.signal };
    let scrollEndTimer: number | undefined;
    const finish = () => {
        window.clearTimeout(scrollEndTimer);
        controller.abort();
        cancelPaperScroll = null;
    };
    const cancel = () => {
        finish();
        paper.scrollTo({ top: paper.scrollTop, behavior: 'instant' });
    };
    cancelPaperScroll = cancel;
    for (const type of ['wheel', 'touchstart', 'pointerdown']) {
        paper.addEventListener(type, cancel, options);
    }
    document.addEventListener(
        'keydown',
        (event) => {
            // Tab lets native focus scrolling take over; stopping it here can race that scroll.
            if (
                [
                    'ArrowUp',
                    'ArrowDown',
                    'PageUp',
                    'PageDown',
                    'Home',
                    'End',
                    ' ',
                    'Escape',
                ].includes(event.key)
            ) {
                cancel();
            }
        },
        { signal: controller.signal },
    );
    if (Reflect.has(paper, 'onscrollend')) {
        paper.addEventListener(
            'scrollend',
            () => {
                // Ignore a queued completion from the scroll that this request replaced.
                if (Math.abs(paper.scrollTop - endTop) < 1) finish();
            },
            { signal: controller.signal },
        );
    } else {
        // Older browsers lack scrollend; release listeners once scrolling settles.
        paper.addEventListener(
            'scroll',
            () => {
                window.clearTimeout(scrollEndTimer);
                scrollEndTimer = window.setTimeout(finish, 150);
            },
            options,
        );
    }
    paper.scrollTo({ top: endTop, behavior: 'smooth' });
}

function getMotionDuration(property: string, fallback: number) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(property).trim();
    const number = Number.parseFloat(value);
    if (!Number.isFinite(number)) return fallback;
    return value.endsWith('s') && !value.endsWith('ms') ? number * 1000 : number;
}

function animateCloseTabExit(closeTab: HTMLAnchorElement) {
    finishCloseTabExit?.();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const stage = closeTab.closest<HTMLElement>('.tab-close-stage');
    const parent = stage?.parentElement;
    const nextSibling = stage?.nextSibling;
    if (!stage || !parent || stage.classList.contains('tab-close-exit-stage')) return;

    if (stage.contains(document.activeElement)) closeTab.blur();
    stage.inert = true;
    stage.removeAttribute('data-close-focus');
    stage.classList.replace('tab-close-stage', 'tab-close-exit-stage');
    stage.setAttribute('aria-hidden', 'true');
    stage.setAttribute('data-close-exiting', '');
    document.body.append(stage);

    const finish = () => {
        window.clearTimeout(timer);
        finishCloseTabExit = null;
        if (parent.isConnected && document.body.dataset.pageKind === 'case-study') {
            stage.classList.replace('tab-close-exit-stage', 'tab-close-stage');
            stage.removeAttribute('aria-hidden');
            stage.removeAttribute('data-close-exiting');
            stage.inert = false;
            parent.insertBefore(
                stage,
                nextSibling && nextSibling.parentNode === parent ? nextSibling : null,
            );
            return;
        }

        stage.remove();
    };

    const duration = getMotionDuration('--motion-case-study-tab-duration', 800);
    const timer = window.setTimeout(finish, Math.max(0, duration));
    finishCloseTabExit = finish;
}

function animateCaseStudyExitForNavigation() {
    const closeTab = document.querySelector<HTMLAnchorElement>(
        `.tab-close-stage ${CASE_STUDY_CLOSE_SELECTOR}`,
    );
    if (closeTab) animateCloseTabExit(closeTab);
}

function scrollToContact(link: HTMLAnchorElement, event: MouseEvent) {
    if (!isPlainPrimaryClick(event) || !targetsCurrentPage(link)) return;

    const contact = document.querySelector<HTMLElement>('#contact');
    const paper = getPaper();
    if (!contact || !paper) return;

    event.preventDefault();
    contact.focus({ preventScroll: true });
    animatePaperScroll(getElementScrollTop(contact, paper));
}

function scrollToPageTop(link: HTMLAnchorElement, event: MouseEvent) {
    if (!isPlainPrimaryClick(event) || !targetsCurrentPage(link)) return;

    const paper = getPaper();
    if (!paper) return;

    event.preventDefault();
    animatePaperScroll(0);

    if (location.hash) {
        history.replaceState(getHistoryState(), '', location.pathname + location.search);
        trackedPath = getLocalPath();
    }
}

function isCurrentPageTab(link: HTMLAnchorElement) {
    const pageKind = getPageKind();
    return (
        (pageKind === 'home' && link.matches('.tab-home')) ||
        (pageKind === 'work' && link.matches('.tab-work')) ||
        (pageKind === 'about' && link.matches('.tab-about'))
    );
}

// ============================================================================
// Event wiring and lifecycle initialization
// ============================================================================
function swapBinderPage(incomingDocument: Document, defaultSwap: () => void) {
    const nav = document.querySelector<HTMLElement>('.binder-nav');
    const incomingNav = incomingDocument.querySelector<HTMLElement>('.binder-nav');
    const paper = getPaper();
    const incomingPaper = incomingDocument.querySelector<HTMLElement>('.paper');
    if (!nav || !incomingNav || !paper || !incomingPaper) {
        defaultSwap();
        return;
    }

    swapFunctions.deselectScripts(incomingDocument);
    swapFunctions.swapRootAttributes(incomingDocument);
    swapFunctions.swapHeadElements(incomingDocument);
    const restoreFocus = swapFunctions.saveFocus();

    // Keep the shell and its sticky nav connected: Safari uses the nav's renderer
    // as its toolbar color source. Only route-specific contents need replacing.
    for (const attribute of [...document.body.attributes]) {
        document.body.removeAttribute(attribute.name);
    }
    for (const attribute of incomingDocument.body.attributes) {
        document.body.setAttribute(attribute.name, attribute.value);
    }
    nav.replaceChildren(...incomingNav.childNodes);
    swapFunctions.swapBodyElement(incomingPaper, paper);
    restoreFocus();
}

function prepareAlternateNavigation(event: MouseEvent) {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>(CASE_STUDY_LINK_SELECTOR);
    if (link) prepareCaseStudyLink(link);
}

function handleNavigationClick(event: MouseEvent) {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;

    const binderNavLink = event.target.closest<HTMLAnchorElement>(BINDER_NAV_LINK_SELECTOR);
    if (binderNavLink && isCurrentPageTab(binderNavLink)) {
        scrollToPageTop(binderNavLink, event);
        return;
    }

    const contactLink = event.target.closest<HTMLAnchorElement>(CONTACT_LINK_SELECTOR);
    if (contactLink) {
        scrollToContact(contactLink, event);
        return;
    }

    if (
        binderNavLink &&
        document.body.dataset.pageKind === 'case-study' &&
        isPlainPrimaryClick(event) &&
        targetsCurrentPage(binderNavLink)
    ) {
        animateCaseStudyExitForNavigation();
    }

    const closeTab = event.target.closest<HTMLAnchorElement>(CASE_STUDY_CLOSE_SELECTOR);
    if (closeTab) {
        if (!isPlainPrimaryClick(event) || !targetsCurrentPage(closeTab)) return;

        const currentUrl = new URL(location.href);
        const returnUrl = getReturnUrl(currentUrl.searchParams.get(RETURN_PATH_PARAM));
        const returnEntry = getHistoryState().binderReturn;
        const shouldGoBack =
            Boolean(returnUrl) &&
            history.length > 1 &&
            returnEntry?.source === getLocalPath(returnUrl!) &&
            returnEntry?.destination === getLocalPath();

        event.preventDefault();
        animateCloseTabExit(closeTab);

        // Only a same-tab navigation creates this marker on the case-study history entry.
        if (shouldGoBack) history.back();
        else void navigate(closeTab.href);
        return;
    }

    const caseStudyLink = event.target.closest<HTMLAnchorElement>(CASE_STUDY_LINK_SELECTOR);
    if (caseStudyLink) {
        const context = prepareCaseStudyLink(caseStudyLink);
        if (
            !context ||
            !isPlainPrimaryClick(event) ||
            !targetsCurrentPage(caseStudyLink) ||
            caseStudyLink.hasAttribute('data-astro-reload') ||
            caseStudyLink.dataset.astroHistory === 'replace'
        )
            return;

        event.preventDefault();
        history.replaceState(
            {
                ...getHistoryState(),
                binderScroll: { path: context.source, top: context.scrollTop },
            },
            '',
            location.href,
        );
        void navigate(context.destination, {
            sourceElement: caseStudyLink,
            state: {
                binderReturn: { source: context.source, destination: context.destination },
            },
        });
    }
}

function updateCloseTabFocus(event: FocusEvent, isFocused: boolean) {
    if (!(event.target instanceof Element)) return;
    const closeTab = event.target.closest<HTMLAnchorElement>(CASE_STUDY_CLOSE_SELECTOR);
    const stage = closeTab?.closest<HTMLElement>('.tab-close-stage');
    stage?.toggleAttribute('data-close-focus', isFocused);
}

function initializeSiteNavigation() {
    // A rapid return must not leave the previous exit artwork beside the new tab.
    if (getPageKind() === 'case-study') finishCloseTabExit?.();
    synchronizePageMotionState();
    normalizeContactHash();
    configureCloseTab();
    restorePaperPosition();
}

function finishSiteNavigation() {
    releasePageEntryMotion();
    // Astro may focus a URL fragment after swapping the document. Restore the paper
    // after that step, before tracking can replace the saved position with the fragment's.
    restorePaperPosition();
    connectPaperPositionTracking();
}

document.addEventListener('click', handleNavigationClick, true);
document.addEventListener('animationend', (event) => {
    if (event.animationName === 'page-entry-reveal' && event.target instanceof HTMLElement) {
        event.target.setAttribute('data-page-entry-complete', '');
    }
});
document.addEventListener('focusin', (event) => {
    updateCloseTabFocus(event, true);
    if (!(event.target instanceof HTMLElement)) return;

    // Reveal every animated ancestor of the focused control, and keep it revealed
    // after focus moves away. Non-focused content retains its normal entry sequence.
    const revealedElements: HTMLElement[] = [];
    for (let element: HTMLElement | null = event.target; element; element = element.parentElement) {
        if (
            getComputedStyle(element)
                .animationName.split(',')
                .some((name) => name.trim() === 'page-entry-reveal')
        ) {
            revealedElements.push(element);
        }
    }
    for (const element of revealedElements) element.setAttribute('data-page-entry-revealed', '');
});
document.addEventListener('focusout', (event) => updateCloseTabFocus(event, false));
document.addEventListener('auxclick', prepareAlternateNavigation, true);
document.addEventListener('contextmenu', prepareAlternateNavigation, true);
document.addEventListener('astro:before-preparation', savePaperPosition);
document.addEventListener('astro:before-swap', (event) => {
    beginPageEntryMotion(event.newDocument);
    disconnectPaperPositionTracking();
    const defaultSwap = event.swap;
    event.swap = () => swapBinderPage(event.newDocument, defaultSwap);
});
document.addEventListener('astro:after-swap', initializeSiteNavigation);
document.addEventListener('astro:page-load', finishSiteNavigation);
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        initializeSiteNavigation();
        finishSiteNavigation();
    }
});
window.addEventListener('pagehide', () => {
    finishCloseTabExit?.();
    saveReloadPosition();
    savePaperPosition();
    disconnectPaperPositionTracking();
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden) savePaperPosition();
});
restoreReloadPosition();
initializeSiteNavigation();
