const tracks = [
    {
        artist: "Abbie Falls",
        title: "Victim",
        cover: "../assets/albums/abbie-falls.jpg",
        spotify: "https://open.spotify.com/track/2MmJg1AUWL9hFrpIEYfl8T"
    },
    {
        artist: "Crown Magnetar",
        title: "Black Lotus",
        cover: "../assets/albums/crown-magnetar.jpg",
        spotify: "https://open.spotify.com/track/6axdgqxhTyjz8G7ZmpkxVu"
    },
    {
        artist: "The Browning",
        title: "OBSOLETE. DELETE. REPEAT.",
        cover: "../assets/albums/the-browning.jpg",
        spotify: "https://open.spotify.com/track/65NzKcoNd9pCKS4P5NksJm"
    },
    {
        artist: "Frog Mallet",
        title: "Boiled in a Pot",
        cover: "../assets/albums/frog-mallet.jpg",
        spotify: "https://open.spotify.com/track/2gDpysB1rLNMOekbja5LPs"
    },
    {
        artist: "Archspire",
        title: "Carrion Ladder",
        cover: "../assets/albums/archspire.jpg",
        spotify: "https://open.spotify.com/track/6TFKQYabhyPb7jRA5HNDbS"
    },
    {
        artist: "Netherwalker",
        title: "Servant to Instinct",
        cover: "../assets/albums/netherwalker.jpg",
        spotify: "https://open.spotify.com/track/0q5h5X06Gj6JDh5PG1D6X8"
    },
    {
        artist: "Analepsy",
        title: "Rifts to Abhorrence",
        cover: "../assets/albums/analepsy.jpg",
        spotify: "https://open.spotify.com/track/4qKcD20tOsKLlR8eXKRl5d"
    }
];


const wheel = document.getElementById("music-wheel");
const carousel = document.getElementById("music-carousel");
const prevButton = carousel.querySelector(".nav-prev");
const nextButton = carousel.querySelector(".nav-next");
const pauseButton = carousel.querySelector(".nav-pause");

// Time in ms for the wheel to move one album
const msPerTrack = 6500;
const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
);

const count = tracks.length;
const half = count / 2;

function wrap(value) {
    return ((value % count) + count) % count;
}

// Continuous wheel position, measured in albums
let scroll = 2;
let velocity = 1 / msPerTrack; // albums per ms, eased towards a target
let acceleration = 0; // albums per ms², keeps speed changes smooth
let navTarget = null; // album position a manual navigation is moving to
let lastTime = null;
let isHovered = false;
let isPaused = false; // manual pause of the automatic rotation

// Which album is brought forward. Pointer and focus events set the two
// inputs, updateRaised() derives the single visible state from them.
let hoveredAlbum = null;
let focusedAlbum = null;
let raisedAlbum = null;
let dismissedLabel = null;
let edgeScrolling = false; // an edge zone is actively scrolling the wheel

// Invisible edge zones: hovering near either edge scrolls the wheel
const edgeZone = 0.10; // share of the wheel width, per side
const edgeSpeed = 1 / 2000; // albums per ms at the very edge
const edgeDelay = 300; // ms the pointer must stay in a zone before scrolling
const velocityTime = 160; // ms, 1/ω of the critically damped speed filter
let edgeDepth = 0; // -1 (left edge) .. 1 (right edge), 0 outside the zones
let edgeSince = null;

// Create album elements once
const albums = tracks.map((track, index) => {
    const album = document.createElement("a");

    album.className = "album";
    album.dataset.index = index;
    album.href = track.spotify;
    album.target = "_blank";
    album.rel = "noopener noreferrer";
    album.setAttribute("aria-label", `Listen to ${track.title} by ${track.artist} on Spotify`);

    const image = document.createElement("img");

    image.src = track.cover;
    image.alt = "";
    image.draggable = false;

    // Dark overlay that dims albums away from the center. The shade is
    // driven by script, its wrapper by CSS (fades out when raised).
    const shade = document.createElement("span");
    const shadeFade = document.createElement("span");

    shade.className = "shade";
    shadeFade.className = "shade-fade";
    shadeFade.append(shade);

    // Inner layer for hover effects, so they never touch the album's
    // own script-controlled transform, opacity and z-index
    const cover = document.createElement("span");

    cover.className = "cover";
    cover.append(image, shadeFade);

    const label = document.createElement("span");
    const title = document.createElement("span");
    const artist = document.createElement("span");

    label.className = "track-label";
    label.setAttribute("aria-hidden", "true");
    title.className = "track-title";
    title.textContent = track.title;
    artist.className = "track-artist";
    artist.textContent = track.artist;
    label.append(title, artist);

    const content = document.createElement("span");

    content.className = "album-content";
    content.append(cover, label);
    album.append(content);
    wheel.appendChild(album);

    // Last written values, so unchanged styles are never rewritten
    const state = {
        element: album,
        content,
        shade,
        label,
        interactive: null,
        transform: "",
        opacity: -1,
        shadeOpacity: -1,
        labelOpacity: 0,
        z: null,
        exitTimer: null
    };

    content.addEventListener("transitionend", (event) => {
        if (event.target === content
            && event.propertyName === "transform"
            && state.exitTimer !== null
            && getComputedStyle(content).transform === "none") {
            clearExit(state);
        }
    });

    content.addEventListener("transitioncancel", (event) => {
        if (event.target === content
            && event.propertyName === "transform"
            && state.exitTimer !== null
            && !hasTransformTransition(state)) {
            clearExit(state);
        }
    });

    return state;
});

