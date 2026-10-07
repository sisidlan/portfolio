import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page, fail = false) {
    await page.addInitScript(
        ({ fail }) => {
            let next = 0;
            let callback: ((token: string) => void) | undefined;
            let failure: (() => void) | undefined;
            window.turnstile = {
                render: (_container, options) => {
                    callback = options.callback;
                    failure = options['error-callback'];
                    return String(++next);
                },
                execute: () => {
                    if (fail) failure?.();
                    else callback?.(`fresh-token-${next}`);
                },
                remove: () => {},
            };
        },
        { fail },
    );
    await page.goto('/');
    const form = page.locator('[data-contact-form]');
    await expect(form).toHaveAttribute('data-contact-form-ready', 'true');
    await form.evaluate((element: HTMLFormElement) => {
        element.action = '/contact-test/';
        element.dataset.turnstileSiteId = 'public-widget-id';
        document.documentElement.style.setProperty('--contact-confirm-delay', '0ms');
    });
    return form;
}

test('each confirmed submission obtains a fresh Turnstile token rather than freezing one during review', async ({
    page,
}) => {
    const bodies: URLSearchParams[] = [];
    await page.route('**/contact-test/', async (route) => {
        bodies.push(new URLSearchParams(route.request().postData()!));
        await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    });
    const form = await setup(page);
    for (let i = 1; i <= 2; i++) {
        await form.locator('#contact-name').fill('Visitor');
        await form.locator('#contact-email').fill('visitor@example.com');
        await form.locator('#contact-message').fill(`Message ${i}`);
        await form.getByRole('button', { name: 'Send', exact: true }).click();
        expect(bodies).toHaveLength(i - 1);
        await form.getByRole('button', { name: 'Confirm', exact: true }).click();
        await expect(form).toHaveAttribute('data-contact-state', 'success');
        expect(bodies[i - 1].get('cf-turnstile-response')).toBe(`fresh-token-${i}`);
    }
});

test('a failed Turnstile challenge preserves the draft and never calls the delivery endpoint', async ({
    page,
}) => {
    let submissions = 0;
    await page.route('**/contact-test/', async (route) => {
        submissions++;
        await route.fulfill({ body: '{"ok":true}' });
    });
    const form = await setup(page, true);
    await form.locator('#contact-name').fill('Visitor');
    await form.locator('#contact-email').fill('visitor@example.com');
    await form.locator('#contact-message').fill('Keep this draft');
    await form.getByRole('button', { name: 'Send', exact: true }).click();
    await form.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(form).toHaveAttribute('data-contact-state', 'error');
    const error = form.locator('[data-contact-delivery-error]');
    await expect(error.locator('svg')).toBeVisible();
    await expect(error.locator('svg')).toHaveCSS('width', '32px');
    await expect(error.locator('svg')).toHaveCSS('color', 'rgb(188, 39, 32)');
    await expect(error.locator('[data-contact-error-text]')).toHaveText('Unable to send message');
    await expect(form.locator('#contact-message')).toHaveValue('Keep this draft');
    await expect(form.locator('#contact-message')).toBeEditable();
    expect(submissions).toBe(0);
});

test('navigation cancels a pending challenge and removes its widget without submitting', async ({
    page,
}) => {
    let submissions = 0;
    await page.route('**/contact-test/', async (route) => {
        submissions++;
        await route.fulfill({ body: '{"ok":true}' });
    });
    const form = await setup(page);
    await page.evaluate(() => {
        window.turnstile = {
            render: () => 'pending-widget',
            execute: () => {},
            remove: () => sessionStorage.setItem('widget-removed', 'true'),
        };
    });
    await form.locator('#contact-name').fill('Visitor');
    await form.locator('#contact-email').fill('visitor@example.com');
    await form.locator('#contact-message').fill('Pending draft');
    await form.getByRole('button', { name: 'Send', exact: true }).click();
    await form.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(form).toHaveAttribute('data-contact-state', 'verifying');
    await page.getByRole('link', { name: 'About', exact: true }).click();
    await expect(page).toHaveURL('/about/');
    await expect
        .poll(() => page.evaluate(() => sessionStorage.getItem('widget-removed')))
        .toBe('true');
    expect(submissions).toBe(0);
});

