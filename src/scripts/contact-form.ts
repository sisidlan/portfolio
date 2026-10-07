import { getGridSize, getRootFontSize } from './paper-grid';
import { getContactToken } from './contact-turnstile';

// ============================================================================
// Form selectors and validation helpers
// ============================================================================
const FORM_SELECTOR = '[data-contact-form]';
const FIELD_SELECTOR = '[data-contact-field]';
const CONTROL_SELECTOR = 'input, textarea';
const SUBMIT_SELECTOR = '[data-contact-submit]';

type ContactControl = HTMLInputElement | HTMLTextAreaElement;
type ContactState = 'editing' | 'confirming' | 'verifying' | 'sending' | 'success' | 'error';
type ConnectedForm = { refresh: () => void; disconnect: () => void };
const connectedForms = new Map<HTMLFormElement, ConnectedForm>();

function getContactDuration(property: string, fallback: number) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(property).trim();
    const number = Number.parseFloat(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, value.endsWith('s') && !value.endsWith('ms') ? number * 1000 : number);
}

function getControl(field: HTMLElement) {
    return field.querySelector<ContactControl>(CONTROL_SELECTOR)!;
}

function getValidationMessage(control: ContactControl) {
    if (control.value.trim() === '') {
        if (control.name === 'name') return 'Enter your name';
        if (control.name === 'message') return 'Enter a message';
        return 'Enter your email';
    }

    if (
        control instanceof HTMLInputElement &&
        control.type === 'email' &&
        control.validity.typeMismatch
    ) {
        return 'Enter a valid email';
    }

    if (control.maxLength > 0 && control.value.length > control.maxLength) {
        return `Use ${control.maxLength} characters or fewer`;
    }

    return '';
}

function updateField(field: HTMLElement, showError: boolean) {
    const control = getControl(field);
    const error = field.querySelector<HTMLElement>('[data-contact-error]')!;
    const message = getValidationMessage(control);
    const hasVisibleError = showError && message !== '';
    const isFilled = control.value.trim() !== '';

    field.toggleAttribute('data-filled', isFilled);
    field.toggleAttribute('data-invalid', hasVisibleError);
    control.setAttribute('aria-invalid', String(hasVisibleError));
    error.textContent = hasVisibleError ? message : '';
    error.toggleAttribute('data-visible', hasVisibleError);
    error.setAttribute('aria-hidden', String(!hasVisibleError));
}

function updateSubmitState(form: HTMLFormElement) {
    const fields = [...form.querySelectorAll<HTMLElement>(FIELD_SELECTOR)];
    const submit = form.querySelector<HTMLButtonElement>(SUBMIT_SELECTOR)!;
    const hint = form.querySelector<HTMLElement>('[data-contact-submit-hint]')!;
    const isValid = fields.every((field) => getValidationMessage(getControl(field)) === '');
    if (form.dataset.contactState && form.dataset.contactState !== 'editing') return isValid;

    submit.setAttribute('aria-disabled', String(!isValid));
    if (isValid) submit.removeAttribute('aria-describedby');
    else submit.setAttribute('aria-describedby', hint.id);
    hint.setAttribute('aria-hidden', String(isValid));
    return isValid;
}

function replaySubmitHintAnimation(form: HTMLFormElement) {
    const hint = form.querySelector<HTMLElement>('[data-contact-submit-hint]');
    if (!hint || hint.getAttribute('aria-hidden') === 'true') return;

    hint.classList.remove('contact-form__submit-hint--wiggle');
    // Force a style read so repeated attempts replay the feedback animation.
    void hint.offsetWidth;
    hint.classList.add('contact-form__submit-hint--wiggle');
}

// ============================================================================
// Grid alignment and lifecycle wiring
// ============================================================================
function alignContactFormToGrid(form: HTMLFormElement) {
    const reader = form.closest<HTMLElement>('.reader');
    const content = form.closest<HTMLElement>('.contact-section__content');
    if (!reader || !content) return;

    const gridSize = getGridSize();
    const currentOffset = Number.parseFloat(
        content.style.getPropertyValue('--contact-grid-offset') || '0',
    );
    const baseTop =
        form.getBoundingClientRect().top - reader.getBoundingClientRect().top - currentOffset;
    const remainder = ((baseTop % gridSize) + gridSize) % gridSize;
    const nextOffset = Math.min(remainder, gridSize - remainder) < 0.02 ? 0 : gridSize - remainder;

    // This is measured viewport geometry, so px avoids rem rounding drift.
    const offset = String(nextOffset) + 'px';
    if (Math.abs(currentOffset - nextOffset) > 0.02) {
        content.style.setProperty('--contact-grid-offset', offset);
    }
    // Reserve the visual offset on scrolling pages. On a short page, extra
    // padding would shrink the flexible main area and cancel the correction.
    const paper = reader.closest<HTMLElement>('.paper');
    const scrolling = paper && reader.getBoundingClientRect().height > paper.clientHeight + 0.5;
    content.style.setProperty('--contact-grid-reserve', scrolling ? offset : '0px');
}

