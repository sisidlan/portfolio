import { expect, test } from '@playwright/test';

// ============================================================================
// Contact form state, submission, and no-JavaScript coverage
// ============================================================================
test('autofill changes and form reset keep validation, labels, and send availability in sync', async ({
    page,
}) => {
    await page.goto('/');
    const form = page.locator('[data-contact-form]');
    const send = form.getByRole('button', { name: 'Send', exact: true });
    await expect(form).toHaveAttribute('data-contact-form-ready', 'true');

    // Autofill may send change without the keystroke-by-keystroke input sequence.
    await form.evaluate((element) => {
        for (const [name, value] of Object.entries({
            name: 'Kevin',
            email: 'hello@example.com',
            message: 'Hello!',
        })) {
            const control = element.querySelector<HTMLInputElement | HTMLTextAreaElement>(
                `[name="${name}"]`,
            )!;
            control.value = value;
            control.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    await expect(send).toHaveAttribute('aria-disabled', 'false');
    await expect(send).not.toHaveAttribute('aria-describedby');
    await expect(form.locator('label[for="contact-name"]')).toHaveCSS('font-size', '12px');

    await form.locator('#contact-email').fill('invalid');
    await form.locator('#contact-message').focus();
    await expect(form.locator('#contact-email')).toHaveAttribute('aria-invalid', 'true');
    await form.evaluate((element: HTMLFormElement) => element.reset());
    await expect(form.locator('#contact-email')).toHaveValue('');
    await expect(form.locator('#contact-email')).toHaveAttribute('aria-invalid', 'false');
    await expect(form.locator('#contact-email-error')).toBeHidden();
    await expect(send).toHaveAttribute('aria-disabled', 'true');
    await expect(send).toHaveAccessibleDescription('Complete all fields to enable send');
    await expect(form.locator('label[for="contact-name"]')).toHaveCSS('font-size', '20px');
    await send.focus();
    await expect(send).toBeFocused();
});

test('invalid submissions stay on the page and valid values reach a configured native form action', async ({
    page,
}) => {
    await page.goto('/');
    const form = page.locator('[data-contact-form]');
    const send = form.getByRole('button', { name: 'Send', exact: true });
    const submissions: string[] = [];
    await page.route('**/contact-test/', async (route) => {
        expect(route.request().method()).toBe('POST');
        submissions.push(route.request().postData() ?? '');
        await route.fulfill({ contentType: 'text/html', body: '<h1>Message received</h1>' });
    });
    await form.evaluate((element: HTMLFormElement) => {
        element.action = '/contact-test/';
    });
    await send.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/');
    expect(submissions).toEqual([]);

    await form.locator('#contact-name').fill('Kevin & team');
    await form.locator('#contact-email').fill('hello@example.com');
    await form.locator('#contact-message').fill('A message with <markup> & punctuation.');
    await send.click();
    await expect(page).toHaveURL('/contact-test/');
    expect(submissions).toHaveLength(1);
    expect(Object.fromEntries(new URLSearchParams(submissions[0]))).toEqual({
        name: 'Kevin & team',
        email: 'hello@example.com',
        message: 'A message with <markup> & punctuation.',
    });
});

test('filled labels and native email validation work without JavaScript', async ({
    browser,
    baseURL,
}) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    await page.goto('/');
    await page.locator('#contact-name').fill('Kevin');
    await expect(page.locator('label[for="contact-name"]')).toHaveCSS('font-size', '12px');
    await page.locator('#contact-email').fill('invalid');
    await page.locator('#contact-message').fill('Hello');
    await page.getByRole('button', { name: 'Send', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/');
    await expect(page.locator('#contact-email')).toBeFocused();
    await context.close();
});