test('failure to load Cloudflare preserves the draft and prevents delivery', async ({ page }) => {
    let submissions = 0;
    await page.route('**/contact-test/', async (route) => {
        submissions++;
        await route.fulfill({ body: '{"ok":true}' });
    });
    await page.route(
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
        (route) => route.abort('failed'),
    );
    const form = await setup(page);
    await page.evaluate(() => delete window.turnstile);
    await form.locator('#contact-name').fill('Visitor');
    await form.locator('#contact-email').fill('visitor@example.com');
    await form.locator('#contact-message').fill('Keep this draft');
    await form.getByRole('button', { name: 'Send', exact: true }).click();
    await form.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(form).toHaveAttribute('data-contact-state', 'error');
    await expect(form.locator('#contact-message')).toHaveValue('Keep this draft');
    expect(submissions).toBe(0);
});

for (const width of [1600, 800, 390, 340]) {
    test(`verification replaces the actions without moving the footer at ${width}px`, async ({
        page,
    }, testInfo) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.route('**/contact-test/', (route) =>
            route.fulfill({ contentType: 'application/json', body: '{"ok":true}' }),
        );
        const form = await setup(page);
        await page.evaluate(() => {
            let container: HTMLElement;
            window.turnstile = {
                render: (element, options) => {
                    container = element;
                    const widget = document.createElement('div');
                    widget.style.cssText = `width:${options.size === 'flexible' ? '100%' : '150px'};min-width:${options.size === 'flexible' ? '300px' : '150px'};height:${options.size === 'flexible' ? 65 : 140}px;background:#fafafa;border:1px solid #ccc`;
                    widget.textContent = 'Verification fixture';
                    element.append(widget);
                    element.dataset.testWidgetSize = options.size;
                    document.addEventListener(
                        'test:verified',
                        () => options.callback('verified-token'),
                        { once: true },
                    );
                    return 'layout-widget';
                },
                execute: () => {},
                remove: () => container.replaceChildren(),
            };
        });
        await form.locator('#contact-name').fill('Visitor');
        await form.locator('#contact-email').fill('visitor@example.com');
        await form.locator('#contact-message').fill('Layout test');
        await form.getByRole('button', { name: 'Send', exact: true }).click();
        const geometry = () =>
            form.evaluate((element) => {
                const readerTop = element.closest('.reader')!.getBoundingClientRect().top;
                return [
                    '[data-contact-field]',
                    '.contact-section__details',
                    '.site-footer',
                ].flatMap((selector) =>
                    [...document.querySelectorAll(selector)].map((node) => {
                        const rect = node.getBoundingClientRect();
                        return [rect.top - readerTop, rect.height];
                    }),
                );
            });
        const before = await geometry();
        await form.getByRole('button', { name: 'Confirm', exact: true }).click();
        await expect(form).toHaveAttribute('data-contact-state', 'verifying');
        await expect(form.locator('[data-contact-submit]')).toBeHidden();
        await expect(form.locator('[data-contact-cancel]')).toBeHidden();
        const verification = form.locator('[data-contact-verification]');
        const mount = form.locator('[data-contact-turnstile]');
        await expect(verification).toBeVisible();
        const compact = await form
            .locator('.contact-form__end')
            .evaluate((element) => element.getBoundingClientRect().width < 300);
        await expect(mount).toHaveAttribute(
            'data-test-widget-size',
            compact ? 'compact' : 'flexible',
        );
        expect(await geometry()).toEqual(before);
        const widget = (await verification.boundingBox())!;
        const actions = (await form.locator('.contact-form__actions').boundingBox())!;
        expect(widget.y + widget.height / 2).toBeCloseTo(actions.y + actions.height / 2, 1);
        await expect(form.locator('[data-contact-submit]')).toHaveAttribute('hidden', '');
        await expect(form.locator('[data-contact-cancel]')).toHaveAttribute('hidden', '');
        const details = (await form.locator('.contact-section__details').boundingBox())!;
        expect(widget.y).toBeGreaterThanOrEqual(details.y + details.height);
        await form.screenshot({ path: testInfo.outputPath('contact-verification.png') });
        await page.evaluate(() => document.dispatchEvent(new Event('test:verified')));
        await expect(form).toHaveAttribute('data-contact-state', 'success');
        await expect(verification).toBeHidden();
        expect(await geometry()).toEqual(before);
    });
}
