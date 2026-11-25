const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium, firefox } = require("playwright");

const url = pathToFileURL(path.resolve(__dirname, "..", "index.html")).href;
let browser;

before(async () => {
    const options = { headless: !process.env.HEADFUL };
    browser = process.env.BROWSER === "chrome"
        ? await chromium.launch({ ...options, channel: "chrome" })
        : await firefox.launch(options);
});

after(async () => {
    if (browser) await browser.close();
});

async function openPage(options = {}) {
    const context = await browser.newContext({
        viewport: { width: 1000, height: 700 },
        ...options
    });
    const page = await context.newPage();
    await page.goto(url);
    await page.mouse.move(1, 1);
    return { context, page };
}

test("revealed side label remains active under the pointer", async () => {
    const { context, page } = await openPage();
    try {
        await page.evaluate(() => eval("scroll=2;isPaused=true;velocity=0;acceleration=0;render(200)"));
        const cover = await page.locator('[data-index="1"] .cover').boundingBox();
        await page.mouse.move(cover.x + cover.width * .15, cover.y + cover.height / 2);
        await page.waitForTimeout(500);
        const label = await page.locator('[data-index="1"] .track-label').boundingBox();
        await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2);
        await page.waitForTimeout(400);
        const state = await page.evaluate(() => ({
            raised: document.querySelector(".album.is-raised")?.dataset.index,
            scroll: eval("scroll"), hovered: eval("hoveredAlbum?.element.dataset.index"),
            edge: eval("edgeScrolling")
        }));
        assert.equal(state.raised, "1", JSON.stringify({ cover, label, state }));
        assert.equal(await page.locator('[data-index="1"] .track-label').evaluate(e => +getComputedStyle(e).opacity), 1);
    } finally {
        await context.close();
    }
});

test("Escape dismisses a revealed label without moving the pointer", async () => {
    const { context, page } = await openPage();
    try {
        await page.evaluate(() => eval("scroll=2;isPaused=true;velocity=0;acceleration=0;render(200)"));
        const cover = await page.locator('[data-index="1"] .cover').boundingBox();
        await page.mouse.move(cover.x + cover.width * .15, cover.y + cover.height / 2);
        await page.waitForTimeout(500);
        const label = await page.locator('[data-index="1"] .track-label').boundingBox();
        await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        assert.equal(await page.locator('[data-index="1"] .track-label').evaluate(e => +getComputedStyle(e).opacity), 0);
        assert.equal(await page.evaluate(() => document.querySelector(".album.is-raised")?.dataset.index), "1");
        await page.mouse.move(1, 1);
        await page.waitForTimeout(300);
        await page.mouse.move(cover.x + cover.width * .15, cover.y + cover.height / 2);
        await page.waitForTimeout(500);
        assert.equal(await page.locator('[data-index="1"] .track-label').evaluate(e => +getComputedStyle(e).opacity), 1);
    } finally {
        await context.close();
    }
});

test("a revealed label in an edge zone does not trigger navigation", async () => {
    const { context, page } = await openPage();
    try {
        await page.evaluate(() => eval("scroll=2;isPaused=true;velocity=0;acceleration=0;render(200)"));
        const wheel = await page.locator(".music-wheel").boundingBox();
        const cover = await page.locator('[data-index="0"] .cover').boundingBox();
        await page.mouse.move(wheel.x + wheel.width * .15, cover.y + cover.height / 2);
        await page.waitForTimeout(500);
        assert.equal(await page.evaluate(() => document.querySelector(".album.is-raised")?.dataset.index), "0");
        const label = await page.locator('[data-index="0"] .track-label').boundingBox();
        await page.mouse.move(wheel.x + wheel.width * .05, label.y + label.height / 2);
        await page.waitForTimeout(500);
        assert.equal(await page.evaluate(() => eval("edgeScrolling")), false);
        assert.equal(await page.evaluate(() => document.querySelector(".album.is-raised")?.dataset.index), "0");
    } finally {
        await context.close();
    }
});

