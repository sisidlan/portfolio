import { expect, test, type Page } from '@playwright/test';

async function fillMessage(page: Page) {
    await page.goto('/');
    const form = page.locator('[data-contact-form]');
    await expect(form).toHaveAttribute('data-contact-form-ready', 'true');
    await form.locator('#contact-name').fill('Kevin & team');
    await form.locator('#contact-email').fill('hello@example.com');
    await form.locator('#contact-message').fill('Hello <world> & friends!');
    return form;
}

async function configureEndpoint(page: Page) {
    await page.locator('[data-contact-form]').evaluate((form: HTMLFormElement) => {
        form.action = '/contact-test/';
    });
}

test('review locks gray fields, Cancel preserves the draft, and success returns to empty Send', async ({
    page,
}, testInfo) => {
    let submissions = 0;
    await page.route('**/contact-test/', async (route) => {
        submissions += 1;
        await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    });
    const form = await fillMessage(page);
    await configureEndpoint(page);
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const primary = form.locator('[data-contact-submit]');
    const cancel = form.getByRole('button', { name: 'Cancel', exact: true });
    const initial = (await form.boundingBox())!;
    const primaryBefore = (await primary.boundingBox())!;
    await primary.click();
    await expect(form).toHaveAttribute('data-contact-state', 'confirming');
    await expect(primary).toHaveText('3');
    await expect(primary).toHaveAccessibleName('Confirm');
    await expect(primary).toBeDisabled();
    await expect(cancel).toBeVisible();
    expect(submissions).toBe(0);
    for (const field of await form.locator('[data-contact-field]').all()) {
        const control = field.locator('input, textarea');
        await expect(control).toHaveAttribute('readonly');
        await expect(control).not.toBeEditable();
        await expect(control).toHaveCSS('color', 'rgb(149, 150, 152)');
        await expect(field.locator('label')).toHaveCSS('color', 'rgb(149, 150, 152)');
        await expect(field).toHaveCSS('color', 'rgb(149, 150, 152)');
        expect(
            await field.evaluate(
                (element) => getComputedStyle(element, '::before').borderBottomColor,
            ),
        ).toBe('rgb(149, 150, 152)');
    }
    const primaryAfter = (await primary.boundingBox())!;
    const cancelBox = (await cancel.boundingBox())!;
    expect(primaryAfter.x).toBeCloseTo(primaryBefore.x, 1);
    expect(primaryAfter.y - (await form.boundingBox())!.y).toBeCloseTo(
        primaryBefore.y - initial.y,
        1,
    );
    const actionGap = await form
        .locator('.contact-form__actions')
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).gap));
    expect(primaryAfter.x - cancelBox.x - cancelBox.width).toBeCloseTo(actionGap, 1);
    expect((await form.boundingBox())!.height).toBeCloseTo(initial.height, 1);
    await form.screenshot({ path: testInfo.outputPath('contact-review.png') });

    await cancel.click();
    await expect(form).toHaveAttribute('data-contact-state', 'editing');
    await expect(form.locator('#contact-message')).toBeEditable();
    await expect(form.locator('#contact-message')).toBeFocused();
    await expect(form.locator('#contact-name')).toHaveValue('Kevin & team');
    await expect(form.locator('#contact-email')).toHaveValue('hello@example.com');
    await expect(form.locator('#contact-message')).toHaveValue('Hello <world> & friends!');
    await expect(primary).toHaveText('Send');
    await expect(cancel).toBeHidden();

    await primary.click();
    await expect(primary).toBeEnabled();
    await primary.click();
    await expect(form).toHaveAttribute('data-contact-state', 'success');
    expect(submissions).toBe(1);
    await expect(primary).toBeHidden();
    const success = form.locator('[data-contact-success]');
    await expect(success).toBeVisible();
    await expect(success).toHaveText('Message sent successfully');
    await expect(success).toHaveCSS('color', 'rgb(39, 130, 59)');
    await expect(success).toHaveCSS('font-size', '20px');
    await expect(success).toHaveCSS('gap', '16px');
    await expect(success.locator('svg')).toHaveCSS('width', '32px');
    await expect(success.locator('svg')).toHaveCSS('height', '32px');
    await expect(form.getByRole('status')).toHaveText('Message sent successfully.');
    for (const control of await form.locator('input, textarea').all()) {
        await expect(control).toHaveValue('');
        await expect(control).toBeEditable();
    }
    await form.screenshot({ path: testInfo.outputPath('contact-success.png') });
    await expect(form).toHaveAttribute('data-contact-state', 'editing', { timeout: 6000 });
    await expect(primary).toBeVisible();
    await expect(primary).toHaveText('Send');
    await expect(primary).toHaveAttribute('aria-disabled', 'true');
    await expect(success).toBeHidden();
});

