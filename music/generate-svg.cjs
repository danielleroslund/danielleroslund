const fs = require("node:fs");
const path = require("node:path");
const tracks = require("./tracks.js");

const width = 840;
const height = 428;
const wheelWidth = 840;
const wheelLeft = (width - wheelWidth) / 2;
const layoutWidth = 712;
const wheelTop = 77.72;
const wheelHeight = layoutWidth * 280 / 760;
const centerX = width / 2;
const centerY = wheelTop + wheelHeight / 2;
const coverSize = layoutWidth * 0.264;
const step = layoutWidth * 0.2;
const coverGap = coverSize + 8;
const labelGap = 400;
const secondsPerTrack = 6.5;
const duration = tracks.length * secondsPerTrack;
const initialTrack = 2;
const half = tracks.length / 2;
const samplesPerTrack = 40;

const theme = {
    accent: "#9966DD",
    artist: "#767676"
};

if (tracks.length !== 7) {
    throw new Error("The SVG layering requires exactly seven tracks.");
}

function number(value) {
    return String(Number(value.toFixed(5)));
}

function escapeXml(value) {
    return value.replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;"
    })[character]);
}

function wrap(value) {
    return ((value % tracks.length) + tracks.length) % tracks.length;
}

function state(position) {
    const distance = Math.abs(position);

    return {
        x: centerX + position * step,
        scale: 0.9 + 0.1 * Math.exp(-0.7 * distance * distance),
        opacity: Math.min(1, Math.max(0, (half - distance) * 2)),
        shade: 0.9 * (1 - 1 / (1 + 0.3 * distance * distance))
    };
}

function transform(position, animated = false) {
    const { x, scale } = state(position);

    if (animated) {
        return `perspective(1000px) translate3d(${number(x)}px, ${number(centerY)}px, 0px) scale(${number(scale)}) rotateY(0.01deg)`;
    }

    return `translate(${number(x)}, ${number(centerY)}) scale(${number(scale)})`;
}

function sampledKeyframes(name, slot, declaration) {
    const frames = Array.from(
        { length: samplesPerTrack + 1 },
        (_, index) => {
            const position = slot + 0.5 - index / samplesPerTrack;

            return `    ${number(index * 100 / samplesPerTrack)}% { ${declaration(position)} }`;
        }
    );

    return `  @keyframes ${name} {\n${frames.join("\n")}\n  }`;
}

function wrapTitle(title) {
    const maxCharacters = Math.floor(step / (15 * 0.55));
    const lines = [];
    let line = "";

    for (const word of title.split(" ")) {
        const pieces =
            word.match(new RegExp(`.{1,${maxCharacters}}`, "g")) || [];

        for (const piece of pieces) {
            if (line && line.length + 1 + piece.length <= maxCharacters) {
                line += ` ${piece}`;
            } else {
                if (line) lines.push(line);
                line = piece;
            }
        }
    }

    if (line) lines.push(line);

    return lines;
}

function imageDefinition(track, index) {
    const bytes = fs.readFileSync(
        path.resolve(__dirname, track.cover)
    );

    if (
        bytes[0] !== 0xff ||
        bytes[1] !== 0xd8 ||
        bytes[bytes.length - 2] !== 0xff ||
        bytes[bytes.length - 1] !== 0xd9
    ) {
        throw new Error(`Not a JPEG: ${track.cover}`);
    }

    return `    <image id="cover-${index}" x="${number(-coverSize / 2)}" y="${number(-coverSize / 2)}" width="${number(coverSize)}" height="${number(coverSize)}" href="data:image/jpeg;base64,${bytes.toString("base64")}"/>`;
}

function trackLabel(track, index, theme) {
    const lines = wrapTitle(track.title);
    const labelTop = coverSize / 2 + 4;

    const title = lines.map((line, lineIndex) =>
        `        <tspan x="0" y="${number(labelTop + 14 + lineIndex * 17.25)}">${escapeXml(line)}</tspan>`
    ).join("\n");

    const artistY = labelTop + lines.length * 17.25 + 12;

    return `            <g transform="translate(${number(index * labelGap)} 0)" text-anchor="middle" font-family="monospace">
        <text fill="${theme.accent}" font-size="15" font-weight="700">
${title}
        </text>
        <text x="0" y="${number(artistY)}" fill="${theme.artist}" font-size="13">${escapeXml(track.artist)}</text>
      </g>`;
}

function slot(position, theme) {
    const initial = state(position);
    const firstTrack = wrap(initialTrack + position);

    const images = tracks.map((_, index) =>
        `        <use href="#cover-${wrap(firstTrack + index)}" transform="translate(${number(index * coverGap)} 0)"/>`
    ).join("\n");

    const label = position === 0 ? `
      <g class="label-fade" opacity="1">
        <g clip-path="url(#label-clip)">
          <g class="label-strip" transform="translate(0 0)">
${tracks.map((_, index) => trackLabel(tracks[wrap(firstTrack + index)], index, theme)).join("\n")}
          </g>
        </g>
      </g>` : "";

    return `    <g class="slot slot-${position + 3}" data-slot="${position}" transform="${transform(position)}" opacity="${number(initial.opacity)}">
      <g clip-path="url(#cover-clip)">
        <g class="strip" transform="translate(0 0)">
${images}
        </g>
        <rect class="shade" x="${number(-coverSize / 2)}" y="${number(-coverSize / 2)}" width="${number(coverSize)}" height="${number(coverSize)}" fill="#000" opacity="${number(initial.shade)}"/>
      </g>${label}
    </g>`;
}

