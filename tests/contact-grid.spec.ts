import { expect, test, type Page } from '@playwright/test';

async function alignmentError(page: Page) {
    return page.evaluate(() => {
        const readerTop = document.querySelector('.reader')!.getBoundingClientRect().top;
        const styles = getComputedStyle(document.documentElement);
        const size = styles.getPropertyValue('--grid-size');
        const grid =
            parseFloat(size) * (size.trim().endsWith('rem') ? parseFloat(styles.fontSize) : 1);
        return Math.max(
            ...[...document.querySelectorAll('[data-contact-field]')].map((field) => {
                const position = field.getBoundingClientRect().bottom - readerTop;
                const remainder = ((position % grid) + grid) % grid;
                return Math.min(remainder, grid - remainder);
            }),
        );
    });
}

for (const width of [1600, 1376, 800, 390, 340]) {
    test(`contact field borders stay on the paper grid after load and layout changes at ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 1000 });
        for (const path of ['/', '/about/', '/work/', '/work/house-of-color/']) {
            await page.goto(path);
            await expect(page.locator('[data-contact-form]')).toHaveAttribute(
                'data-contact-form-ready',
                'true',
            );
            await page.evaluate(() => document.fonts.ready);
            await expect.poll(() => alignmentError(page)).toBeLessThan(0.1);
            // Simulate content becoming taller after initialization without a window resize.
            await page.locator('.page').evaluate((element) => {
                const extra = document.createElement('div');
                extra.style.height = '17.375px';
                extra.dataset.testExtraContent = '';
                element.append(extra);
            });
            await expect.poll(() => alignmentError(page)).toBeLessThan(0.1);
            await page.locator('[data-test-extra-content]').evaluate((element) => element.remove());
            await expect.poll(() => alignmentError(page)).toBeLessThan(0.1);
            if (path === '/work/') {
                for (const view of ['grid', 'list', 'grid', 'list']) {
                    await page.getByRole('button', { name: `${view} view`, exact: false }).click();
                    await expect(page.locator('#work-projects')).not.toHaveAttribute(
                        'data-work-transition',
                    );
                    await expect.poll(() => alignmentError(page)).toBeLessThan(0.1);
                }
            }
        }
    });
}
