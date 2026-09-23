# Editing the portfolio

## Pages and sections

Each file under `src/pages/` creates a route. For example, `src/pages/work/house-of-color.astro` creates `/work/house-of-color/`. The binder layout already supplies the main landmark.

```astro
---
import BinderLayout from '../layouts/BinderLayout.astro';
---

<BinderLayout title="Page title | Kevin" description="A short description of this page.">
    <div class="page-content">
        <h1>Page title</h1>
        <section>
            <h2>Primary section heading</h2>
            <h3>Subsection heading</h3>
            <p>Page content.</p>
        </section>
    </div>
</BinderLayout>
```

On the home page, new sections go after `.home-hero`, inside `.page-content-home`. The hero owns the intro/note flex layout. Later sections stack below it.

## Binder rings

The ring layout for every page is configured in `src/config/binder.ts`:

```ts
export const binderRingLayout = {
    startRow: 4,
    spacingRows: 4,
    bottomClearanceRows: 0,
} as const;
```

`startRow` selects the horizontal paper-grid line crossed by the first ring's attachment point, measured from the top of the paper below the navigation. `spacingRows` controls the distance from one ring attachment to the next in complete grid rows. For example, `4` places consecutive rings four two-rem rows apart. `bottomClearanceRows` reserves that many empty grid rows below the final visible ring; increase it when you want more breathing room before the paper edge, or set it to `0` to allow a ring to sit as close to the edge as its full artwork permits.

Every route uses these same positions. `binder-rings.ts` measures the paper height and creates exactly as many complete visible rings as fit above the lower paper edge and configured clearance; it ignores the transparent lower portion of the SVG viewBox so a usable final ring is not skipped. Ring artwork dimensions, visible artwork height, and the paper attachment offset remain centralized with the other visual tokens in `src/styles/tokens.css`.

## Portfolio work

All project entries live in `src/data/work.ts`. That catalogue supplies both the complete Work page and the smaller Featured Work selection on the homepage, so project content and links only need to be maintained once.

```ts
import projectSketch from '../assets/work/project-name-sketch.png';
import projectThumbnail from '../assets/work/project-name.png';

{
    id: 'project-name',
    title: 'Project name',
    summary: 'A short explanation of the project, your role, and the outcome.',
    href: '/work/project-name/',
    isVisible: true,
    isFeatured: false,
    order: 2,
    featuredOrder: 2,
    thumbnail: {
        sketch: projectSketch,
        image: projectThumbnail,
        alt: 'A clear description of what the project thumbnail shows',
        rotation: -1,
    },
}
```

Set `isVisible` to `false` to keep a project in the catalogue without rendering it anywhere. A visible project appears on the Work page; set `isFeatured` to `true` to include it on the homepage too. `order` controls the Work page, while the optional `featuredOrder` controls the homepage selection independently. If `featuredOrder` is omitted, the regular order is used.

Thumbnail fields accept imported images from `src/assets/work/` or URL strings such as `/images/project-name.png` for files in `public/images/`. Imported images use Astro's image processing; public images are served unchanged. The current House of Color PNGs stay in `public/images/` to preserve their Display P3 color profiles and exact sketch/image registration. Both layers should use matching dimensions and composition. The sketch is decorative; `alt` describes the finished image. Use an empty alt only when that image adds no information beyond the project title.

`thumbnail.rotation` accepts a number of degrees or any CSS angle. At rest, the sketch fills the complete 3:2 paper. On hover or keyboard focus, the paper straightens, grows slightly, crossfades to the finished image, and reveals its Polaroid border and decorative arrow. The frame overlays the full-size image rather than resizing it. `WorkThumbnail.astro` owns this artwork and interaction.

`WorkCollection.astro` renders catalogue selections through `WorkEntry.astro`. List view always places the thumbnail on the left and the title, summary, and case-study button on the right. At viewport widths up to 64rem, list entries stack with the thumbnail above the description. Titles and descriptions use one 2rem paper-grid row per text line, with one empty row between them; the shared alignment helper keeps the complete text block on the paper grid.

The Work page enables the collection's List view/Grid view switcher. Grid view uses two thumbnail columns, hides summaries and buttons, and centers each title below its thumbnail. It becomes one column below 48rem. The visitor's choice is saved locally for later visits; the homepage always uses list view and does not expose the switcher.

The current entry is House of Color at `/work/house-of-color/`. Add another object to the catalogue for a new project, then create its case-study page in `src/pages/work/`. The thumbnail and View Case Study button get their destination from the same catalogue entry and are both marked with `data-case-study-link`:

```astro
<PrimaryBtn href="/work/project-name/" data-case-study-link>
    View case study
</PrimaryBtn>
```

The title and summary remain informational text; the thumbnail and button are separate links rather than one nested or oversized link.