// Fixed depth slots keep nearer covers in front while the artwork strips
// advance together at each slot handoff.
const layers = [-3, 3, -2, 2, -1, 1, 0];

const keyframes = layers.flatMap(layer => [
    sampledKeyframes(
        `move-${layer + 3}`,
        layer,
        position =>
            `transform: ${transform(position, true)}; opacity: ${number(state(position).opacity)}`
    ),
    sampledKeyframes(
        `shade-${layer + 3}`,
        layer,
        position =>
            `opacity: ${number(state(position).shade)}`
    )
]).join("\n");

const description = tracks
    .map(track => `${track.title} by ${track.artist}`)
    .join("; ");

// Generate a single transparent SVG for both light and dark themes.
const createSvg = theme => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Currently on repeat</title>
  <desc id="description">A rotating selection of seven album covers: ${escapeXml(description)}.</desc>

  <defs>
${tracks.map(imageDefinition).join("\n")}

    <clipPath id="cover-clip">
      <rect x="${number(-coverSize / 2)}" y="${number(-coverSize / 2)}" width="${number(coverSize)}" height="${number(coverSize)}" rx="${number(coverSize * 0.08)}"/>
    </clipPath>

    <clipPath id="wheel-clip">
      <rect x="${wheelLeft}" y="0" width="${wheelWidth}" height="${height}"/>
    </clipPath>

    <!-- Fade the artwork to transparency instead of a fixed background color. -->
    <linearGradient id="edge-fade" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="white" stop-opacity="0"/>
      <stop offset="6%" stop-color="white" stop-opacity=".2"/>
      <stop offset="14%" stop-color="white" stop-opacity=".75"/>
      <stop offset="23%" stop-color="white" stop-opacity="1"/>
      <stop offset="77%" stop-color="white" stop-opacity="1"/>
      <stop offset="86%" stop-color="white" stop-opacity=".75"/>
      <stop offset="94%" stop-color="white" stop-opacity=".2"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </linearGradient>

    <mask id="edge-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="${wheelLeft}" y="0" width="${wheelWidth}" height="${height}">
      <rect x="${wheelLeft}" y="0" width="${wheelWidth}" height="${height}" fill="url(#edge-fade)"/>
    </mask>

    <clipPath id="label-clip">
      <rect x="${number(-labelGap / 2)}" y="${number(coverSize / 2 + 4)}" width="${number(labelGap)}" height="64"/>
    </clipPath>

    <style>
      .slot { animation: var(--motion) ${secondsPerTrack}s linear infinite; animation-delay: -${secondsPerTrack / 2}s; }
      .shade { animation: var(--shade) ${secondsPerTrack}s linear infinite; animation-delay: -${secondsPerTrack / 2}s; }
      .strip { animation: strip ${duration}s steps(${tracks.length}, end) infinite; animation-delay: -${secondsPerTrack / 2}s; }
      .label-strip { animation: label-strip ${duration}s steps(${tracks.length}, end) infinite; animation-delay: -${secondsPerTrack / 2}s; }
      .label-fade { animation: label-fade ${secondsPerTrack}s linear infinite; animation-delay: -${secondsPerTrack / 2}s; }

${layers.map(layer => `      .slot-${layer + 3} { --motion: move-${layer + 3}; --shade: shade-${layer + 3}; }`).join("\n")}

      @keyframes strip {
        from { transform: translateX(0px) }
        to { transform: translateX(${number(-tracks.length * coverGap)}px) }
      }

      @keyframes label-strip {
        from { transform: translateX(0px) }
        to { transform: translateX(${number(-tracks.length * labelGap)}px) }
      }

      @keyframes label-fade {
        0%, 100% { opacity: 0 }
        50% { opacity: 1 }
      }

${keyframes}

      @media (prefers-reduced-motion: reduce) {
        .slot, .shade, .strip, .label-strip, .label-fade {
          animation: none;
        }
      }
    </style>
  </defs>

  <text x="${centerX}" y="50" text-anchor="middle" font-family="monospace" font-size="16" fill="${theme.accent}">// currently on repeat</text>

  <g clip-path="url(#wheel-clip)" mask="url(#edge-mask)">
${layers.map(layer => slot(layer, theme)).join("\n")}
  </g>
</svg>
`;

if (require.main === module) {
    const svg = createSvg(theme);

    const output = path.join(
        __dirname,
        "..",
        "assets",
        "music-wheel.svg"
    );

    fs.writeFileSync(output, svg);
    console.log(`Generated ${output} (${Buffer.byteLength(svg)} bytes)`);
} else {
    module.exports = createSvg(theme);
}