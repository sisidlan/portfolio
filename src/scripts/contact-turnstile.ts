type Turnstile = {
    render: (
        container: HTMLElement,
        options: {
            sitekey: string;
            action: string;
            execution: 'execute';
            appearance: 'execute';
            theme: 'light';
            size: 'flexible' | 'compact';
            'response-field': false;
            callback: (token: string) => void;
            'error-callback': () => void;
            'expired-callback': () => void;
            'timeout-callback': () => void;
        },
    ) => string;
    execute: (widget: string) => void;
    remove: (widget: string) => void;
};

declare global {
    interface Window {
        turnstile?: Turnstile;
    }
}

let loading: Promise<Turnstile> | undefined;

function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (loading) return loading;
    loading = new Promise<Turnstile>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        const timeout = window.setTimeout(() => failed(), 10_000);
        const failed = () => {
            window.clearTimeout(timeout);
            script.remove();
            loading = undefined;
            reject(new Error('Security verification could not load.'));
        };
        script.addEventListener('error', failed, { once: true });
        script.addEventListener(
            'load',
            () => {
                window.clearTimeout(timeout);
                if (window.turnstile) resolve(window.turnstile);
                else failed();
            },
            { once: true },
        );
        document.head.append(script);
    });
    return loading;
}

function widgetOptions(form: HTMLFormElement) {
    return {
        action: 'contact',
        execution: 'execute',
        appearance: 'execute',
        theme: 'light',
        size:
            form.querySelector<HTMLElement>('.contact-form__end')!.getBoundingClientRect().width <
            300
                ? 'compact'
                : 'flexible',
        'response-field': false,
    } as const;
}

// A dev-only visual fixture: ignore tokens and keep the widget mounted until
// navigation. It never enters the real verification or email-delivery flow.
export async function previewContactWidget(form: HTMLFormElement, signal: AbortSignal) {
    if (!import.meta.env.DEV) return;
    const container = form.querySelector<HTMLElement>('[data-contact-turnstile]');
    if (!container) throw new Error('Security verification is unavailable.');
    const turnstile = await loadTurnstile();
    signal.throwIfAborted();
    const ignore = () => {};
    const widget = turnstile.render(container, {
        ...widgetOptions(form),
        sitekey: '3x00000000000000000000FF',
        callback: ignore,
        'error-callback': ignore,
        'expired-callback': ignore,
        'timeout-callback': ignore,
    });
    const remove = () => turnstile.remove(widget);
    signal.addEventListener('abort', remove, { once: true });
    try {
        turnstile.execute(widget);
    } catch (error) {
        signal.removeEventListener('abort', remove);
        remove();
        throw error;
    }
}

export async function getContactToken(form: HTMLFormElement, signal: AbortSignal) {
    const sitekey = form.dataset.turnstileSiteId;
    if (!sitekey) return null;
    const container = form.querySelector<HTMLElement>('[data-contact-turnstile]');
    if (!container) throw new Error('Security verification is unavailable.');
    const turnstile = await loadTurnstile();
    signal.throwIfAborted();

    return new Promise<string>((resolve, reject) => {
        let widget: string | undefined;
        let settled = false;
        const cleanup = () => {
            window.clearTimeout(timeout);
            signal.removeEventListener('abort', aborted);
            // Queue removal so even a synchronous callback during render can
            // clean up the returned widget. This also releases iframe focus.
            queueMicrotask(() => {
                if (widget !== undefined) turnstile.remove(widget);
            });
        };
        const fail = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('Security verification failed. Please try again.'));
        };
        const aborted = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(signal.reason);
        };
        const timeout = window.setTimeout(fail, 60_000);
        signal.addEventListener('abort', aborted, { once: true });
        try {
            widget = turnstile.render(container, {
                ...widgetOptions(form),
                sitekey,
                callback: (token) => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    resolve(token);
                },
                'error-callback': fail,
                'expired-callback': fail,
                'timeout-callback': fail,
            });
            if (!settled) turnstile.execute(widget);
        } catch {
            fail();
        }
    });
}
