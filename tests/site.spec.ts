import { expect, test } from '@playwright/test';

// ============================================================================
// Route, navigation, layout, and accessibility regressions
// ============================================================================
for (const route of ['/', '/about/', '/work/', '/work/house-of-color/']) {
    test(`${route} loads with valid landmarks, named links, and SVG references`, async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('response', (response) => {
            if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
        });
        const response = await page.goto(route);
        expect(response?.status()).toBe(200);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.getByRole('main')).toHaveCount(1);
        await expect(page.getByRole('contentinfo')).toHaveCount(1);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
        await expect(page.locator('.button h3, nav h3')).toHaveCount(0);
        for (const link of await page.getByRole('link').all()) {
            await expect(link).toHaveAccessibleName(/\S/);
        }

        const problems = await page.evaluate(() => {
            const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
            const issues = ids.filter((id, index) => ids.indexOf(id) !== index);
            for (const element of document.querySelectorAll('svg use, [aria-labelledby]')) {
                const reference =
                    element.getAttribute('href')?.slice(1) ||
                    element.getAttribute('aria-labelledby');
                for (const id of reference?.split(/\s+/) ?? []) {
                    if (id && !document.getElementById(id)) issues.push(id);
                }
            }
            return issues;
        });
        expect(problems).toEqual([]);
        expect(errors).toEqual([]);
    });
}

test('section and component headings use the revised hierarchy and type scale', async ({
    page,
}) => {
    await page.goto('/');

    const featuredHeading = page.getByRole('heading', {
        level: 2,
        name: 'Featured Work',
    });
    const contactHeading = page.getByRole('heading', {
        level: 3,
        name: 'Contact me',
        exact: true,
    });
    await expect(featuredHeading).toHaveCSS('font-size', '48px');
    await expect(contactHeading).toHaveCSS('font-size', '28px');

    await expect(page.getByRole('heading', { level: 3, name: 'What I Do:' })).toHaveCSS(
        'font-size',
        '28px',
    );
    await expect(page.getByRole('heading', { level: 3, name: 'House of Color' })).toHaveCSS(
        'font-size',
        '28px',
    );
});

test('work thumbnail rotations survive initial load, hover, reload, and client navigation', async ({
    page,
}) => {
    const rotationDirections = () =>
        page.locator('.work-thumbnail').evaluateAll((thumbnails) =>
            thumbnails.map((thumbnail) => {
                const matrix = new DOMMatrixReadOnly(getComputedStyle(thumbnail).transform);
                return Math.sign(matrix.b);
            }),
        );
    const followsListPattern = async () => {
        const directions = await rotationDirections();
        return (
            directions.length > 0 &&
            directions.every((direction, index) => direction === (index % 2 === 0 ? 1 : -1))
        );
    };
    const followsGridPattern = async () => {
        const directions = await rotationDirections();
        return (
            directions.length > 0 &&
            directions.every((direction, index) => {
                const row = Math.floor(index / 2);
                const column = index % 2;
                return direction === ((row + column) % 2 === 0 ? 1 : -1);
            })
        );
    };

    await page.goto('/');
    // Development styles are also imported by Vite after the server-rendered CSS.
    // Check the settled page, not a transient correct frame before those imports.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await expect.poll(followsListPattern).toBe(true);

    const firstThumbnail = page.locator('.work-thumbnail').first();
    await expect(firstThumbnail.locator('.work-thumbnail__image--sketch')).toHaveCSS(
        'opacity',
        '1',
    );
    await expect(firstThumbnail.locator('.work-thumbnail__image--finished')).toHaveCSS(
        'opacity',
        '0',
    );
    await firstThumbnail.hover();
    await expect(firstThumbnail).toHaveCSS('transform', 'matrix(1.025, 0, 0, 1.025, 0, 0)');
    await expect(firstThumbnail.locator('.work-thumbnail__image--sketch')).toHaveCSS(
        'opacity',
        '0',
    );
    await expect(firstThumbnail.locator('.work-thumbnail__image--finished')).toHaveCSS(
        'opacity',
        '1',
    );
    await page.mouse.down();
    await expect(firstThumbnail).toHaveCSS('transform', 'matrix(1.01, 0, 0, 1.01, 0, 0)');
    await page.mouse.move(1, 1);
    await page.mouse.up();
    await expect.poll(followsListPattern).toBe(true);

    await page.reload();
    await page.waitForTimeout(500);
    await expect.poll(followsListPattern).toBe(true);

    await page.getByRole('link', { name: 'About', exact: true }).click();
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect.poll(followsListPattern).toBe(true);

    await page.goto('/work/');
    await expect.poll(followsListPattern).toBe(true);
    // Exercise both cells of the second grid row even with a small catalogue.
    await page.locator('[data-work-collection]').evaluate((collection) => {
        while (collection.children.length < 4) {
            collection.append(collection.firstElementChild!.cloneNode(true));
        }
        collection.prepend(collection.lastElementChild!);
    });
    await expect.poll(followsListPattern).toBe(true);
    await page.locator('[data-work-view-option="grid"]').click();
    await expect.poll(followsGridPattern).toBe(true);
    await page.locator('[data-work-view-option="list"]').click();
    await expect.poll(followsListPattern).toBe(true);
    await page.locator('[data-work-collection]').evaluate((collection) => {
        collection.firstElementChild?.remove();
    });
    await expect.poll(followsListPattern).toBe(true);
});

test('work content starts its fade after client navigation has initialized the page', async ({
    page,
}) => {
    await page.goto('/');
    await page.evaluate(() => {
        document.addEventListener(
            'astro:after-swap',
            () => {
                sessionStorage.setItem(
                    'test:incoming-motion-gate',
                    String(document.documentElement.dataset.pageEntryPending),
                );
            },
            { once: true },
        );
    });
    await page.getByRole('link', { name: 'Work', exact: true }).click();

    const content = page.locator('.work-browser__content');
    await expect
        .poll(() => page.evaluate(() => sessionStorage.getItem('test:incoming-motion-gate')))
        .toBe('true');
    await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toHaveCSS(
        'opacity',
        '1',
    );
    await expect(content).toHaveCSS('animation-name', 'page-entry-reveal');
    await expect(content).toHaveCSS('opacity', '0');

    await page.waitForTimeout(900);
    const fadingOpacity = Number.parseFloat(
        await content.evaluate((element) => getComputedStyle(element).opacity),
    );
    expect(fadingOpacity).toBeGreaterThan(0);
    expect(fadingOpacity).toBeLessThan(1);

    await expect(content).toHaveCSS('opacity', '1');
});

test('home body fades on startup, refresh, and return navigation and releases its layer', async ({
    page,
}) => {
    const body = page.locator('.home-body');
    const verifyFade = async () => {
        await expect(body).toHaveCSS('will-change', 'opacity');
        const samples = await body.evaluate(async (element) => {
            const values: number[] = [];
            const deadline = performance.now() + 10000;
            while (performance.now() < deadline) {
                const opacity = Number(getComputedStyle(element).opacity);
                values.push(opacity);
                if (opacity === 1) break;
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            }
            return values;
        });
        expect(samples[0]).toBe(0);
        expect(samples.filter((opacity) => opacity > 0 && opacity < 1).length).toBeGreaterThan(5);
        expect(samples.at(-1)).toBe(1);
        await expect(body).toHaveCSS('will-change', 'auto');
    };

    await page.goto('/');
    await verifyFade();
    await page.reload();
    await verifyFade();
    await page.getByRole('link', { name: 'About', exact: true }).click();
    await expect(page).toHaveURL('/about/');
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL('/');
    await verifyFade();
});

