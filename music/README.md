# Music wheel

A local interactive music carousel and a generated animated SVG preview for
the GitHub profile README. Both use the same track list and album artwork.
The current selection contains nine tracks.

## Update the music selection

1. Add square JPEG artwork to `assets/albums/`.
2. Update `music/tracks.js` with the artist, title, relative cover path and
   Spotify URL. Keep at least seven tracks for the fixed SVG depth slots.
3. From the repository root, regenerate the preview:

```powershell
node music/generate-svg.cjs
```

Open `music/index.html` for the interactive version, or open the generated
`assets/music-wheel.svg` locally to inspect the preview.

## SVG preview

The generator uses only Node.js built-ins, embeds each JPEG once and uses
seven fixed depth slots independently of the track count. Each track takes
6.5 seconds; the current nine-track loop takes 58.5 seconds.

The 840 × 338 SVG has a transparent background for both GitHub themes.
A symmetric edge mask uses a sampled smoothstep curve cubed over 17% of
each side. A subtle perspective transform preserves fractional motion in
Firefox. The SVG uses no cover shadows. Title wrapping approximates
monospace font metrics, which may vary by platform.

The SVG and interactive carousel have separate layout implementations.
Review both if layout or timing changes.

## Profile README integration

Embed the generated preview from the repository root:

```html
<div align="center">
  <img src="./assets/music-wheel.svg" width="100%" alt="Currently on repeat: rotating album covers" />
</div>
```

The preview is an animated image, not the interactive carousel. It requires
no GitHub Pages deployment or external image requests. Earlier GitHub probes
showed that opening the raw SVG directly could block embedded JPEGs under
GitHub's content-security policy, although the README rendered them.

Inspect the final README in both light and dark mode before merging.

## Tests

From the repository root:

```powershell
Push-Location music/tests
npm ci
npx playwright install firefox
$env:BROWSER = 'firefox'
node --test svg.test.cjs carousel.test.cjs
Pop-Location
```

The nine-track version passed all 25 tests in Firefox on 26 November 2026
(21 interactive carousel tests and four SVG tests). Chrome and WebKit have
not been retested for this version. Set `$env:HEADFUL = '1'` for a visible
browser.

## Accessibility

The SVG has a static initial frame when animation is disabled or unsupported.
Its CSS requests reduced motion, but an embedded image may not receive the
host page's preference. See [ACCESSIBILITY.md](ACCESSIBILITY.md) for known
limitations, browser options and remaining manual checks.