The shared site-navigation helper records whether the case study was opened from Home or Work. Scroll checkpoints run at most twice per second, with the exact position saved before navigation, page hiding, and case-study opening. A one-use session-storage checkpoint covers immediate reloads; it is consumed only for the matching URL and history entry, never a normal page visit. No form values are stored. Restoration runs again after Astro's page-load event so fragment focusing cannot override it. The close tab returns through browser history, with a source-page URL fallback for copied links and new tabs. Direct visits without return context go to Work.

## Buttons

```astro
---
import PrimaryBtn from '../components/PrimaryBtn.astro';
import PrimarySubmit from '../components/PrimarySubmit.astro';
import SecondaryBtn from '../components/SecondaryBtn.astro';
---

<PrimaryBtn href="/work/">View my work</PrimaryBtn>
<SecondaryBtn href="#contact">Get in touch</SecondaryBtn>
<PrimarySubmit>Send</PrimarySubmit>
```

Both link components accept standard anchor attributes, including `class`, `id`, `target`, `rel`, and `aria-label`. They are navigation links styled as buttons; use `PrimarySubmit` or a native `<button>` for actions such as submitting a form or opening a dialog.

The contact form uses the standard-size `PrimarySubmit.astro`. Its unavailable state swaps the yellow decoration for the multiply-blended `public/images/highlighter-gray.svg`, changes the outline and label to light gray, hides the shadow, and displays its completion hint in the half-row beneath the button. The hint is outside the button's layout box, so the button can remain vertically centered against the Message field while its caption aligns with field errors. Both caption types use the shared rem-based `--contact-caption-gap`. JavaScript applies `aria-disabled` instead of the native `disabled` attribute, so the button remains keyboard-focusable. Without JavaScript, native form validation controls submission.

`ButtonLink.astro` owns the anchor wrapper; `ButtonArtwork.astro` owns the shared vectors and label; `buttons.css` owns dimensions and states. Primary and secondary select the variant. A future tertiary variant can extend the variant type, add its ink/decoration rules, and use a small `TertiaryBtn.astro` wrapper.

The outer `.button-primary` and `.button-secondary` selectors are retained. Shared internals now use `.button__label`, `.button__highlighter`, and `.button__shadow--default`, `--hover`, or `--active`. Button labels are spans with the same visual typography as `h4` elements.

## Sticky notes

```astro
---
import StickyNote from '../components/StickyNote.astro';
import SecondaryBtn from '../components/SecondaryBtn.astro';
---

<StickyNote id="project-note" title="A note" size={19} padding={2.5} contentGap={2} rotation={-1.2}>
    <ul class="sticky-note-list" role="list">
        <li class="sticky-note-list__item">
            <p>First item</p>
        </li>
        <li class="sticky-note-list__item">
            <p>Second item</p>
        </li>
    </ul>
</StickyNote>

<StickyNote id="contact-note" title="Let's talk" class="contact-note">
    <div class="contact-note__footer">
        <SecondaryBtn href="#contact">Get in touch</SecondaryBtn>
        <p class="caption">A short caption</p>
    </div>
</StickyNote>

<style>
    .contact-note__footer {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        margin-top: auto;
    }
</style>
```

| Property     | Default           | Meaning                                            |
| ------------ | ----------------- | -------------------------------------------------- |
| `id`         | Required          | Unique, stable ID for the note and its SVG artwork |
| `title`      | Required          | Visible `h3` heading                               |
| `size`       | `17`              | Width and height in rem; use a positive number     |
| `padding`    | `2.5`             | Content padding in rem                             |
| `contentGap` | Same as `padding` | Title-to-body gap in rem                           |
| `rotation`   | `0`               | Number in degrees, or a CSS angle such as `'1deg'` |
| `class`      | None              | Optional class for positioning a specific note     |

Use the `size` prop to resize a note. It scales all three vectors and their offsets together. Overriding only the outer CSS width or `--sticky-note-size` does **not** recalculate artwork sizing. Root-font-size changes scale content and artwork together because dimensions use rem.

Only the artwork rotates; the title and body remain upright. The body is a flex column, so `margin-top: auto` anchors a content group at the bottom. Font sizes remain independent of the `size` prop. Very small notes, large padding, and long titles can overflow: choose dimensions that accommodate the content.

List items use `.sticky-note-list__item`. Edit `sticky-note-list.css` for bullet dimensions/color, horizontal gap, and row spacing. The current values are 0.5rem bullets, a 1.5rem bullet-to-text gap, and 1rem between rows. Default list indentation is removed. Keep `role="list"` on these visually customized lists so their semantics remain explicit.

## Netherlands time and captions

```astro
---
import NetherlandsTime from '../components/NetherlandsTime.astro';
---

<NetherlandsTime />
<NetherlandsTime location="Amsterdam, The Netherlands" />
```

The location prop changes only the caption; the timezone is always `Europe/Amsterdam`. Set `showLocation={false}` when only the time is needed, such as in the footer. The clock displays 12-hour time, handles daylight saving, and updates at minute boundaries. It restarts after Astro page navigation and after returning to a hidden browser tab. It stops work when there is no clock on the page. Without JavaScript, only the location appears when `showLocation` is enabled. The time is based on the visitor's device clock.