for (const route of ['/about/', '/work/house-of-color/']) {
    test(`${route} keeps the shared fade and releases its opacity layer`, async ({ page }) => {
        await page.goto(route);
        // About currently contains only its heading; its contact section is the reveal target.
        const content = page
            .locator(route === '/about/' ? '.contact-section' : '.page-content > :not(h1)')
            .first();
        await expect(content).toHaveCSS('opacity', '0');
        await expect(content).toHaveCSS('will-change', 'opacity');
        await expect
            .poll(async () => {
                const opacity = Number(
                    await content.evaluate((element) => getComputedStyle(element).opacity),
                );
                return opacity > 0 && opacity < 1;
            })
            .toBe(true);
        await expect(content).toHaveCSS('opacity', '1');
        await expect(content).toHaveCSS('will-change', 'auto');
    });
}

test('reduced motion shows work content immediately after client navigation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('link', { name: 'Work', exact: true }).click();

    const content = page.locator('.work-browser__content');
    await expect(content).toHaveCSS('animation-name', 'none');
    await expect(content).toHaveCSS('opacity', '1');
    await expect(content).toHaveCSS('will-change', 'auto');
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page.locator('.home-body')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.home-body')).toHaveCSS('opacity', '1');
    await expect(page.locator('.home-body')).toHaveCSS('will-change', 'auto');
});

test('client navigation preserves tab selection, overlap, and case-study close behavior', async ({
    page,
}) => {
    await page.goto('/');
    const shell = await page.evaluateHandle(() => {
        const elements = [
            document.body,
            document.querySelector('.binder'),
            document.querySelector('.binder-nav'),
        ];
        const state = { elements, detached: false };
        new MutationObserver((records) => {
            state.detached ||= records.some((record) =>
                [...record.removedNodes].some((node) =>
                    elements.some(
                        (element) => element && (node === element || node.contains(element)),
                    ),
                ),
            );
        }).observe(document.documentElement, { childList: true, subtree: true });
        return state;
    });
    await page.getByRole('link', { name: 'About', exact: true }).click();
    await expect(page).toHaveURL('/about/');
    await expect(page.locator('.tab-about')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.tab-about')).toHaveCSS('z-index', '2');
    await page.getByRole('link', { name: 'Work', exact: true }).click();
    await expect(page).toHaveURL('/work/');
    await expect(page.locator('.tab-work')).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'View case study: House of Color', exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/work/house-of-color/');
    await expect(page.locator('.tab-close')).toHaveCSS('left', '16px');
    await page.getByRole('link', { name: 'Close case study and return to Work' }).click();
    await expect(page).toHaveURL('/work/');
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL('/');
    expect(
        await shell.evaluate(({ elements, detached }) => ({
            detached,
            connected: elements.every((element) => element?.isConnected),
        })),
    ).toEqual({ detached: false, connected: true });
});

test('the active home tab returns the paper to the top', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 300 });
    await page.goto('/');

    const paper = page.locator('.paper');
    await paper.evaluate((element) => {
        const paperElement = element as HTMLElement;
        paperElement.style.scrollBehavior = 'auto';
        paperElement.scrollTop = paperElement.scrollHeight;
        paperElement.style.removeProperty('scroll-behavior');
    });
    await expect.poll(() => paper.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await page.locator('.tab-home').click();
    await expect(page).toHaveURL('/');
    await expect.poll(() => paper.evaluate((element) => element.scrollTop)).toBe(0);
});

test('case studies close to their source page and restore its paper position', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 300 });

    for (const scenario of [
        { path: '/', label: 'Home' },
        { path: '/work/', label: 'Work' },
    ]) {
        await page.goto(scenario.path);

        const caseStudyLink = page.getByRole('link', { name: 'View case study' }).last();
        await caseStudyLink.scrollIntoViewIfNeeded();
        const paper = page.locator('.paper');
        const sourceScrollTop = await paper.evaluate((element) => element.scrollTop);

        expect(sourceScrollTop).toBeGreaterThan(0);
        await caseStudyLink.click();
        await expect.poll(() => new URL(page.url()).pathname).toBe('/work/house-of-color/');
        expect(new URL(page.url()).searchParams.get('returnTo')).toBe(scenario.path);

        await page
            .getByRole('link', { name: `Close case study and return to ${scenario.label}` })
            .click();
        await expect.poll(() => new URL(page.url()).pathname).toBe(scenario.path);
        await expect
            .poll(() => paper.evaluate((element) => element.scrollTop))
            .toBe(sourceScrollTop);
    }
});

test('case-study return survives reload and forward navigation with the original URL intact', async ({
    page,
}) => {
    const sourcePath = '/?filter=ux#main';
    await page.goto(sourcePath);
    const link = page.locator('[data-case-study-link]').last();
    await link.scrollIntoViewIfNeeded();
    const sourceTop = await page.locator('.paper').evaluate((element) => element.scrollTop);
    await link.click();
    await expect(page.locator('.tab-close')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe(sourcePath);

    await page.reload();
    await page.getByRole('link', { name: 'Close case study and return to Home' }).click();
    await expect(page).toHaveURL(sourcePath);
    await expect
        .poll(() => page.locator('.paper').evaluate((element) => element.scrollTop))
        .toBe(sourceTop);

    await page.goForward();
    await expect(page.locator('.tab-close')).toBeVisible();
    await page.locator('.tab-close').click();
    await expect(page).toHaveURL(sourcePath);
    await expect
        .poll(() => page.locator('.paper').evaluate((element) => element.scrollTop))
        .toBe(sourceTop);
});

test('case studies opened in a new tab restore their source URL and position', async ({
    page,
    context,
    browserName,
}) => {
    const sourcePath = '/?filter=ux#main';
    await page.goto(sourcePath);
    const link = page.locator('[data-case-study-link]').last();
    await link.scrollIntoViewIfNeeded();
    const sourceTop = await page.locator('.paper').evaluate((element) => element.scrollTop);
    const popupPromise = context.waitForEvent('page');
    await link.click(
        browserName === 'webkit' ? { modifiers: ['ControlOrMeta'] } : { button: 'middle' },
    );
    const popup = await popupPromise;
    await popup.waitForLoadState();
    await popup.getByRole('link', { name: 'Close case study and return to Home' }).click();
    await expect(popup).toHaveURL(sourcePath);
    await expect
        .poll(() => popup.locator('.paper').evaluate((element) => element.scrollTop))
        .toBe(sourceTop);
    await expect(page).toHaveURL(sourcePath);
    await popup.close();
});

test('a copied case-study URL uses its fallback even after a visit to another page', async ({
    page,
}) => {
    await page.goto('/');
    const link = page.locator('[data-case-study-link]').last();
    await link.scrollIntoViewIfNeeded();
    await link.dispatchEvent('contextmenu');
    const destination = await link.getAttribute('href');
    const sourceTop = await page.locator('.paper').evaluate((element) => element.scrollTop);
    await page.goto('/about/');
    await page.goto(destination!);
    await page.getByRole('link', { name: 'Close case study and return to Home' }).click();
    await expect(page).toHaveURL('/');
    await expect
        .poll(() => page.locator('.paper').evaluate((element) => element.scrollTop))
        .toBe(sourceTop);
});

test('invalid external case-study return URLs fall back to Work', async ({ page }) => {
    await page.goto(
        '/work/house-of-color/?returnTo=https%3A%2F%2Fexample.com%2F&returnScroll=invalid',
    );
    const close = page.getByRole('link', { name: 'Close case study and return to Work' });
    await expect(close).toHaveAttribute('href', '/work/');
    await close.click();
    await expect(page).toHaveURL('/work/');
});

test('the footer bar stays attached to the paper on short pages and tall viewports', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1600, height: 1400 });
    for (const route of ['/about/', '/work/', '/work/house-of-color/']) {
        await page.goto(route);
        await page.evaluate(() => document.fonts.ready);
        const footer = (await page.locator('.site-footer').boundingBox())!;
        const footerBar = (await page.locator('.site-footer__bar').boundingBox())!;
        const reader = (await page.locator('.reader').boundingBox())!;
        const paper = (await page.locator('.paper').boundingBox())!;
        const rings = (await page.locator('.binder-rings').boundingBox())!;
        expect(footerBar.y + footerBar.height).toBeCloseTo(reader.y + reader.height, 1);
        const paperOverflow = footerBar.y + footerBar.height - (paper.y + paper.height);
        expect(paperOverflow).toBeGreaterThanOrEqual(0);
        expect(paperOverflow).toBeLessThanOrEqual(32);
        expect(rings.y + rings.height).toBeCloseTo(footer.y, 1);
    }
});

