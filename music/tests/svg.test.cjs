const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium, firefox, webkit } = require("playwright");
const tracks = require("../tracks.js");

const music = path.resolve(__dirname, "..");
const svgPath = path.resolve(music, "..", "assets", "music-wheel.svg");
let browser;

before(async () => {
    const headless = process.env.HEADFUL !== "1";
    switch (process.env.BROWSER || "firefox") {
        case "firefox":
            browser = await firefox.launch({ headless });
            break;
        case "chrome":
            browser = await chromium.launch({ channel: "chrome", headless });
            break;
        case "webkit":
            browser = await webkit.launch({ headless });
            break;
        default:
            throw new Error(`Unsupported BROWSER: ${process.env.BROWSER}`);
    }
});

after(async () => {
    if (browser) await browser.close();
});

test("generator is deterministic and embeds each original JPEG once", () => {
    const generator = require.resolve("../generate-svg.cjs");
    const first = require(generator);
    delete require.cache[generator];
    assert.equal(require(generator), first);
    assert.equal(fs.readFileSync(svgPath, "utf8"), first);

    const images = [...first.matchAll(/<image id="cover-(\d+)"[^>]+href="data:image\/jpeg;base64,([^"]+)"/g)];
    assert.equal(images.length, tracks.length);
    images.forEach(([match, index, encoded], expectedIndex) => {
        assert.equal(Number(index), expectedIndex);
        assert.deepEqual(Buffer.from(encoded, "base64"), fs.readFileSync(path.resolve(music, tracks[expectedIndex].cover)));
    });
    assert.doesNotMatch(first, /<script\b|\son\w+\s*=|(?:href|src)="(?!#|data:image\/jpeg;base64,)/i);
    assert.doesNotMatch(first, /@import|url\(\s*["']?(?!#)/i);
});

test("SVG animation matches the carousel positions, label handoff, and loop", async () => {
    const page = await browser.newPage({ reducedMotion: "no-preference" });
    try {
        await page.goto(pathToFileURL(svgPath).href);
        const times = [...new Set([0, 1625, 45499, 45500,
            ...Array.from({ length: tracks.length }, (_, index) =>
                [index * 6500, index * 6500 + 3249, index * 6500 + 3250, index * 6500 + 3251]).flat()
        ])].sort((a, b) => a - b);
        const samples = await page.evaluate(times => {
            const animations = document.getAnimations();
            animations.forEach(animation => animation.pause());
            return times.map(time => {
                animations.forEach(animation => { animation.currentTime = time; });
                return [...document.querySelectorAll(".slot")]
                    .map(element => {
                        const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
                        const strip = element.querySelector(".strip");
                        const offset = new DOMMatrixReadOnly(getComputedStyle(strip).transform).e;
                        const image = strip.querySelectorAll("use")[Math.round(-offset / (712 * 0.264 + 8))];
                        const label = element.querySelector(".label-fade");
                        let labelText = null;
                        if (label) {
                            const labels = label.querySelector(".label-strip");
                            const labelOffset = new DOMMatrixReadOnly(getComputedStyle(labels).transform).e;
                            labelText = labels.children[Math.round(-labelOffset / 400)].textContent.replace(/\s+/g, " ").trim();
                        }
                        return {
                            slot: Number(element.dataset.slot),
                            track: Number(image.getAttribute("href").replace("#cover-", "")),
                            x: matrix.e,
                            scale: matrix.a,
                            opacity: Number(getComputedStyle(element).opacity),
                            shade: Number(getComputedStyle(element.querySelector(".shade")).opacity),
                            label: label ? Number(getComputedStyle(label).opacity) : null,
                            labelText
                        };
                    });
            });
        }, times);

        for (const [sampleIndex, time] of times.entries()) {
            const albums = samples[sampleIndex];
            assert.equal(albums.length, 7, `depth slots at ${time}ms`);
            assert.equal(new Set(albums.map(album => album.track)).size, 7);
            for (const album of albums) {
                const position = album.slot + 0.5 - ((time + 3250) % 6500) / 6500;
                const distance = Math.abs(position);
                const expectedX = 420 + position * 142.4;
                const expectedTrack = ((2 + album.slot + Math.floor((time + 3250) / 6500)) % 7 + 7) % 7;
                assert.equal(album.track, expectedTrack, `track in slot ${album.slot} at ${time}ms`);
                assert(Math.abs(album.x - expectedX) < 0.02, JSON.stringify({ time, album, position }));
                assert(Math.abs(album.scale - (0.9 + 0.1 * Math.exp(-0.7 * distance * distance))) < 0.001);
                assert(Math.abs(album.opacity - Math.min(1, Math.max(0, (3.5 - distance) * 2))) < 0.001);
                assert(Math.abs(album.shade - 0.9 * (1 - 1 / (1 + 0.3 * distance * distance))) < 0.001);
                if (album.label !== null) {
                    assert.equal(album.labelText, `${tracks[expectedTrack].title} ${tracks[expectedTrack].artist}`);
                    assert(Math.abs(album.label - Math.max(0, 1 - 2 * distance)) < 0.001);
                }
            }
            assert.equal(albums.filter(album => album.label !== null).length, 1);
        }
        assert.deepEqual(samples[0], samples.at(-1));
    } finally {
        await page.close();
    }
});

test("SVG renders and animates as a local image without network requests", async () => {
    const page = await browser.newPage({ reducedMotion: "no-preference" });
    try {
        await page.goto(pathToFileURL(path.join(music, "index.html")).href);
        const networkRequests = [];
        page.on("request", request => {
            if (/^https?:/i.test(request.url())) networkRequests.push(request.url());
        });
        await page.evaluate(url => {
            const image = document.createElement("img");
            image.id = "svg-preview";
            image.src = url;
            document.body.replaceChildren(image);
        }, pathToFileURL(svgPath).href);
        const image = page.locator("#svg-preview");
        await image.evaluate(element => element.decode());
        assert.deepEqual(await image.evaluate(element => [element.naturalWidth, element.naturalHeight]), [840, 338]);
        const first = await image.screenshot();
        await page.waitForTimeout(1000);
        const second = await image.screenshot();
        assert.notDeepEqual(first, second, "the image should change over one second");
        assert.deepEqual(networkRequests, []);
    } finally {
        await page.close();
    }
});

test("SVG has an accessible static initial frame with and without animation CSS", async () => {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    try {
        await page.goto(pathToFileURL(svgPath).href);
        assert.equal(await page.locator("title").textContent(), "Currently on repeat");
        const description = await page.locator("desc").textContent();
        for (const track of tracks) assert(description.includes(`${track.title} by ${track.artist}`));

        async function staticFrame() {
            return page.evaluate(() => ({
                animations: document.getAnimations().length,
                visible: [...document.querySelectorAll(".slot")]
                    .map(element => ({
                        slot: Number(element.dataset.slot),
                        track: Number(element.querySelector(".strip use").getAttribute("href").replace("#cover-", "")),
                        label: element.querySelector(".label-fade")
                            ? Number(getComputedStyle(element.querySelector(".label-fade")).opacity)
                            : null,
                        x: element.getCTM().e
                    }))
            }));
        }

        const reduced = await staticFrame();
        assert.equal(reduced.animations, 0);
        assert.equal(reduced.visible.length, 7);
        assert.deepEqual(reduced.visible.filter(album => album.label === 1), [{ slot: 0, track: 2, label: 1, x: 420 }]);
        await page.locator("style").evaluate(style => style.remove());
        assert.deepEqual(await staticFrame(), reduced);
    } finally {
        await page.close();
    }
});
