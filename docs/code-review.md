# Code review — 21 September 2026

The architecture is appropriate for this portfolio: static Astro pages, shared presentational components, a data-driven project list, local fonts, and a small set of browser scripts. A framework migration or client-side state library would add complexity without solving a current need.

The review covered all authored pages, components, TypeScript, CSS, public assets, tests, configuration, package declarations, editor settings, and documentation. Generated output and dependency behavior were inspected where relevant; third-party dependency source was not audited line by line. Existing visible content, composition, rem dimensions, artwork, and interaction states were the baseline.

## Organization pass

- Added consistent bordered section headers to the authored CSS, Astro frontmatter, and TypeScript so responsibilities are scannable without adding runtime logic.
- Consolidated adjustable palette, typography, layout, navigation, button, work-collection, sticky-note, contact/footer, homepage, and diagnostic values in `src/styles/tokens.css`.
- Replaced remaining fixed CSS pixel dimensions with rem-based tokens, including the root scale, footer corner overlap, diagnostic border, and component geometry. SVG path/viewBox coordinates remain unitless artwork coordinates; live grid alignment offsets remain pixels because they are measured viewport values and rem conversion introduces rounding drift.
- Reused the shared white, shadow, sticky-note, and tab palette tokens in SVG/CSS artwork. Removed unused tokens introduced during the pass and kept component CSS responsible for relationships rather than global design values.

## Fixed

- **Unused implementations:** removed the four unused wide-button components, their wide highlighter SVG, and their CSS. Removed unused color tokens and a redundant form selector. Current primary, secondary, and standard-size Send buttons keep their existing artwork and states.
- **Form state:** floating labels now derive from input values through CSS rather than a duplicate JavaScript flag. Autofill/change events, resets, and restored pages synchronize validity and Send availability. Without JavaScript, labels still float and native required/email validation applies. Once Send is available, it no longer exposes the hidden completion hint as its accessible description.
- **Submission boundary:** the form uses native submission, outside Astro's client router. No provider endpoint was invented or connected, and no real message was sent during testing. The provider test intercepts a local request.
- **Navigation:** history checkpoints are limited to twice per second instead of every animation frame. Exact positions are flushed at navigation boundaries. A one-use, tab-local checkpoint handles immediate reloads before history updates are committed; it is matched to the URL/history entry and cleared on consumption. It stores no contact-form data.
- **WebKit restoration:** saved paper positions are reapplied after Astro's fragment/focus handling. This fixes a reproduced case where closing a case study opened in a new tab returned to the source URL but lost its scroll position.
- **Grid calculations:** work-entry and contact alignment use the same CSS grid token. Work-entry measurements are batched before style writes instead of repeatedly forcing layout for each row. The preceding-row alignment rule is unchanged.
- **Binder rings:** replaced page-dependent `background-repeat: space` distribution with discrete, grid-anchored rings. A shared configuration controls the starting row, row interval, and bottom clearance; the bounds helper creates exactly as many visible rings as each page can fit, accounting for the SVG's transparent lower viewBox area.
- **HTML and accessibility:** removed invalid headings inside definition-list terms and a decorative heading nested inside spans. Location/time headings and the thumbnail arrow retain their typography. Read More links identify their project through an accessible description; native buttons receive the same visible keyboard-focus treatment as links. Reduced-motion rules cover invalid floating labels too.
- **Assets:** losslessly recompressed both House of Color PNGs, retaining their full 900 × 600 dimensions, decoded RGBA pixels, and Display P3 profiles. Kept their URLs and exact sketch/image registration. Added the font copyright notices and Open Font License beside the fonts. Removed Finder metadata from the public directory so it is no longer deployed.
- **Maintenance:** replaced placeholder About/Work descriptions, corrected the diagnostic page's undefined color token, and marked `/scroll-test/` as `noindex`. Updated the README and editing guide to describe the current footer, components, image locations, defaults, lifecycle behavior, and testing commands.

## Asset savings

| Asset                  |            Before |             After |
| ---------------------- | ----------------: | ----------------: |
| Finished thumbnail PNG |     514,540 bytes |     397,553 bytes |
| Sketch PNG             |     411,001 bytes |     304,863 bytes |
| **Combined**           | **925,541 bytes** | **702,416 bytes** |

The images are **223,125 bytes smaller (24.1%)**. Pixel buffers and embedded color profiles were compared directly. Lossy palette conversion and automatic color-space conversion were rejected because preserving the artwork matters more than maximizing compression.

The site builds to five static routes: four portfolio pages and the manual scrolling diagnostic. No runtime dependency was added. JavaScript remains limited to Astro's client router, navigation/scroll state, grid alignment, contact validation, the Netherlands clock, and the lower overscroll backdrop. SVG paths and filters remain where needed for the established illustration style.

## Verification

