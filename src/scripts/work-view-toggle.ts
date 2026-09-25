import type { WorkView } from '../types/work';

// ============================================================================
// Work collection view preference for the current browsing session
// ============================================================================
const VIEW_VALUES: WorkView[] = ['list', 'grid'];

function isWorkView(value: string | undefined | null): value is WorkView {
    return VIEW_VALUES.includes(value as WorkView);
}

function supportsWebAnimations() {
    return typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
}

function waitForAnimation(animation: Animation, duration: number) {
    const finished = (animation as Animation & { finished?: Promise<Animation> }).finished;
    const fallback = new Promise<void>((resolve) => window.setTimeout(resolve, duration));
    return finished
        ? Promise.race([
              finished.then(
                  () => undefined,
                  () => undefined,
              ),
              fallback,
          ])
        : fallback;
}

class WorkViewSwitcher extends HTMLElement {
    private controller: AbortController | null = null;
    private collection: HTMLElement | null = null;
    private buttons: HTMLButtonElement[] = [];
    private activeAnimations: Animation[] = [];
    private transitionToken = 0;

    connectedCallback() {
        this.controller?.abort();
        this.controller = new AbortController();
        this.collection = this.querySelector<HTMLElement>('[data-work-collection]');
        this.buttons = [...this.querySelectorAll<HTMLButtonElement>('[data-work-view-option]')];
        if (!this.collection) return;

        const defaultView = isWorkView(this.dataset.defaultView)
            ? this.dataset.defaultView
            : 'list';
        const storedView = this.readSessionView();
        this.setView(storedView ?? defaultView, false);

        for (const button of this.buttons) {
            button.addEventListener(
                'click',
                () => {
                    const view = button.dataset.workViewOption;
                    if (isWorkView(view)) this.setView(view, true);
                },
                { signal: this.controller.signal },
            );
        }
    }

    disconnectedCallback() {
        this.controller?.abort();
        this.cancelAnimations();
        this.controller = null;
    }

    private readSessionView() {
        const storageKey = this.dataset.storageKey;
        if (!storageKey) return null;

        try {
            const storedView = sessionStorage.getItem(storageKey);
            return isWorkView(storedView) ? storedView : null;
        } catch {
            return null;
        }
    }

    private cancelAnimations() {
        this.transitionToken += 1;
        this.activeAnimations.forEach((animation) => animation.cancel());
        this.activeAnimations = [];
        this.collection?.removeAttribute('data-work-transition');
        this.collection?.removeAttribute('data-work-reveal');
    }

    private getTransitionDuration() {
        const value = getComputedStyle(document.documentElement)
            .getPropertyValue('--motion-work-view-duration')
            .trim();
        const number = Number.parseFloat(value);
        if (!Number.isFinite(number)) return 420;
        return value.endsWith('s') && !value.endsWith('ms') ? number * 1000 : number;
    }

    private getTransitionEasing() {
        return (
            getComputedStyle(document.documentElement)
                .getPropertyValue('--motion-work-view-ease')
                .trim() || 'cubic-bezier(0.22, 1, 0.36, 1)'
        );
    }

    private setButtonState(view: WorkView) {
        for (const button of this.buttons) {
            button.setAttribute('aria-pressed', String(button.dataset.workViewOption === view));
        }
    }

    private getMediaElements() {
        return [...(this.collection?.querySelectorAll<HTMLElement>('.work-entry__media') ?? [])];
    }

    private async animateView(view: WorkView) {
        if (!this.collection) return;

        this.cancelAnimations();
        const token = this.transitionToken;
        const mediaElements = this.getMediaElements();
        const firstRects = new Map(
            mediaElements.map((element) => [element, element.getBoundingClientRect()]),
        );
        const direction = view === 'grid' ? 'to-grid' : 'to-list';

        this.collection.dataset.workTransition = direction;
        this.collection.dataset.workView = view;
        this.setButtonState(view);

        // Force the new layout before calculating the inverse transform for FLIP.
        this.collection.getBoundingClientRect();
        const animations: Animation[] = [];
        const duration = this.getTransitionDuration();
        const easing = this.getTransitionEasing();
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const canAnimate = supportsWebAnimations();

        for (const element of mediaElements) {
            const first = firstRects.get(element);
            const last = element.getBoundingClientRect();
            if (!first || reducedMotion || !canAnimate || !last.width || !last.height) continue;

            const deltaX = first.left - last.left;
            const deltaY = first.top - last.top;
            const scaleX = first.width / last.width;
            const scaleY = first.height / last.height;
            try {
                const animation = element.animate(
                    [
                        {
                            transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
                        },
                        { transform: 'translate(0, 0) scale(1, 1)' },
                    ],
                    { duration, easing, fill: 'both' },
                );
                animations.push(animation);
            } catch {
                // Layout state still changes when a partial Web Animations implementation fails.
            }
        }

        this.activeAnimations = animations;
        if (animations.length > 0) {
            await Promise.all(animations.map((animation) => waitForAnimation(animation, duration)));
        }

        if (token !== this.transitionToken || !this.collection) return;
        animations.forEach((animation) => animation.cancel());
        this.activeAnimations = [];
        this.collection.removeAttribute('data-work-transition');
        this.collection.dataset.workReveal = 'true';

        window.setTimeout(
            () => {
                if (token === this.transitionToken)
                    this.collection?.removeAttribute('data-work-reveal');
            },
            reducedMotion ? 0 : duration,
        );
    }

    private setView(view: WorkView, persist: boolean) {
        if (!this.collection) return;

        const currentView = this.collection.dataset.workView as WorkView | undefined;
        if (currentView !== view && persist) void this.animateView(view);
        else {
            this.collection.dataset.workView = view;
            this.setButtonState(view);
        }

        if (currentView !== view) {
            this.dispatchEvent(new Event('work:view-change', { bubbles: true }));
        }

        if (persist && this.dataset.storageKey) {
            try {
                sessionStorage.setItem(this.dataset.storageKey, view);
            } catch {
                // The view still changes when session storage is unavailable.
            }
        }
    }
}

if (!customElements.get('work-view-switcher')) {
    customElements.define('work-view-switcher', WorkViewSwitcher);
}