test('Confirm counts down, blocks submission, and restarts cleanly after Cancel', async ({
    page,
}) => {
    let submissions = 0;
    await page.route('**/contact-test/', async (route) => {
        submissions += 1;
        await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    });
    const form = await fillMessage(page);
    await configureEndpoint(page);
    const primary = form.locator('[data-contact-submit]');
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await primary.click();
    for (const text of ['3', '2', '1']) {
        await expect(primary).toHaveText(text);
        await expect(primary).toHaveAccessibleName('Confirm');
        await expect(primary).toBeDisabled();
        await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
        await expect(form).toHaveAttribute('data-contact-state', 'confirming');
        expect(submissions).toBe(0);
        // Reinitialization must keep the existing deadline and avoid duplicate timers.
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        await expect(primary).toHaveText(text);
        await page.clock.runFor(1000);
    }
    await expect(primary).toHaveText('Confirm');
    await expect(primary).toBeEnabled();
    expect(submissions).toBe(0);
    await form.getByRole('button', { name: 'Cancel' }).click();
    await primary.click();
    await expect(primary).toHaveText('3');
    await page.clock.runFor(1000);
    await expect(primary).toHaveText('2');
    await form.getByRole('button', { name: 'Cancel' }).click();
    await page.clock.runFor(3000);
    await expect(primary).toHaveText('Send');
    await expect(form).toHaveAttribute('data-contact-state', 'editing');
    await expect(form.locator('#contact-message')).toHaveValue('Hello <world> & friends!');
    await primary.click();
    await expect(primary).toHaveText('3');
    // If callbacks are delayed, derive the label from elapsed time rather than replaying ticks.
    await page.clock.fastForward(3001);
    await expect(primary).toHaveText('Confirm');
    await expect(primary).toBeEnabled();
    await primary.click();
    await expect(form).toHaveAttribute('data-contact-state', 'success');
    expect(submissions).toBe(1);
});

test('rapid submissions and double clicks cannot bypass review or duplicate a pending request', async ({
    page,
}) => {
    let release!: () => void;
    const response = new Promise<void>((resolve) => {
        release = resolve;
    });
    let submissions = 0;
    await page.route('**/contact-test/', async (route) => {
        submissions += 1;
        await response;
        await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    });
    try {
        const form = await fillMessage(page);
        await configureEndpoint(page);
        const primary = form.locator('[data-contact-submit]');
        await primary.dblclick();
        await expect(form).toHaveAttribute('data-contact-state', 'confirming');
        await expect(primary).toHaveAttribute('aria-disabled', 'true');
        await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
        expect(submissions).toBe(0);
        await expect(primary).toBeEnabled();
        // OS click counts can still identify a double click after the arming delay.
        await primary.evaluate((button) =>
            button.dispatchEvent(
                new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    detail: 2,
                }),
            ),
        );
        expect(submissions).toBe(0);
        await primary.click();
        await expect(form).toHaveAttribute('data-contact-state', 'sending');
        await expect.poll(() => submissions).toBe(1);
        await expect(primary).toHaveText('Sending…');
        await expect(primary).toHaveAttribute('aria-busy', 'true');
        await expect(form.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        await form.evaluate((element: HTMLFormElement) => {
            element.requestSubmit();
            element.requestSubmit();
        });
        expect(submissions).toBe(1);
        release();
        await expect(form).toHaveAttribute('data-contact-state', 'success');
        expect(submissions).toBe(1);
    } finally {
        release();
    }
});

test('held Enter does not confirm after the arming delay and Escape restores editing', async ({
    page,
}) => {
    const form = await fillMessage(page);
    const primary = form.locator('[data-contact-submit]');
    await primary.focus();
    await page.keyboard.down('Enter');
    await expect(form).toHaveAttribute('data-contact-state', 'confirming');
    await expect(primary).toBeEnabled();
    await page.keyboard.down('Enter');
    await expect(form).toHaveAttribute('data-contact-state', 'confirming');
    await page.keyboard.up('Enter');
    await page.keyboard.press('Escape');
    await expect(form).toHaveAttribute('data-contact-state', 'editing');
    await expect(form.locator('#contact-message')).toBeFocused();
    await expect(form.locator('#contact-message')).toHaveValue('Hello <world> & friends!');
});