for (const rootSize of [16, 12]) {
    test(`buttons preserve their states and proportional SVG sizing at ${rootSize}px rem`, async ({
        page,
    }) => {
        await page.goto('/');
        await page.evaluate(
            (size) => (document.documentElement.style.fontSize = `${size}px`),
            rootSize,
        );
        for (const variant of ['primary', 'secondary']) {
            const button =
                variant === 'primary'
                    ? page.locator('.home-intro .button-primary')
                    : page.locator('.sticky-home-2 .button-secondary');
            await page.mouse.move(1, 1);
            await expect(button).toHaveCSS('width', `${12.1875 * rootSize}px`);
            await expect(button).toHaveCSS('height', `${3.5 * rootSize}px`);
            await expect(button.locator('.button__shadow--default')).toHaveCSS('opacity', '1');
            await expect(button.locator('.button__shadow--active')).toHaveCSS('opacity', '0');
            await button.hover();
            await expect(button.locator('.button__shadow--default')).toHaveCSS('opacity', '0');
            await expect(button.locator('.button__shadow--hover')).toHaveCSS('opacity', '1');
            await page.mouse.down();
            await expect(button.locator('.button__shadow--hover')).toHaveCSS('opacity', '0');
            await expect(button.locator('.button__shadow--active')).toHaveCSS('opacity', '1');
            await expect(button.locator('.button__shadow--active')).toHaveCSS(
                'width',
                `${12.1875 * rootSize}px`,
            );
            await expect(button.locator('.button__shadow--active')).toHaveCSS(
                'height',
                `${3.5 * rootSize}px`,
            );
            const buttonBox = await button.boundingBox();
            const activeShadowBox = await button.locator('.button__shadow--active').boundingBox();
            // WebKit quantizes fractional SVG bounds differently; allow subpixel rounding.
            expect(Math.abs(activeShadowBox!.x - buttonBox!.x - 0.25 * rootSize)).toBeLessThan(0.5);
            expect(Math.abs(activeShadowBox!.y - buttonBox!.y - 0.25 * rootSize)).toBeLessThan(0.5);
            await expect(button.locator('.button__shadow--active path')).toHaveCSS(
                'fill',
                variant === 'primary' ? 'rgb(36, 33, 31)' : 'rgb(105, 102, 99)',
            );
            await expect(button.locator('.button__shadow--active path')).toHaveCSS(
                'fill-opacity',
                '0.6',
            );
            await expect(button.locator('.button__label')).toHaveCSS('color', 'rgb(69, 67, 143)');
            await page.mouse.move(1, 1);
            await page.mouse.up();
        }
        await expect(page.locator('.home-intro .button__highlighter--enabled')).toHaveCSS(
            'width',
            `${15 * rootSize}px`,
        );
        await expect(page.locator('.sticky-home-1')).toHaveCSS('width', `${17 * rootSize}px`);
        await expect(page.locator('.sticky-home-1 .sticky-note__content')).toHaveCSS(
            'transform',
            'none',
        );
        await expect(page.locator('.sticky-home-1 .sticky-note__visual')).not.toHaveCSS(
            'transform',
            'none',
        );
        const paperWidth = await page
            .locator('.sticky-home-1 .sticky-note__paper')
            .evaluate((element) => parseFloat(getComputedStyle(element).width));
        expect(paperWidth).toBeCloseTo(((23 * 17) / 21) * rootSize, 1);
    });
}

test('navigation shares the page width cap while the corner stays at the viewport edge', async ({
    page,
}) => {
    await page.setViewportSize({ width: 2700, height: 1100 });
    await page.goto('/');
    const nav = await page.locator('.binder-nav__content').boundingBox();
    const navShell = await page.locator('.binder-nav').boundingBox();
    const content = await page.locator('.page-content').boundingBox();
    const corner = await page.locator('.binder-nav__corner').boundingBox();
    const homeVector = await page.locator('.vector-tab-home').boundingBox();
    const homeIcon = await page.locator('.icon-home').boundingBox();
    const workVector = await page.locator('.vector-tab-work').boundingBox();
    const workLabel = await page.locator('.tab-work .tab__label').boundingBox();
    expect(nav!.width).toBe(108 * 16);
    expect(nav!.width).toBe(content!.width);
    expect(nav!.x).toBe(content!.x);
    expect(corner!.x + corner!.width).toBe(2700);
    expect(corner!.y).toBeCloseTo(navShell!.y + navShell!.height, 1);
    expect(homeVector!.y - navShell!.y).toBeCloseTo(0.1875 * 16, 1);
    expect(homeVector!.y + homeVector!.height).toBeCloseTo(navShell!.y + navShell!.height, 1);
    expect(workVector!.y - navShell!.y).toBeCloseTo(0.1875 * 16, 1);
    expect(workVector!.y + workVector!.height).toBeCloseTo(navShell!.y + navShell!.height, 1);
    expect(homeIcon!.y + homeIcon!.height / 2).toBeCloseTo(
        homeVector!.y + homeVector!.height / 2,
        1,
    );
    expect(workLabel!.y + workLabel!.height / 2).toBeCloseTo(
        workVector!.y + workVector!.height / 2,
        1,
    );
});