test("settled fractional position displays a fully opaque label", async () => {
    const { context, page } = await openPage();
    try {
        await page.evaluate(() => eval("scroll=2.25;isPaused=true;velocity=0;acceleration=0;render(200)"));
        await page.waitForTimeout(700);
        assert.equal(await page.locator('[data-index="2"] .track-label').evaluate(e => +getComputedStyle(e).opacity), 1);
        assert.equal(await page.locator(".track-label").evaluateAll(nodes => nodes.filter(e => +getComputedStyle(e).opacity > 0).length), 1);
        const ratios = await page.evaluate(() => {
            const rgb = color => color.match(/\d+/g).slice(0, 3).map(Number);
            const luminance = color => color.map(value => {
                value /= 255;
                return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
            }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
            const background = luminance(rgb(getComputedStyle(document.body).backgroundColor));
            return [...document.querySelectorAll('[data-index="2"] .track-title, [data-index="2"] .track-artist')]
                .map(element => (luminance(rgb(getComputedStyle(element).color)) + .05) / (background + .05));
        });
        assert(ratios.every(ratio => ratio >= 4.5), JSON.stringify(ratios));
    } finally {
        await context.close();
    }
});

test("long and side labels remain readable and unclipped on narrow screens", async () => {
    for (const width of [480, 320, 200]) {
        const { context, page } = await openPage({ viewport: { width, height: 700 }, reducedMotion: "reduce" });
        try {
            await page.evaluate(() => eval("scroll=2;render(200)"));
            const result = await page.evaluate(() => {
                const album = document.querySelector('[data-index="2"]');
                const label = album.querySelector(".track-label").getBoundingClientRect();
                const title = album.querySelector(".track-title");
                const wheel = document.querySelector(".music-wheel").getBoundingClientRect();
                return {
                    left: label.left, right: label.right, bottom: label.bottom,
                    wheelBottom: wheel.bottom, font: parseFloat(getComputedStyle(title).fontSize),
                    scrollWidth: document.documentElement.scrollWidth
                };
            });
            assert(result.font >= 12, JSON.stringify(result));
            assert(result.left >= 0 && result.right <= width, JSON.stringify(result));
            assert(result.bottom <= result.wheelBottom, JSON.stringify(result));
            assert.equal(result.scrollWidth, width);
            for (const index of [0, 4]) {
                await page.evaluate(index => eval(`focusedAlbum=albums[${index}];updateRaised();render(200)`), index);
                const side = await page.locator(`[data-index="${index}"] .track-label`).boundingBox();
                assert(side.x >= 0 && side.x + side.width <= width, JSON.stringify({ width, index, side }));
            }
            const overlap = await page.evaluate(() => {
                const buttons = [...document.querySelectorAll(".nav-arrow")].map(e => e.getBoundingClientRect());
                const covers = [...document.querySelectorAll(".album")].map(e => e.querySelector(".cover").getBoundingClientRect());
                return buttons.some(b => covers.some(c => b.left < c.right && b.right > c.left && b.top < c.bottom && b.bottom > c.top));
            });
            assert.equal(overlap, false, `controls overlap covers at ${width}px`);
        } finally {
            await context.close();
        }
    }
});

test("narrow labels fit when the user's default text size doubles", async () => {
    for (const width of [320, 200]) {
        const { context, page } = await openPage({ viewport: { width, height: 700 }, reducedMotion: "reduce" });
        try {
            await page.addStyleTag({ content: "html { font-size: 200%; }" });
            await page.evaluate(() => eval("scroll=2;measure();render(200)"));
            const sizes = await page.evaluate(() => {
                const label = document.querySelector('[data-index="2"] .track-label').getBoundingClientRect();
                const button = document.querySelector(".nav-arrow").getBoundingClientRect();
                const wheel = document.querySelector(".music-wheel").getBoundingClientRect();
                return { left: label.left, right: label.right, bottom: label.bottom, buttonTop: button.top, wheelBottom: wheel.bottom };
            });
            assert(sizes.left >= 0 && sizes.right <= width && sizes.bottom <= sizes.buttonTop && sizes.bottom <= sizes.wheelBottom, JSON.stringify({ width, sizes }));
        } finally {
            await context.close();
        }
    }
});

test("all tracks fit at the outer positions on narrow screens", async () => {
    for (const [width, fontSize] of [[480, "100%"], [320, "100%"], [200, "100%"], [320, "200%"], [200, "200%"]]) {
        const { context, page } = await openPage({ viewport: { width, height: 700 }, reducedMotion: "reduce" });
        try {
            await page.addStyleTag({ content: `html { font-size: ${fontSize}; }` });
            await page.evaluate(() => eval("measure();render(200)"));
            const violations = await page.evaluate(width => {
                const result = [];
                for (let index = 0; index < 7; index++) {
                    for (const distance of [-2, 2]) {
                        eval(`scroll=${index - distance};focusedAlbum=albums[${index}];updateRaised();render(200)`);
                        const label = document.querySelector(`[data-index="${index}"] .track-label`).getBoundingClientRect();
                        const arrow = document.querySelector(".nav-arrow").getBoundingClientRect();
                        if (label.left < 0 || label.right > width || label.bottom > arrow.top) {
                            result.push({ index, distance, left: label.left, right: label.right, bottom: label.bottom, arrowTop: arrow.top });
                        }
                    }
                }
                return result;
            }, width);
            assert.deepEqual(violations, [], `width ${width}, font ${fontSize}: ${JSON.stringify(violations)}`);
        } finally {
            await context.close();
        }
    }
});

test("lifted long labels do not clip or cover navigation at narrow widths", async () => {
    for (const [width, fontSize] of [[200, "200%"], [320, "200%"], [480, "100%"]]) {
        const { context, page } = await openPage({ viewport: { width, height: 700 } });
        try {
            await page.addStyleTag({ content: `html { font-size: ${fontSize}; }` });
            for (const distance of [-2, 0, 2]) {
                await page.evaluate(distance => eval(`scroll=${2 - distance};isPaused=true;velocity=0;acceleration=0;measure();render(200);focusedAlbum=albums[2];updateRaised()`), distance);
                await page.waitForTimeout(300);
                const result = await page.evaluate(() => {
                    const label = document.querySelector('[data-index="2"] .track-label').getBoundingClientRect();
                    const wheel = document.querySelector(".music-wheel").getBoundingClientRect();
                    const buttons = [...document.querySelectorAll(".nav-arrow")].map(e => e.getBoundingClientRect());
                    return {
                        left: label.left, right: label.right, bottom: label.bottom, wheelBottom: wheel.bottom,
                        overlapsButton: buttons.some(b => label.left < b.right && label.right > b.left && label.top < b.bottom && label.bottom > b.top)
                    };
                });
                assert(result.left >= 0 && result.right <= width && result.bottom <= result.wheelBottom && !result.overlapsButton, JSON.stringify({ width, fontSize, distance, result }));
            }
        } finally {
            await context.close();
        }
    }
});

test("keyboard focus latches pause and explicit resume starts rotation", async () => {
    const { context, page } = await openPage();
    try {
        const group = page.locator(".music-carousel");
        assert.equal(await group.getAttribute("role"), "group");
        assert.equal(await group.getAttribute("aria-roledescription"), "carousel");
        assert.equal(await page.locator(".nav-pause").evaluate(e => getComputedStyle(e).opacity), "0");
        await page.keyboard.press("Tab");
        assert(await page.evaluate(() => document.activeElement.matches(".nav-pause:focus-visible")));
        assert.equal(await page.locator(".nav-pause").evaluate(e => getComputedStyle(e).opacity), "1");
        assert.equal(await page.locator(".nav-pause").getAttribute("aria-pressed"), "true");
        await page.locator(".nav-pause").evaluate(e => e.blur());
        await page.waitForTimeout(1800);
        const stopped = await page.evaluate(() => eval("scroll"));
        await page.waitForTimeout(500);
        assert(Math.abs(await page.evaluate(() => eval("scroll")) - stopped) < .001);
        await page.locator(".nav-pause").focus();
        await page.keyboard.press("Space");
        assert.equal(await page.locator(".nav-pause").getAttribute("aria-pressed"), "false");
        await page.waitForTimeout(1000);
        assert((await page.evaluate(() => eval("scroll"))) > stopped + .05);
    } finally {
        await context.close();
    }
});

test("Space enables rotation but waits while the album retains keyboard focus", async () => {
    const { context, page } = await openPage();
    try {
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        assert(await page.evaluate(() => document.activeElement.matches(".album:focus-visible")));
        await page.keyboard.press("Space");
        assert.equal(await page.locator(".nav-pause").getAttribute("aria-pressed"), "false");
        await page.waitForTimeout(1500);
        const stopped = await page.evaluate(() => eval("scroll"));
        await page.waitForTimeout(400);
        assert(Math.abs(await page.evaluate(() => eval("scroll")) - stopped) < .001);
        await page.evaluate(() => document.activeElement.blur());
        await page.waitForTimeout(1100);
        assert((await page.evaluate(() => eval("scroll"))) > stopped + .05);
    } finally {
        await context.close();
    }
});

test("automatic label handoff never overlaps labels", async () => {
    const { context, page } = await openPage();
    try {
        await page.evaluate(() => {
            eval("scroll=2.35;velocity=1/msPerTrack;acceleration=0;render(200)");
            window.labelFrames = [];
            window.recordLabels = true;
            function sample() {
                if (!window.recordLabels) return;
                window.labelFrames.push([...document.querySelectorAll(".track-label")].map(e => +getComputedStyle(e).opacity));
                requestAnimationFrame(sample);
            }
            requestAnimationFrame(sample);
        });
        await page.waitForTimeout(1800);
        const frames = await page.evaluate(() => { window.recordLabels = false; return window.labelFrames; });
        assert(frames.length > 10);
        assert(frames.every(values => values.filter(value => value > 0).length <= 1));
        assert(frames.some(values => values.some(value => value > 0 && value < 1)));
        assert(frames.some(values => values[2] > 0) && frames.some(values => values[3] > 0));
    } finally {
        await context.close();
    }
});

test("keyboard-focused album takes priority over pointer hover", async () => {
    const { context, page } = await openPage();
    try {
        await page.keyboard.press("Tab");
        await page.locator('[data-index="2"]').focus();
        const cover = await page.locator('[data-index="3"] .cover').boundingBox();
        await page.mouse.move(cover.x + cover.width * .9, cover.y + cover.height / 2);
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => eval("hoveredAlbum?.element.dataset.index")), "3");
        assert.equal(await page.locator(".album.is-raised").getAttribute("data-index"), "2");
        assert(await page.locator('[data-index="2"]').evaluate(e => e.matches(":focus-visible")));
    } finally {
        await context.close();
    }
});

