// public/scripts/infiniteSnap.js
// Hybrid wrap: prefers edge wrapping (smooth, no “stuck”), but ALSO recenters
// if the centered item drifts into the first/last copy within a soft zone.

const CLEANUP = Symbol("infiniteSnapCleanup");

async function waitForImages(container) {
  const imgs = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      if (img.complete && img.naturalWidth > 0) return;
      await new Promise((res) => {
        img.addEventListener("load", res, { once: true });
        img.addEventListener("error", res, { once: true });
      });
    })
  );

  await Promise.all(
    imgs.map((img) =>
      img.decode ? img.decode().catch(() => {}) : Promise.resolve()
    )
  );
}

function initGrid(grid) {
  if (!grid) return;
  if (grid.dataset.inited === "1") return;
  grid.dataset.inited = "1";

  // Optional: hide until positioned (works with your .grid[data-ready="1"])
  grid.dataset.ready = "0";

  const count = parseInt(grid.dataset.count || "0", 10);
  const copies = parseInt(grid.dataset.copies || "0", 10);
  if (!count || !copies) return;

  const items = Array.from(grid.querySelectorAll(".snap-item"));
  if (items.length !== count * copies) return;

const centerCopy = Math.floor(copies / 2);

// default: start on first item
let startOffset = 0;

// ✅ if this grid is a project page, start on first image (skip title)
if (grid.dataset.startAt === "first-image") startOffset = 1;

const centerStart = count * centerCopy + startOffset;

  let centers = [];
  const recomputeCenters = () => {
    centers = items.map((el) => el.offsetTop + el.offsetHeight / 2);
  };

  const closestIndexToViewportCenter = () => {
    const target = grid.scrollTop + grid.clientHeight / 2;
    let lo = 0,
      hi = centers.length - 1;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (centers[mid] < target) lo = mid + 1;
      else hi = mid;
    }

    let i = lo;
    if (
      i > 0 &&
      Math.abs(centers[i - 1] - target) < Math.abs(centers[i] - target)
    ) {
      i--;
    }
    return i;
  };

  const centerTopFor = (idx) =>
    items[idx].offsetTop -
    (grid.clientHeight / 2 - items[idx].offsetHeight / 2);

  const teleportPreservingPosition = (fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    const delta = centers[toIdx] - centers[fromIdx];

    const prevSnap = grid.style.scrollSnapType;
    grid.style.scrollSnapType = "none";
    grid.scrollTop += delta;
    grid.style.scrollSnapType = prevSnap;
  };

  let adjusting = false;
  let rafLock = false;

  // --- Hybrid wrap tuning ---
  // Hard edge threshold: do wrap right at the top/bottom so it never "stops".
  const EDGE_PX = 6;

  // Soft zone: if user is near an edge, also allow “copy drift” recenter.
  // Bigger = wraps earlier (less chance of reaching hard edge).
  const SOFT_ZONE_PX = 220;

  // Only allow wrapping after initial positioning settles
  let armed = false;

  // Track scroll direction to avoid weird early wraps
  let lastScrollTop = 0;
  let dir = 0; // -1 up, +1 down

  // Wrap logic
  const maybeWrap = () => {
    if (!armed) return;
    if (adjusting) return;
    if (!centers.length) return;

    const maxScrollTop = grid.scrollHeight - grid.clientHeight;
    const st = grid.scrollTop;

    const atTopHard = st <= EDGE_PX;
    const atBotHard = st >= maxScrollTop - EDGE_PX;

    const inTopSoft = st <= SOFT_ZONE_PX;
    const inBotSoft = st >= maxScrollTop - SOFT_ZONE_PX;

    // If we're not near any edge, do nothing.
    if (!inTopSoft && !inBotSoft) return;

    const idx = closestIndexToViewportCenter();
    const copyIndex = Math.floor(idx / count);

    // Decide whether to wrap.
    // 1) Hard edge always wraps in that direction.
    // 2) Soft zone also wraps if we're drifting into first/last copy.
    let targetIdx = null;

    if (atTopHard || (inTopSoft && (copyIndex === 0 || dir < 0))) {
      // Move "down" two copies to stay around middle
      targetIdx = idx + count * 2;
    } else if (
      atBotHard ||
      (inBotSoft && (copyIndex === copies - 1 || dir > 0))
    ) {
      // Move "up" two copies
      targetIdx = idx - count * 2;
    }

    if (targetIdx == null) return;

    targetIdx = Math.max(0, Math.min(items.length - 1, targetIdx));

    adjusting = true;
    teleportPreservingPosition(idx, targetIdx);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => (adjusting = false))
    );
  };

  // Run wrap on scroll, but don’t delay (this removes “stuck” feeling)
  const onScroll = () => {
    if (!armed) return;
    if (adjusting || rafLock) return;

    const st = grid.scrollTop;
    const d = st - lastScrollTop;
    if (d !== 0) dir = d > 0 ? 1 : -1;
    lastScrollTop = st;

    rafLock = true;
    requestAnimationFrame(() => {
      rafLock = false;
      maybeWrap();
    });
  };

  const onWheel = () => {
    // wheel implies intent; try wrap on next frame
    requestAnimationFrame(maybeWrap);
  };

  const onResize = () => {
    recomputeCenters();
    requestAnimationFrame(maybeWrap);
  };

  grid.addEventListener("scroll", onScroll);
  grid.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("resize", onResize);

  // Observe layout changes (image decode can change heights)
  const ro = new ResizeObserver(() => {
    recomputeCenters();
    requestAnimationFrame(maybeWrap);
  });
  ro.observe(grid);
  items.forEach((el) => ro.observe(el));

  const armAfterSettle = () => {
    armed = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        armed = true;
        // set direction baseline
        lastScrollTop = grid.scrollTop;
        dir = 0;
        maybeWrap();
      });
    });
  };

  const doInitialPositioning = () => {
    recomputeCenters();

    const prevSnap = grid.style.scrollSnapType;
    grid.style.scrollSnapType = "none";
    grid.scrollTop = centerTopFor(centerStart);
    grid.style.scrollSnapType = prevSnap;

    // visible now
    grid.dataset.ready = "1";

    armAfterSettle();
  };

  // Pass 1 after layout settles
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      doInitialPositioning();

      // Pass 2 after images decode (helps hard refresh)
      waitForImages(grid).then(() => {
        requestAnimationFrame(() => {
          doInitialPositioning();
        });
      });
    });
  });

  grid[CLEANUP] = () => {
    window.removeEventListener("resize", onResize);
    grid.removeEventListener("scroll", onScroll);
    grid.removeEventListener("wheel", onWheel);
    ro.disconnect();
    delete grid.dataset.inited;
    delete grid.dataset.ready;
  };
}

function initAll() {
  document
    .querySelectorAll('[data-infinite-snap="1"]')
    .forEach((grid) => initGrid(grid));
}

function cleanupAll() {
  document
    .querySelectorAll('[data-infinite-snap="1"]')
    .forEach((grid) => grid?.[CLEANUP]?.());
}

document.addEventListener("astro:before-swap", cleanupAll);
document.addEventListener("astro:page-load", initAll);
document.addEventListener("astro:after-swap", initAll);

// In case evaluated late
initAll();
