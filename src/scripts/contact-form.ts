import { getGridSize, getRootFontSize } from './paper-grid';

// ============================================================================
// Form selectors and validation helpers
// ============================================================================
const FORM_SELECTOR = '[data-contact-form]';
const FIELD_SELECTOR = '[data-contact-field]';
const CONTROL_SELECTOR = 'input, textarea';
const SUBMIT_SELECTOR = '[data-contact-submit]';

type ContactControl = HTMLInputElement | HTMLTextAreaElement;

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
    if (!reader) return;

    const gridSize = getGridSize();
    const currentOffset = Number.parseFloat(
        form.style.getPropertyValue('--contact-grid-offset') || '0',
    );
    const baseTop =
        form.getBoundingClientRect().top - reader.getBoundingClientRect().top - currentOffset;
    const remainder = ((baseTop % gridSize) + gridSize) % gridSize;
    const nextOffset = remainder < 0.01 ? 0 : gridSize - remainder;

    // This is measured viewport geometry, so px avoids rem rounding drift.
    const offset = String(nextOffset) + 'px';
    form.style.setProperty('--contact-grid-offset', offset);
    content?.style.setProperty('--contact-grid-offset', offset);

    // The shared offset also keeps the contact section's reserved height
    // stable. Apply a separate visual correction so the form itself remains
    // aligned when a page's preceding content has a different height.
    const currentAdjustment = Number.parseFloat(
        form.style.getPropertyValue('--contact-form-grid-adjustment') || '0',
    );
    const renderedTop =
        form.getBoundingClientRect().top - reader.getBoundingClientRect().top - currentAdjustment;
    const renderedRemainder = ((renderedTop % gridSize) + gridSize) % gridSize;
    const formAdjustment = renderedRemainder < 0.01 ? 0 : gridSize - renderedRemainder;
    form.style.setProperty('--contact-form-grid-adjustment', `${formAdjustment}px`);
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
    if (form.dataset.contactFormReady === 'true') {
        form.querySelectorAll<HTMLElement>(FIELD_SELECTOR).forEach((field) => {
            updateField(
                field,
                field.hasAttribute('data-invalid') && getControl(field).value.trim() !== '',
            );
        });
        updateSubmitState(form);
        return;
    }
    form.dataset.contactFormReady = 'true';
    form.noValidate = true;

    const fields = [...form.querySelectorAll<HTMLElement>(FIELD_SELECTOR)];

    for (const field of fields) {
        const control = getControl(field);

        updateField(field, false);
        field.toggleAttribute('data-focused', document.activeElement === control);

        const updateControl = () => {
            const showError = field.hasAttribute('data-invalid') && control.value.trim() !== '';
            updateField(field, showError);
            updateSubmitState(form);
        };

        control.addEventListener('input', updateControl);
        control.addEventListener('change', updateControl);

        control.addEventListener('focus', () => {
            field.setAttribute('data-focused', '');
        });

        control.addEventListener('blur', () => {
            field.removeAttribute('data-focused');
            updateField(field, control.value.trim() !== '');
            updateSubmitState(form);
        });
    }

    form.addEventListener('reset', () => {
        // The reset event fires before the controls regain their default values.
        queueMicrotask(() => {
            fields.forEach((field) => updateField(field, false));
            updateSubmitState(form);
        });
    });

    form.addEventListener('submit', (event) => {
        if (!updateSubmitState(form)) {
            event.preventDefault();
            replaySubmitHintAnimation(form);
        }
    });

    updateSubmitState(form);
    alignContactFormToGrid(form);
}

function connectContactForms() {
    document.querySelectorAll<HTMLFormElement>(FORM_SELECTOR).forEach((form) => {
        connectContactForm(form);
        alignContactDividerToGrid(form);
    });
    window.requestAnimationFrame(() => {
        document.querySelectorAll<HTMLFormElement>(FORM_SELECTOR).forEach((form) => {
            alignContactFormToGrid(form);
            alignContactDividerToGrid(form);
        });
    });
}

document.addEventListener('astro:page-load', connectContactForms);
document.addEventListener('work:view-change', connectContactForms);
window.addEventListener('resize', connectContactForms);
window.addEventListener('pageshow', connectContactForms);
void document.fonts.ready.then(connectContactForms);
connectContactForms();