function alignContactDividerToGrid(form: HTMLFormElement) {
    const content = form.closest<HTMLElement>('.contact-section__content');
    const reader = form.closest<HTMLElement>('.reader');
    if (!content || !reader) return;

    const rootStyles = getComputedStyle(document.documentElement);
    const offsetValue = rootStyles.getPropertyValue('--contact-divider-offset').trim();
    const offset = offsetValue.endsWith('rem')
        ? Number.parseFloat(offsetValue) * getRootFontSize()
        : Number.parseFloat(offsetValue);
    if (!Number.isFinite(offset)) return;

    // Anchor the divider to the already aligned form instead of the section
    // wrapper. The wrapper can contain fractional spacing, while the form's
    // top edge is the stable two-grid-row reference point.
    const formTop = form.getBoundingClientRect().top;
    const contentTop = content.getBoundingClientRect().top;
    const targetTop = formTop - offset;
    const unadjustedTop = contentTop - offset;
    const adjustment = targetTop - unadjustedTop;

    content.style.setProperty('--contact-divider-grid-adjustment', `${adjustment}px`);
}

function connectContactForm(form: HTMLFormElement) {
    const existing = connectedForms.get(form);
    if (existing) {
        existing.refresh();
        return;
    }

    const lifecycle = new AbortController();
    const options = { signal: lifecycle.signal };
    const fields = [...form.querySelectorAll<HTMLElement>(FIELD_SELECTOR)];
    const controls = fields.map(getControl);
    const submit = form.querySelector<HTMLButtonElement>(SUBMIT_SELECTOR)!;
    const label = submit.querySelector<HTMLElement>('.button__label')!;
    const cancel = form.querySelector<HTMLButtonElement>('[data-contact-cancel]')!;
    const success = form.querySelector<HTMLElement>('[data-contact-success]')!;
    const status = form.querySelector<HTMLElement>('[data-contact-status]')!;
    const deliveryError = form.querySelector<HTMLElement>('[data-contact-delivery-error]')!;
    const deliveryErrorText = deliveryError.querySelector<HTMLElement>(
        '[data-contact-error-text]',
    )!;
    const verification = form.querySelector<HTMLElement>('[data-contact-turnstile]');
    const hint = form.querySelector<HTMLElement>('[data-contact-submit-hint]')!;
    let state: ContactState = 'editing';
    let lastEdited = controls[0];
    let readyAt = 0;
    let reviewedBody: URLSearchParams | null = null;
    let confirmTimer: number | undefined;
    let feedbackTimer: number | undefined;
    let requestTimer: number | undefined;
    let request: AbortController | null = null;

    const clearPending = () => {
        window.clearTimeout(confirmTimer);
        window.clearTimeout(feedbackTimer);
        window.clearTimeout(requestTimer);
        confirmTimer = feedbackTimer = requestTimer = undefined;
        request?.abort();
        request = null;
        reviewedBody = null;
    };

    const render = (nextState: ContactState) => {
        window.clearTimeout(confirmTimer);
        confirmTimer = undefined;
        state = nextState;
        form.dataset.contactState = state;
        const remaining = state === 'confirming' ? Math.max(0, readyAt - performance.now()) : 0;
        const seconds = Math.ceil(remaining / 1000);
        const verifying = state === 'verifying';
        const locked = state === 'confirming' || verifying || state === 'sending';
        controls.forEach((control) => {
            control.readOnly = locked;
        });
        cancel.hidden = !locked;
        cancel.disabled = verifying || state === 'sending';
        cancel.setAttribute('aria-disabled', String(cancel.disabled));
        submit.hidden = state === 'success' || state === 'error';
        // Keep the buttons' layout boxes while verification occupies their slot.
        for (const button of [cancel, submit]) {
            button.inert = verifying;
            button.setAttribute('aria-hidden', String(verifying));
        }
        if (verification) verification.hidden = !verifying;
        success.hidden = state !== 'success';
        deliveryError.hidden = state !== 'error';
        const text =
            state === 'editing' || state === 'success' || state === 'error'
                ? 'Send'
                : state === 'confirming'
                  ? seconds > 0
                      ? String(seconds)
                      : 'Confirm'
                  : 'Sending…';
        if (label.textContent !== text) label.textContent = text;
        // Keep the action's accessible name stable while its visible label counts down.
        if (state === 'confirming') submit.setAttribute('aria-label', 'Confirm');
        else submit.removeAttribute('aria-label');
        submit.setAttribute('aria-busy', String(state === 'sending'));
        if (state === 'editing') {
            updateSubmitState(form);
        } else {
            hint.setAttribute('aria-hidden', 'true');
            submit.removeAttribute('aria-describedby');
            submit.setAttribute('aria-disabled', String(state !== 'confirming' || remaining > 0));
        }
        if (remaining > 0) {
            // Schedule the next displayed second from the deadline, avoiding interval drift.
            confirmTimer = window.setTimeout(
                () => render('confirming'),
                Math.max(1, remaining - (seconds - 1) * 1000),
            );
        }
    };

    const edit = () => {
        clearPending();
        deliveryError.hidden = true;
        deliveryErrorText.textContent = '';
        status.textContent = '';
        render('editing');
    };

    const refresh = () => {
        fields.forEach((field) => {
            updateField(
                field,
                field.hasAttribute('data-invalid') && getControl(field).value.trim() !== '',
            );
            field.toggleAttribute('data-focused', document.activeElement === getControl(field));
        });
        render(state);
    };

    const review = () => {
        deliveryError.hidden = true;
        reviewedBody = new URLSearchParams(
            Array.from(new FormData(form), ([name, value]) => [name, String(value)]),
        );
        const delay = getContactDuration('--contact-confirm-delay', 3000);
        readyAt = performance.now() + delay;
        render('confirming');
        status.textContent =
            'Review your message. Confirm becomes available after the countdown; Cancel lets you edit.';
    };

    const fail = () => {
        const shouldMoveFocus = form
            .querySelector('.contact-form__actions')!
            .contains(document.activeElement);
        edit();
        render('error');
        deliveryErrorText.textContent = 'Unable to send message, try again later';
        if (shouldMoveFocus) form.closest<HTMLElement>('#contact')?.focus({ preventScroll: true });
        feedbackTimer = window.setTimeout(
            () => {
                if (state === 'error') render('editing');
            },
            getContactDuration('--contact-error-duration', 5000),
        );
    };

    const deliver = async () => {
        const endpoint = form.getAttribute('action')?.trim();
        if (!endpoint) {
            fail();
            return;
        }
        const body = reviewedBody;
        if (!body) return;
        render('sending');
        status.textContent = 'Sending your message.';
        const currentRequest = new AbortController();
        request = currentRequest;
        let timeout: number | undefined;
        try {
            if (form.dataset.turnstileSiteId) {
                render('verifying');
                status.textContent = 'Completing security verification.';
                const token = await getContactToken(form, currentRequest.signal);
                if (!token) throw new Error('Security verification is unavailable');
                body.set('cf-turnstile-response', token);
            }
            if (request !== currentRequest || lifecycle.signal.aborted) return;
            render('sending');
            status.textContent = 'Sending your message.';
            timeout = window.setTimeout(() => currentRequest.abort(), 15_000);
            requestTimer = timeout;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { Accept: 'application/json' },
                body,
                signal: currentRequest.signal,
            });
            if (request !== currentRequest || lifecycle.signal.aborted) return;
            if (!response.ok) throw new Error('Submission was not accepted');
            request = null;
            const shouldMoveFocus = form
                .querySelector('.contact-form__actions')!
                .contains(document.activeElement);
            form.reset();
            // Let the native reset and its validation synchronization finish first.
            queueMicrotask(() => {
                if (lifecycle.signal.aborted) return;
                render('success');
                status.textContent = 'Message sent successfully.';
                if (shouldMoveFocus)
                    form.closest<HTMLElement>('#contact')?.focus({ preventScroll: true });
                feedbackTimer = window.setTimeout(
                    () => {
                        if (state === 'success') render('editing');
                    },
                    getContactDuration('--contact-success-duration', 5000),
                );
            });
        } catch {
            if (request !== currentRequest || lifecycle.signal.aborted) return;
            fail();
        } finally {
            window.clearTimeout(timeout);
            if (request === currentRequest) request = null;
        }
    };

    for (const field of fields) {
        const control = getControl(field);
        const updateControl = () => {
            if (state === 'confirming' || state === 'verifying' || state === 'sending') return;
            if (state === 'success' || state === 'error') edit();
            deliveryError.hidden = true;
            status.textContent = '';
            updateField(field, field.hasAttribute('data-invalid') && control.value.trim() !== '');
            updateSubmitState(form);
        };
        control.addEventListener('input', updateControl, options);
        control.addEventListener('change', updateControl, options);
        control.addEventListener(
            'focus',
            () => {
                lastEdited = control;
                field.setAttribute('data-focused', '');
            },
            options,
        );
        control.addEventListener(
            'blur',
            () => {
                field.removeAttribute('data-focused');
                updateField(field, state === 'editing' && control.value.trim() !== '');
                updateSubmitState(form);
            },
            options,
        );
    }

    cancel.addEventListener(
        'click',
        () => {
            if (state !== 'confirming') return;
            edit();
            status.textContent = 'Message unlocked. You can edit it before sending.';
            lastEdited.focus({ preventScroll: true });
        },
        options,
    );
    submit.addEventListener(
        'click',
        (event) => {
            // A long OS double-click interval can outlast the short arming delay.
            if (event.detail > 1) event.preventDefault();
        },
        options,
    );
    form.addEventListener(
        'keydown',
        (event) => {
            if (state === 'confirming' && event.key === 'Escape') {
                event.preventDefault();
                cancel.click();
            } else if (
                state !== 'editing' &&
                event.repeat &&
                (event.key === 'Enter' || event.key === ' ')
            ) {
                event.preventDefault();
            }
        },
        options,
    );
    form.addEventListener(
        'reset',
        () => {
            clearPending();
            queueMicrotask(() => {
                if (lifecycle.signal.aborted) return;
                edit();
                fields.forEach((field) => updateField(field, false));
                updateSubmitState(form);
            });
        },
        options,
    );
    form.addEventListener(
        'submit',
        (event) => {
            event.preventDefault();
            if (state === 'editing') {
                if (updateSubmitState(form)) review();
                else replaySubmitHintAnimation(form);
            } else if (state === 'confirming' && performance.now() >= readyAt) {
                void deliver();
            }
        },
        options,
    );

    form.noValidate = true;
    form.dataset.contactFormReady = 'true';
    const resizeObserver = new ResizeObserver(scheduleContactAlignment);
    const precedingContent = form.closest('.paper-sheet')?.querySelector('.page');
    if (precedingContent) resizeObserver.observe(precedingContent);
    resizeObserver.observe(form);
    connectedForms.set(form, {
        refresh,
        disconnect: () => {
            resizeObserver.disconnect();
            clearPending();
            lifecycle.abort();
            render('editing');
            status.textContent = '';
            deliveryError.hidden = true;
            delete form.dataset.contactFormReady;
        },
    });
    refresh();
    alignContactFormToGrid(form);
}