for (const failure of ['unavailable', 'server', 'network']) {
    test(`${failure} delivery never shows success or clears the message`, async ({
        page,
    }, testInfo) => {
        const form = await fillMessage(page);
        if (failure !== 'unavailable') {
            await configureEndpoint(page);
            await page.route('**/contact-test/', async (route) => {
                if (failure === 'network') await route.abort('failed');
                else await route.fulfill({ status: 500, body: 'Failed' });
            });
        }
        const primary = form.locator('[data-contact-submit]');
        await primary.click();
        await expect(primary).toBeEnabled();
        await primary.click();
        const error = form.getByRole('alert');
        await expect(error).toBeVisible();
        await expect(error).toHaveText('Unable to send message, try again later');
        await expect(error).toHaveCSS('color', 'rgb(188, 39, 32)');
        await expect(error).toHaveCSS('font-size', '20px');
        await expect(error).toHaveCSS('text-transform', 'uppercase');
        expect(await error.evaluate((element) => getComputedStyle(element).fontFamily)).toBe(
            await form
                .locator('[data-contact-success]')
                .evaluate((element) => getComputedStyle(element).fontFamily),
        );
        await expect(form).toHaveAttribute('data-contact-state', 'error');
        await expect(primary).toBeHidden();
        await expect(page.locator('#contact')).toBeFocused();
        const actionsBox = (await form.locator('.contact-form__actions').boundingBox())!;
        const errorBox = (await error.boundingBox())!;
        expect(errorBox.x + errorBox.width).toBeCloseTo(actionsBox.x + actionsBox.width, 1);
        expect(errorBox.y + errorBox.height / 2).toBeCloseTo(
            actionsBox.y + actionsBox.height / 2,
            1,
        );
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        await expect(error).toBeVisible();
        await expect(form.locator('[data-contact-success]')).toBeHidden();
        await expect(form.locator('#contact-message')).toHaveValue('Hello <world> & friends!');
        await expect(form.locator('#contact-message')).toBeEditable();
        if (failure === 'unavailable') {
            await form.screenshot({ path: testInfo.outputPath('contact-error.png') });
            await expect(form).toHaveAttribute('data-contact-state', 'editing', { timeout: 6000 });
        } else {
            await form.locator('#contact-message').fill('An edited draft');
            await expect(form).toHaveAttribute('data-contact-state', 'editing');
        }
        await expect(error).toBeHidden();
        await expect(primary).toBeVisible();
        await expect(primary).toHaveText('Send');
        await expect(primary).toBeEnabled();
    });
}

test('a timed-out request unlocks the draft and never produces a late success', async ({
    page,
}) => {
    let release!: () => void;
    const response = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route('**/contact-test/', async (route) => {
        await response;
        await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    });
    try {
        const form = await fillMessage(page);
        await configureEndpoint(page);
        const primary = form.locator('[data-contact-submit]');
        // Install the clock before creating the deadline so performance.now stays consistent.
        await page.clock.install();
        await primary.click();
        const delay = await page.evaluate(() => {
            const value = getComputedStyle(document.documentElement)
                .getPropertyValue('--contact-confirm-delay')
                .trim();
            return Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
        });
        await page.clock.fastForward(delay + 1);
        await expect(primary).toBeEnabled();
        await primary.click();
        await expect(form).toHaveAttribute('data-contact-state', 'sending');
        await page.clock.fastForward(15_001);
        await expect(form).toHaveAttribute('data-contact-state', 'error');
        await expect(form.getByRole('alert')).toBeVisible();
        await expect(form.locator('#contact-message')).toBeEditable();
        await expect(form.locator('#contact-message')).toHaveValue('Hello <world> & friends!');
        release();
        await expect(form.locator('[data-contact-success]')).toBeHidden();
        await expect(primary).toHaveText('Send');
        await expect(primary).toBeHidden();
        await page.clock.fastForward(5001);
        await expect(form).toHaveAttribute('data-contact-state', 'editing');
        await expect(primary).toBeVisible();
        await expect(primary).toBeEnabled();
    } finally {
        release();
    }
});

test('reinitialization, reset, and navigation clear review state without accumulating handlers', async ({
    page,
}) => {
    let submissions = 0;
    await page.route('**/contact-test/', async (route) => {
        submissions += 1;
        await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    });
    const form = await fillMessage(page);
    await configureEndpoint(page);
    await form.locator('[data-contact-submit]').click();
    await page.evaluate(() => {
        for (let index = 0; index < 3; index += 1) {
            window.dispatchEvent(new Event('resize'));
            window.dispatchEvent(new PageTransitionEvent('pageshow'));
            document.dispatchEvent(new Event('work:view-change'));
        }
    });
    await expect(form).toHaveAttribute('data-contact-state', 'confirming');
    await expect(form.locator('#contact-message')).toHaveAttribute('readonly');
    await expect(form.locator('[data-contact-submit]')).toBeEnabled();
    await form.locator('[data-contact-submit]').click();
    await expect(form).toHaveAttribute('data-contact-state', 'success');
    expect(submissions).toBe(1);
    await form.evaluate((element: HTMLFormElement) => element.reset());
    await expect(form).toHaveAttribute('data-contact-state', 'editing');
    await expect(form.locator('[data-contact-submit]')).toBeVisible();
    await page.getByRole('link', { name: 'About', exact: true }).click();
    await expect(page).toHaveURL('/about/');
    await expect(form).toHaveAttribute('data-contact-form-ready', 'true');
    await expect(form).toHaveAttribute('data-contact-state', 'editing');
    await expect(form.locator('#contact-message')).toBeEditable();
    await expect(form.locator('#contact-message')).toHaveValue('');
});
