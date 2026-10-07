import { expect, test } from '@playwright/test';

// Point TEST_BASE_URL at Astro dev to verify the local-only branch. The normal
// production-preview test run verifies that these parameters have no effect.
for (const state of ['success', 'error', 'verifying']) {
    test(`contact ${state} preview is persistent in dev and inactive in production`, async ({
        page,
    }) => {
        let deliveryCalls = 0;
        await page.route('**/api/contact/**', (route) => {
            deliveryCalls++;
            return route.abort();
        });
        await page.route('https://challenges.cloudflare.com/**', (route) => {
            deliveryCalls++;
            return route.abort();
        });
        if (state === 'verifying') {
            await page.addInitScript(() => {
                window.turnstile = {
                    render(container, options) {
                        container.dataset.testSitekey = options.sitekey;
                        container.dataset.testSize = options.size;
                        const widget = document.createElement('div');
                        widget.textContent = 'Test widget';
                        container.append(widget);
                        document.addEventListener('preview-solved', () =>
                            options.callback('ignored-preview-token'),
                        );
                        return 'preview-widget';
                    },
                    execute() {},
                    remove() {
                        document.querySelector('[data-contact-turnstile]')?.replaceChildren();
                    },
                };
            });
        }
        await page.goto(`/?contact-preview=${state}`);
        const form = page.locator('[data-contact-form]');
        await expect(form).toHaveAttribute('data-contact-form-ready', 'true');
        if (!process.env.TEST_BASE_URL) {
            await expect(form).toHaveAttribute('data-contact-state', 'editing');
            await expect(form.locator('[data-contact-success]')).toBeHidden();
            await expect(form.locator('[data-contact-delivery-error]')).toBeHidden();
            await expect(form.locator('[data-contact-turnstile]')).toBeEmpty();
            expect(deliveryCalls).toBe(0);
            return;
        }

        await expect(form).toHaveAttribute('data-contact-state', state);
        await expect(
            form.locator(
                state === 'success'
                    ? '[data-contact-success]'
                    : state === 'error'
                      ? '[data-contact-delivery-error]'
                      : '[data-contact-verification]',
            ),
        ).toBeVisible();
        await form.evaluate((element: HTMLFormElement) => {
            element.action = '/api/contact/';
            element.dataset.turnstileSiteId = 'preview-site-id';
        });
        if (state === 'verifying') {
            const mount = form.locator('[data-contact-turnstile]');
            await expect(mount).toHaveAttribute('data-test-sitekey', '3x00000000000000000000FF');
            await expect(mount).toHaveAttribute('data-test-size', 'flexible');
            await expect(form.locator('[data-contact-submit]')).toBeHidden();
            await expect(form.locator('[data-contact-cancel]')).toBeHidden();
            await page.evaluate(() => document.dispatchEvent(new Event('preview-solved')));
        } else {
            await form.locator('#contact-name').fill('Preview visitor');
            await form.locator('#contact-email').fill('visitor@example.com');
            await form.locator('#contact-message').fill('Preview draft');
        }
        await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
        await page.clock.install();
        await page.clock.fastForward(61000);
        await expect(form).toHaveAttribute('data-contact-state', state);
        expect(deliveryCalls).toBe(0);
        if (state === 'verifying') {
            await expect(form.locator('[data-contact-turnstile]')).toHaveText('Test widget');
            await page.evaluate(() => document.dispatchEvent(new Event('astro:before-swap')));
            await expect(form.locator('[data-contact-turnstile]')).toBeEmpty();
        }
    });
}