function disconnectContactForms() {
    if (alignmentFrame !== undefined) window.cancelAnimationFrame(alignmentFrame);
    alignmentFrame = undefined;
    connectedForms.forEach((connection) => connection.disconnect());
    connectedForms.clear();
}

function connectContactForms() {
    document.querySelectorAll<HTMLFormElement>(FORM_SELECTOR).forEach((form) => {
        connectContactForm(form);
        alignContactDividerToGrid(form);
    });
    scheduleContactAlignment();
}

let alignmentFrame: number | undefined;

function scheduleContactAlignment() {
    if (alignmentFrame !== undefined) return;
    alignmentFrame = window.requestAnimationFrame(() => {
        alignmentFrame = undefined;
        document.querySelectorAll<HTMLFormElement>(FORM_SELECTOR).forEach((form) => {
            alignContactFormToGrid(form);
            alignContactDividerToGrid(form);
        });
    });
}

document.addEventListener('astro:before-swap', disconnectContactForms);
window.addEventListener('pagehide', disconnectContactForms);
document.addEventListener('astro:page-load', connectContactForms);
document.addEventListener('work:view-change', connectContactForms);
window.addEventListener('resize', connectContactForms);
window.addEventListener('pageshow', connectContactForms);
void document.fonts.ready.then(connectContactForms);
connectContactForms();
