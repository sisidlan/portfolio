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
        const container = document.createElement('div');
        container.dataset.contactTurnstile = '';
        element.append(container);
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
    await expect(form).toHaveAttribute('data-contact-state', 'sending');
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
