// ============================================================================
// Button-to-thumbnail hover fallback
// ============================================================================
const BUTTON_SELECTOR = '.work-entry__button';
const ENTRY_SELECTOR = '.work-entry';

type InteractionState = {
    hover: boolean;
    focus: boolean;
};

const states = new WeakMap<HTMLElement, InteractionState>();

function getEntry(target: EventTarget | null) {
    return target instanceof Element ? target.closest<HTMLElement>(ENTRY_SELECTOR) : null;
}

function getButton(target: EventTarget | null) {
    return target instanceof Element ? target.closest<HTMLElement>(BUTTON_SELECTOR) : null;
}

function setState(entry: HTMLElement, key: keyof InteractionState, value: boolean) {
    const state = states.get(entry) ?? { hover: false, focus: false };
    state[key] = value;
    states.set(entry, state);
    entry.toggleAttribute('data-work-action-active', state.hover || state.focus);
}

function isInside(target: EventTarget | null, container: Element) {
    return target instanceof Node && container.contains(target);
}

document.addEventListener('mouseover', (event) => {
    const button = getButton(event.target);
    const entry = getEntry(button);
    if (!button || !entry || isInside(event.relatedTarget, button)) return;
    setState(entry, 'hover', true);
});

document.addEventListener('mouseout', (event) => {
    const button = getButton(event.target);
    const entry = getEntry(button);
    if (!button || !entry || isInside(event.relatedTarget, button)) return;
    setState(entry, 'hover', false);
});

document.addEventListener('focusin', (event) => {
    const button = getButton(event.target);
    const entry = getEntry(button);
    if (button && entry) setState(entry, 'focus', true);
});

document.addEventListener('focusout', (event) => {
    const button = getButton(event.target);
    const entry = getEntry(button);
    if (!button || !entry || isInside(event.relatedTarget, button)) return;
    setState(entry, 'focus', false);
});
