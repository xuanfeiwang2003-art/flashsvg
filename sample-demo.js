(function () {
  'use strict';
  const root = document.getElementById('fs-demo');
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';
  const samples = window.FLASHSVG_SAMPLES;
  const engine = window.FlashSVGDemoEngine;
  const models = samples.map(sample => engine.buildSample(sample));
  const $ = id => root.querySelector('#fsd-' + id);
  const NS = 'http://www.w3.org/2000/svg';
  const cells = [];
  const buttons = [];
  const completed = new Set();
  let sampleIndex = 0, model = models[0], current = samples[0];
  let blockIndex = 0, elapsed = 0, committed = 0, playing = false, all = false;
  let raf = 0, previousTime = null, hold = 0, lastPhase = '', lastBlock = -1;
  let paths = [], atFinalArt = false;
  let activeSpeed = 'fast';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  for (let i = 0; i < 16; i++) {
    const cell = document.createElement('div');
    cell.className = 'token';
    cell.innerHTML = '<span class="number">' + String(i + 1).padStart(2, '0') + '</span><span class="state"></span><span class="value">—</span>';
    $('token-grid').appendChild(cell); cells.push(cell);
  }
  samples.forEach((sample, i) => {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.sample = sample.id;
    button.title = sample.name + ' · ' + sample.paths.length + ' paths';
    button.setAttribute('aria-label', 'Play ' + sample.name);
    button.setAttribute('aria-pressed', 'false');
    const img = document.createElement('img');
    img.src = sample.reference; img.alt = ''; img.width = 42; img.height = 42;
    button.appendChild(img);
    button.addEventListener('click', () => { all = false; load(i); start(); });
    $('example-picker').appendChild(button); buttons.push(button);
  });

  function duration(index) {
    const totals = { slow: 70000, fast: 8500 };
    const total = totals[activeSpeed] || totals.fast;
    const first = activeSpeed === 'fast' ? 600 : 1500;
    return index === 0 ? first : (total - first) / Math.max(1, model.blocks.length - 1);
  }
  function stopRAF() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; previousTime = null;
  }
  function controls() {
    $('play-symbol').textContent = playing ? 'Ⅱ' : '▶';
    $('play-label').textContent = playing ? 'Pause' : blockIndex >= model.blocks.length ? 'Replay sample' : committed ? 'Resume' : 'Play sample';
    $('play-all').classList.toggle('active', all);
    $('all-label').textContent = all ? 'Stop sequence' : 'Play all 5';
    $('step').disabled = blockIndex >= model.blocks.length;
    $('sequence-status').textContent = all ? 'PLAYING ALL 5' : '';
    $('studio-status').textContent = blockIndex >= model.blocks.length ? (playing && all ? 'Sample complete · next up' : 'Complete SVG') : playing ? 'Drawing in blocks of 16' : committed ? 'Paused · continue anytime' : 'Ready to draw';
    buttons.forEach((button, i) => {
      button.setAttribute('aria-pressed', String(i === sampleIndex));
      button.classList.toggle('completed', completed.has(i));
    });
  }
  function initCanvas() {
    atFinalArt = false; paths = [];
    const svg = $('drawing');
    svg.setAttribute('viewBox', current.viewBox || '0 0 512 512');
    svg.innerHTML = '';
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('transform', current.transform || '');
    svg.appendChild(group);
    current.paths.forEach(path => {
      const node = document.createElementNS(NS, 'path');
      node.setAttribute('fill', path.fill); node.setAttribute('d', '');
      group.appendChild(node); paths.push(node);
    });
    root.querySelector('.output-tile').classList.remove('complete');
  }
  function draw(count) {
    count = Math.max(0, Math.min(model.totalUnits, count));
    committed = count;
    if (count >= model.totalUnits) {
      if (!atFinalArt) {
        const original = new DOMParser().parseFromString(current.svg, 'image/svg+xml').documentElement;
        $('drawing').innerHTML = original.innerHTML;
        atFinalArt = true;
      }
      root.querySelector('.output-tile').classList.add('complete');
    } else {
      if (atFinalArt) initCanvas();
      model.ranges.forEach((range, i) => {
        const part = engine.pathAt(range, count);
        const node = paths[i];
        node.setAttribute('d', part.d);
        node.setAttribute('fill', part.complete ? range.fill : 'none');
        if (part.complete) {
          node.removeAttribute('stroke'); node.removeAttribute('stroke-width');
        } else {
          node.setAttribute('stroke', range.fill === 'none' ? '#705ad2' : range.fill);
          node.setAttribute('stroke-width', '2');
          node.setAttribute('stroke-linecap', 'round'); node.setAttribute('stroke-linejoin', 'round');
          node.setAttribute('vector-effect', 'non-scaling-stroke');
        }
      });
    }
    const donePaths = model.ranges.filter(range => count >= range.end).length;
    $('path-count').textContent = donePaths + ' / ' + current.paths.length;
    $('committed-count').textContent = count.toLocaleString('en-US');
    const percent = Math.floor(count / model.totalUnits * 100);
    $('percent').textContent = percent + '%';
    $('progress').value = blockIndex >= model.blocks.length ? model.blocks.length : blockIndex;
    $('progress').style.setProperty('--progress', percent + '%');
    $('drawing-status').textContent = count >= model.totalUnits ? 'Complete · EOS' : count ? 'Drawing' : 'Blank canvas';
    $('output-art').setAttribute('aria-label', current.name + ' drawing ' + percent + '% complete; ' + donePaths + ' completed paths');
  }
  function showPhase(phase, block) {
    const blockId = block ? block.index : -1;
    if (lastPhase === phase && lastBlock === blockId) return;
    lastPhase = phase; lastBlock = blockId;
    root.querySelectorAll('[data-fsd-phase]').forEach(tab => tab.classList.toggle('active', tab.dataset.fsdPhase === phase));
    $('outcome').classList.toggle('finished', phase === 'complete');
    if (!block) {
      cells.forEach(cell => { cell.className = 'token'; cell.querySelector('.value').textContent = '—'; cell.querySelector('.state').textContent = ''; });
      $('phase-label').textContent = 'global positions · sliding window';
      $('prefix-range').textContent = 'Committed: none';
      $('draft-range').textContent = 'Draft window: 1–16';
      $('next-range').textContent = 'A fresh window starts after the committed prefix.';
      cells.forEach((cell, i) => { cell.querySelector('.number').textContent = '#' + (i + 1); });
      $('outcome').textContent = 'Start with a blank canvas';
      $('phase-description').textContent = 'Draft 16 candidates together. Verify and commit a prefix. Repeat until the SVG is complete.';
      return;
    }
    $('block-current').textContent = String(block.index + 1).padStart(2, '0');
    const isCommit = phase === 'commit' || phase === 'complete';
    const rangeStart = block.start + 1;
    const rangeEnd = block.start + block.validCount;
    const prefixEnd = isCommit ? block.end : block.start;
    $('prefix-range').textContent = prefixEnd ? 'Committed: 1–' + prefixEnd : 'Committed: none';
    $('draft-range').textContent = (isCommit ? 'Verified: ' : 'Draft window: ') + rangeStart + '–' + rangeEnd;
    $('next-range').textContent = block.terminal && isCommit ? 'EOS · sample complete' : (isCommit ? 'Next fresh window: ' + (block.end + 1) + '–' + Math.min(model.totalUnits, block.end + 16) : '16 fresh candidates · global positions');
    cells.forEach((cell, i) => {
      let type = 'draft', value = block.candidates[i], mark = '';
      if (i >= block.validCount) { type = 'discarded'; value = '—'; }
      else if (phase === 'verify' || isCommit) {
        if (i < block.acceptCount) { type = 'accepted'; mark = '✓'; }
        else if (i === block.rejectionIndex) {
          type = isCommit ? 'replaced' : 'rejected'; mark = isCommit ? '↻' : '×';
          if (isCommit) value = model.stream[block.start + i];
        } else { type = 'discarded'; if (isCommit) value = '—'; }
      }
      cell.className = 'token ' + type;
      cell.querySelector('.number').textContent = i < block.validCount ? '#' + (block.start + i + 1) : '—';
      cell.querySelector('.value').textContent = value;
      cell.querySelector('.state').textContent = mark;
      cell.title = 'Global position ' + (block.start + i + 1) + ' · ' + value;
    });
    if (phase === 'draft') {
      $('phase-label').textContent = '16 candidates · one diffusion pass';
      $('phase-description').textContent = 'Condition on the committed prefix. Draft positions ' + rangeStart + '–' + rangeEnd + ' together.';
      $('outcome').textContent = 'Parallel draft · canvas waits for commit';
    } else if (phase === 'verify') {
      $('phase-label').textContent = 'shared weights · one causal pass';
      $('phase-description').textContent = 'One causal pass of the same weights evaluates the entire draft block.';
      $('outcome').textContent = block.rejectionIndex === null ? block.acceptCount + ' candidates accepted' : block.acceptCount + ' accepted · first rejection at #' + (block.start + block.rejectionIndex + 1);
    } else if (phase === 'complete') {
      $('phase-label').textContent = 'EOS · complete sample';
      $('phase-description').textContent = 'Generation ends at EOS. The committed blocks now form the complete original SVG.';
      $('outcome').textContent = current.name + ' complete · ' + model.blocks.length + ' rounds · EOS';
    } else {
      $('phase-label').textContent = 'commit prefix · update SVG canvas';
      if (block.rejectionIndex !== null) {
        $('phase-description').textContent = 'Commit through #' + block.end + ' and discard the suffix. Draft 16 fresh candidates from #' + (block.end + 1) + ' next.';
        $('outcome').textContent = block.acceptCount + ' accepted + #' + block.end + ' resampled · suffix discarded';
      } else if (block.bonus !== null) {
        $('phase-description').textContent = 'Accept all 16 candidates, sample a bonus token, then start a fresh window.';
        $('outcome').textContent = '+17 · 16 accepted + bonus ' + block.bonus;
      } else {
        $('phase-description').textContent = 'Commit the final prefix and EOS to finish the complete SVG sample.';
        $('outcome').textContent = '+' + (block.end - block.start) + ' · final block + EOS';
      }
    }
  }
  function load(index) {
    stopRAF(); playing = false;
    sampleIndex = index; current = samples[index]; model = models[index];
    blockIndex = 0; elapsed = 0; committed = 0; hold = 0; lastPhase = ''; lastBlock = -2;
    $('reference-art').src = current.reference;
    $('reference-art').alt = current.name + ' artwork from the paper';
    $('reference-name').textContent = current.name;
    $('output-name').textContent = current.name;
    $('sample-number').textContent = String(index + 1).padStart(2, '0');
    $('block-current').textContent = '01'; $('block-total').textContent = model.blocks.length;
    $('progress').max = model.blocks.length;
    initCanvas(); draw(0); showPhase('idle', null); controls();
  }
  function finish() {
    blockIndex = model.blocks.length;
    draw(model.totalUnits); completed.add(sampleIndex);
    showPhase('complete', model.blocks[model.blocks.length - 1]);
    if (!all || sampleIndex === samples.length - 1) { playing = false; all = false; stopRAF(); }
    else hold = 0;
    controls();
  }
  function tick(time) {
    raf = 0;
    if (!playing) return;
    const delta = previousTime === null ? 0 : Math.min(time - previousTime, 100);
    previousTime = time;
    if (blockIndex >= model.blocks.length) {
      hold += delta;
      if (all && hold >= ($('speed').value === 'fast' ? 500 : 1400)) { load(sampleIndex + 1); start(); return; }
    } else {
      elapsed += delta;
      while (blockIndex < model.blocks.length && elapsed >= duration(blockIndex)) {
        elapsed -= duration(blockIndex);
        const endCount = model.blocks[blockIndex].end; blockIndex++; draw(endCount);
        if (blockIndex === model.blocks.length) { finish(); break; }
      }
      if (blockIndex < model.blocks.length) {
        const block = model.blocks[blockIndex];
        const ratio = elapsed / duration(blockIndex);
        const phase = ratio < .34 ? 'draft' : ratio < .7 ? 'verify' : 'commit';
        showPhase(phase, block);
        if (phase === 'commit') {
          draw(block.end);
        }
      }
    }
    if (playing) raf = requestAnimationFrame(tick);
  }
  function start() {
    if (playing) return;
    if (blockIndex >= model.blocks.length && !(all && sampleIndex < samples.length - 1)) load(sampleIndex);
    playing = true; previousTime = null; controls(); raf = requestAnimationFrame(tick);
  }
  function pause() { playing = false; stopRAF(); controls(); }
  $('play').addEventListener('click', () => playing ? pause() : start());
  $('restart').addEventListener('click', () => { all = false; load(sampleIndex); start(); });
  $('play-all').addEventListener('click', () => {
    if (all) { all = false; pause(); }
    else { completed.clear(); all = true; load(0); start(); }
  });
  $('step').addEventListener('click', () => {
    all = false; pause();
    if (blockIndex >= model.blocks.length) return;
    const block = model.blocks[blockIndex]; blockIndex++; elapsed = 0;
    draw(block.end); showPhase('commit', block);
    if (blockIndex >= model.blocks.length) finish();
    controls();
  });
  $('progress').addEventListener('input', () => {
    const value = Number($('progress').value);
    all = false; pause(); blockIndex = value; elapsed = 0;
    if (value === 0) { draw(0); showPhase('idle', null); $('block-current').textContent = '01'; }
    else {
      draw(model.blocks[value - 1].end);
      showPhase(value === model.blocks.length ? 'complete' : 'commit', model.blocks[value - 1]);
      if (value === model.blocks.length) completed.add(sampleIndex);
    }
    controls();
  });
  $('speed').addEventListener('change', () => {
    const ratio = blockIndex < model.blocks.length ? elapsed / duration(blockIndex) : 0;
    activeSpeed = $('speed').value;
    if (blockIndex < model.blocks.length) elapsed = ratio * duration(blockIndex);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) pause(); });
  load(0);
  // Explicit controls are also available for visitors who request reduced motion.
  if (reducedMotion) $('studio-status').textContent = 'Ready · manual playback available';
}());