test('work entries keep media left, copy grid-aligned, and project links synchronized', async ({
    page,
}) => {
    await page.goto('/');
    const rows = page.locator('.work-entry');
    const rowCount = await rows.count();

    expect(rowCount).toBeGreaterThan(0);

    for (let index = 0; index < rowCount; index += 1) {
        const row = rows.nth(index);
        const media = (await row.locator('.work-entry__media').boundingBox())!;
        const content = (await row.locator('.work-entry__content').boundingBox())!;
        expect(media.x).toBeLessThan(content.x);
        await expect(row.locator('.work-thumbnail')).toHaveAttribute(
            'href',
            '/work/house-of-color/',
        );
        await expect(
            row.getByRole('link', { name: 'View Case Study', exact: true }),
        ).toHaveAttribute('href', '/work/house-of-color/');
        await expect(row.locator(':scope > a')).toHaveCount(0);

        const mediaBox = (await row.locator('.work-entry__media').boundingBox())!;
        const contentBox = (await row.locator('.work-entry__content').boundingBox())!;
        expect(
            Math.abs(contentBox.y + contentBox.height / 2 - (mediaBox.y + mediaBox.height / 2)),
        ).toBeLessThanOrEqual(32);
    }

    const row = rows.first();

    await expect
        .poll(() =>
            row.evaluate((element) => {
                const reader = document.querySelector<HTMLElement>('.reader')!;
                const content = element.querySelector<HTMLElement>('.work-entry__content')!;
                const gridSize =
                    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 2;
                const relativeTop =
                    content.getBoundingClientRect().top - reader.getBoundingClientRect().top;
                const phase = ((relativeTop % gridSize) + gridSize) % gridSize;
                return Math.min(phase, gridSize - phase);
            }),
        )
        .toBeCloseTo(0, 0);

    const title = row.locator('.work-entry__content > h3');
    const summary = row.locator('.work-entry__summary');
    await expect(title).toHaveCSS('line-height', '32px');
    await expect(summary).toHaveCSS('line-height', '32px');
    await expect(summary).toHaveCSS('margin-top', '32px');

    const textSpacing = await row.evaluate((element) => {
        const titleBox = element
            .querySelector<HTMLElement>('.work-entry__content > h3')!
            .getBoundingClientRect();
        const summaryBox = element
            .querySelector<HTMLElement>('.work-entry__summary')!
            .getBoundingClientRect();
        return summaryBox.top - titleBox.bottom;
    });
    expect(textSpacing).toBeCloseTo(32, 1);

    const thumbnail = row.locator('.work-thumbnail');
    const thumbnailBox = (await thumbnail.boundingBox())!;
    expect(thumbnailBox.width / thumbnailBox.height).toBeCloseTo(3 / 2, 1);
    await expect(thumbnail.locator('.work-thumbnail__shadow')).toHaveCount(3);
    const shadowGeometry = await thumbnail.evaluate((element) => {
        const thumbnailHeight = element.clientHeight;
        const thumbnailWidth = element.clientWidth;
        const soft = element.querySelector<SVGElement>('.work-thumbnail__shadow--soft')!;
        const hard = element.querySelector<SVGElement>('.work-thumbnail__shadow--hard')!;

        return {
            softHeight: soft.clientHeight / thumbnailHeight,
            softWidth: soft.clientWidth / thumbnailWidth,
            softLeft: Number.parseFloat(getComputedStyle(soft).left) / thumbnailWidth,
            hardHeight: hard.clientHeight / thumbnailHeight,
            hardWidth: hard.clientWidth / thumbnailWidth,
            hardLeft: Number.parseFloat(getComputedStyle(hard).left) / thumbnailWidth,
        };
    });
    expect(shadowGeometry.softHeight).toBeCloseTo(23.9375 / 21, 2);
    expect(shadowGeometry.softWidth).toBeCloseTo(5.75 / 21 / 1.5, 2);
    expect(shadowGeometry.softLeft).toBeCloseTo(-4.409375 / 21 / 1.5, 2);
    expect(shadowGeometry.hardHeight).toBeCloseTo(19.75 / 21, 2);
    expect(shadowGeometry.hardWidth).toBeCloseTo(4.375 / 21 / 1.5, 2);
    expect(shadowGeometry.hardLeft).toBeCloseTo(-2.6325 / 21 / 1.5, 2);
    await expect(thumbnail.locator('.work-thumbnail__polaroid')).toHaveCSS('opacity', '0');
    await expect(thumbnail.locator('.work-thumbnail__polaroid')).toHaveCSS('visibility', 'hidden');
    await expect(thumbnail.locator('.work-thumbnail__paper')).toHaveCSS(
        'background-color',
        'rgb(255, 255, 255)',
    );
    await expect(thumbnail.locator('.work-thumbnail__image--sketch')).toHaveCSS('opacity', '1');
    await expect(thumbnail.locator('.work-thumbnail__image--finished img')).toHaveAttribute(
        'src',
        '/images/house-of-color-image.png',
    );
    await expect(thumbnail.locator('.work-thumbnail__image--finished img')).toHaveCSS(
        'object-fit',
        'fill',
    );

    await row.getByRole('link', { name: 'View Case Study', exact: true }).hover();
    await expect(thumbnail).toHaveCSS('transform', 'matrix(1.025, 0, 0, 1.025, 0, 0)');
    await expect(thumbnail.locator('.work-thumbnail__polaroid')).toHaveCSS('opacity', '1');
    await expect(thumbnail.locator('.work-thumbnail__image--sketch')).toHaveCSS('opacity', '0');

    await thumbnail.hover();
    await expect(thumbnail).toHaveCSS('transform', 'matrix(1.025, 0, 0, 1.025, 0, 0)');
    await expect(thumbnail.locator('.work-thumbnail__polaroid')).toHaveCSS('opacity', '1');
    await expect(thumbnail.locator('.work-thumbnail__polaroid')).toHaveCSS('visibility', 'visible');
    const frameGeometry = await thumbnail.evaluate((element) => {
        const frame = element.querySelector<HTMLElement>('.work-thumbnail__polaroid')!;
        const caption = element.querySelector<HTMLElement>('.work-thumbnail__caption')!;
        const frameBox = frame.getBoundingClientRect();
        const captionBox = caption.getBoundingClientRect();
        return {
            leftGap: captionBox.left - frameBox.left,
            rightGap: frameBox.right - captionBox.right,
        };
    });
    expect(frameGeometry.leftGap).toBeLessThanOrEqual(1);
    expect(frameGeometry.rightGap).toBeLessThanOrEqual(1);
    await expect(thumbnail.locator('.work-thumbnail__caption')).toContainText('>');
    await expect(thumbnail.locator('.work-thumbnail__image--sketch')).toHaveCSS('opacity', '0');
    await expect(thumbnail.locator('.work-thumbnail__image--finished')).toHaveCSS('opacity', '1');

    await page.mouse.down();
    await expect(thumbnail).toHaveCSS('transform', 'matrix(1.01, 0, 0, 1.01, 0, 0)');
    await page.mouse.move(1, 1);
    await page.mouse.up();
});

test('work page toggles between persistent list and grid views', async ({ page }) => {
    await page.goto('/work/');

    const collection = page.locator('#work-projects');
    const entry = collection.locator('.work-entry').first();
    const pageHeader = page.locator('.work-browser__header');
    const pageTitle = pageHeader.locator('h1');
    const listButton = page.getByRole('button', { name: 'List view', exact: true });
    const gridButton = page.getByRole('button', { name: 'Grid view', exact: true });

    await expect(collection).toHaveAttribute('data-work-view', 'list');
    await expect(listButton).toHaveAttribute('aria-pressed', 'true');
    await expect(gridButton).toHaveAttribute('aria-pressed', 'false');
    await expect(pageHeader).toHaveCSS('height', '64px');
    const headerBox = (await pageHeader.boundingBox())!;
    const titleBox = (await pageTitle.boundingBox())!;
    const toggleBox = (await page.locator('.work-view-toggle').boundingBox())!;
    expect(titleBox.y).toBeCloseTo(toggleBox.y, 1);
    expect(titleBox.height).toBeCloseTo(toggleBox.height, 1);
    expect(toggleBox.x + toggleBox.width).toBeCloseTo(headerBox.x + headerBox.width, 1);
    await expect(page.locator('.work-view-toggle')).toHaveCSS('height', '64px');
    await expect(listButton).toHaveCSS('color', 'rgb(36, 33, 31)');
    await expect(gridButton).toHaveCSS('color', 'rgb(149, 150, 152)');
    await expect(listButton).toHaveCSS('border-top-width', '4px');
    await expect(listButton).toHaveCSS('border-radius', '8px');
    await expect(listButton.locator('.work-view-toggle__icon')).toHaveCSS('width', '48px');
    await expect(listButton.locator('.work-view-toggle__icon')).toHaveCSS('height', '48px');
    await expect(gridButton.locator('.work-view-toggle__icon')).toHaveCSS('width', '48px');
    await expect(gridButton.locator('.work-view-toggle__icon')).toHaveCSS('height', '48px');

    await gridButton.hover();
    await expect(gridButton).toHaveCSS('color', 'rgb(36, 33, 31)');

    const listMedia = (await entry.locator('.work-entry__media').boundingBox())!;
    const listContent = (await entry.locator('.work-entry__content').boundingBox())!;
    expect(listMedia.x).toBeLessThan(listContent.x);

    await gridButton.click();
    await expect(collection).toHaveAttribute('data-work-view', 'grid');
    await expect(gridButton).toHaveAttribute('aria-pressed', 'true');
    await expect(entry.locator('.work-entry__summary')).toBeHidden();
    await expect(entry.getByRole('link', { name: 'View Case Study', exact: true })).toBeHidden();
    await expect(entry.locator('.work-entry__content')).toHaveCSS('text-align', 'center');
    expect(
        await collection.evaluate(
            (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
        ),
    ).toBe(2);

    await page.reload();
    await expect(collection).toHaveAttribute('data-work-view', 'grid');

    await listButton.click();
    await expect(collection).toHaveAttribute('data-work-view', 'list');
    await expect(entry.locator('.work-entry__summary')).toBeVisible();
    await expect(entry.getByRole('link', { name: 'View Case Study', exact: true })).toBeVisible();
});

test('contact section and footer stay on the paper grid after repeated work view changes', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1376, height: 1000 });
    await page.goto('/work/');

    for (const view of ['grid', 'list', 'grid', 'list']) {
        await page.getByRole('button', { name: `${view} view`, exact: false }).click();
        await expect(page.locator('#work-projects')).not.toHaveAttribute('data-work-transition');
        await expect
            .poll(() =>
                page.evaluate(() => {
                    const reader = document.querySelector('.reader')!.getBoundingClientRect();
                    const content = document.querySelector('.contact-section__content')!;
                    const form = document.querySelector('[data-contact-form]')!;
                    const root = getComputedStyle(document.documentElement);
                    const token = root.getPropertyValue('--grid-size').trim();
                    const grid =
                        parseFloat(token) * (token.endsWith('rem') ? parseFloat(root.fontSize) : 1);
                    const positions = [
                        form.getBoundingClientRect().top,
                        content.getBoundingClientRect().top +
                            parseFloat(getComputedStyle(content, '::before').top),
                        document.querySelector('.site-footer')!.getBoundingClientRect().top,
                    ];
                    return Math.max(
                        ...positions.map((top) => {
                            const phase = (((top - reader.top) % grid) + grid) % grid;
                            return Math.min(phase, grid - phase);
                        }),
                    );
                }),
            )
            .toBeLessThan(0.1);
    }
});