function hasTransformTransition(album) {
    return album.content.getAnimations().some((animation) =>
        animation.transitionProperty === "transform"
        && animation.playState !== "finished"
        && animation.playState !== "idle"
    );
}

function clearExit(album) {
    if (album.exitTimer !== null) {
        clearTimeout(album.exitTimer);
        album.exitTimer = null;
        album.element.classList.remove("is-exiting");
    }
}

// Layout, all derived from the wheel width
const coverRatio = 0.264; // cover size relative to the wheel width
const stepRatio = 0.2; // distance between album centers
let wheelWidth = 0;
let wheelHeight = 0;
let coverSize = 0;
let visibleLabel = null;
const labelFadeTime = 200;
const settledSpeed = 0.1 / 1000; // CSS pixels per ms

function setLabelOpacity(album, opacity) {
    if (opacity !== album.labelOpacity) {
        album.labelOpacity = opacity;
        album.label.style.opacity = opacity;
    }
}

function renderLabel(delta = 0) {
    const nearest = Math.round(scroll);
    const next = raisedAlbum ?? albums[wrap(nearest)];
    const pixelsPerAlbum = wheelWidth * stepRatio;
    const settled = reducedMotion.matches || (
        navTarget === null && !edgeScrolling
        && (isHovered || isPaused || focusedAlbum !== null || edgeDepth !== 0)
        && Math.abs(velocity) * pixelsPerAlbum < settledSpeed
        && Math.abs(acceleration) * velocityTime * pixelsPerAlbum < settledSpeed
    );
    const target = next === dismissedLabel
        ? 0
        : (raisedAlbum !== null || settled ? 1 : Math.max(0, 1 - 2 * Math.abs(scroll - nearest)));

    if (visibleLabel === null || reducedMotion.matches) {
        if (visibleLabel !== null && visibleLabel !== next) {
            setLabelOpacity(visibleLabel, 0);
        }
        visibleLabel = next;
        setLabelOpacity(visibleLabel, target);
        return;
    }

    const opacity = visibleLabel.labelOpacity;
    const goal = visibleLabel === next ? target : 0;
    const change = Math.min(delta / labelFadeTime, Math.abs(goal - opacity));
    setLabelOpacity(visibleLabel, opacity + Math.sign(goal - opacity) * change);

    // Never start the incoming label until the outgoing one is fully hidden.
    if (visibleLabel !== next && visibleLabel.labelOpacity === 0) {
        visibleLabel = next;
    }
}

function measure() {
    wheelWidth = wheel.clientWidth;
    wheelHeight = wheel.clientHeight - parseFloat(getComputedStyle(wheel).paddingBottom);

    // Covers are laid out at their largest size and only ever scaled down,
    // which keeps them sharp while they move
    coverSize = wheelWidth * coverRatio;

    albums.forEach(({ element }) => {
        element.style.width = `${coverSize}px`;
        element.style.height = `${coverSize}px`;
    });
}

