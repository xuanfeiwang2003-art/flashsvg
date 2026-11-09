(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduce.matches;
  let language = 'en';
  try { language = localStorage.getItem('flashsvg-language') || 'en'; } catch (_) {}
  const isZh = () => document.documentElement.lang === 'zh';

  function setLanguage(lang) {
    language = lang === 'zh' ? 'zh' : 'en';
    document.documentElement.lang = language;
    $$('[data-en][data-zh]').forEach(el => { el.textContent = el.dataset[language]; });
    $('#language-toggle').textContent = isZh() ? 'EN' : '中文';
    $('#language-toggle').setAttribute('aria-label', isZh() ? 'Switch to English' : '切换为中文');
    $('#motion-toggle').setAttribute('aria-label', isZh() ? (paused ? '恢复动画' : '暂停动画') : (paused ? 'Resume animations' : 'Pause animations'));
    $('#menu-toggle').setAttribute('aria-label', isZh() ? '展开导航' : 'Open navigation');
    $('#figure-close').textContent = isZh() ? '关闭 ×' : 'Close ×';
    document.title = isZh() ? 'FlashSVG — 快速且忠实的 SVG 生成' : 'FlashSVG — Fast and Faithful SVG Generation';
    try { localStorage.setItem('flashsvg-language', language); } catch (_) {}
    window.dispatchEvent(new CustomEvent('flashsvg:language', { detail: { language } }));
  }

  window.FlashSVGLab?.initSimulations();
  window.FlashSVGLab?.initExplore();
  $('#language-toggle').addEventListener('click', () => setLanguage(isZh() ? 'en' : 'zh'));
  setLanguage(language);

  function setMotion(value) {
    paused = value;
    document.documentElement.classList.toggle('motion-paused', paused);
    $('#motion-toggle').textContent = paused ? '▷' : 'Ⅱ';
    $('#motion-toggle').setAttribute('aria-pressed', String(paused));
    $('#motion-toggle').setAttribute('aria-label', isZh() ? (paused ? '恢复动画' : '暂停动画') : (paused ? 'Resume animations' : 'Pause animations'));
    window.dispatchEvent(new CustomEvent('flashsvg:motion', { detail: { paused } }));
  }
  $('#motion-toggle').addEventListener('click', () => setMotion(!paused));
  reduce.addEventListener('change', e => setMotion(e.matches));
  setMotion(paused);

  function initHighlights() {
    const tabs = $$('[data-highlight]');
    const panels = ['faithful', 'termination', 'faster'];
    const destinations = { faithful: 'showcase', termination: 'diagnosis', faster: 'decode' };
    const hashPanels = { showcase: 'faithful', 'gallery-main': 'faithful', 'gallery-track': 'faithful', diagnosis: 'termination', 'termination-demo': 'termination', decode: 'faster', 'decode-demo': 'faster' };
    let selected = '';
    function select(name, { focus = false, updateHash = false } = {}) {
      if (!panels.includes(name)) return;
      tabs.forEach(tab => {
        const active = tab.dataset.highlight === name;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      panels.forEach(panel => { $(`#panel-${panel}`).hidden = panel !== name; });
      $('#highlights').dataset.activePanel = name;
      if (updateHash) history.replaceState(null, '', `#${destinations[name]}`);
      if (focus) $(`#highlight-${name}`).focus({ preventScroll: true });
      if (selected !== name) {
        selected = name;
        window.dispatchEvent(new CustomEvent('flashsvg:highlight', { detail: { panel: name } }));
      }
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab.dataset.highlight, { updateHash: true }));
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        if (next !== undefined) {
          event.preventDefault();
          select(tabs[next].dataset.highlight, { focus: true, updateHash: true });
        }
      });
    });
    document.addEventListener('click', event => {
      const anchor = event.target.closest('a[href^="#"]');
      if (!anchor) return;
      const id = anchor.getAttribute('href').slice(1);
      if (hashPanels[id]) select(hashPanels[id]);
    });
    window.addEventListener('hashchange', () => {
      const panel = hashPanels[location.hash.slice(1)];
      if (panel) select(panel);
    });
    select(hashPanels[location.hash.slice(1)] || 'faithful');
  }
  initHighlights();

  // Reveal only after handlers are mounted, so static content is usable without JS.
  document.documentElement.classList.add('js');
  if ('IntersectionObserver' in window) {
    const reveals = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      if (entry.target.contains($('#selection-demo'))) $('#selection-demo').classList.add('selecting');
      reveals.unobserve(entry.target);
    }), { threshold: 0.08 });
    $$('.reveal').forEach(el => reveals.observe(el));
    const navObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) $$('#navigation a').forEach(a => a.classList.toggle('active', a.hash === `#${entry.target.id}`));
    }), { rootMargin: '-20% 0px -55% 0px', threshold: 0 });
    $$('main section[id]').forEach(section => navObserver.observe(section));
  } else $$('.reveal').forEach(el => el.classList.add('is-visible'));

  const nav = $('#navigation');
  $('#menu-toggle').addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    $('#menu-toggle').setAttribute('aria-expanded', String(open));
    $('#menu-toggle').textContent = open ? '×' : '☰';
  });
  $$('#navigation a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('open');
    $('#menu-toggle').setAttribute('aria-expanded', 'false');
    $('#menu-toggle').textContent = '☰';
  }));

  let scrolling = false;
  function updateProgress() {
    const max = document.documentElement.scrollHeight - innerHeight;
    $('#reading-progress').style.width = `${max ? Math.min(100, scrollY / max * 100) : 0}%`;
    scrolling = false;
  }
  addEventListener('scroll', () => { if (!scrolling) { requestAnimationFrame(updateProgress); scrolling = true; } }, { passive: true });
  updateProgress();

  const dialog = $('#figure-dialog');
  let lastFigureTrigger;
  $$('.figure-trigger').forEach(button => button.addEventListener('click', () => {
    $('#figure-image').src = window.FlashSVGAssets?.[button.dataset.figure] || button.dataset.figure;
    $('#figure-image').alt = button.dataset.caption;
    $('#figure-caption').textContent = button.dataset.caption;
    lastFigureTrigger = button;
    dialog.showModal();
    $('#figure-close').focus();
  }));
  $('#figure-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => {
    if (e.target === dialog) {
      const b = dialog.getBoundingClientRect();
      if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) dialog.close();
    }
  });
  dialog.addEventListener('close', () => lastFigureTrigger?.focus({ preventScroll: true }));

  $('#selection-replay').addEventListener('click', () => {
    const demo = $('#selection-demo');
    demo.classList.remove('selecting');
    requestAnimationFrame(() => requestAnimationFrame(() => demo.classList.add('selecting')));
  });

  const resultTabs = $$('[data-result-tab]');
  function setResultTab(index, focus = false) {
    resultTabs.forEach((b, i) => {
      b.classList.toggle('active', i === index);
      b.setAttribute('aria-selected', String(i === index));
      b.tabIndex = i === index ? 0 : -1;
      $(`#result-${b.dataset.resultTab}`).hidden = i !== index;
    });
    if (focus) resultTabs[index].focus();
  }
  resultTabs.forEach((b, i) => {
    b.addEventListener('click', () => setResultTab(i));
    b.addEventListener('keydown', e => {
      let target;
      if (e.key === 'ArrowRight') target = (i + 1) % resultTabs.length;
      if (e.key === 'ArrowLeft') target = (i + resultTabs.length - 1) % resultTabs.length;
      if (e.key === 'Home') target = 0;
      if (e.key === 'End') target = resultTabs.length - 1;
      if (target !== undefined) { e.preventDefault(); setResultTab(target, true); }
    });
  });

  let toastTimer;
  function toast(text) {
    const el = $('#toast');
    clearTimeout(toastTimer);
    el.textContent = text;
    el.classList.add('visible');
    toastTimer = setTimeout(() => el.classList.remove('visible'), 3000);
  }
  $('#copy-reference').addEventListener('click', async () => {
    const text = 'FlashSVG: Fast and Faithful SVG Generation via Block Diffusion. Anonymous research manuscript.';
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const area = document.createElement('textarea');
        area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
        document.body.append(area); area.select();
        const success = document.execCommand('copy'); area.remove();
        if (!success) throw new Error('Clipboard unavailable');
      }
      toast(isZh() ? '论文信息已复制' : 'Paper reference copied');
    } catch (_) { toast(isZh() ? '请从完整论文中复制引用信息' : 'Please copy the reference from the manuscript'); }
  });

  // Ambient coordinates are an interface motif, not model outputs or measurements.
  const canvas = $('#field-canvas');
  const context = canvas.getContext('2d');
  if (context) {
    let width = 0, height = 0, frame = 0, visible = true, animation = 0, last = 0;
    const particles = Array.from({ length: 34 }, (_, i) => ({ x: ((i * 137.5) % 100) / 100, y: ((i * 71.3) % 100) / 100, s: .3 + i % 4 * .12 }));
    function size() {
      width = canvas.clientWidth; height = canvas.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = width * ratio; canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      paint();
    }
    function paint() {
      context.clearRect(0, 0, width, height);
      const points = particles.map(p => ({ x: (p.x * width + Math.sin(frame * .003 + p.y * 15) * 15), y: (p.y * height + Math.cos(frame * .002 + p.x * 10) * 12) }));
      points.forEach((p, i) => {
        context.fillStyle = i % 5 === 0 ? 'rgba(97,232,212,.48)' : 'rgba(106,166,255,.22)';
        context.fillRect(p.x, p.y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
        if (i % 3) return;
        points.slice(i + 1).forEach(q => {
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < 170) { context.strokeStyle = `rgba(87,140,181,${.08 * (1 - d / 170)})`; context.beginPath(); context.moveTo(p.x, p.y); context.lineTo(q.x, q.y); context.stroke(); }
        });
      });
    }
    function tick(time) {
      animation = 0;
      if (paused || reduce.matches || !visible || document.hidden) return;
      if (time - last > 40) { frame++; paint(); last = time; }
      animation = requestAnimationFrame(tick);
    }
    function restart() { if (!animation && !paused && !reduce.matches && visible && !document.hidden) animation = requestAnimationFrame(tick); }
    window.addEventListener('flashsvg:motion', () => { if (paused && animation) { cancelAnimationFrame(animation); animation = 0; } else restart(); });
    document.addEventListener('visibilitychange', restart);
    addEventListener('resize', size, { passive: true });
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; restart(); }).observe(canvas);
    size(); restart();
  }
})();