The caption uses `<p class="caption">` with the visual `h5` typography. Use `<p class="caption">` for other captions, reserving heading elements for actual headings.

## Footer and contact area

`ContactSection.astro` and `SiteFooter.astro` are rendered by `BinderLayout.astro`, so they appear automatically on every page. The `#contact` section remains inside `.paper-sheet`, with the paper grid and binder rings behind it. Only the four-rem credit bar in `SiteFooter.astro` sits below the paper visual on the black surface. The Home sticky note links to the contact section with `href="#contact"`.

The desktop footer form has two equal columns. The left column contains its `h3` heading and the fields; the right column contains right-aligned `h4` headings for location and local time, their values in the following grid rows, and the standard-size Send button. Placeholders, entered values, the location, and the local time use the 1.25rem body size; floating field labels retain the smaller caption size. Name and email are one 2rem grid row high, while Message stays two rows high and scrolls internally when its content exceeds that space. Its 2rem line-height keeps the text aligned with the paper rows. Field artwork uses only a left and bottom stroke. Labels remain placeholder-sized until their field contains text, then occupy the half-row above it. Absolute-positioned errors occupy the half-row below without changing the layout.

The controls keep the standard `name`, `email`, and `message` field names. The form has **no delivery endpoint yet**: without an `action`, a valid submission posts to the current static page and does not send an email. Add the selected provider's endpoint as `action` on the form in `ContactSection.astro`, and retain or adapt its required method and field names. `data-astro-reload` preserves native form submission rather than having the client router intercept the provider's response. The submit control is a real `<button type="submit">`.

`contact-form.ts` supplies inline email validation, the unavailable submit-button state, and a small vertical offset that keeps the field baselines on the paper grid. A non-empty invalid value is reported only after leaving its field, rather than while it is first being typed. Clicking Send while required fields are empty does not add duplicate field errors because the persistent completion hint already explains the unavailable state. A non-empty invalid email remains visible until corrected. Error styling uses the dedicated `--alert-color` token; entered values remain black, and an empty placeholder remains light gray. Floating labels use CSS `:placeholder-shown` rather than a duplicate JavaScript filled flag, so restored/autofilled values and JavaScript-free typing do not overlap their labels. Change events, page restoration, and native resets synchronize validation and button availability. Provider-specific success, server errors, spam protection, and privacy messaging remain for the selected form service. Server-side validation is still necessary; browser validation is not a security boundary.

The paper-to-credit spacing and lower credit-bar height are controlled by `--page-footer-gap` and `--footer-bar-height` in `tokens.css`; the contact section's upper separation lives in `ContactSection.astro`. The ring strip belongs to `.paper-sheet`, so it continues through the contact section and stops before the credit bar. Contact navigation uses smooth scrolling without retaining `#contact` in the URL, with an automatic reduced-motion exception.

## Styling conventions

- Component filenames use PascalCase. CSS uses descriptive kebab-case, with `__element` and `--state` for new component internals.
- Existing composition hooks such as `.home-intro`, `.sticky-notes-home`, and `.sticky-home-1` are retained.
- Shared design values belong in `tokens.css`. Palette, typography, spacing, dimensions, artwork placement, and component states are grouped there so a visual adjustment normally has one editing location. The current `--page-max-width` is **108rem**, shared by navigation and page content. The corner remains anchored to the outer navigation.
- Keep layout dimensions in rem. SVG viewBox/path coordinates should stay in their original unitless coordinate system.
- Bundled fonts stay first in each typography stack. Metric-adjusted local fallback faces in `typography.css` reduce width and line-wrap changes while fonts load; update those fallback faces if the primary fonts are replaced.
- Runtime grid offsets are the exception: they are measured in viewport pixels and written as pixels to avoid fractional rem rounding; they are not fixed design values.
- Component-specific styles belong with the component. Page composition belongs in its page stylesheet. Shared type styles belong in `typography.css`.
- Long CSS, Astro, and TypeScript files use a bordered section-comment convention. Keep those headers descriptive and update them when a section's responsibility changes; avoid comments that duplicate the property names.
- The tab labels use `.tab__label`, with the same visual typography as `h4`. Captions and control labels do not add false headings to the document outline.
- Each page has one `h1`; Featured Work uses `h2`; project, sticky-note, and contact titles use `h3`; location/time headings use `h4`. Preserve logical hierarchy when adding content. Decorative arrows, button text, and captions use spans or paragraphs rather than headings.

## Astro references

- [Components and slots](https://docs.astro.build/en/basics/astro-components/)
- [Styling and component scope](https://docs.astro.build/en/guides/styling/)
- [Client-router lifecycle events](https://docs.astro.build/en/guides/view-transitions/#lifecycle-events)