function render(delta = 0) {
    const stepX = wheelWidth * stepRatio;
    const centerX = wheelWidth / 2;
    const centerY = wheelHeight / 2;

    albums.forEach((album, index) => {
        // Signed distance from center, wrapped to [-half, half)
        const position = wrap(index - scroll + half) - half;

        const distance = Math.abs(position);

        // Roughly 100% in the center, 95% next to it and 90% further out
        const scale = 0.9 + 0.1 * Math.exp(-0.7 * distance * distance);
        const shade = 0.9 * (1 - 1 / (1 + 0.3 * distance * distance));
        const x = centerX + position * stepX - coverSize / 2;
        const y = centerY - coverSize / 2;

        // Fully faded by the time an album wraps around off-screen
        const opacity = Math.min(1, Math.max(0, (3.5 - distance) * 2));
        const interactive = distance <= 2;
        const z = Math.round(10 - distance);

        // Firefox snaps plain 2D/3D translations to whole or half pixels,
        // which makes slow motion step. A perspective transform with a
        // negligible tilt is drawn through the full transform instead and
        // moves smoothly. Keep it at rest too, avoiding a rounding jump
        // when the wheel slows down or resumes.
        const transform = reducedMotion.matches
            ? `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) scale(${scale})`
            : `perspective(1000px) translate3d(${x}px, ${y}px, 0) scale(${scale}) rotateY(0.01deg)`;

        // Only touch the DOM for values that changed
        if (transform !== album.transform) {
            album.transform = transform;
            album.element.style.transform = transform;
        }

        if (opacity !== album.opacity) {
            album.opacity = opacity;
            album.element.style.opacity = opacity;
        }

        if (shade !== album.shadeOpacity) {
            album.shadeOpacity = shade;
            album.shade.style.opacity = shade;
        }

        // Base stacking order; a raised album overrides it in CSS
        if (z !== album.z) {
            album.z = z;
            album.element.style.setProperty("--z", z);
        }

        if (interactive !== album.interactive) {
            album.interactive = interactive;
            if (!interactive && document.activeElement === album.element) {
                (position < 0 ? nextButton : prevButton).focus({ preventScroll: true });
            }
            album.element.tabIndex = interactive ? 0 : -1;
            album.element.style.pointerEvents = interactive ? "" : "none";

            // A non-interactive album can't stay hovered
            if (!interactive && hoveredAlbum === album) {
                hoveredAlbum = null;
                updateRaised();
            }
        }
    });
    renderLabel(delta);
}

let isAnimating = false;

// Interaction state -> one visible state. Only toggles classes; the
// transitions, and the immediate z-index change, live in CSS.
function updateRaised() {
    // Active edge scrolling wins over hover, since albums slide under the
    // pointer. Keyboard focus is unaffected.
    const next = focusedAlbum ?? (edgeScrolling ? null : hoveredAlbum);

    if (next === raisedAlbum) {
        return;
    }

    dismissedLabel = null;

    if (raisedAlbum !== null) {
        raisedAlbum.element.classList.remove("is-raised");
        if (!reducedMotion.matches) {
            raisedAlbum.element.classList.add("is-exiting");
            const exiting = raisedAlbum;
            // A transition may never start if hover changes within one frame.
            exiting.exitTimer = setTimeout(() => {
                if (!hasTransformTransition(exiting)) {
                    clearExit(exiting);
                }
            }, 300);
        }
    }

    if (next !== null) {
        clearExit(next);
    }
    next?.element.classList.add("is-raised");

    // Dim the others by class, so the CSS never needs an ancestor selector
    albums.forEach((album) => {
        album.element.classList.toggle(
            "is-dimmed",
            next !== null && album !== next
        );
    });

    raisedAlbum = next;
    if (reducedMotion.matches) {
        renderLabel();
    }
}

function stopForReducedMotion() {
    navTarget = null;
    velocity = 0;
    acceleration = 0;
    edgeDepth = 0;
    edgeSince = null;
    edgeScrolling = false;
    albums.forEach(clearExit);
    updateRaised();
}

function frame(time) {
    if (reducedMotion.matches) {
        isAnimating = false;
        stopForReducedMotion();
        render();
        return;
    }

    const delta = lastTime === null
        ? 0
        : Math.min(time - lastTime, 100);

    lastTime = time;

    // Highest priority first: manual navigation, edge zone, hover/focus
    // pause, then automatic rotation
    const edgeActive =
        edgeDepth !== 0 && time - edgeSince >= edgeDelay;

    edgeScrolling = edgeActive;
    updateRaised();

    let targetVelocity = 1 / msPerTrack;

    if (navTarget !== null) {
        targetVelocity = 0;
    } else if (edgeActive) {
        const t = Math.abs(edgeDepth);

        targetVelocity =
            Math.sign(edgeDepth) * edgeSpeed * t * t * (3 - 2 * t);
    } else if (isHovered || focusedAlbum !== null || isPaused || edgeDepth !== 0) {
        targetVelocity = 0;
    }

    // Critically damped speed filter (exact solution per frame): speed and
    // acceleration both change continuously, so pausing, resuming and
    // reversing never jerk
    const decay = Math.exp(-delta / velocityTime);
    const offset = velocity - targetVelocity;
    const slope = acceleration + offset / velocityTime;

    velocity = targetVelocity + (offset + slope * delta) * decay;
    acceleration =
        (slope - (offset + slope * delta) / velocityTime) * decay;

    if (navTarget !== null) {
        // Glide to the chosen album, independent of frame rate
        scroll += (navTarget - scroll) * (1 - Math.exp(-delta / 180));

        if (Math.abs(navTarget - scroll) < 0.002) {
            scroll = navTarget;
            navTarget = null;
        }
    } else {
        scroll += velocity * delta;
    }

    render(delta);
    requestAnimationFrame(frame);
}