test('tab hover and pressed palettes preserve their SVG paint references', async ({ page }) => {
    await page.goto('/work/house-of-color/');
    for (const [kind, hover, active] of [
        ['home', 'green-tab-fill', 'dark-green-tab-fill'],
        ['work', 'work-blue-tab-fill', 'work-dark-blue-tab-fill'],
        ['about', 'about-pink-tab-fill', 'about-dark-pink-tab-fill'],
    ]) {
        // A fresh document isolates each palette from WebKit's cancelled pointer gesture state.
        await page.goto('/work/house-of-color/');
        const tab = page.locator(`.tab-${kind}`);
        await tab.hover();
        await expect
            .poll(() =>
                tab.evaluate((element) => getComputedStyle(element).getPropertyValue('--tab-fill')),
            )
            .toContain(hover);
        await page.mouse.down();
        await expect
            .poll(() =>
                tab.evaluate((element) => getComputedStyle(element).getPropertyValue('--tab-fill')),
            )
            .toContain(active);
        await expect(page.locator(`[id="${active}"]`)).toHaveCount(1);
        await page.mouse.move(1, 100);
        await page.mouse.up();
    }
});

test('new homepage sections flow below the hero and remain scrollable', async ({ page }) => {
    await page.goto('/');
    const introBefore = await page.locator('.home-intro').boundingBox();
    const notesBefore = await page.locator('.sticky-notes-home').boundingBox();
    await page.locator('.page-content-home').evaluate((element) => {
        const section = document.createElement('section');
        section.id = 'additional-content';
        section.style.height = '100rem';
        section.textContent = 'Additional homepage content';
        element.append(section);
    });
    expect(await page.locator('.home-intro').boundingBox()).toEqual(introBefore);
    expect(await page.locator('.sticky-notes-home').boundingBox()).toEqual(notesBefore);
    const hero = (await page.locator('.home-hero').boundingBox())!;
    const section = (await page.locator('#additional-content').boundingBox())!;
    expect(section.y).toBeGreaterThanOrEqual(hero.y + hero.height);
    await page.locator('.paper').evaluate((element) => (element.scrollTop = 500));
    await expect
        .poll(() => page.locator('.paper').evaluate((element) => element.scrollTop))
        .toBe(500);
});

test('binder rings scroll with the page while the navigation stays fixed', async ({ page }) => {
    await page.goto('/');

    const paper = page.locator('.paper');
    const rings = page.locator('.binder-rings');
    const navigation = page.locator('.binder-nav');
    const ringsBefore = await rings.boundingBox();
    const navigationBefore = await navigation.boundingBox();

    expect(ringsBefore).not.toBeNull();
    expect(navigationBefore).not.toBeNull();

    await paper.evaluate((element) => {
        element.scrollTop = 80;
    });
    await expect.poll(() => paper.evaluate((element) => element.scrollTop)).toBe(80);

    const ringsAfter = await rings.boundingBox();
    const navigationAfter = await navigation.boundingBox();

    expect(ringsAfter).not.toBeNull();
    expect(navigationAfter).not.toBeNull();
    expect(ringsAfter!.y).toBeCloseTo(ringsBefore!.y - 80, 1);
    expect(navigationAfter!.y).toBeCloseTo(navigationBefore!.y, 1);
});

test('binder rings keep fixed grid positions and stop before the paper edge', async ({ page }) => {
    for (const route of ['/', '/about/', '/work/', '/work/house-of-color/']) {
        await page.goto(route);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('[data-binder-rings]')).toHaveAttribute('data-bounds-ready', '');

        const geometry = await page.locator('[data-binder-rings]').evaluate((container) => {
            const rootStyles = getComputedStyle(document.documentElement);
            const rootSize = Number.parseFloat(rootStyles.fontSize);
            const gridValue = rootStyles.getPropertyValue('--grid-size').trim();
            const visibleHeightValue = rootStyles
                .getPropertyValue('--binder-ring-visible-height')
                .trim();
            const anchorValue = rootStyles.getPropertyValue('--binder-ring-paper-anchor-y').trim();
            const toPixels = (value: string) =>
                Number.parseFloat(value) * (value.endsWith('rem') ? rootSize : 1);
            const gridSize = toPixels(gridValue);
            const visibleHeight = toPixels(visibleHeightValue);
            const anchor = toPixels(anchorValue);
            const containerBounds = container.getBoundingClientRect();
            const rings = Array.from(container.querySelectorAll<HTMLElement>('[data-binder-ring]'));
            const visibleRings = rings.filter(
                (ring) => getComputedStyle(ring).visibility !== 'hidden',
            );

            return {
                startRow: Number((container as HTMLElement).dataset.startRow),
                spacingRows: Number((container as HTMLElement).dataset.spacingRows),
                bottomClearanceRows: Number((container as HTMLElement).dataset.bottomClearanceRows),
                gridSize,
                visibleHeight,
                totalCount: rings.length,
                visibleRows: visibleRings.map((ring) => {
                    const bounds = ring.getBoundingClientRect();
                    return (bounds.top - containerBounds.top + anchor) / gridSize;
                }),
                visibleBottoms: visibleRings.map(
                    (ring) =>
                        ring.getBoundingClientRect().top -
                        containerBounds.top +
                        visibleHeight -
                        containerBounds.height,
                ),
            };
        });

        expect(geometry.totalCount).toBe(geometry.visibleRows.length);
        expect(geometry.visibleRows[0]).toBeCloseTo(geometry.startRow, 4);

        for (let index = 1; index < geometry.visibleRows.length; index += 1) {
            expect(geometry.visibleRows[index] - geometry.visibleRows[index - 1]).toBeCloseTo(
                geometry.spacingRows,
                4,
            );
        }

        geometry.visibleBottoms.forEach((bottom) =>
            expect(bottom).toBeLessThanOrEqual(
                -(geometry.bottomClearanceRows * geometry.gridSize) + 0.5,
            ),
        );
    }
});

