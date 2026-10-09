# Brand

Source for the Frontdesk.ai logo. Shipped files live in [`public/brand/`](../public/brand/).

![Frontdesk.ai logo](../public/brand/frontdesk-logo.svg)

## The logo

- **Wordmark:** `frontdesk.ai`, all lowercase, set in **Bitcount Prop Single** at weight 400, the same font the app loads (`app/fonts/bitcount-prop-single-latin.woff2`, SIL Open Font License). Every letter is a set of touching dots on a 100-unit grid; the build reads those dots straight out of the font.
- **Mark:** a lowercase `f` and `d` merged on one shared stem, drawn on the same touching-dot grid as the wordmark: the `f`'s curl tops the stem, its crossbar runs through the top of the `d`'s bowl.

## Files

| File in `public/brand/` | Use |
| --- | --- |
| `frontdesk-mark.svg` | Symbol only, square canvas: avatars, favicons, app icons |
| `frontdesk-logo.svg` | Horizontal lockup: headers, README, docs |
| `frontdesk-logo-stacked.svg` | Stacked lockup: square or centred layouts |
| `frontdesk-wordmark.svg` | Wordmark only: tight horizontal spaces |
| `*-light.svg` | Same artwork in `#F5F5F4` for dark backgrounds |
| `frontdesk-app-icon.svg` | Mark on a dark rounded tile: source for every app icon |
| `icons/icon-192.png`, `icons/icon-512.png` | PWA manifest icons |

Ink colour is `#111111`.

## Regenerate

```bash
pip install fonttools brotli
cd brand/tools
python build_logo.py
```

`tools/glyphs.py` extracts the dots from the font; `tools/build_logo.py` holds the mark's dot grid (`FD`) and writes:

- every SVG in `public/brand/`
- `app/icon.svg` (browser tab icon)
- `components/brand/logo-data.ts`, the dot coordinates behind the `<Logo />`, `<LogoMark />` and `<LogoWordmark />` React components (`components/brand/logo.tsx`)

The raster icons are rendered from `public/brand/frontdesk-app-icon.svg` with any SVG renderer: `app/favicon.ico` (16/32/48 px), `app/apple-icon.png` (180 px), and `public/brand/icons/icon-192.png` / `icon-512.png`. Re-render them whenever the mark changes.

## Where the logo appears in the app

| Place | Uses |
| --- | --- |
| Browser tab, bookmarks | `app/favicon.ico`, `app/icon.svg` |
| iOS home screen | `app/apple-icon.png` |
| Installed app (PWA) | `app/manifest.ts` → `public/brand/icons/` |
| Dashboard sidebar | `<Logo />`, `<LogoMark />` when collapsed |
| Settings sidebar, login/signup | `<Logo />` |
| Onboarding intro | `<LogoMark />` then `<LogoWordmark />` |
| Social preview card | `<Logo />` in `app/opengraph-image.tsx` |

The React components draw with `currentColor`, so they follow the theme's text colour in light and dark mode.

## Not done yet

Colour palette and a usage guide. Trademark clearance has not been checked.