- Astro/type checks: zero errors, warnings, or hints.
- Prettier: consistent formatting.
- Production build: all five routes generated successfully.
- Browser regressions: **70 passed** — 35 scenarios each in Chromium and WebKit. The original 29 Chromium tests passed before changes. New cases cover autofill/change events, reset, native submission, JavaScript-free form use, bounded history updates, immediate reloads, the persisted list/grid work view, and grid-locked binder-ring spacing and bounds.
- Visual comparison: home, project-entry default/hover, and footer empty/filled/error states at 16px and 12px root sizes. All 12 screenshot pairs were pixel-identical to the baseline. The image pixel buffers and profiles themselves are identical.
- npm advisory audit: zero known vulnerabilities in the installed dependency graph at review time. This is not a security guarantee.
- Firefox automation could not launch: the downloaded test browser reported that it could not find its temporary profile, including with an explicit temporary-directory override. It is configured as a test project but is not counted as verified.

The suite checks current behavior, not just whether the build succeeds. It covers routes and accessible names, SVG references, case-study return paths, copied links/new tabs, tab/button states, rem scaling, note placement, thumbnail crossfades, form geometry and validation timing, top/bottom backdrop colors, keyboard access, and reduced motion.

## Before launch

1. **Connect message delivery.** The form has no `action` endpoint, so a valid submission currently posts to the static page and does not send email. Choose a provider, configure its endpoint, and test delivery, success/failure feedback, server-side validation, abuse protection, and relevant privacy information. Front-end validation is not a security boundary.
2. **Complete responsive layouts.** The hero has fixed desktop composition and large gutters, and the tab widths are not yet adapted for narrow phones. Rem scaling does not resolve these layout constraints by itself. Check 320–430px widths, landscape orientation, 200% zoom, long text, and the on-screen keyboard. This review deliberately did not redesign those layouts.
3. **Resolve placeholder contrast.** `--light-gray-ink-color` (#959698) against `--paper-color` (#fffdf7) is approximately **2.91:1**. This falls below the 4.5:1 requirement applicable to the 1.25rem, weight-500 placeholders, and below 3:1 for field strokes needed to identify controls. The palette is unchanged to preserve the requested appearance; darker placeholder/stroke tokens are a design decision still to make. See [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
4. **Finish content and publishing metadata.** About, Work, and House of Color need their planned content. Select the domain before adding canonical URLs and a sitemap; supply a favicon and social-sharing image. Root-relative URLs assume deployment at `/`. Configure compression and appropriate HTML/asset caching on the host.
5. **Do a physical-device and assistive-technology pass.** Automated WebKit does not reproduce every Safari GPU/elastic-scroll behavior. Check fast trackpad scrolling and both bounce edges in Safari, plus touch interaction, VoiceOver field announcements, and keyboard navigation. Firefox still needs a successful run in a working browser environment.
6. **Establish durable version control.** No `.git` directory is present in either portfolio directory. Keep committed source history before expanding the site. The active project is the inner directory containing `package.json`; the outer same-named folder is only a container. Avoid syncing generated dependencies/build output between machines through iCloud.

## Architecture and editing boundaries

- `BinderLayout.astro` supplies metadata, navigation, the single main landmark, the paper contact section, and the credit bar.
- `.paper` is the scroll container. `.reader` carries the moving grid; `.paper-sheet` contains the page, contact area, and ring strip. The black credit bar follows the paper. These layers were not restructured.
- Page content belongs in `src/pages/`; project visibility, ordering, and homepage selection belong in `src/data/work.ts`. Shared component behavior belongs in its component/script rather than in copied page markup.
- Tokens and typography stay in `src/styles/`; component CSS stays with its Astro component. Existing public component names and composition classes were retained rather than renamed for cosmetic consistency.
- `public/` assets are copied unchanged by Astro. Current PNGs use this path to preserve their color profiles. Imported `Image` assets are also supported, but changing pipelines requires a color/registration check.
- Source comments explain behavior and browser constraints. Editing instructions live in the README and editing guide. Dependency versions and the lockfile were not changed unnecessarily.

## Reference basis

- [Astro components](https://docs.astro.build/en/basics/astro-components/) and [styling scope](https://docs.astro.build/en/guides/styling/) informed the static-component structure.
- [Astro router lifecycle](https://docs.astro.build/en/guides/view-transitions/#lifecycle-events) informed script initialization and restoration.
- [History.replaceState](https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState) documents rejection of overly frequent updates.
- [HTML definition-list rules](https://html.spec.whatwg.org/multipage/grouping-content.html#the-dt-element) informed the location/time markup correction.
- [CSS placeholder state](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:placeholder-shown) and [ARIA invalid-field guidance](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA21.html) informed form-state changes.
- [Astro image handling](https://docs.astro.build/en/guides/images/) distinguishes public assets from processed imports.
- [Alegreya Sans license](https://github.com/google/fonts/blob/main/ofl/alegreyasans/OFL.txt) and [Londrina Solid license](https://github.com/google/fonts/blob/main/ofl/londrinasolid/OFL.txt) supply the bundled font notices.

The review focuses on observable correctness, clear ownership, justified abstractions, and reproducible checks. A successful build alone does not establish browser compatibility, accessibility conformance, message delivery, or production readiness.
