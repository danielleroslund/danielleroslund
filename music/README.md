# Music wheel SVG

From the repository root, regenerate the preview after editing `tracks.js` or
the album artwork:

```powershell
node music\generate-svg.cjs
```

The generator uses only Node.js built-ins and writes `assets\music-wheel.svg`.
It reads cover paths relative to `music`, embeds each JPEG once, and uses the
same track order as the interactive carousel. SVG geometry and sampled
keyframes mirror the desktop carousel; if its layout or timing changes, update
the generator too. Seven fixed depth slots reuse the artwork, and a subtle
perspective transform preserves fractional motion in Firefox. The SVG uses no
cover shadows. The title wrapping approximates the browser's monospace font
metrics, which may vary by platform.

Run the SVG smoke tests with the existing test-only Playwright dependency:

```powershell
Set-Location music\tests
$env:BROWSER = 'firefox' # or 'chrome' or 'webkit'
node --test svg.test.cjs
```

Set `$env:HEADFUL = '1'` for a visible browser.

The SVG has a static initial frame when animation is disabled or unsupported.
Its CSS requests a static frame for reduced motion, but an SVG embedded as an
image may not receive the host page's preference. See `ACCESSIBILITY.md` for
the known limitations and remaining manual checks. In the GitHub probe, the
raw SVG opened directly as a document could not load its embedded JPEG under
GitHub's content-security policy, although it rendered inside the README.

## Planned README integration and GitHub verification

After approval, the profile README can embed the generated preview with:

```markdown
![Currently on repeat: seven rotating album covers](./assets/music-wheel.svg)
```

Once GitHub Pages is deployed and its URL is confirmed, the image can be
wrapped in a link to the interactive carousel. Before merging, publish a
temporary test branch only with approval and inspect the rendered README in
Firefox and Chrome, including artwork, perspective motion, label transitions
and the 45.5-second loop. The earlier GitHub probe did not test this specific
perspective-based SVG. Reduced-motion behavior and pause limitations remain
subject to the checks in `ACCESSIBILITY.md`.
