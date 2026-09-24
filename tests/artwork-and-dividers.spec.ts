import { expect, test } from '@playwright/test';

test('primary marker keeps multiply blending above its shadow after hover and view switching', async ({
    page,
}) => {
    await page.goto('/work/');
    await page.getByRole('button', { name: 'Grid view', exact: true }).click();
    await expect(page.locator('[data-work-collection]')).not.toHaveAttribute(
        'data-work-transition',
    );
    await page.getByRole('button', { name: 'List view', exact: true }).click();
    await expect(page.locator('[data-work-collection]')).not.toHaveAttribute(
        'data-work-transition',
    );

    for (const route of ['work', 'home']) {
        if (route === 'home') {
            await page.getByRole('link', { name: 'Home', exact: true }).click();
            await expect(page).toHaveURL('/');
            await expect(page.locator('.home-body')).toHaveCSS('opacity', '1');
        }
        const buttons = page.locator('.work-entry__button');
        for (const button of await buttons.all()) {
            await expect(button.locator('.button__highlighter--enabled')).toHaveCSS(
                'mix-blend-mode',
                'multiply',
            );
            await expect(button.locator('.button__highlighter--enabled')).toHaveCSS(
                'transform',
                'none',
            );
            const centerOffset = await button.evaluate((element) => {
                const button = element.getBoundingClientRect();
                const marker = element
                    .querySelector('.button__highlighter--enabled')!
                    .getBoundingClientRect();
                return {
                    x: marker.x + marker.width / 2 - button.x - button.width / 2,
                    y: marker.y + marker.height / 2 - button.y - button.height / 2,
                };
            });
            expect(Math.abs(centerOffset.x)).toBeLessThan(0.1);
            expect(Math.abs(centerOffset.y)).toBeLessThan(0.1);
            await button.hover();
            await expect(button.locator('.button__shadow--hover')).toHaveCSS('opacity', '1');
            await page.mouse.move(1, 1);
            await expect(button.locator('.button__shadow--default')).toHaveCSS('opacity', '1');
            expect(
                await button.evaluate((element) => {
                    const z = (selector: string) =>
                        Number(getComputedStyle(element.querySelector(selector)!).zIndex);
                    return [
                        z('.button__highlighter--enabled'),
                        z('.button__shadow--default'),
                        Number(getComputedStyle(element, '::before').zIndex),
                        z('.button__label'),
                    ];
                }),
            ).toEqual([1, 0, 2, 3]);
        }
    }
});

test('one extension token controls section and contact dividers on every route', async ({
    page,
}) => {
    for (const width of [1280, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const route of ['/', '/work/', '/about/', '/work/house-of-color/']) {
            await page.goto(route);
            const measure = () =>
                page.evaluate(() => {
                    const contact = document.querySelector('.contact-section__content')!;
                    const style = getComputedStyle(contact);
                    const before = getComputedStyle(contact, '::before');
                    const heading = document.querySelector('.section-header');
                    return {
                        rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
                        contactExtension:
                            Number.parseFloat(style.paddingLeft) - Number.parseFloat(before.left),
                        headingExtension: heading
                            ? -Number.parseFloat(getComputedStyle(heading).marginLeft)
                            : null,
                    };
                });
            for (const extension of [0.5, 1.5]) {
                if (extension !== 0.5) {
                    await page.evaluate(
                        (value) =>
                            document.documentElement.style.setProperty(
                                '--content-divider-extension',
                                `${value}rem`,
                            ),
                        extension,
                    );
                }
                const metrics = await measure();
                expect(metrics.contactExtension).toBeCloseTo(extension * metrics.rem, 3);
                if (metrics.headingExtension !== null) {
                    expect(metrics.headingExtension).toBeCloseTo(extension * metrics.rem, 3);
                }
            }
        }
    }
});