test('top overscroll keeps vertical guides while horizontal lines and rings stop', async ({
    page,
}) => {
    await page.goto('/');

    const backdrop = await page.evaluate(() => {
        const paper = document.querySelector<HTMLElement>('.paper')!;
        const reader = document.querySelector<HTMLElement>('.reader')!;
        const paperStyles = getComputedStyle(paper);
        const readerStyles = getComputedStyle(reader);
        const readerBox = reader.getBoundingClientRect();

        return {
            paperScrollHeight: paper.scrollHeight,
            readerHeight: readerBox.height,
            paperBackground: paperStyles.backgroundImage,
            paperBackgroundColor: paperStyles.backgroundColor,
            paperBackgroundRepeat: paperStyles.backgroundRepeat,
            paperBackgroundSize: paperStyles.backgroundSize,
            readerBackground: readerStyles.backgroundImage,
            readerBackgroundPositionY: readerStyles.backgroundPositionY,
            readerBackgroundRepeat: readerStyles.backgroundRepeat,
            readerBeforeContent: getComputedStyle(reader, '::before').content,
        };
    });

    expect(backdrop.paperScrollHeight).toBeCloseTo(backdrop.readerHeight, 0);
    expect(backdrop.paperBackground.match(/linear-gradient/g)).toHaveLength(2);
    expect(backdrop.paperBackground).toContain('90deg');
    expect(backdrop.paperBackgroundColor).toBe('rgb(255, 253, 247)');
    expect(backdrop.paperBackgroundRepeat.split(', ').every((value) => value === 'no-repeat')).toBe(
        true,
    );
    expect(backdrop.paperBackgroundSize).toContain('100% 100%');
    expect(backdrop.readerBackground.match(/linear-gradient/g)).toHaveLength(3);
    expect(backdrop.readerBackgroundPositionY.split(', ').every((value) => value === '0px')).toBe(
        true,
    );
    expect(backdrop.readerBackgroundRepeat).toBe('repeat-y, repeat, repeat');
    expect(backdrop.readerBeforeContent).toBe('none');

    const readerBefore = await page.locator('.reader').boundingBox();
    await page.locator('.paper').evaluate((element) => {
        element.scrollTop = 80;
    });
    await expect
        .poll(() => page.locator('.paper').evaluate((element) => element.scrollTop))
        .toBe(80);
    const readerAfter = await page.locator('.reader').boundingBox();

    expect(readerAfter!.y).toBeCloseTo(readerBefore!.y - 80, 1);
    await expect(page.locator('.binder-rings')).toHaveCSS('bottom', '0px');
    await expect(page.locator('.binder-rings')).toHaveCount(1);
});

