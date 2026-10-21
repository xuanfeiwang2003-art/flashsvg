(() => {
  'use strict';

  function initializePipeline() {
    const root = document.querySelector('#pipeline-lab');
    if (!root || root.dataset.initialized === 'true') return;
    root.dataset.initialized = 'true';
    root.classList.add('pipeline-lab');

    // These labels and acceptance decisions illustrate the algorithm only.
    // They are not an actual OmniSVG tokenization or a FlashSVG inference trace.
    const draftLabels = ['M', '40,12', 'C', '58,12', '72,26', '72,44', 'L', '60,68', '40,76', '20,68', 'L', '8,44', '8,26', '24,12', 'Z', '#A7F3D0'];
    const stages = [
      {
        name: 'Draft', eyebrow: '01 / DIFFUSION MODE', title: 'Propose a whole block.',
        description: 'One diffusion pass proposes 16 tokens in parallel, conditioned on the already committed prefix. A proposal is not yet part of the output.',
        mode: 'qθ', modeName: 'Parallel proposal', blockTitle: '16 draft positions',
        marker: 'PROPOSED', status: '16 proposals · 0 new tokens committed',
        detailTitle: 'A draft is a proposal', detail: 'All 16 positions are available at once. The causal mode must check the draft before any of its tokens can be committed.',
        output: 'The output prefix is unchanged.', outputCount: '0 new tokens',
        legend: [['proposed', 'Proposed token']]
      },
      {
        name: 'Verify', eyebrow: '02 / CAUSAL MODE', title: 'Find the accepted prefix.',
        description: 'One causal pass of the same weights evaluates the draft positions. Speculative acceptance proceeds left to right. This example rejects token 7.',
        mode: 'pθ', modeName: 'Causal verification', blockTitle: 'Illustrative acceptance outcome',
        marker: 'CHECKED', status: '6 accepted · first rejection at position 7',
        detailTitle: 'Stop at the first rejection', detail: 'Tokens 1–6 are accepted. At token 7, the draft is rejected. Positions 8–16 cannot be committed from this block, even if they look plausible.',
        output: 'The accepted prefix can be retained; the suffix must be discarded.', outputCount: '6 accepted drafts',
        legend: [['accepted', 'Accepted prefix'], ['rejected', 'First rejection'], ['discarded', 'Unused suffix']]
      },
      {
        name: 'Commit', eyebrow: '03 / OUTPUT UPDATE', title: 'Resample, then continue.',
        description: 'Keep the accepted prefix and sample a replacement at the first rejection from the normalized residual distribution. Discard the draft suffix and start a fresh block.',
        mode: 'pθ', modeName: 'Verified continuation', blockTitle: 'Only verified continuation is retained',
        marker: 'COMMITTED', status: '6 accepted + 1 resampled · remaining draft discarded',
        detailTitle: 'Seven new output tokens', detail: 'The replacement shown as C is illustrative. The next block begins after this replacement, conditioned on the updated output prefix.',
        output: 'Accepted prefix + resampled token → next block.', outputCount: '7 new tokens',
        legend: [['accepted', 'Accepted prefix'], ['replacement', 'Resampled token'], ['discarded', 'Discarded draft']]
      }
    ];

    root.innerHTML = `
      <div class="pipeline-topline"><span class="pipeline-console-label"><span aria-hidden="true"></span> VERIFIED DECODING</span><span class="pipeline-concept-label">Conceptual walkthrough · not a model trace</span></div>
      <div class="pipeline-intro"><h3>From a parallel draft<br>to a verified prefix.</h3><p>One checkpoint. A diffusion mode to draft.<br>A causal mode to decide what stays.</p></div>
      <div class="pipeline-stage-tabs" role="tablist" aria-label="Decoding stages">
        ${stages.map((stage, index) => `<button class="pipeline-stage-tab" id="pipeline-tab-${index}" type="button" role="tab" aria-selected="${index === 0}" aria-controls="pipeline-stage-panel" tabindex="${index === 0 ? '0' : '-1'}" data-stage="${index}"><span class="pipeline-stage-number">0${index + 1}</span><span>${stage.name}</span><span class="pipeline-stage-arrow" aria-hidden="true">↗</span></button>`).join('')}
      </div>
      <div class="pipeline-stage-panel" id="pipeline-stage-panel" role="tabpanel" aria-labelledby="pipeline-tab-0" tabindex="0">
        <div class="pipeline-token-pane">
          <div class="pipeline-block-header"><span class="pipeline-block-title"></span><span class="pipeline-block-marker"></span></div>
          <div class="pipeline-token-grid" role="list" aria-label="Sixteen illustrative draft positions"></div>
          <div class="pipeline-legend" aria-label="Token states"></div>
          <div class="pipeline-output"><span class="pipeline-prefix-label">OUTPUT PREFIX</span><div class="pipeline-output-track"><span class="pipeline-existing-prefix">… prefix</span><span class="pipeline-output-tokens"></span><span class="pipeline-next-block" aria-hidden="true">→</span></div><p class="pipeline-output-description"></p></div>
        </div>
        <div class="pipeline-inspector"><span class="pipeline-eyebrow"></span><div class="pipeline-mode"><span class="pipeline-mode-symbol"></span><span class="pipeline-mode-name"></span></div><h4 class="pipeline-stage-title"></h4><p class="pipeline-stage-description"></p><div class="pipeline-detail"><strong class="pipeline-detail-title"></strong><p class="pipeline-detail-description"></p></div></div>
      </div>
      <div class="pipeline-controls"><div class="pipeline-status" role="status" aria-live="polite" aria-atomic="true"><span class="pipeline-status-indicator" aria-hidden="true"></span><span class="pipeline-status-text"></span></div><button class="pipeline-play" type="button" aria-pressed="false"><span class="pipeline-play-icon" aria-hidden="true">▶</span><span class="pipeline-play-label">Play sequence</span></button></div>
      <div class="pipeline-footnote"><p><strong>Why verify?</strong> Committed tokens follow the adapted checkpoint’s autoregressive distribution, up to floating-point rounding. This guarantee applies to the adapted model, not the original released checkpoint or visual correctness. If all 16 drafts are accepted, a bonus token is sampled; this example shows the first-rejection case.</p><p class="pipeline-repeat-note"><strong>Repeat until finished.</strong> Each new block is conditioned on the updated prefix. Continue until EOS or the 1,536-token cap.</p><p class="pipeline-motion-note" hidden>Reduced motion is enabled. Use the stage buttons to explore at your own pace.</p></div>
    `;

    const select = (selector) => root.querySelector(selector);
    const tabs = Array.from(root.querySelectorAll('.pipeline-stage-tab'));
    const grid = select('.pipeline-token-grid');
    const panel = select('.pipeline-stage-panel');
    const play = select('.pipeline-play');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let currentStage = 0;
    let playing = false;
    let timer = null;
    let inViewport = true;
    let globallyPaused = document.body.classList.contains('motion-paused');

    function render(stageIndex) {
      currentStage = stageIndex;
      const stage = stages[stageIndex];
      root.dataset.stage = String(stageIndex);
      panel.setAttribute('aria-labelledby', `pipeline-tab-${stageIndex}`);
      tabs.forEach((tab, index) => {
        tab.setAttribute('aria-selected', String(index === stageIndex));
        tab.tabIndex = index === stageIndex ? 0 : -1;
      });
      select('.pipeline-block-title').textContent = stage.blockTitle;
      select('.pipeline-block-marker').textContent = stage.marker;
      select('.pipeline-eyebrow').textContent = stage.eyebrow;
      select('.pipeline-mode-symbol').textContent = stage.mode;
      select('.pipeline-mode-name').textContent = stage.modeName;
      select('.pipeline-stage-title').textContent = stage.title;
      select('.pipeline-stage-description').textContent = stage.description;
      select('.pipeline-detail-title').textContent = stage.detailTitle;
      select('.pipeline-detail-description').textContent = stage.detail;
      select('.pipeline-output-description').textContent = stage.output;
      select('.pipeline-status-text').textContent = stage.status;

      grid.replaceChildren(...draftLabels.map((label, index) => {
        const token = document.createElement('div');
        token.className = 'pipeline-token';
        token.setAttribute('role', 'listitem');
        let state = 'proposed';
        let visibleLabel = label;
        let status = 'proposed';
        if (stageIndex > 0) {
          state = index < 6 ? 'accepted' : index === 6 ? (stageIndex === 1 ? 'rejected' : 'replacement') : 'discarded';
          status = state === 'replacement' ? 'resampled replacement for L' : state === 'discarded' ? (stageIndex === 1 ? 'unused after first rejection' : 'discarded draft') : state;
          if (stageIndex === 2 && index === 6) visibleLabel = 'C';
          if (stageIndex === 2 && index > 6) visibleLabel = '—';
        }
        token.classList.add(`pipeline-token-${state}`);
        token.setAttribute('aria-label', `Position ${index + 1}: ${visibleLabel}, ${status}`);
        const number = document.createElement('span');
        number.className = 'pipeline-token-position';
        number.textContent = String(index + 1).padStart(2, '0');
        number.setAttribute('aria-hidden', 'true');
        const value = document.createElement('code');
        value.textContent = visibleLabel;
        value.setAttribute('aria-hidden', 'true');
        const check = document.createElement('span');
        check.className = 'pipeline-token-mark';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = state === 'accepted' ? '✓' : state === 'rejected' ? '×' : state === 'replacement' ? '↻' : '';
        token.append(number, value, check);
        return token;
      }));

      select('.pipeline-legend').replaceChildren(...stage.legend.map(([state, label]) => {
        const legend = document.createElement('span');
        legend.className = `pipeline-legend-item pipeline-legend-${state}`;
        const dot = document.createElement('i');
        dot.setAttribute('aria-hidden', 'true');
        legend.append(dot, document.createTextNode(label));
        return legend;
      }));
      const outputTokens = select('.pipeline-output-tokens');
      outputTokens.replaceChildren();
      if (stageIndex === 0) {
        const empty = document.createElement('span');
        empty.className = 'pipeline-output-empty';
        empty.textContent = 'awaiting verification';
        outputTokens.append(empty);
      } else {
        const labels = draftLabels.slice(0, 6);
        if (stageIndex === 2) labels.push('C');
        labels.forEach((label, index) => {
          const chip = document.createElement('code');
          chip.className = stageIndex === 2 && index === 6 ? 'pipeline-output-replacement' : '';
          chip.textContent = label;
          outputTokens.append(chip);
        });
      }
      outputTokens.setAttribute('aria-label', stage.outputCount);
      updatePlayButton();
    }

    function updatePlayButton() {
      play.setAttribute('aria-pressed', String(playing));
      play.disabled = reducedMotion.matches || globallyPaused;
      select('.pipeline-play-icon').textContent = playing ? 'Ⅱ' : '▶';
      select('.pipeline-play-label').textContent = reducedMotion.matches ? 'Motion reduced' : globallyPaused ? 'Motion paused' : playing ? 'Pause sequence' : currentStage === 2 ? 'Replay sequence' : currentStage === 1 ? 'Continue sequence' : 'Play sequence';
    }

    function stopPlayback() {
      playing = false;
      window.clearTimeout(timer);
      timer = null;
      root.classList.remove('pipeline-playing');
      updatePlayButton();
    }

    function scheduleNext() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        if (!playing || !inViewport || document.hidden || reducedMotion.matches || globallyPaused) {
          stopPlayback();
          return;
        }
        const nextStage = currentStage + 1;
        if (nextStage >= stages.length) {
          stopPlayback();
          return;
        }
        render(nextStage);
        if (nextStage === stages.length - 1) stopPlayback();
        else scheduleNext();
      }, 2900);
    }

    function startPlayback() {
      if (reducedMotion.matches || document.hidden || !inViewport || globallyPaused) return;
      if (currentStage === stages.length - 1) render(0);
      playing = true;
      root.classList.add('pipeline-playing');
      updatePlayButton();
      scheduleNext();
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => {
        stopPlayback();
        render(index);
      });
      tab.addEventListener('keydown', (event) => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        stopPlayback();
        render(next);
        tabs[next].focus();
      });
    });
    play.addEventListener('click', () => playing ? stopPlayback() : startPlayback());

    function applyMotionPreference() {
      stopPlayback();
      select('.pipeline-motion-note').hidden = !reducedMotion.matches;
    }
    if (typeof reducedMotion.addEventListener === 'function') reducedMotion.addEventListener('change', applyMotionPreference);
    else if (typeof reducedMotion.addListener === 'function') reducedMotion.addListener(applyMotionPreference);

    document.addEventListener('flashmotionchange', (event) => {
      globallyPaused = Boolean(event.detail && event.detail.paused);
      applyMotionPreference();
    });

    if ('IntersectionObserver' in window) {
      const visibilityObserver = new IntersectionObserver((entries) => {
        inViewport = entries[0].isIntersecting;
        if (!inViewport) stopPlayback();
      }, { threshold: 0.08 });
      visibilityObserver.observe(root);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopPlayback();
    });
    window.addEventListener('pagehide', stopPlayback);
    render(0);
    applyMotionPreference();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializePipeline, { once: true });
  else initializePipeline();
})();
