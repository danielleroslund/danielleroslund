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
- Screen-reader behavior, physical touch devices and actual browser zoom
  still require manual verification. Automated checks cover narrow CSS
  viewports and enlarged default text, but are not a full WCAG audit.

## Regression tests

The tests use Node.js 20 or newer and a test-only Playwright dependency:

```powershell
Set-Location music\tests
npm ci
npx playwright install firefox
npm test
```

To run against an installed Google Chrome, set `$env:BROWSER = 'chrome'`
before `npm test`. Set `$env:HEADFUL = '1'` to run with a visible browser.