test('footer contact link, credit bar, corner, and bottom overscroll are connected', async ({
    page,
}) => {
    await page.goto('/');

    const paper = page.locator('.paper');
    const contact = page.locator('#contact');
    const bar = page.locator('.site-footer__bar');
    const corner = page.locator('.site-footer__corner');
    const form = page.locator('[data-contact-form]');

    await expect(form).toHaveCount(1);
    await expect(form).toHaveAttribute('method', 'post');
    await expect(form.locator('#contact-name')).toHaveAttribute('name', 'name');
    await expect(form.locator('#contact-email')).toHaveAttribute('name', 'email');
    await expect(form.locator('#contact-message')).toHaveAttribute('name', 'message');
    await expect(form.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
    await expect(page.locator('.contact-section__details')).toContainText('Breda, The Netherlands');
    await expect(page.locator('[data-netherlands-time]')).toHaveText(/\d{1,2}:\d{2}/);
    await expect(paper).toHaveCSS('scroll-behavior', 'smooth');
    await expect(contact).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.site-footer')).toHaveCSS('background-color', 'rgb(36, 33, 31)');
    await expect(bar).toHaveCSS('height', '64px');
    await expect(corner).toHaveCSS('transform', 'matrix(1, 0, 0, -1, 0, 0)');

    const footerBox = (await page.locator('.site-footer').boundingBox())!;
    const cornerBox = (await corner.boundingBox())!;
    expect(cornerBox.y + cornerBox.height - footerBox.y).toBeCloseTo(1, 1);
    await expect
        .poll(() =>
            page.evaluate(() => ({
                contactInPaper: document
                    .querySelector('.paper-sheet')!
                    .contains(document.querySelector('#contact')),
                contactInFooter: document
                    .querySelector('.site-footer')!
                    .contains(document.querySelector('#contact')),
            })),
        )
        .toEqual({ contactInPaper: true, contactInFooter: false });

    await page.getByRole('link', { name: 'Get in touch', exact: true }).click();
    await expect(page).toHaveURL('/');
    await expect.poll(() => paper.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(contact).toBeInViewport();

    await paper.evaluate((element) => (element.scrollTop = element.scrollHeight));
    await expect.poll(() => paper.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(paper).toHaveClass(/paper--near-bottom/);
    await expect(paper).toHaveCSS('background-color', 'rgb(36, 33, 31)');
    await expect(paper).toHaveCSS('background-image', 'none');

    await paper.evaluate((element) => {
        element.scrollTop = 0;
    });
    await expect.poll(() => paper.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(paper).not.toHaveClass(/paper--near-bottom/);
    await expect(paper).toHaveCSS('background-color', 'rgb(255, 253, 247)');
    await expect
        .poll(() => paper.evaluate((element) => getComputedStyle(element).backgroundImage))
        .toContain('90deg');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(paper).toHaveCSS('scroll-behavior', 'auto');
});

test('contact form preserves its grid, validates on exit, scrolls, and stays aligned', async ({
    page,
}) => {
    await page.goto('/');

    const form = page.locator('[data-contact-form]');
    const name = form.locator('#contact-name');
    const email = form.locator('#contact-email');
    const message = form.locator('#contact-message');
    const submit = form.getByRole('button', { name: 'Send', exact: true });
    const submitHint = form.locator('[data-contact-submit-hint]');
    const heading = page.getByRole('heading', {
        level: 3,
        name: 'Contact me',
        exact: true,
    });
    const nameField = form.locator('.contact-form__field--name');
    const emailField = form.locator('.contact-form__field--email');

    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS('color', 'rgb(36, 33, 31)');
    await expect(submit).toHaveAttribute('aria-disabled', 'true');
    await expect(submit).not.toHaveAttribute('disabled');
    expect(await submit.evaluate((element) => element.tabIndex)).toBe(0);
    await expect(submit).toHaveAttribute('aria-describedby', 'contact-submit-hint');
    await expect(submitHint).toHaveText('Complete all fields to enable send');
    await expect(submitHint).toHaveAttribute('aria-hidden', 'false');
    await expect(submitHint).toHaveCSS('color', 'rgb(149, 150, 152)');
    await expect(submit).toHaveCSS('width', '195px');
    await expect(submit).toHaveCSS('height', '56px');
    await expect(submit).toHaveCSS('filter', 'none');
    await expect(submit.locator('.button__label')).toHaveCSS('color', 'rgb(149, 150, 152)');
    await expect(submit.locator('.button__shadow--default')).toHaveCSS('opacity', '0');
    await expect(submit.locator('.button__highlighter--enabled')).toHaveCSS('opacity', '0');
    await expect(submit.locator('.button__highlighter--disabled')).toHaveCSS('opacity', '1');
    await expect(submit.locator('.button__highlighter--disabled')).toHaveCSS(
        'mix-blend-mode',
        'multiply',
    );
    await expect(message).toHaveCSS('resize', 'none');
    await expect(message).toHaveCSS('overflow-y', 'auto');
    await expect(message).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(message).toHaveCSS('min-height', '64px');
    await expect(name).toHaveCSS('height', '32px');
    await expect(email).toHaveCSS('height', '32px');
    await expect(form.locator('label[for="contact-name"]')).toHaveCSS(
        'color',
        'rgb(149, 150, 152)',
    );
    await expect(form.locator('label[for="contact-name"]')).toHaveCSS('font-size', '20px');
    await expect(name).toHaveCSS('font-size', '20px');
    await expect(message).toHaveCSS('font-size', '20px');
    await expect(form.getByRole('link', { name: /write an email/i })).toHaveCount(0);
    await expect(form.locator('.contact-form__alternative')).toHaveCount(0);

    const layout = await page.evaluate(() => {
        const box = (selector: string) =>
            document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
        const content = box('.contact-section__content');
        const contentStyles = getComputedStyle(
            document.querySelector<HTMLElement>('.contact-section__content')!,
        );
        const formBox = box('[data-contact-form]');
        const readerBox = box('.reader');
        const startBox = box('.contact-form__start');
        const endBox = box('.contact-form__end');
        const nameBox = box('#contact-name');
        const emailBox = box('#contact-email');
        const messageBox = box('#contact-message');
        const submitBox = box('[data-contact-submit]');
        const submitHintBox = box('[data-contact-submit-hint]');
        const messageErrorBox = box('#contact-message-error');
        const footerBox = box('.site-footer');
        const locationTermBox = box('.contact-section__detail:first-child h4');
        const locationDescriptionBox = box(
            '.contact-section__detail:first-child .contact-section__value',
        );
        const timeTermBox = box('.contact-section__detail:last-child h4');
        const timeDescriptionBox = box(
            '.contact-section__detail:last-child .contact-section__value',
        );
        const fieldBoxes = [...document.querySelectorAll<HTMLElement>('[data-contact-field]')].map(
            (field) => field.getBoundingClientRect(),
        );
        const fieldStroke = getComputedStyle(
            document.querySelector<HTMLElement>('.contact-form__field--name')!,
            '::before',
        );

        return {
            contentLeft: content.left + Number.parseFloat(contentStyles.paddingLeft),
            contentRight: content.right - Number.parseFloat(contentStyles.paddingRight),
            formLeft: formBox.left,
            formRight: formBox.right,
            formWidth: formBox.width,
            startWidth: startBox.width,
            endWidth: endBox.width,
            columnGap: endBox.left - startBox.right,
            startBottom: startBox.bottom,
            endBottom: endBox.bottom,
            nameWidth: nameBox.width,
            emailWidth: emailBox.width,
            messageWidth: messageBox.width,
            submitWidth: submitBox.width,
            nameHeight: nameBox.height,
            emailHeight: emailBox.height,
            messageHeight: messageBox.height,
            messageTop: messageBox.top,
            messageBottom: messageBox.bottom,
            submitTop: submitBox.top,
            submitBottom: submitBox.bottom,
            submitHintTop: submitHintBox.top,
            messageErrorTop: messageErrorBox.top,
            footerGap: footerBox.top - formBox.bottom,
            locationRowOffset: locationDescriptionBox.top - locationTermBox.top,
            timeRowOffset: timeDescriptionBox.top - timeTermBox.top,
            detailGroupGap: timeTermBox.top - locationDescriptionBox.bottom,
            fieldBottomRemainders: fieldBoxes.map(
                (fieldBox) => (fieldBox.bottom - readerBox.top) % 32,
            ),
            fieldGaps: [
                fieldBoxes[1].top - fieldBoxes[0].bottom,
                fieldBoxes[2].top - fieldBoxes[1].bottom,
            ],
            strokeTop: fieldStroke.top,
            strokeBottom: fieldStroke.bottom,
            strokeRadius: fieldStroke.borderBottomLeftRadius,
        };
    });
    expect(layout.formLeft).toBeCloseTo(layout.contentLeft, 1);
    expect(layout.formRight).toBeCloseTo(layout.contentRight, 1);
    expect(layout.startWidth).toBeCloseTo(layout.endWidth, 1);
    expect(layout.columnGap).toBeCloseTo(32, 1);
    expect(layout.nameWidth).toBeCloseTo(layout.startWidth, 1);
    expect(layout.emailWidth).toBeCloseTo(layout.startWidth, 1);
    expect(layout.messageWidth).toBeCloseTo(layout.startWidth, 1);
    expect(layout.nameHeight).toBeCloseTo(32, 1);
    expect(layout.emailHeight).toBeCloseTo(32, 1);
    expect(layout.messageHeight).toBeCloseTo(64, 1);
    expect(layout.submitWidth).toBeCloseTo(195, 1);
    expect(layout.startBottom).toBeCloseTo(layout.endBottom, 1);
    expect(layout.submitTop - layout.messageTop).toBeCloseTo(5, 1);
    expect(layout.messageBottom - layout.submitBottom).toBeCloseTo(3, 1);
    expect(layout.messageErrorTop - layout.messageBottom).toBeCloseTo(4, 1);
    expect(layout.submitHintTop).toBeCloseTo(layout.messageErrorTop, 1);
    expect(layout.footerGap).toBeCloseTo(64, 1);
    expect(layout.locationRowOffset).toBeCloseTo(32, 1);
    expect(layout.timeRowOffset).toBeCloseTo(32, 1);
    expect(layout.detailGroupGap).toBeCloseTo(32, 1);
    expect(layout.fieldBottomRemainders.every((remainder) => Math.abs(remainder) < 0.1)).toBe(true);
    expect(layout.fieldGaps).toEqual([32, 32]);
    expect(layout.strokeTop).toBe('8px');
    expect(layout.strokeBottom).toBe('-2px');
    expect(layout.strokeRadius).toBe('8px');

    await expect(page.getByRole('heading', { level: 4, name: 'My location' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 4, name: 'Local time' })).toBeVisible();

    await name.focus();
    await expect(nameField).toHaveCSS('color', 'rgb(105, 102, 99)');
    await expect(form.locator('label[for="contact-name"]')).toHaveCSS('font-size', '20px');
    await expect(form.locator('label[for="contact-name"]')).toHaveCSS('font-weight', '500');
    await name.fill('K');
    await expect(form.locator('label[for="contact-name"]')).toHaveCSS('font-size', '12px');
    await expect(form.locator('label[for="contact-name"]')).toHaveCSS('font-weight', '800');
    await name.fill('');
    await email.focus();
    await expect(name).toHaveAttribute('aria-invalid', 'false');
    await expect(form.locator('#contact-name-error')).toHaveAttribute('aria-hidden', 'true');

    await email.fill('not-an-email');
    await expect(form.locator('#contact-email-error')).toHaveAttribute('aria-hidden', 'true');
    await expect(email).toHaveAttribute('aria-invalid', 'false');
    await name.focus();
    await expect(form.locator('#contact-email-error')).toHaveText('Enter a valid email');
    await expect(form.locator('#contact-email-error')).toHaveAttribute('aria-hidden', 'false');
    await email.fill('');
    await expect(form.locator('#contact-email-error')).toHaveAttribute('aria-hidden', 'true');

    const stableLayoutBeforeError = await form.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        messageTop: element.querySelector<HTMLElement>('.contact-form__field--message')!.offsetTop,
        submitTop: element.querySelector<HTMLElement>('[data-contact-submit]')!.offsetTop,
    }));

    await submit.click({ force: true });
    await expect(form.locator('[data-contact-error]:visible')).toHaveCount(0);
    await expect(name).toHaveAttribute('aria-invalid', 'false');
    await expect(form).not.toHaveAttribute('data-submit-attempted', 'true');

    const stableLayoutAfterError = await form.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        messageTop: element.querySelector<HTMLElement>('.contact-form__field--message')!.offsetTop,
        submitTop: element.querySelector<HTMLElement>('[data-contact-submit]')!.offsetTop,
    }));
    expect(stableLayoutAfterError).toEqual(stableLayoutBeforeError);

    await name.fill('Kevin');
    await email.fill('not-an-email');
    await expect(nameField).toHaveCSS('color', 'rgb(105, 102, 99)');
    await message.fill('Hello');
    await page.locator('.work-entry').click({ position: { x: 1, y: 1 } });
    await expect(form.locator('#contact-email-error')).toHaveText('Enter a valid email');
    await expect(form.locator('#contact-email-error')).toHaveAttribute('aria-hidden', 'false');
    await expect(emailField).toHaveCSS('color', 'rgb(163, 58, 53)');
    await expect(email).toHaveCSS('color', 'rgb(36, 33, 31)');
    await expect(form.locator('label[for="contact-email"]')).toHaveCSS('color', 'rgb(163, 58, 53)');
    const invalidStroke = await emailField.evaluate((element) => {
        const stroke = getComputedStyle(element, '::before');
        return {
            borderColor: stroke.borderBottomColor,
            transitionDuration: stroke.transitionDuration,
        };
    });
    expect(invalidStroke).toEqual({
        borderColor: 'rgb(163, 58, 53)',
        transitionDuration: '0s',
    });
    await expect(form.locator('#contact-email-error b')).toHaveCount(0);
    await expect(form.locator('#contact-email-error')).toHaveCSS('font-weight', '500');
    await expect(submit).toHaveAttribute('aria-disabled', 'true');

    const initialMessageHeight = (await message.boundingBox())!.height;
    await message.fill(Array.from({ length: 30 }, (_, index) => `Line ${index + 1}`).join('\n'));
    const scrolledMessageState = await message.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        lineHeight: getComputedStyle(element).lineHeight,
    }));
    expect(scrolledMessageState.height).toBeCloseTo(initialMessageHeight, 1);
    expect(scrolledMessageState.scrollHeight).toBeGreaterThan(scrolledMessageState.clientHeight);
    expect(scrolledMessageState.lineHeight).toBe('32px');

    await email.fill('hello@example.com');
    await page.locator('.work-entry').click({ position: { x: 1, y: 1 } });
    await expect(submit).toHaveAttribute('aria-disabled', 'false');
    await expect(submit).toHaveCSS('filter', 'none');
    await expect(emailField).toHaveCSS('color', 'rgb(105, 102, 99)');
    await expect(submit.locator('.button__shadow--default')).toHaveCSS('opacity', '1');
    await expect(submit.locator('.button__highlighter--enabled')).toHaveCSS('opacity', '1');
    await expect(submit.locator('.button__highlighter--disabled')).toHaveCSS('opacity', '0');
    await expect(submitHint).toHaveAttribute('aria-hidden', 'true');
    await expect(submitHint).toHaveCSS('visibility', 'hidden');

    const detailTypography = await page.evaluate(() => {
        const location = getComputedStyle(
            document.querySelector<HTMLElement>('.contact-section__value')!,
        );
        const time = getComputedStyle(
            document.querySelector<HTMLElement>('.contact-section__time')!,
        );

        return {
            location: [
                location.fontFamily,
                location.fontSize,
                location.fontWeight,
                location.lineHeight,
            ],
            time: [time.fontFamily, time.fontSize, time.fontWeight, time.lineHeight],
        };
    });
    expect(detailTypography.time).toEqual(detailTypography.location);
    expect(detailTypography.location[1]).toBe('20px');
});

