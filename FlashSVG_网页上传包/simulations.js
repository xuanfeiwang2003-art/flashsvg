(() => {
"use strict";

const mounted = new WeakMap();

/** Mount the two schematic demonstrations. Returns an idempotent cleanup function. */
function initSimulations(root = document) {
  if (mounted.has(root)) return mounted.get(root);

  const query = (selector) => root.querySelector(selector);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const controllers = [];
  const listeners = [];
  let motionPaused = false;
  let disposed = false;
  let language = document.documentElement?.lang === "zh" ? "zh" : "en";
  const translate = (en, zh) => language === "zh" ? zh : en;

  function listen(target, name, handler, options) {
    if (!target) return;
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  }

  function mayAnimate() {
    return !motionPaused && !reducedMotion.matches && !document.hidden;
  }

  function prepareButton(button) {
    if (button?.tagName === "BUTTON") button.type = "button";
  }

  function mountDecode() {
    const container = query("#decode-demo");
    if (!container) return;
    const tokens = container.querySelector("#decode-tokens");
    const phase = container.querySelector("#decode-phase");
    const forwards = container.querySelector("#decode-forward-count");
    const commits = container.querySelector("#decode-commit-count");
    const roundCount = container.querySelector("#decode-round-count");
    const roundLabel = container.querySelector("#decode-round-label");
    const stream = container.querySelector("#decode-committed-stream");
    const completion = container.querySelector("#decode-completion");
    const drawing = container.querySelector("#decode-drawing");
    const previewPaths = container.querySelector("#decode-preview-paths");
    const bos = container.querySelector("[data-decode-bos]");
    const play = container.querySelector("#decode-play");
    const reset = container.querySelector("#decode-reset");
    if (!tokens || !phase || !forwards || !commits) return;

    [play, reset].forEach(prepareButton);
    phase.setAttribute("aria-live", "polite");
    phase.setAttribute("aria-atomic", "true");
    tokens.setAttribute("role", "list");
    stream?.setAttribute("role", "list");
    completion?.setAttribute("aria-live", "polite");
    const stepLabels = [...container.querySelectorAll(".decode-step-labels > span[data-phase]")];
    const phaseIndices = { ready: 0, draft: 1, verify: 2, commit: 3, done: 4 };
    const kinds = new Set(["command", "coordinate", "color", "eos"]);
    const blockLength = 16;
    let data = null;
    let dataReference = null;
    let state = "ready";
    let round = 0;
    let completedRounds = 0;
    let forwardCount = 0;
    let playing = false;
    let active = query("#highlights")?.dataset.activePanel === "faster" || ["#decode", "#decode-demo"].includes(window.location?.hash);
    let resumeWanted = true;
    let inViewport = typeof window.IntersectionObserver !== "function";
    let viewportObserver = null;
    let timer = null;
    let streamRevision = "";

    function localized(value) {
      return typeof value === "string" ? value : value?.[language] || value?.en || value?.zh || "";
    }

    function validToken(token) {
      return token && Number.isInteger(token.id) && kinds.has(token.kind) && typeof token.label === "string";
    }

    function validate(candidate) {
      if (candidate?.kind !== "encoded-example" || !Array.isArray(candidate.tokens) || !candidate.tokens.length ||
          !Array.isArray(candidate.rounds) || !candidate.rounds.length || !Number.isInteger(candidate.tokenizer?.bosId) ||
          !Number.isInteger(candidate.tokenizer?.eosId) || !Number.isInteger(candidate.tokenizer?.maskId) ||
          !Number.isInteger(candidate.tokenizer?.coordinateOffset) || !(candidate.tokenizer?.bboxSize > 0) ||
          candidate.tokens.some((token) => !validToken(token))) return null;
      const canonical = candidate.rounds.flatMap((item) => item.committed || []);
      if (canonical.length !== candidate.tokens.length || canonical.some((token, index) => !validToken(token) ||
          token.id !== candidate.tokens[index].id || token.kind !== candidate.tokens[index].kind)) return null;
      for (const item of candidate.rounds) {
        if (!Number.isInteger(item.acceptedCount) || item.acceptedCount < 0 || item.acceptedCount >= blockLength ||
            !Array.isArray(item.draft) || item.draft.length !== blockLength || item.draft.some((token) => !validToken(token)) ||
            !Array.isArray(item.committed) || item.committed.length !== item.acceptedCount + 1 ||
            item.draft.slice(0, item.acceptedCount).some((token, index) => token.id !== item.committed[index].id) ||
            item.draft[item.acceptedCount].id === item.committed[item.acceptedCount]?.id) return null;
      }
      const eos = candidate.tokens.flatMap((token, index) => token.kind === "eos" || token.id === candidate.tokenizer.eosId ? [index] : []);
      if (eos.length !== 1 || eos[0] !== candidate.tokens.length - 1 || candidate.tokens.at(-1).id !== candidate.tokenizer.eosId) return null;
      return candidate;
    }

    function stop() {
      playing = false;
      window.clearTimeout(timer);
      timer = null;
    }

    function resetState() {
      stop();
      state = "ready";
      round = 0;
      completedRounds = 0;
      forwardCount = 0;
      streamRevision = "";
    }

    function showResult() {
      if (!data) return;
      stop();
      state = "done";
      round = data.rounds.length - 1;
      completedRounds = data.rounds.length;
      forwardCount = data.rounds.length * 2;
      resumeWanted = false;
    }

    function loadData() {
      const candidate = window.FlashSVGDecodeData;
      if (candidate === dataReference) return;
      dataReference = candidate;
      data = validate(candidate);
      resetState();
      if (data && reducedMotion.matches) showResult();
    }

    function committedTokens() {
      return data ? data.rounds.slice(0, completedRounds).flatMap((item) => item.committed) : [];
    }

    function tokenTitle(token) {
      return `${token.label} · ID ${token.id}${token.detail ? ` · ${localized(token.detail)}` : ""}`;
    }

    function description() {
      if (!data) return translate("Waiting for the SVG token example.", "等待 SVG token 编码样例。");
      if (state === "ready") return translate(
        "Play four continuous rounds of drafting and verification, all the way to EOS.",
        "自动连续播放四轮草拟与验证，直到 EOS。"
      );
      if (state === "draft") return translate(
        `Propose ${blockLength} SVG tokens in parallel · +1 forward. Nothing is committed yet.`,
        `并行草拟 ${blockLength} 个 SVG token · +1 次前向，尚未提交。`
      );
      if (state === "verify") return translate(
        "Evaluate every proposal with one causal forward using the same weights · +1 forward.",
        "同一套权重通过一次因果前向并行验证全部草稿 · +1 次前向。"
      );
      if (state === "commit") {
        const item = data.rounds[round];
        const oldToken = item.draft[item.acceptedCount];
        const correction = item.committed[item.acceptedCount];
        const discarded = blockLength - item.committed.length;
        return translate(
          `Accept ${item.acceptedCount}, replace ${oldToken.label} with ${correction.label}; discard ${discarded} later proposals. Commit ${item.committed.length} tokens with no extra forward.`,
          `接受 ${item.acceptedCount} 个，将 ${oldToken.label} 修正为 ${correction.label}，丢弃后续 ${discarded} 个草稿；提交 ${item.committed.length} 个 token，无需额外前向。`
        );
      }
      return translate(
        "EOS reached. The preview is decoded from the complete committed sequence.",
        "已到达 EOS，右侧预览由完整提交序列解码。"
      );
    }

    function renderStream() {
      const committed = committedTokens();
      if (bos) {
        bos.textContent = "BOS";
        bos.title = data ? translate(`ID ${data.tokenizer.bosId} · Input context; excluded from the generated count`, `ID ${data.tokenizer.bosId} · 输入上下文，不计入生成数`) : "";
        if (data) bos.dataset.tokenId = String(data.tokenizer.bosId);
      }
      if (!stream) return;
      stream.setAttribute("aria-label", translate(`${committed.length} committed SVG tokens; BOS is input context`, `已提交 ${committed.length} 个 SVG token；BOS 为输入上下文`));
      const revision = `${language}:${completedRounds}`;
      if (streamRevision === revision) return;
      streamRevision = revision;
      const items = [];
      for (let r = 0; data && r < completedRounds; r += 1) {
        const item = data.rounds[r];
        item.committed.forEach((token, index) => {
          const chip = document.createElement("span");
          chip.className = "committed-token";
          chip.dataset.round = String(r + 1);
          chip.dataset.kind = token.kind;
          chip.dataset.tokenId = String(token.id);
          chip.setAttribute("role", "listitem");
          chip.textContent = token.label;
          chip.classList.toggle("is-replacement", index === item.acceptedCount);
          chip.classList.toggle("is-eos", token.kind === "eos");
          chip.classList.toggle("is-latest", r === completedRounds - 1);
          if (token.kind === "color") chip.style.setProperty("--token-color", token.label);
          chip.title = `${tokenTitle(token)} · ${translate(`Round ${r + 1}`, `第 ${r + 1} 轮`)}`;
          items.push(chip);
        });
      }
      stream.replaceChildren(...items);
      stream.dataset.count = String(committed.length);
      stream.scrollTop = stream.scrollHeight;
    }

    // The tokenizer writes two coordinate-pair tokens after M, one after L and
    // one after Z. M uses the second pair; Z consumes its pair without drawing it.
    function renderPreview() {
      if (!previewPaths) return;
      const committed = committedTokens();
      const paths = [];
      let path = [];
      const coordinate = (token) => {
        if (!data || token?.kind !== "coordinate") return null;
        const value = token.id - data.tokenizer.coordinateOffset;
        const size = data.tokenizer.bboxSize;
        if (value < 0 || value >= size * size) return null;
        return `${value % size} ${Math.floor(value / size)}`;
      };
      for (let index = 0; index < committed.length;) {
        const token = committed[index];
        if (token.kind === "eos") break;
        if (token.kind === "color") {
          if (path.length) paths.push({ d: path.join(" "), fill: /^#[0-9a-f]{6}$/i.test(token.label) ? token.label : "none" });
          path = [];
          index += 1;
          continue;
        }
        if (token.kind !== "command") break;
        const command = Object.keys(data.tokenizer.commands || {}).find((name) => data.tokenizer.commands[name] === token.id);
        const pairs = command === "M" ? 2 : command === "L" || command === "Z" ? 1 : 0;
        if (!pairs || !coordinate(committed[index + 1]) || (pairs === 2 && !coordinate(committed[index + 2]))) break;
        if (command === "M") {
          if (path.length) paths.push({ d: path.join(" "), fill: "none" });
          path = [`M ${coordinate(committed[index + 2])}`];
        } else if (command === "L" && path.length) path.push(`L ${coordinate(committed[index + 1])}`);
        else if (command === "Z" && path.length) path.push("Z");
        index += pairs + 1;
      }
      if (path.length) paths.push({ d: path.join(" "), fill: "none" });
      previewPaths.replaceChildren(...paths.map((part) => {
        const element = document.createElementNS("http://www.w3.org/2000/svg", "path");
        element.setAttribute("d", part.d);
        element.setAttribute("fill", part.fill);
        element.setAttribute("stroke", part.fill === "none" ? "currentColor" : "none");
        element.setAttribute("stroke-width", "1.6");
        element.setAttribute("stroke-linecap", "round");
        element.setAttribute("stroke-linejoin", "round");
        element.dataset.complete = String(part.fill !== "none");
        return element;
      }));
      drawing?.setAttribute("aria-label", translate("SVG reconstructed from the committed official tokenizer tokens; illustrative decoding decisions", "从已提交的官方 tokenizer token 重建 SVG；解码决策为机制示意"));
    }

    function render() {
      const complete = state === "done";
      const committedPhase = state === "commit" || complete;
      const currentRound = data?.rounds[round];
      const committed = committedTokens();
      const reachedEOS = committed.at(-1)?.kind === "eos";
      container.dataset.phase = state;
      container.dataset.round = state === "ready" ? "0" : String(round + 1);
      container.classList.toggle("is-playing", playing);
      container.classList.toggle("is-complete", complete);
      container.classList.toggle("has-eos", reachedEOS);
      tokens.setAttribute("aria-label", translate(`${blockLength} SVG token draft positions`, `${blockLength} 个 SVG token 草稿位置`));
      stepLabels.forEach((label) => {
        const raw = label.dataset.phase;
        const index = raw in phaseIndices ? phaseIndices[raw] : Number(raw);
        const selected = index === phaseIndices[state] || (complete && index === 3);
        label.classList.toggle("current", selected);
        if (selected) label.setAttribute("aria-current", "step");
        else label.removeAttribute("aria-current");
        const en = ["01 / MASK", "02 / DRAFT", "03 / VERIFY", "04 / COMMIT", "05 / DONE"];
        const zh = ["01 / 掩码", "02 / 草拟", "03 / 验证", "04 / 提交", "05 / 完成"];
        if (Number.isInteger(index) && index >= 0 && index < en.length) label.textContent = translate(en[index], zh[index]);
      });
      tokens.replaceChildren(...Array.from({ length: blockLength }, (_, index) => {
        const proposal = currentRound?.draft[index];
        const item = document.createElement("span");
        item.className = "decode-token";
        item.setAttribute("role", "listitem");
        const position = document.createElement("small");
        position.className = "decode-token-index";
        position.textContent = String(index + 1).padStart(2, "0");
        const value = document.createElement("strong");
        value.className = "decode-token-value";
        value.textContent = state === "ready" || !proposal ? "MASK" : proposal.label;
        item.append(position, value);
        let status = translate("masked", "已掩码");
        if (state === "ready" || !proposal) {
          item.classList.add("is-masked");
          item.title = data ? `MASK · ID ${data.tokenizer.maskId}` : "MASK";
        } else {
          item.dataset.kind = proposal.kind;
          item.dataset.tokenId = String(proposal.id);
          item.title = tokenTitle(proposal);
          if (proposal.kind === "color") item.style.setProperty("--token-color", proposal.label);
          if (state === "draft") {
            item.classList.add("is-draft");
            status = translate(`draft ${proposal.label}, not committed`, `草稿 ${proposal.label}，尚未提交`);
          } else if (state === "verify") {
            item.classList.add("is-verified");
            status = translate(`${proposal.label}, target distribution evaluated`, `${proposal.label}，目标分布已计算`);
          } else if (committedPhase && index < currentRound.acceptedCount) {
            item.classList.add("is-accepted");
            status = translate(`${proposal.label} accepted and committed`, `${proposal.label} 已接受并提交`);
          } else if (committedPhase && index === currentRound.acceptedCount) {
            const replacement = currentRound.committed[index];
            item.classList.add("is-rejected", "is-corrected");
            item.classList.toggle("is-eos", replacement.kind === "eos");
            const oldValue = document.createElement("del");
            oldValue.className = "decode-rejected-value";
            oldValue.textContent = proposal.label;
            const arrow = document.createElement("span");
            arrow.className = "decode-correction-arrow";
            arrow.textContent = "→";
            arrow.setAttribute("aria-hidden", "true");
            const correction = document.createElement("ins");
            correction.className = "decode-corrected-value";
            correction.textContent = replacement.label;
            value.replaceChildren(oldValue, arrow, correction);
            item.title = `${tokenTitle(proposal)} → ${tokenTitle(replacement)}`;
            item.dataset.correctedId = String(replacement.id);
            status = translate(`reject ${proposal.label}, commit residual sample ${replacement.label}`, `拒绝 ${proposal.label}，提交残差采样 ${replacement.label}`);
          } else {
            item.classList.add("is-discarded");
            status = translate(`draft ${proposal.label} discarded`, `草稿 ${proposal.label} 已丢弃`);
          }
        }
        item.setAttribute("aria-label", translate(`Position ${index + 1}, ${status}`, `位置 ${index + 1}，${status}`));
        return item;
      }));
      phase.textContent = description();
      phase.title = localized(data?.note);
      forwards.textContent = String(forwardCount);
      commits.textContent = String(committed.length);
      if (roundCount) roundCount.textContent = state === "ready" ? "0" : String(round + 1);
      if (roundLabel) roundLabel.textContent = data ? `ROUND ${state === "ready" ? 0 : round + 1}/${data.rounds.length}` : "ROUND —";
      if (completion) {
        completion.textContent = complete ? translate("EOS · COMPLETE", "EOS · 已完成") : reachedEOS ? translate("EOS RECEIVED", "已收到 EOS") :
          playing ? translate("GENERATING", "连续生成中") : state === "ready" ? translate("READY", "待播放") : translate("PAUSED", "已暂停");
        completion.dataset.state = complete ? "done" : reachedEOS ? "eos" : playing ? "running" : state === "ready" ? "ready" : "paused";
      }
      renderStream();
      renderPreview();
      drawing?.classList.toggle("is-complete", complete);
      if (play) {
        play.textContent = playing ? translate("Pause", "暂停") : reducedMotion.matches && !complete ? translate("Show result", "显示结果") : motionPaused && !reducedMotion.matches ? translate("Motion paused", "动效已暂停") :
          complete ? translate("Replay", "重播") : state === "ready" ? translate("Play sequence", "播放过程") : translate("Continue", "继续");
        play.setAttribute("aria-pressed", String(playing));
        play.disabled = (motionPaused && !reducedMotion.matches) || !data;
      }
      if (reset) reset.setAttribute("aria-label", translate("Reset SVG decoding demo", "重置 SVG 解码演示"));
    }

    function advance() {
      if (!data) return;
      if (state === "ready") {
        state = "draft";
        forwardCount += 1;
      } else if (state === "draft") {
        state = "verify";
        forwardCount += 1;
      } else if (state === "verify") {
        state = "commit";
        completedRounds = round + 1;
      } else if (state === "commit" && round < data.rounds.length - 1) {
        round += 1;
        state = "draft";
        forwardCount += 1;
      } else {
        state = "done";
        resumeWanted = false;
        stop();
      }
    }

    function tick() {
      if (!playing || !active || !inViewport || !mayAnimate()) {
        stop();
        render();
        return;
      }
      advance();
      render();
      if (playing) timer = window.setTimeout(tick, 900);
    }

    function start() {
      if (!data || playing || state === "done" || !active || !inViewport || document.hidden) return;
      if (reducedMotion.matches) {
        showResult();
        render();
        return;
      }
      if (motionPaused) return;
      playing = true;
      if (state === "ready") tick();
      else {
        render();
        timer = window.setTimeout(tick, 900);
      }
    }

    listen(play, "click", () => {
      if (playing) {
        resumeWanted = false;
        stop();
        render();
        return;
      }
      if ((motionPaused && !reducedMotion.matches) || document.hidden || !data) return;
      active = true;
      if (state === "done") resetState();
      resumeWanted = true;
      start();
    });
    listen(reset, "click", () => {
      resumeWanted = false;
      resetState();
      render();
    });
    listen(window, "flashsvg:highlight", (event) => {
      if (!["faster", "faithful", "termination"].includes(event.detail?.panel)) return;
      active = event.detail.panel === "faster";
      if (!active) stop();
      else if (resumeWanted) start();
      render();
    });
    listen(window, "flashsvg:decode-data", () => {
      loadData();
      render();
      if (active && resumeWanted) start();
    });
    listen(document, "visibilitychange", () => {
      if (!document.hidden && active && resumeWanted) start();
    });
    listen(window, "resize", () => {
      if (stream && completedRounds) stream.scrollTop = stream.scrollHeight;
    });
    listen(reducedMotion, "change", () => {
      if (reducedMotion.matches && data) showResult();
      else stop();
      render();
    });

    if (typeof window.IntersectionObserver === "function") {
      viewportObserver = new window.IntersectionObserver((entries) => {
        const entry = entries.find((item) => item.target === container);
        if (!entry) return;
        inViewport = entry.isIntersecting && entry.intersectionRatio >= 0.2;
        if (!inViewport) stop();
        else if (active && resumeWanted) start();
        render();
      }, { threshold: [0, 0.2] });
      viewportObserver.observe(container);
    }

    controllers.push({
      pause() { stop(); render(); },
      refresh() {
        loadData();
        render();
        if (active && resumeWanted) start();
      },
      dispose() { resumeWanted = false; stop(); viewportObserver?.disconnect(); },
    });
    loadData();
    render();
    if (active && resumeWanted) start();
  }

  function mountTermination() {
    const container = query("#termination-demo");
    if (!container) return;
    const run = container.querySelector("#termination-run");
    const reset = container.querySelector("#termination-reset");
    const tokenView = container.querySelector("#termination-token-view");
    const status = container.querySelector("#termination-status");
    const sourceDetail = container.querySelector("#termination-source-detail");
    const exampleName = container.querySelector("#termination-example-name");
    const exampleArt = container.querySelector("#termination-example-art");
    const names = ["omni", "flash"];
    const views = names.map((name) => {
      const card = container.querySelector(`.token-stream-card[data-stream="${name}"]`);
      return card && {
        name, card,
        state: card.querySelector("[data-stream-state]"),
        count: card.querySelector("[data-stream-count]"),
        total: card.querySelector("[data-stream-total]"),
        progress: card.querySelector("[data-stream-progress]"),
        list: card.querySelector("[data-token-stream]"),
        outcome: card.querySelector("[data-stream-outcome]"),
        countValue: 0,
      };
    });
    if (!status || views.some((view) => !view || !view.list || !view.count)) return;

    [run, reset, tokenView].forEach(prepareButton);
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    views.forEach((view) => view.list.setAttribute("role", "list"));
    let data = null;
    let dataReference = null;
    let invalidData = false;
    let showIds = false;
    let playing = false;
    let active = query("#highlights")?.dataset.activePanel === "termination" || ["#diagnosis", "#termination-demo"].includes(window.location?.hash);
    let resumeWanted = true;
    let inViewport = typeof window.IntersectionObserver !== "function";
    let viewportObserver = null;
    let timer = null;
    let startedAt = 0;
    let elapsed = 0;
    let renderedLanguage = language;
    // Both columns share one visual token budget, so neither suggests a faster tokenizer.
    // The eased ten-second presentation is never a measurement of model latency.
    const duration = 10000;
    let tokenBudget = 0;
    let revealPower = 1;
    const allowedKinds = new Set(["command", "coordinate", "color", "eos", "bos", "special"]);

    function localized(value, fallback = "") {
      if (typeof value === "string") return value;
      return value?.[language] || value?.en || value?.zh || fallback;
    }

    function validate(candidate) {
      if (!candidate || !["encoded-example", "recorded"].includes(candidate.kind)) return null;
      if (!Number.isInteger(candidate.tokenizer?.eosId)) return null;
      const streams = candidate.streams;
      if (!streams || streams.omni?.end !== "cap" || streams.flash?.end !== "eos") return null;
      for (const name of names) {
        const item = streams[name];
        if (!Array.isArray(item.tokens) || !item.tokens.length || !Number.isInteger(item.cap) || item.cap < item.tokens.length) return null;
        if (item.tokens.some((token) => !Number.isInteger(token.id) || !allowedKinds.has(token.kind) || typeof token.label !== "string")) return null;
        const eosPositions = item.tokens.flatMap((token, index) => token.id === candidate.tokenizer.eosId || token.kind === "eos" ? [index] : []);
        if (name === "omni" && (item.tokens.length !== item.cap || eosPositions.length)) return null;
        if (name === "flash" && (eosPositions.length !== 1 || eosPositions[0] !== item.tokens.length - 1 || item.tokens.at(-1).id !== candidate.tokenizer.eosId || item.tokens.at(-1).kind !== "eos")) return null;
      }
      return candidate;
    }

    function stop() {
      if (playing) elapsed = Math.min(duration, elapsed + performance.now() - startedAt);
      playing = false;
      window.clearTimeout(timer);
      timer = null;
    }

    function clearStreams() {
      views.forEach((view) => {
        view.countValue = 0;
        view.list.replaceChildren();
        const pane = view.list.parentElement;
        if (pane) pane.scrollTop = 0;
      });
    }

    function renderExample() {
      if (exampleName) exampleName.textContent = data ? localized(data.example?.name, "SVG EXAMPLE") : translate("WAITING FOR TOKENIZER DATA", "等待接入 tokenizer 数据");
      if (!exampleArt) return;
      exampleArt.setAttribute("aria-label", data ? localized(data.example?.name, "SVG example") : translate("No SVG example loaded", "尚未载入 SVG 样例"));
      exampleArt.replaceChildren();
      if (!data?.example?.svgMarkup) return;
      const parsed = new DOMParser().parseFromString(data.example.svgMarkup, "image/svg+xml");
      const svg = parsed.documentElement;
      if (svg.localName !== "svg" || svg.namespaceURI !== "http://www.w3.org/2000/svg" || parsed.querySelector("parsererror")) return;
      svg.querySelectorAll("script,foreignObject,iframe,object,embed,audio,video,style").forEach((element) => element.remove());
      [svg, ...svg.querySelectorAll("*")].forEach((element) => {
        [...element.attributes].forEach((attribute) => {
          const name = attribute.name.toLowerCase();
          const value = attribute.value.trim();
          const externalUrl = [...value.matchAll(/url\s*\(\s*([^)]+)\)/gi)].some((match) => !match[1].trim().replace(/^["']|["']$/g, "").startsWith("#"));
          if (name.startsWith("on") || name === "xml:base" || ((name === "href" || name.endsWith(":href")) && !value.startsWith("#")) || externalUrl || /javascript:/i.test(value)) element.removeAttribute(attribute.name);
        });
      });
      exampleArt.append(document.importNode(svg, true));
    }

    function loadData() {
      const candidate = window.FlashSVGTerminationData;
      if (candidate === dataReference && data) return false;
      const valid = validate(candidate);
      if (valid === data && candidate === dataReference) return false;
      stop();
      dataReference = candidate;
      data = valid;
      invalidData = Boolean(candidate && !valid);
      tokenBudget = data ? Math.max(...names.map((name) => data.streams[name].tokens.length)) : 0;
      const flashFraction = data ? data.streams.flash.tokens.length / tokenBudget : 1;
      // A short Flash stream remains readable for at least 28% of the presentation.
      // This easing is shared by both columns; counts match until one stream ends.
      revealPower = flashFraction > 0 && flashFraction < 1 ? Math.max(1, Math.log(flashFraction) / Math.log(0.28)) : 1;
      elapsed = 0;
      clearStreams();
      renderExample();
      return true;
    }

    function updateChip(chip, token, index) {
      const displayLabel = token.kind === "coordinate" ? token.label.replace(/[()]/g, "").replace(/,/g, " ") : token.label;
      chip.textContent = showIds ? String(token.id) : displayLabel;
      chip.title = `${translate("Token", "Token")} ${index + 1} · ID ${token.id}${token.detail ? ` · ${token.detail}` : ""}`;
      chip.setAttribute("aria-label", `${displayLabel} · ID ${token.id}`);
    }

    function renderTokens(view, count) {
      if (!data) return;
      const sequence = data.streams[view.name].tokens;
      if (count < view.countValue) {
        view.list.replaceChildren();
        view.countValue = 0;
      }
      if (renderedLanguage !== language) [...view.list.children].forEach((chip, index) => updateChip(chip, sequence[index], index));
      if (count === view.countValue) return;
      view.list.lastElementChild?.classList.remove("is-new");
      const fragment = document.createDocumentFragment();
      for (let index = view.countValue; index < count; index += 1) {
        const token = sequence[index];
        const chip = document.createElement("span");
        chip.className = "token-chip";
        chip.dataset.kind = token.kind;
        chip.dataset.tokenId = String(token.id);
        chip.setAttribute("role", "listitem");
        updateChip(chip, token, index);
        if (index === count - 1) chip.classList.add("is-new");
        fragment.append(chip);
      }
      view.list.append(fragment);
      view.countValue = count;
      const pane = view.list.parentElement;
      if (pane) pane.scrollTop = pane.scrollHeight;
    }

    function followLatestTokens() {
      views.forEach((view) => {
        const pane = view.list.parentElement;
        if (pane && view.countValue) pane.scrollTop = pane.scrollHeight;
      });
    }

    function currentElapsed() {
      return Math.min(duration, elapsed + (playing ? performance.now() - startedAt : 0));
    }

    function countAtTime(name, time) {
      if (!data) return 0;
      const length = data.streams[name].tokens.length;
      return time >= duration ? length : Math.min(length, Math.floor(tokenBudget * Math.pow(time / duration, revealPower)));
    }

    function render() {
      const time = currentElapsed();
      const complete = Boolean(data) && time >= duration;
      const flashEnded = Boolean(data) && countAtTime("flash", time) === data.streams.flash.tokens.length;
      const phase = !data ? "pending" : complete ? "done" : playing ? "running" : time ? "paused" : "ready";
      container.dataset.phase = phase;
      container.classList.toggle("is-playing", playing);
      container.classList.toggle("is-complete", complete);
      container.classList.toggle("is-capped", complete);
      container.classList.toggle("has-eos", flashEnded);
      container.querySelectorAll("[data-context-bos]").forEach((chip) => {
        const bosId = data?.tokenizer?.bosId;
        chip.textContent = showIds && Number.isInteger(bosId) ? String(bosId) : "BOS";
        chip.dataset.tokenId = Number.isInteger(bosId) ? String(bosId) : "";
        chip.title = Number.isInteger(bosId) ? `BOS · ID ${bosId} · ${translate("Input prefix, excluded from the generated-token count", "输入前缀，不计入生成 token 数")}` : "BOS";
      });
      views.forEach((view) => {
        const sequence = data?.streams[view.name];
        const count = countAtTime(view.name, time);
        const ended = Boolean(sequence) && count === sequence.tokens.length;
        const state = !data ? "pending" : ended ? view.name === "flash" ? "eos" : "capped" : phase;
        renderTokens(view, count);
        view.count.textContent = count.toLocaleString("en-US");
        if (view.total) {
          view.total.textContent = sequence ? sequence.tokens.length.toLocaleString("en-US") : "—";
          view.total.title = translate("Total tokens in this sequence, not the generation cap", "该序列的 token 总数，不是生成上限");
        }
        view.progress?.style.setProperty("--progress", `${sequence ? count / sequence.tokens.length * 100 : 0}%`);
        view.card.dataset.state = state;
        if (view.state) {
          view.state.dataset.state = state;
          view.state.textContent = !data ? translate("WAITING", "待接入") : ended ? view.name === "flash" ? "EOS" : translate("CAP · NO EOS", "上限 · 无 EOS") : playing ? translate("GENERATING", "生成中") : time ? translate("PAUSED", "已暂停") : translate("READY", "就绪");
        }
        if (view.outcome) {
          view.outcome.dataset.state = state;
          const cap = sequence?.cap.toLocaleString("en-US");
          const total = sequence?.tokens.length.toLocaleString("en-US");
          view.outcome.textContent = !data ? translate("Real tokenizer IDs have not been loaded.", "尚未载入真实 tokenizer ID。") : ended ? view.name === "flash" ? translate(`EOS emitted at ${total} tokens · generation cap: ${cap}.`, `第 ${total} 个 token 输出 EOS 并结束 · 生成上限：${cap}。`) : translate(`${cap}-token cap reached without EOS. CAP is a stopping condition, not a token.`, `达到 ${cap}-token 上限仍无 EOS。CAP 是停止条件，不是 token。`) : view.name === "flash" ? translate(`Sequence total: ${total} tokens including EOS · generation cap: ${cap}.`, `序列共 ${total} 个 token（包含 EOS）· 生成上限：${cap}。`) : translate(`The stream continues until the ${cap}-token cap.`, `序列继续增长，直到 ${cap}-token 上限。`);
        }
      });
      if (!data) {
        status.textContent = invalidData ? translate("The supplied sequence data needs valid token IDs and matching EOS/cap endings.", "序列数据需包含有效 token ID，并与 EOS／上限结束条件一致。") : translate("Waiting for tokenizer code and encoded sequences. No illustrative token IDs have been substituted.", "等待 tokenizer 代码及其编码序列接入；当前未填入虚构 token ID。");
      } else {
        const provenance = data.kind === "recorded" ? translate("Recorded token sequences", "真实生成序列回放") : translate("Real tokenizer encodings · termination illustration, not recorded inference", "真实 tokenizer 编码 · 终止行为示意，并非真实推理记录");
        const playback = complete ? translate("OmniSVG: no EOS at the cap. FlashSVG: ended with EOS.", "OmniSVG 到上限仍无 EOS；FlashSVG 输出 EOS 并结束。") : playing ? translate("Automatic side-by-side playback.", "双栏自动播放中。") : time ? translate("Playback paused; continue or reset.", "播放已暂停，可继续或重置。") : translate("Ready for side-by-side playback.", "准备播放双栏序列。");
        status.textContent = `${provenance}. ${playback} ${translate("Playback timing is normalized and does not measure inference speed.", "播放时长经过演示编排，不代表推理速度。")}`;
      }
      if (sourceDetail) sourceDetail.textContent = data ? `${translate("Tokenizer", "Tokenizer")} ${data.tokenizer.model || ""} · EOS ID ${data.tokenizer.eosId}. ${localized(data.note)}` : translate("Tokenizer implementation, vocabulary IDs and source provenance will be read from the supplied code.", "将从提供的代码中读取 tokenizer 实现、词表 ID 及其来源。");
      if (renderedLanguage !== language) renderExample();
      renderedLanguage = language;
      if (run) {
        run.textContent = !data ? translate("Waiting for data", "等待数据") : playing ? translate("Pause", "暂停") : reducedMotion.matches ? translate("Show result", "显示结果") : motionPaused ? translate("Motion paused", "动效已暂停") :
          complete ? translate("Replay", "重播") : time ? translate("Continue", "继续") : translate("Play both streams", "播放两条序列");
        run.setAttribute("aria-pressed", String(playing));
        run.disabled = !data || (motionPaused && !reducedMotion.matches);
      }
      if (reset) {
        reset.disabled = !data;
        reset.setAttribute("aria-label", translate("Reset token comparison", "重置 token 对比"));
      }
      if (tokenView) {
        tokenView.disabled = !data;
        tokenView.setAttribute("aria-pressed", String(showIds));
        tokenView.textContent = showIds ? translate("Show path symbols", "显示命令与数字") : translate("Show token IDs", "显示 token ID");
      }
      followLatestTokens();
    }
    listen(window, "resize", followLatestTokens);

    function tick() {
      if (!playing || !active || !inViewport || !mayAnimate()) {
        stop();
        render();
        return;
      }
      if (currentElapsed() >= duration) {
        stop();
        elapsed = duration;
        resumeWanted = false;
      }
      render();
      if (playing) timer = window.setTimeout(tick, 60);
    }

    function start() {
      if (!data || playing || elapsed >= duration || !active || !inViewport || document.hidden) return;
      if (reducedMotion.matches) {
        stop();
        elapsed = duration;
        resumeWanted = false;
        render();
        return;
      }
      if (!mayAnimate()) return;
      playing = true;
      startedAt = performance.now();
      tick();
    }

    listen(run, "click", () => {
      if (playing) {
        resumeWanted = false;
        stop();
        render();
        return;
      }
      loadData();
      if (!data || (motionPaused && !reducedMotion.matches) || document.hidden) return;
      active = true;
      if (elapsed >= duration) {
        elapsed = 0;
        clearStreams();
      }
      if (reducedMotion.matches) {
        elapsed = duration;
        resumeWanted = false;
        render();
        return;
      }
      resumeWanted = true;
      start();
    });
    listen(reset, "click", () => {
      resumeWanted = false;
      stop();
      elapsed = 0;
      clearStreams();
      render();
    });
    listen(tokenView, "click", () => {
      if (!data) return;
      showIds = !showIds;
      views.forEach((view) => [...view.list.children].forEach((chip, index) => updateChip(chip, data.streams[view.name].tokens[index], index)));
      render();
    });
    listen(window, "flashsvg:highlight", (event) => {
      if (!["faster", "faithful", "termination"].includes(event.detail?.panel)) return;
      active = event.detail.panel === "termination";
      if (!active) stop();
      else if (resumeWanted) start();
      render();
    });
    listen(window, "flashsvg:termination-data", () => {
      loadData();
      render();
      if (active && resumeWanted) start();
    });
    listen(document, "visibilitychange", () => {
      if (!document.hidden && active && resumeWanted) start();
    });
    listen(reducedMotion, "change", () => {
      stop();
      render();
      if (active && resumeWanted) start();
    });

    if (typeof window.IntersectionObserver === "function") {
      viewportObserver = new window.IntersectionObserver((entries) => {
        const entry = entries.find((item) => item.target === container);
        if (!entry) return;
        inViewport = entry.isIntersecting && entry.intersectionRatio >= 0.2;
        if (!inViewport) stop();
        else if (active && resumeWanted) start();
        render();
      }, { threshold: [0, 0.2] });
      viewportObserver.observe(container);
    }

    controllers.push({
      pause() { stop(); render(); },
      refresh() {
        loadData();
        render();
        if (active && resumeWanted) start();
      },
      dispose() { resumeWanted = false; stop(); viewportObserver?.disconnect(); },
    });
    loadData();
    render();
  }

  mountDecode();
  mountTermination();

  const onMotion = (event) => {
    if (typeof event.detail?.paused !== "boolean" || motionPaused === event.detail.paused) return;
    motionPaused = event.detail.paused;
    controllers.forEach((controller) => motionPaused ? controller.pause() : controller.refresh());
  };
  listen(window, "flashsvg:motion", onMotion);
  listen(document, "flashsvg:motion", onMotion);
  const onLanguage = (event) => {
    language = ["en", "zh"].includes(event.detail?.language)
      ? event.detail.language
      : document.documentElement?.lang === "zh" ? "zh" : "en";
    controllers.forEach((controller) => controller.refresh());
  };
  listen(window, "flashsvg:language", onLanguage);
  listen(document, "flashsvg:language", onLanguage);
  listen(document, "visibilitychange", () => {
    if (document.hidden) controllers.forEach((controller) => controller.pause());
  });
  listen(reducedMotion, "change", () => controllers.forEach((controller) => controller.pause()));

  function cleanup() {
    if (disposed) return;
    disposed = true;
    controllers.forEach((controller) => controller.dispose());
    listeners.forEach((remove) => remove());
    mounted.delete(root);
  }
  mounted.set(root, cleanup);
  return cleanup;
}

window.FlashSVGLab = { ...window.FlashSVGLab, initSimulations };
})();