function startAnimation() {
    if (isAnimating || reducedMotion.matches) {
        return;
    }

    isAnimating = true;
    lastTime = null;
    requestAnimationFrame(frame);
}

// Manual navigation: step to the previous or next album
function navigate(direction) {
    const base = navTarget ?? Math.round(scroll);

    if (reducedMotion.matches) {
        scroll = base + direction;
        navTarget = null;
        render();
        return;
    }

    navTarget = base + direction;
    velocity = 0;
    acceleration = 0;
    startAnimation();
}

prevButton.addEventListener("click", () => navigate(-1));
nextButton.addEventListener("click", () => navigate(1));

function togglePause() {
    isPaused = !isPaused;
    pauseButton.setAttribute("aria-pressed", isPaused);
}

pauseButton.addEventListener("click", togglePause);

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && raisedAlbum !== null) {
        dismissedLabel = raisedAlbum;
        if (reducedMotion.matches) {
            renderLabel();
        }
    }
});

carousel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        if (event.target.closest(".album")) {
            (direction < 0 ? prevButton : nextButton).focus({ preventScroll: true });
        }
        navigate(direction);
    } else if (event.key === " " && !event.target.closest("button")) {
        // Buttons handle Space themselves
        event.preventDefault();
        togglePause();
    }
});

// Hover state comes from pointer events, not from polling :hover
function setHovered(element) {
    hoveredAlbum = element ? albums[element.dataset.index] : null;
    updateRaised();
}

wheel.addEventListener("pointerover", (event) => {
    if (event.pointerType === "mouse") {
        setHovered(event.target.closest(".album"));
    }
});

wheel.addEventListener("pointerout", (event) => {
    if (event.pointerType !== "mouse") {
        return;
    }

    // Moving between children of the same album isn't leaving it
    const next = event.relatedTarget instanceof Element
        ? event.relatedTarget.closest(".album")
        : null;

    setHovered(next);
});

// Pause on mouse hover (not touch, where hover sticks after a tap)
carousel.addEventListener("pointerenter", (event) => {
    isHovered = event.pointerType === "mouse";
});

carousel.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") {
        edgeDepth = 0;
        edgeSince = null;
        return;
    }

    const rect = wheel.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const inside = x >= 0 && x <= 1
        && event.clientY >= rect.top && event.clientY <= rect.bottom;

    // The clipping gutter is not part of the navigation area.
    isHovered = inside || event.target.closest(".album") !== null;
    const label = event.target.closest(".track-label");
    if (!inside || reducedMotion.matches
        || (label && label.closest(".album") === raisedAlbum?.element)) {
        edgeDepth = 0;
        edgeSince = null;
        return;
    }

    let depth = 0;

    if (x < edgeZone) {
        depth = -(edgeZone - x) / edgeZone;
    } else if (x > 1 - edgeZone) {
        depth = (x - (1 - edgeZone)) / edgeZone;
    }

    depth = Math.max(-1, Math.min(1, depth));

    // Start the activation delay when entering a zone or switching sides
    if (depth === 0) {
        edgeSince = null;
    } else if (edgeSince === null || Math.sign(depth) !== Math.sign(edgeDepth)) {
        edgeSince = performance.now();
    }

    edgeDepth = depth;
});

carousel.addEventListener("pointerleave", () => {
    isHovered = false;
    edgeDepth = 0;
    edgeSince = null;
});

// Pause during keyboard navigation only, not after a mouse click
carousel.addEventListener("focusin", (event) => {
    const isFocused = event.target.matches(":focus-visible");

    if (isFocused && !carousel.contains(event.relatedTarget)) {
        isPaused = true;
        pauseButton.setAttribute("aria-pressed", "true");
    }

    const element = event.target.closest(".album");

    focusedAlbum = isFocused && element
        ? albums[element.dataset.index]
        : null;
    updateRaised();
});

carousel.addEventListener("focusout", () => {
    focusedAlbum = null;
    updateRaised();
});

// Initialize
measure();
render();
startAnimation();

new ResizeObserver(() => {
    measure();
    render();
}).observe(wheel);

reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) {
        stopForReducedMotion();
    }
    render();
    startAnimation();
});