test('reloading uses the latest paper position instead of a stale contact position', async ({
    page,
}) => {
    await page.goto('/');
    const paper = page.locator('.paper');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('link', { name: 'Get in touch', exact: true }).click();
    await expect.poll(() => paper.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator('#contact')).toBeInViewport();
    await expect(page).toHaveURL('/');

    await paper.evaluate((element) => {
        const paperElement = element as HTMLElement;
        paperElement.style.scrollBehavior = 'auto';
        paperElement.scrollTo(0, 0);
    });
    await expect.poll(() => paper.evaluate((element) => element.scrollTop)).toBe(0);
    await expect
        .poll(() =>
            page.evaluate(
                () => (history.state as { binderScroll?: { top: number } }).binderScroll?.top,
            ),
        )
        .toBe(0);

    await page.reload();
    await expect.poll(() => paper.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(page.locator('#contact')).not.toBeInViewport();
});

test('reloading a legacy contact URL clears the fragment without jumping to the footer', async ({
    page,
}) => {
    await page.goto('/');
    await page.evaluate(() => history.replaceState(history.state, '', '/#contact'));
    await page.reload();

    await expect(page).toHaveURL('/');
    await expect
        .poll(() => page.locator('.paper').evaluate((element) => element.scrollTop))
        .toBe(0);
    await expect(page.locator('#contact')).not.toBeInViewport();
});

test('the paper grid begins directly below the binder navigation', async ({ page }) => {
    await page.goto('/');

    const alignment = await page.evaluate(() => {
        const navigation = document.querySelector<HTMLElement>('.binder-nav')!;
        const reader = document.querySelector<HTMLElement>('.reader')!;

        return {
            navigationBottom: navigation.getBoundingClientRect().bottom,
            readerTop: reader.getBoundingClientRect().top,
        };
    });

    expect(alignment.readerTop).toBeCloseTo(alignment.navigationBottom, 1);
});

test('notes retain corner anchoring, stacking, and bottom-aligned footer when resized', async ({
    page,
}) => {
    await page.goto('/');
    await page.locator('.sticky-notes-home').evaluate((element) => {
        const container = element as HTMLElement;
        container.style.width = '24rem';
        container.style.height = '24rem';
    });
    const container = (await page.locator('.sticky-notes-home').boundingBox())!;
    const first = (await page.locator('.sticky-home-1').boundingBox())!;
    const second = (await page.locator('.sticky-home-2').boundingBox())!;
    expect(first.x - container.x).toBe(1.75 * 16);
    expect(first.y - container.y).toBe(-1.5 * 16);
    expect(second.x + second.width - container.x - container.width).toBeCloseTo(2.4 * 16, 1);
    expect(second.y + second.height).toBe(container.y + container.height);
    expect(first.x + first.width).toBeGreaterThan(second.x);
    expect(first.y + first.height).toBeGreaterThan(second.y);
    await expect(page.locator('.sticky-home-1')).toHaveCSS('z-index', '2');
    const body = (await page.locator('.sticky-home-2 .sticky-note__body').boundingBox())!;
    const footer = (await page.locator('.sticky-home-2__footer').boundingBox())!;
    expect(footer.y + footer.height).toBeCloseTo(body.y + body.height, 1);
    await expect(page.locator('.sticky-home-2__footer')).toHaveCSS('gap', '24px');
});

test('keyboard users can skip navigation and focus the main content', async ({
    page,
    browserName,
}) => {
    await page.goto('/');
    await expect(page.locator('[data-contact-form]')).toHaveAttribute(
        'data-contact-form-ready',
        'true',
    );
    await page.keyboard.press(
        browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab',
    );
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
});

test('content and navigation remain usable without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4323/');
    await expect(page.getByRole('link', { name: 'Get in touch', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Work', exact: true }).click();
    await expect(page).toHaveURL(/\/work\/$/);
    await context.close();
});