test("keyboard focus remains visible in forced-colors mode", async () => {
    const { context, page } = await openPage({ forcedColors: "active" });
    try {
        await page.keyboard.press("Tab");
        await page.locator('[data-index="2"]').focus();
        const focus = await page.locator('[data-index="2"] .cover').evaluate(e => ({
            style: getComputedStyle(e).outlineStyle,
            width: parseFloat(getComputedStyle(e).outlineWidth)
        }));
        assert.equal(focus.style, "solid");
        assert(focus.width >= 2, JSON.stringify(focus));
    } finally {
        await context.close();
    }
});

test("all seven Spotify links remain exposed with accessible names", async () => {
    const { context, page } = await openPage({ reducedMotion: "reduce" });
    try {
        assert.equal(await page.getByRole("link").count(), 7);
        const links = await page.getByRole("link").evaluateAll(nodes => nodes.map(e => ({
            name: e.getAttribute("aria-label"), hidden: e.closest('[aria-hidden="true"]') !== null,
            href: e.href, target: e.target, rel: e.rel
        })));
        assert(links.every(link => link.name && !link.hidden && link.href.startsWith("https://open.spotify.com/track/") && link.target === "_blank" && link.rel.includes("noopener")));
    } finally {
        await context.close();
    }
});

test("arrow navigation moves focus from an album to its navigation control", async () => {
    const { context, page } = await openPage();
    try {
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(1400);
        assert(await page.evaluate(() => document.activeElement.matches(".nav-next:focus-visible")));
        assert(Math.abs(await page.evaluate(() => eval("scroll")) - 4) < .01);
    } finally {
        await context.close();
    }
});

