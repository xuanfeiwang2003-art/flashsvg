(function () {
"use strict";

// Thirteen real, author-selected examples from Figure 1 of the supplied paper.
const galleryCases = [
  { zh: "树屋", en: "Tree house" },
  { zh: "火烈鸟", en: "Flamingo" },
  { zh: "火箭", en: "Rocket" },
  { zh: "相机", en: "Camera" },
  { zh: "地球龟", en: "Globe turtle" },
  { zh: "灯笼", en: "Lantern" },
  { zh: "皇冠", en: "Crown" },
  { zh: "蝙蝠与南瓜", en: "Bat and pumpkin" },
  { zh: "调色盘", en: "Paint palette" },
  { zh: "钥匙与地图", en: "Key and map" },
  { zh: "纸飞机", en: "Paper plane" },
  { zh: "海盗帽与望远镜", en: "Pirate hat and telescope" },
  { zh: "火焰", en: "Flame" },
];

// Exact Table 1 values, copied from the previous FlashSVG page's systems array.
// Columns: DINO, SSIM, LPIPS, text CLIP, text judge, image candidate EOS.
// Time is deliberately omitted: the paper reports multiple inference engines.
const systems = [
  {
    name: "FlashSVG-4B", type: "ours", badge: "ours",
    icons: [0.935, 0.928, 0.064, 0.276, 5.42, 0.997],
    illustrations: [0.904, 0.918, 0.083, 0.223, 2.54, 0.982],
  },
  {
    name: "FlashSVG-8B", type: "ours", badge: "ours",
    detail: {
      zh: "转换阶段包含 EOS 蒸馏。",
      en: "Conversion includes EOS distillation.",
    },
    icons: [0.914, 0.909, 0.088, 0.274, 5.49, 0.981],
    illustrations: [0.884, 0.910, 0.101, 0.229, 2.75, 0.925],
  },
  {
    name: "OmniSVG-4B", type: "open", badge: "released",
    icons: [0.776, 0.837, 0.197, 0.271, 4.46, 0.63],
    illustrations: [0.707, 0.834, 0.245, 0.215, 1.35, 0.40],
  },
  {
    name: "CTRL-S (8B)", type: "open", badge: "open",
    icons: [0.899, 0.822, 0.142, 0.295, 6.92, 1.00],
    illustrations: [0.854, 0.836, 0.159, 0.276, 5.89, 1.00],
  },
  {
    name: "Qwen3.8-27B", type: "open", badge: "open",
    icons: [0.887, 0.804, 0.171, 0.307, 8.87, 0.87],
    illustrations: [0.809, 0.763, 0.226, 0.306, 8.77, 0.69],
  },
  {
    name: "Qwen3.8-27B + GPT-6 Astra SFT", type: "open", badge: "teacher",
    detail: {
      zh: "论文作者使用 GPT-6 Astra 生成的 SVG 进行微调。",
      en: "Fine-tuned by the paper's authors on GPT-6 Astra SVGs.",
    },
    icons: [0.889, 0.767, 0.226, 0.303, 8.94, 0.97],
    illustrations: [0.872, 0.777, 0.245, 0.298, 8.99, 0.96],
  },
  {
    name: "GPT-6 Astra", type: "closed", badge: "api",
    icons: [0.970, 0.972, 0.021, 0.308, 9.79, null],
    illustrations: [0.981, 0.984, 0.009, 0.313, 9.83, null],
  },
  {
    name: "Claude Opus 5.5", type: "closed", badge: "api",
    icons: [0.960, 0.890, 0.057, 0.304, 9.71, null],
    illustrations: [0.939, 0.900, 0.061, 0.316, 9.44, null],
  },
  {
    name: "vtracer", type: "tracer", badge: "tracer", imageOnly: true,
    icons: [0.982, 0.987, 0.009, null, null, null],
    illustrations: [0.978, 0.987, 0.009, null, null, null],
  },
];

const badgeLabels = {
  zh: { ours: "本文", released: "发布版", open: "开放模型", teacher: "教师 SFT", api: "API", tracer: "描摹" },
  en: { ours: "Ours", released: "Released", open: "Open", teacher: "Teacher SFT", api: "API", tracer: "Tracer" },
};

let disposePrevious = null;

/** Initialize the real-example gallery and Table 1 quality explorer. */
function initExplore() {
  disposePrevious?.();
  const cleanups = [];
  const on = (element, event, handler) => {
    if (!element) return;
    element.addEventListener(event, handler);
    cleanups.push(() => element.removeEventListener(event, handler));
  };
  const $ = (selector) => document.querySelector(selector);
  const language = () => document.documentElement.lang.toLowerCase().startsWith("zh") ? "zh" : "en";
  const active = (button, selected) => {
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("active", selected);
    button.classList.toggle("is-active", selected);
  };

  const gallery = $("#gallery-main");
  const track = $("#gallery-track");
  const galleryName = $("#gallery-name");
  const galleryCounter = $("#gallery-counter");
  const gallerySource = $("#gallery-source");
  const previous = $("#gallery-prev");
  const next = $("#gallery-next");
  const play = $("#gallery-play");
  const cards = track ? [...track.querySelectorAll("article.figure1-card")]
    .sort((a, b) => Number(a.dataset.galleryIndex) - Number(b.dataset.galleryIndex)) : [];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const AUTO_DELAY = 3600;
  let galleryIndex = 0;
  let autoTimer = 0;
  let settleTimer = 0;
  let resizeTimer = 0;
  let autoDue = 0;
  let requestedPlaying = true;
  let motionPaused = document.documentElement.classList.contains("motion-paused");
  let hovered = false;
  let focusWithin = false;
  let pointerDown = false;
  let scrolling = false;
  let inViewport = false;
  let pendingTarget = null;
  let disposed = false;

  const galleryReady = () => gallery && track && cards.length > 0;
  const isInside = (element) => !!element && (
    gallery?.contains(element) || [previous, next, play].some((control) => control?.contains(element))
  );
  const eligible = () => galleryReady() && cards.length > 1 && requestedPlaying &&
    !motionPaused && !reducedMotion.matches && !document.hidden && inViewport &&
    !hovered && !focusWithin && !pointerDown && !disposed;
  const canAuto = () => eligible() && !scrolling;

  function updatePlayButton() {
    const lang = language();
    const running = !!canAuto();
    gallery?.classList.toggle("is-paused", !running);
    if (gallery) gallery.dataset.autoplay = running ? "running" : "paused";
    if (!play) return;
    // Pressed represents the user's autoplay preference; hover/focus temporarily suspend it.
    play.setAttribute("aria-pressed", String(requestedPlaying));
    play.disabled = motionPaused || reducedMotion.matches || cards.length < 2;
    const text = motionPaused
      ? lang === "zh" ? "动效已暂停" : "Motion paused"
      : reducedMotion.matches
        ? lang === "zh" ? "已减少动态效果" : "Reduced motion"
        : requestedPlaying
          ? lang === "zh" ? "暂停轮播" : "Pause slideshow"
          : lang === "zh" ? "播放轮播" : "Play slideshow";
    play.textContent = text;
    play.setAttribute("aria-label", text);
    play.title = lang === "zh"
      ? "指针悬停、焦点在内、页面隐藏或图库离开视口时，自动轮播暂缓。"
      : "Autoplay waits while hovered, focused, hidden, or outside the viewport.";
  }

  function galleryText() {
    if (!galleryReady()) return;
    const lang = language();
    const item = galleryCases[galleryIndex] || galleryCases[0];
    if (galleryName) galleryName.textContent = item[lang];
    if (galleryCounter) galleryCounter.textContent = `${String(galleryIndex + 1).padStart(2, "0")} / ${String(cards.length).padStart(2, "0")}`;
    if (gallerySource) gallerySource.textContent = lang === "zh"
      ? "Figure 1 · 作者精选真实案例，保留原图耗时；总体结论见完整评测。"
      : "Figure 1 · Author-selected real examples with original timings; see full evaluations for aggregate results.";
    gallery.setAttribute("aria-label", lang === "zh" ? "Figure 1 论文精选案例，可使用左右方向键" : "Figure 1 paper examples; use left and right arrow keys");
    gallery.setAttribute("aria-roledescription", lang === "zh" ? "轮播图库" : "carousel");
    track.setAttribute("aria-label", lang === "zh" ? "横向滚动 Figure 1 精选案例" : "Scroll Figure 1 selected examples horizontally");
    previous?.setAttribute("aria-label", lang === "zh" ? "上一个案例" : "Previous example");
    next?.setAttribute("aria-label", lang === "zh" ? "下一个案例" : "Next example");
    cards.forEach((card, index) => {
      const selected = index === galleryIndex;
      const name = (galleryCases[index] || galleryCases[0])[lang];
      card.classList.toggle("is-current", selected);
      if (selected) card.setAttribute("aria-current", "true");
      else card.removeAttribute("aria-current");
      card.setAttribute("role", "group");
      card.setAttribute("aria-roledescription", lang === "zh" ? "案例" : "slide");
      card.setAttribute("aria-label", `${index + 1} / ${cards.length} · ${name}`);
      const image = card.querySelector("img");
      if (image) image.alt = lang === "zh"
        ? `论文 Figure 1 精选案例：${name}，保留原图输入或提示与耗时`
        : `Paper Figure 1 selected example: ${name}, with the original input or prompt and timing`;
    });
    updatePlayButton();
  }

  function syncAutoplay(reset = false) {
    window.clearTimeout(autoTimer);
    autoTimer = 0;
    if (reset) autoDue = 0;
    if (!canAuto()) {
      if (!scrolling || !eligible()) autoDue = 0;
      updatePlayButton();
      return;
    }
    if (!autoDue) autoDue = Date.now() + AUTO_DELAY;
    autoTimer = window.setTimeout(() => {
      autoTimer = 0;
      if (!canAuto()) { syncAutoplay(); return; }
      autoDue = Date.now() + AUTO_DELAY;
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const nextIndex = track.scrollLeft >= maxScroll - 3 ? 0 : galleryIndex + 1;
      selectGallery(nextIndex, { manual: false });
    }, Math.max(0, autoDue - Date.now()));
    updatePlayButton();
  }

  function cardStart(index) {
    return cards[index].offsetLeft - cards[0].offsetLeft;
  }

  function settleGallery() {
    window.clearTimeout(settleTimer);
    settleTimer = 0;
    if (!galleryReady() || disposed || pointerDown) return;
    // Near the end several selected cards share the same clamped scroll offset.
    // Preserve a requested card there so all 13 examples can advance before wrapping.
    if (pendingTarget && Math.abs(track.scrollLeft - pendingTarget.left) < 3) {
      galleryIndex = pendingTarget.index;
    } else {
      let closest = 0;
      let distance = Infinity;
      cards.forEach((card, index) => {
        const nextDistance = Math.abs(cardStart(index) - track.scrollLeft);
        if (nextDistance < distance) { closest = index; distance = nextDistance; }
      });
      galleryIndex = closest;
    }
    pendingTarget = null;
    scrolling = false;
    galleryText();
    syncAutoplay();
  }

  function queueSettle(delay = 160) {
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(settleGallery, delay);
  }

  function selectGallery(index, { animate = true, manual = true } = {}) {
    if (!galleryReady() || disposed) return;
    galleryIndex = ((index % cards.length) + cards.length) % cards.length;
    if (manual) autoDue = Date.now() + AUTO_DELAY;
    galleryText();
    const left = Math.max(0, Math.min(cardStart(galleryIndex), Math.max(0, track.scrollWidth - track.clientWidth)));
    pendingTarget = { index: galleryIndex, left };
    scrolling = true;
    const behavior = animate && !motionPaused && !reducedMotion.matches ? "smooth" : "instant";
    if (typeof track.scrollTo === "function") track.scrollTo({ left, behavior });
    else track.scrollLeft = left;
    syncAutoplay();
    // Also settle when a clamped target is already visible and no scroll event occurs.
    queueSettle(behavior === "smooth" ? 220 : 0);
  }

  function galleryKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest("input, textarea, select, [contenteditable=true]")) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    selectGallery(galleryIndex + (event.key === "ArrowRight" ? 1 : -1));
  }

  function checkViewport() {
    if (!gallery) return;
    const rect = gallery.getBoundingClientRect();
    inViewport = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < window.innerHeight && rect.left < window.innerWidth;
    syncAutoplay();
  }

  function stopAnimatedScroll() {
    if (!track || !scrolling) return;
    const left = track.scrollLeft;
    if (typeof track.scrollTo === "function") track.scrollTo({ left, behavior: "instant" });
    else track.scrollLeft = left;
    pendingTarget = null;
    scrolling = false;
    settleGallery();
  }

  if (galleryReady()) {
    if (!gallery.hasAttribute("tabindex")) gallery.tabIndex = 0;
    if (!gallery.hasAttribute("role")) gallery.setAttribute("role", "region");
    track.setAttribute("aria-live", "off");
    if (!track.hasAttribute("tabindex")) track.tabIndex = 0;
    [previous, next, play].forEach((button) => {
      if (button?.tagName === "BUTTON") button.type = "button";
      if (button && !gallery.contains(button)) on(button, "keydown", galleryKey);
    });
    on(previous, "click", () => selectGallery(galleryIndex - 1));
    on(next, "click", () => selectGallery(galleryIndex + 1));
    on(play, "click", () => {
      if (motionPaused || reducedMotion.matches) return;
      requestedPlaying = !requestedPlaying;
      syncAutoplay(true);
    });
    on(gallery, "keydown", galleryKey);
    on(gallery, "pointerenter", (event) => {
      if (event.pointerType === "touch") return;
      hovered = true;
      syncAutoplay();
    });
    on(gallery, "pointerleave", () => { hovered = false; syncAutoplay(); });
    const updateFocus = () => { focusWithin = isInside(document.activeElement); syncAutoplay(); };
    on(gallery, "focusin", updateFocus);
    on(gallery, "focusout", () => queueMicrotask(updateFocus));
    [previous, next, play].filter((button) => button && !gallery.contains(button)).forEach((button) => {
      on(button, "focusin", updateFocus);
      on(button, "focusout", () => queueMicrotask(updateFocus));
    });
    on(track, "pointerdown", () => {
      pointerDown = true;
      pendingTarget = null;
      syncAutoplay();
    });
    const releasePointer = () => {
      if (!pointerDown) return;
      pointerDown = false;
      queueSettle();
      syncAutoplay();
    };
    on(window, "pointerup", releasePointer);
    on(window, "pointercancel", releasePointer);
    on(track, "wheel", () => {
      pendingTarget = null;
      scrolling = true;
      syncAutoplay();
      queueSettle();
    });
    on(track, "scroll", () => {
      scrolling = true;
      syncAutoplay();
      queueSettle();
    });
    on(track, "scrollend", settleGallery);
    on(document, "visibilitychange", () => {
      if (document.hidden) stopAnimatedScroll();
      syncAutoplay(true);
    });
    const onMotion = (event) => {
      if (typeof event.detail?.paused !== "boolean" || event.detail.paused === motionPaused) return;
      motionPaused = event.detail.paused;
      if (motionPaused) stopAnimatedScroll();
      syncAutoplay(true);
    };
    on(window, "flashsvg:motion", onMotion);
    on(document, "flashsvg:motion", onMotion);
    on(reducedMotion, "change", () => {
      if (reducedMotion.matches) stopAnimatedScroll();
      syncAutoplay(true);
    });
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        checkViewport();
        if (!pointerDown) selectGallery(galleryIndex, { animate: false, manual: false });
      }, 80);
    };
    on(window, "resize", onResize);
    if (typeof window.IntersectionObserver === "function") {
      const observer = new window.IntersectionObserver((entries) => {
        const entry = entries.find((item) => item.target === gallery);
        if (!entry) return;
        inViewport = entry.isIntersecting && entry.intersectionRatio > 0;
        syncAutoplay();
      }, { threshold: [0, 0.01] });
      observer.observe(gallery);
      cleanups.push(() => observer.disconnect());
    } else on(window, "scroll", checkViewport);
    if (typeof window.ResizeObserver === "function") {
      const observer = new window.ResizeObserver(onResize);
      observer.observe(track);
      cards.forEach((card) => observer.observe(card));
      cleanups.push(() => observer.disconnect());
    }
    focusWithin = isInside(document.activeElement);
    checkViewport();
    selectGallery(0, { animate: false, manual: false });
  }

  cleanups.push(() => {
    disposed = true;
    window.clearTimeout(autoTimer);
    window.clearTimeout(settleTimer);
    window.clearTimeout(resizeTimer);
    gallery?.classList.remove("is-paused");
    if (gallery) delete gallery.dataset.autoplay;
  });

  const head = $("#results-head");
  const body = $("#results-body");
  const note = $("#results-note");
  const taskButtons = [...document.querySelectorAll("[data-result-task]")];
  const kindButtons = [...document.querySelectorAll("[data-result-kind]")];
  let task = "image";
  let kind = "icons";

  const metricCell = (value, digits = 3, className = "metric") => {
    const cell = document.createElement("td");
    cell.className = className;
    cell.textContent = value == null ? "—" : Number(value).toFixed(digits);
    return cell;
  };

  function renderResults() {
    if (!head || !body) return;
    const lang = language();
    taskButtons.forEach((button) => active(button, button.dataset.resultTask === task));
    kindButtons.forEach((button) => active(button, button.dataset.resultKind === kind));
    const labels = task === "image"
      ? [lang === "zh" ? "模型" : "Model", "DINO ↑", "SSIM ↑", "LPIPS ↓", lang === "zh" ? "候选 EOS ↑" : "Candidate EOS ↑"]
      : [lang === "zh" ? "模型" : "Model", "CLIP ↑", lang === "zh" ? "评判分数（0–10）↑" : "Judge (0–10) ↑"];
    const headerCells = labels.map((label) => {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      return cell;
    });
    if (head.tagName === "TR") head.replaceChildren(...headerCells);
    else {
      const row = document.createElement("tr");
      row.append(...headerCells);
      head.replaceChildren(row);
    }

    const rows = systems.filter((system) => task === "image" || !system.imageOnly).map((system) => {
      const values = system[kind];
      const row = document.createElement("tr");
      row.className = `result-row result-${system.type}${system.type === "ours" ? " ours" : ""}`;
      const model = document.createElement("th");
      model.scope = "row";
      model.className = "model-cell";
      const name = document.createElement("span");
      name.className = "model-name";
      name.textContent = system.name;
      if (system.detail) name.title = system.detail[lang];
      const badge = document.createElement("span");
      badge.className = `model-badge badge ${system.type}`;
      badge.textContent = badgeLabels[lang][system.badge];
      model.append(name, document.createTextNode(" "), badge);
      row.append(model);
      if (task === "image") {
        row.append(...values.slice(0, 3).map((value) => metricCell(value)));
        const eos = document.createElement("td");
        eos.className = "metric eos-cell";
        eos.textContent = values[5] == null ? "—" : `${Number((values[5] * 100).toFixed(1))}%`;
        row.append(eos);
      } else row.append(metricCell(values[3]), metricCell(values[4], 2));
      return row;
    });
    body.replaceChildren(...rows);

    if (note) {
      const category = lang === "zh"
        ? kind === "icons" ? "图标" : "插画"
        : kind === "icons" ? "icons" : "illustrations";
      note.textContent = lang === "zh"
        ? task === "image"
          ? `Table 1 · 每类150例，当前为图生SVG${category}。最多8个候选取首个非空渲染，API模型使用1个样本。FlashSVG质量与候选EOS来自AR采样，两行均为3个训练种子均值；基线为单次评测。候选EOS统计全部候选。vtracer仅支持图生SVG。“—”表示未测量或不适用。`
          : `Table 1 · 每类150例，当前为文生SVG${category}。展示CLIP相似度与GPT-6 Astra提示忠实度评分（0–10）；最多8个候选取首个非空渲染，API使用1个样本。FlashSVG质量来自AR采样，两行为3个训练种子均值；基线为单次评测。vtracer仅支持图生SVG，此处省略；图生SVG的EOS不作为文生SVG指标。`
        : task === "image"
          ? `Table 1 · 150 cases per category; image-to-SVG ${category} shown. First non-empty render of up to eight candidates; API models use one sample. FlashSVG quality and candidate EOS use AR samples; both rows average three training seeds, while baselines are single evaluations. Candidate EOS counts all candidates. vtracer is image-only. “—” means not measured or not applicable.`
          : `Table 1 · 150 cases per category; text-to-SVG ${category} shown. CLIP similarity and GPT-6 Astra prompt-fidelity judge (0–10). First non-empty render of up to eight candidates; API models use one sample. FlashSVG quality uses AR samples; both rows average three training seeds, while baselines are single evaluations. Image-only vtracer is omitted; image-to-SVG EOS is not a text-to-SVG metric.`;
    }
  }

  taskButtons.forEach((button) => {
    if (button.tagName === "BUTTON") button.type = "button";
    on(button, "click", () => {
      const value = button.dataset.resultTask;
      if (value !== "image" && value !== "text") return;
      task = value;
      renderResults();
    });
  });
  kindButtons.forEach((button) => {
    if (button.tagName === "BUTTON") button.type = "button";
    on(button, "click", () => {
      const value = button.dataset.resultKind;
      if (value !== "icons" && value !== "illustrations") return;
      kind = value;
      renderResults();
    });
  });
  renderResults();

  let previousLanguageEvent = null;
  const refreshLanguage = (event) => {
    if (previousLanguageEvent === event) return;
    previousLanguageEvent = event;
    galleryText();
    renderResults();
  };
  on(document, "flashsvg:language", refreshLanguage);
  on(window, "flashsvg:language", refreshLanguage);

  const dispose = () => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    if (disposePrevious === dispose) disposePrevious = null;
  };
  disposePrevious = dispose;
  return dispose;
}

window.FlashSVGLab = { ...window.FlashSVGLab, initExplore };
})();
