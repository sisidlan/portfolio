import { expect, test } from '@playwright/test';

test('keyboard focus reveals delayed content immediately and keeps it visible', async ({
    page,
}) => {
    await page.goto('/');
    await expect(page.locator('[data-contact-form]')).toHaveAttribute(
        'data-contact-form-ready',
        'true',
    );
    const action = page.getByRole('link', { name: 'View my work', exact: true });
    await action.focus();
    await expect(action).toHaveCSS('opacity', '1');
    await page.locator('.tab-work').focus();
    await expect(action).toHaveCSS('opacity', '1');

    await page.locator('#contact-name').focus();
    await expect(page.locator('#contact')).toHaveCSS('opacity', '1');
    await page.locator('.tab-home').focus();
    await expect(page.locator('#contact')).toHaveCSS('opacity', '1');

    await page.goto('/work/');
    await page.getByRole('button', { name: 'Grid view', exact: true }).focus();
    await expect(page.locator('.work-view-toggle')).toHaveCSS('opacity', '1');
    await page.locator('.work-thumbnail').first().focus();
    await expect(page.locator('.work-browser__content')).toHaveCSS('opacity', '1');
});

test('filled and invalid contact controls preserve their colors without rectangular outlines', async ({
    page,
}) => {
    await page.goto('/');
    const name = page.locator('#contact-name');
    const email = page.locator('#contact-email');
    const message = page.locator('#contact-message');
    await name.fill('Kevin');
    await email.fill('invalid');
    await message.fill('Hello');
    await expect(email).toHaveAttribute('aria-invalid', 'true');

    for (const control of [name, email, message]) {
        await control.focus();
        await expect(control).toBeFocused();
        await expect(control).toHaveCSS('outline-style', 'none');
        await expect(page.locator('#contact')).toHaveCSS('opacity', '1');
    }
    await expect(page.locator('.contact-form__field--name')).toHaveCSS(
        'color',
        'rgb(105, 102, 99)',
    );
    await expect(page.locator('.contact-form__field--email')).toHaveCSS(
        'color',
        'rgb(188, 39, 32)',
    );
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`contact navigation moves focus to the form and preserves keyboard order (${reducedMotion})`, async ({
        page,
        browserName,
    }) => {
        await page.emulateMedia({ reducedMotion });
        await page.goto('/');
        const action = page.getByRole('link', { name: 'Get in touch', exact: true });
        await action.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#contact')).toBeFocused();
        await expect(page.locator('#contact')).toBeInViewport();
        await expect(page).toHaveURL('/');
        await page.keyboard.press(
            browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab',
        );
        await expect(page.locator('#contact-name')).toBeFocused();
        await expect(page.locator('#contact-name')).toBeInViewport();

        if (reducedMotion === 'reduce') {
            await page.locator('.tab-home').click();
            await expect
                .poll(() => page.locator('.paper').evaluate((element) => element.scrollTop))
                .toBe(0);
            await action.click();
            await expect(page.locator('#contact')).toBeFocused();
            await expect(page.locator('#contact')).toBeInViewport();
        }
    });
}

for (const input of ['wheel', 'keyboard']) {
    test(`${input} input can interrupt contact scrolling`, async ({ page }) => {
        await page.goto('/');
        await page.mouse.move(1000, 500);
        await page.evaluate(() => {
            document.querySelector<HTMLAnchorElement>('a[href="#contact"]')!.click();
        });
        await expect
            .poll(() => page.locator('.paper').evaluate((element) => element.scrollTop))
            .toBeGreaterThan(0);
        if (input === 'wheel') await page.mouse.wheel(0, -1000);
        else await page.keyboard.press('PageUp');
        // Wait beyond both the old custom animation and the browser's scroll settling time.
        await page.waitForTimeout(1200);
        await expect(page.locator('#contact')).not.toBeInViewport();
    });
}

test('view-switch animation starts at the previous media bounds in both directions', async ({
    page,
}) => {
    await page.setViewportSize({ width: 900, height: 1100 });
    await page.goto('/work/');
    await page.evaluate(() => document.fonts.ready);
    for (const view of ['grid', 'list']) {
        const geometry = await page.evaluate((nextView) => {
            const media = [...document.querySelectorAll<HTMLElement>('.work-entry__media')];
            const before = media.map((element) => element.getBoundingClientRect().toJSON());
            document
                .querySelector<HTMLButtonElement>(`[data-work-view-option="${nextView}"]`)!
                .click();
            for (const element of media) {
                for (const animation of element.getAnimations()) {
                    animation.pause();
                    animation.currentTime = 0;
                }
            }
            const opening = media.map((element) => element.getBoundingClientRect().toJSON());
            for (const element of media) {
                for (const animation of element.getAnimations()) animation.finish();
            }
            return { before, opening };
        }, view);
        for (let index = 0; index < geometry.before.length; index += 1) {
            for (const dimension of ['x', 'y', 'width', 'height']) {
                expect(geometry.opening[index][dimension]).toBeCloseTo(
                    geometry.before[index][dimension],
                    1,
                );
            }
        }
        await expect(page.locator('#work-projects')).not.toHaveAttribute('data-work-transition');
    }
});

test('exiting close artwork is inert and rapid forward navigation removes it', async ({ page }) => {
    await page.goto('/work/');
    await page.locator('.work-thumbnail').first().click();
    await expect(page.locator('.tab-close-stage')).toHaveCount(1);
    const exitState = await page.locator('.tab-close-stage a').evaluate((link) => {
        (link as HTMLAnchorElement).focus();
        (link as HTMLAnchorElement).click();
        const stage = link.parentElement!;
        return {
            inert: stage.inert,
            hidden: stage.getAttribute('aria-hidden'),
            focused: stage.contains(document.activeElement),
            inBody: stage.parentElement === document.body,
        };
    });
    expect(exitState).toEqual({ inert: true, hidden: 'true', focused: false, inBody: true });
    await expect(page).toHaveURL('/work/');
    await page.goForward();
    await expect(page.locator('.tab-close-stage')).toHaveCount(1);
    await expect(page.locator('.tab-close')).toHaveCount(1);
    await expect(page.locator('.tab-close-exit-stage')).toHaveCount(0);
    await page.locator('.tab-close').focus();
    await expect(page.locator('.tab-close')).toBeFocused();
});

test('delayed controls are visible on focus without JavaScript', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    try {
        await page.goto('/');
        const action = page.getByRole('link', { name: 'View my work', exact: true });
        await action.focus();
        await expect(action).toHaveCSS('opacity', '1');
        await page.locator('#contact-name').focus();
        await expect(page.locator('#contact')).toHaveCSS('opacity', '1');
        await expect(page.locator('#contact-name')).toHaveCSS('outline-style', 'none');
    } finally {
        await context.close();
    }
});

test('a close navigation that stays on the page restores the interactive tab', async ({ page }) => {
    await page.goto('/work/');
    await page.locator('.work-thumbnail').first().click();
    await expect(page.locator('.tab-close-stage')).toHaveCount(1);
    // Simulate a history traversal that does not navigate, exercising the exit fallback.
    await page.evaluate(() => {
        history.back = () => {};
    });
    await page.locator('.tab-close').click();
    await expect(page.locator('.tab-close-exit-stage')).toHaveCount(1);
    await expect(page.locator('.tab-close-stage')).toHaveCount(1);
    await expect(page.locator('.tab-close-stage')).not.toHaveAttribute('inert');
    await expect(page.locator('.tab-close-stage')).not.toHaveAttribute('aria-hidden');
    await page.locator('.tab-close').focus();
    await expect(page.locator('.tab-close')).toBeFocused();
});