test("switching to reduced motion clears active edge navigation", async () => {
    const { context, page } = await openPage();
    try {
        const wheel = await page.locator(".music-wheel").boundingBox();
        await page.mouse.move(wheel.x + wheel.width * .02, wheel.y + 40);
        await page.waitForTimeout(800);
        assert(await page.evaluate(() => eval("edgeScrolling")));
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.waitForTimeout(200);
        assert.deepEqual(await page.evaluate(() => ({
            edge: eval("edgeScrolling"), depth: eval("edgeDepth"),
            velocity: eval("velocity"), target: eval("navTarget")
        })), { edge: false, depth: 0, velocity: 0, target: null });
    } finally {
        await context.close();
    }
});

test("cancelled delayed exit releases stacking", async () => {
    const { context, page } = await openPage();
    try {
        await page.addStyleTag({ content: ".album .album-content { transition-delay: 600ms !important; }" });
        await page.evaluate(() => eval('setHovered(document.querySelector(\'[data-index="2"]\'))'));
        await page.waitForTimeout(1000);
        await page.evaluate(() => eval("setHovered(null)"));
        await page.waitForTimeout(400);
        assert.equal(await page.locator('[data-index="2"].is-exiting').count(), 1);
        await page.locator('[data-index="2"] .album-content').evaluate(e => e.getAnimations().forEach(animation => animation.cancel()));
        await page.waitForTimeout(400);
        assert.equal(await page.locator(".album.is-exiting").count(), 0);
    } finally {
        await context.close();
    }
});
