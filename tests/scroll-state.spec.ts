import { expect, test } from '@playwright/test';

// ============================================================================
// Scroll checkpoint persistence
// ============================================================================
test('scroll checkpoints are bounded and an immediate reload restores the final position', async ({
    page,
}) => {
    await page.goto('/');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('[data-contact-form]')).toHaveAttribute(
        'data-contact-form-ready',
        'true',
    );
    const writes = await page.evaluate(async () => {
        const paper = document.querySelector<HTMLElement>('.paper')!;
        const original = history.replaceState.bind(history);
        let count = 0;
        history.replaceState = (...args) => {
            count += 1;
            original(...args);
        };
        for (let frame = 1; frame <= 60; frame += 1) {
            paper.scrollTop = frame * 5;
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        history.replaceState = original;
        return count;
    });
    expect(writes).toBeLessThanOrEqual(4);
    await page.locator('.paper').evaluate((element) => {
        element.scrollTop = 360;
    });
    await page.reload();
    await expect
        .poll(() => page.locator('.paper').evaluate((element) => element.scrollTop))
        .toBe(360);
});
