# Carousel accessibility

The carousel pauses when keyboard focus enters. Its pause control is visible
on keyboard focus, and Space on an album also toggles automatic rotation.
Resuming from a focused album takes effect after focus leaves that album,
provided the pointer is not hovering and reduced motion is not enabled.
Reduced-motion preferences stop automatic rotation. Escape dismisses a
revealed track label until the pointer or focus leaves that album.

All seven track links remain available to screen readers, including links
outside the visible part of the carousel. Automatic rotation does not make
live announcements.

## Known limitations

- There is no persistent pause control available to sighted mouse-only or
  touch-only users. Hover pauses only while the pointer remains over the
  carousel. This can prevent conformance with
  [WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).
- Track labels fade during motion and may temporarily fall below the text
  contrast threshold. Settled labels are fully opaque.
- Viewports below 185 CSS pixels and default text sizes above 200% have not
  been comprehensively verified.
- Screen-reader behavior, physical touch devices and actual browser zoom
  still require manual verification. Automated checks cover narrow CSS
  viewports and enlarged default text, but are not a full WCAG audit.

## Remaining manual verification

- Check actual browser zoom at 200% and 400%.
- Check navigation and links on physical touch devices.
- Check rendering and interaction in Safari/WebKit.
- Check keyboard and screen-reader behavior with NVDA and VoiceOver.
- Investigate the intermittent headful hover/focus test if it recurs.

## Regression tests

The tests use Node.js 20 or newer and a test-only Playwright dependency:

```powershell
Set-Location music\tests
npm ci
npx playwright install firefox
npm test
```

Set `$env:BROWSER` to `firefox`, `chrome`, or `webkit` before `npm test`.
Chrome uses an installed Google Chrome; WebKit requires
`npx playwright install webkit`. Set `$env:HEADFUL = '1'` to run with a
visible browser. On Windows, headful Playwright WebKit cannot create the
sub-250px viewports used by some tests; run those tests headlessly and
verify Safari separately.

## Animation performance

From `music\tests`, run the comparison against a separate repository
snapshot containing the baseline `music` and `assets` directories:

```powershell
$env:BROWSER = 'firefox' # or 'chrome'
node .\performance.cjs 'C:\path\to\baseline-snapshot'
```

The script alternates five 15-second runs per version after a two-second
warmup, at a 1000 x 700 headless viewport. It reports frame intervals and
instrumented JavaScript render times. Compare runs on the same machine
with similar load; headless timing and timer precision do not establish
real-device smoothness.
