const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium, firefox, webkit } = require("playwright");

const baseline = process.argv[2];
if (!baseline) {
    throw new Error("Provide the absolute path to the baseline repository snapshot");
}

const roots = {
    baseline: path.resolve(baseline),
    candidate: path.resolve(__dirname, "..", "..")
};
const browserName = process.env.BROWSER || "firefox";
const browsers = { firefox, chrome: chromium, webkit };
if (!Object.hasOwn(browsers, browserName)) {
    throw new Error(`Unsupported BROWSER: ${browserName}`);
}

const viewport = { width: 1000, height: 700 };

async function sample(browser, root) {
    const context = await browser.newContext({ viewport });
    try {
        const page = await context.newPage();
        await page.goto(pathToFileURL(path.join(root, "music", "index.html")).href);
        await page.mouse.move(1, 1);
        await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
        return await page.evaluate(async () => {
            if (eval("reducedMotion.matches || isPaused || isHovered")) {
                throw new Error("Automatic rotation is not active");
            }

            const warmupUntil = performance.now() + 2000;
            await new Promise(resolve => {
                function warmup(time) {
                    if (time >= warmupUntil) resolve();
                    else requestAnimationFrame(warmup);
                }
                requestAnimationFrame(warmup);
            });

            const renderTimes = [];
            const originalRender = eval("render");
            eval("render = (...args) => { const start = performance.now(); originalRender(...args); renderTimes.push(performance.now() - start); }");

            const intervals = [];
            const end = performance.now() + 15000;
            let previous = null;
            await new Promise(resolve => {
                function frame(time) {
                    if (previous !== null) intervals.push(time - previous);
                    previous = time;
                    if (time >= end) resolve();
                    else requestAnimationFrame(frame);
                }
                requestAnimationFrame(frame);
            });

            const summary = values => {
                if (!values.length) throw new Error("No animation samples captured");
                const sorted = [...values].sort((a, b) => a - b);
                return {
                    count: values.length,
                    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
                    p95: sorted[Math.floor((sorted.length - 1) * 0.95)]
                };
            };
            return {
                frameIntervalMs: summary(intervals),
                renderMs: summary(renderTimes),
                framesOver25ms: intervals.filter(interval => interval > 25).length
            };
        });
    } finally {
        await context.close();
    }
}

async function main() {
    const options = { headless: true };
    if (browserName === "chrome") options.channel = "chrome";
    const browser = await browsers[browserName].launch(options);
    try {
        console.log(JSON.stringify({ browser: browserName, version: browser.version(), viewport, warmupMs: 2000, sampleMs: 15000 }));
        const results = { baseline: [], candidate: [] };
        for (let pair = 0; pair < 5; pair++) {
            const order = pair % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
            for (const name of order) {
                const result = await sample(browser, roots[name]);
                results[name].push(result);
                console.log(JSON.stringify({ pair: pair + 1, name, ...result }));
            }
        }
        const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
        for (const name of ["baseline", "candidate"]) {
            console.log(JSON.stringify({
                name,
                medianMeanFrameMs: median(results[name].map(result => result.frameIntervalMs.mean)),
                medianP95FrameMs: median(results[name].map(result => result.frameIntervalMs.p95)),
                medianMeanRenderMs: median(results[name].map(result => result.renderMs.mean)),
                medianP95RenderMs: median(results[name].map(result => result.renderMs.p95)),
                medianFramesOver25ms: median(results[name].map(result => result.framesOver25ms))
            }));
        }
    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
