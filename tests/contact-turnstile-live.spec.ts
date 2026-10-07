import { expect, test } from '@playwright/test';

test('the dev verification preview displays the real widget without delivery', async ({ page }) => {
    test.skip(
        !process.env.TEST_REAL_TURNSTILE || !process.env.TEST_BASE_URL,
        'Requires Astro dev and access to Cloudflare’s external test widget',
    );
    let deliveries = 0;
    await page.route('**/api/contact/**', (route) => {
        deliveries++;
        return route.abort();
    });
    await page.goto('/?contact-preview=verifying');
    const form = page.locator('[data-contact-form]');
    await expect(form).toHaveAttribute('data-contact-state', 'verifying');
    await expect(form.locator('[data-contact-submit]')).toBeHidden();
    await expect(form.locator('[data-contact-cancel]')).toBeHidden();
    await expect
        .poll(
            () =>
                form
                    .locator('[data-contact-turnstile]')
                    .evaluate(
                        (element) => element.firstElementChild?.getBoundingClientRect().height ?? 0,
                    ),
            { timeout: 15000 },
        )
        .toBe(65);
    await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
    await expect(form).toHaveAttribute('data-contact-state', 'verifying');
    expect(deliveries).toBe(0);
});

// Optional external integration check. Uses Cloudflare's public interactive
// test key and intercepts delivery; it never completes a challenge or sends mail.
test('the real Turnstile widget occupies the action slot and replaces both buttons', async ({
    page,
}, testInfo) => {
    test.skip(
        !process.env.TEST_REAL_TURNSTILE,
        'Requires access to Cloudflare’s external test widget',
    );
    let deliveries = 0;
    await page.route('**/contact-test/', (route) => {
        deliveries++;
        return route.abort();
    });
    await page.goto('/');
    const form = page.locator('[data-contact-form]');
    await expect(form).toHaveAttribute('data-contact-form-ready', 'true');
    await form.evaluate((element: HTMLFormElement) => {
        element.action = '/contact-test/';
        element.dataset.turnstileSiteId = '3x00000000000000000000FF';
        document.documentElement.style.setProperty('--contact-confirm-delay', '0ms');
    });
    await form.locator('#contact-name').fill('Widget layout test');
    await form.locator('#contact-email').fill('visitor@example.com');
    await form.locator('#contact-message').fill('No email is sent by this check.');
    await form.getByRole('button', { name: 'Send', exact: true }).click();
    await form.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(form).toHaveAttribute('data-contact-state', 'verifying');
    await expect(form.locator('[data-contact-submit]')).toBeHidden();
    await expect(form.locator('[data-contact-cancel]')).toBeHidden();
    const widget = form.locator('[data-contact-verification]');
    const mount = form.locator('[data-contact-turnstile]');
    await expect
        .poll(
            () =>
                mount.evaluate(
                    (element) => element.firstElementChild?.getBoundingClientRect().height ?? 0,
                ),
            { timeout: 15000 },
        )
        .toBe(65);
    const actions = (await form.locator('.contact-form__actions').boundingBox())!;
    const bounds = (await widget.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(300);
    expect(bounds.y + bounds.height / 2).toBeCloseTo(actions.y + actions.height / 2, 1);
    await form.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    const formBounds = (await form.boundingBox())!;
    const widgetBounds = (await widget.boundingBox())!;
    await page.screenshot({
        path: testInfo.outputPath('real-turnstile.png'),
        clip: {
            ...formBounds,
            height:
                Math.max(formBounds.height, widgetBounds.y + widgetBounds.height - formBounds.y) +
                8,
        },
    });
    expect(deliveries).toBe(0);
});
