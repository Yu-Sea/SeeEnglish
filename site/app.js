(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const pad2 = (value) => String(value).padStart(2, '0');

  const ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
  const normalize = (value) =>
    String(value ?? '')
      .replace(/’/g, "'")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

  const todayLabel = () => {
    const now = new Date();
    return `${pad2(now.getMonth() + 1)}.${pad2(now.getDate())}`;
  };

  const IRREGULAR = {
    be: {
      am: '第一人称单数',
      is: '第三人称单数',
      are: '复数',
      was: '过去式',
      were: '过去式',
      been: '过去分词',
      being: '现在分词',
    },
    have: { has: '第三人称单数', had: '过去式 / 过去分词', having: '现在分词' },
    do: { does: '第三人称单数', did: '过去式', done: '过去分词', doing: '现在分词' },
    go: { goes: '第三人称单数', went: '过去式', gone: '过去分词', going: '现在分词' },
    say: { said: '过去式 / 过去分词' },
    get: { got: '过去式 / 过去分词', gotten: '过去分词' },
    make: { made: '过去式 / 过去分词' },
    know: { knew: '过去式', known: '过去分词' },
    think: { thought: '过去式 / 过去分词' },
    take: { took: '过去式', taken: '过去分词' },
    see: { saw: '过去式', seen: '过去分词' },
    come: { came: '过去式' },
    find: { found: '过去式 / 过去分词' },
    give: { gave: '过去式', given: '过去分词' },
    tell: { told: '过去式 / 过去分词' },
    feel: { felt: '过去式 / 过去分词' },
    leave: { left: '过去式 / 过去分词' },
    run: { ran: '过去式' },
    write: { wrote: '过去式', written: '过去分词' },
    child: { children: '复数' },
    person: { people: '复数' },
    man: { men: '复数' },
    woman: { women: '复数' },
    mouse: { mice: '复数' },
    foot: { feet: '复数' },
    tooth: { teeth: '复数' },
    life: { lives: '复数' },
    leaf: { leaves: '复数' },
    good: { better: '比较级', best: '最高级' },
    bad: { worse: '比较级', worst: '最高级' },
    far: { farther: '比较级', farthest: '最高级', further: '比较级', furthest: '最高级' },
  };

  const IRREGULAR_REVERSE = new Map();
  Object.entries(IRREGULAR).forEach(([base, forms]) => {
    Object.entries(forms).forEach(([form, label]) => {
      if (!IRREGULAR_REVERSE.has(form)) {
        IRREGULAR_REVERSE.set(form, { base, label });
      }
    });
  });

  const UNINFLECTED = new Set([
    'news',
    'series',
    'species',
    'means',
    'physics',
    'mathematics',
    'economics',
    'politics',
    'ethics',
    'chaos',
    'gas',
    'bus',
    'plus',
    'this',
    'his',
    'its',
    'us',
    'as',
    'is',
    'was',
    'yes',
    'always',
    'perhaps',
    'across',
    'unless',
  ]);

  const ED_EXCEPTIONS = new Set([
    'bed',
    'red',
    'shed',
    'sled',
    'wed',
    'need',
    'feed',
    'seed',
    'speed',
    'deed',
    'reed',
    'weed',
    'hundred',
    'naked',
    'wicked',
    'sacred',
    'rugged',
    'aged',
  ]);

  const ING_EXCEPTIONS = new Set([
    'thing',
    'nothing',
    'something',
    'anything',
    'everything',
    'morning',
    'evening',
    'ceiling',
    'during',
    'string',
    'spring',
    'bring',
  ]);

  function addCandidate(set, value, allowShort = false) {
    const candidate = String(value ?? '').trim();
    if (!candidate || !/^[a-z][a-z' -]*$/.test(candidate)) return;
    if (allowShort || candidate.length >= 3) set.add(candidate);
  }

  function lemmaCandidates(rawWord) {
    const word = normalize(rawWord);
    const candidates = new Set([word]);
    if (!word) return candidates;

    const irregular = IRREGULAR_REVERSE.get(word);
    if (irregular) addCandidate(candidates, irregular.base, true);

    if (word.endsWith("'s")) addCandidate(candidates, word.slice(0, -2));

    if (word.endsWith('ies') && word.length >= 5) {
      addCandidate(candidates, `${word.slice(0, -3)}y`);
    }
    if (word.endsWith('ves') && word.length >= 5) {
      addCandidate(candidates, `${word.slice(0, -3)}f`);
      addCandidate(candidates, `${word.slice(0, -3)}fe`);
    }
    if (word.endsWith('es') && word.length >= 4) {
      addCandidate(candidates, word.slice(0, -2));
      addCandidate(candidates, word.slice(0, -1));
    }
    if (
      word.endsWith('s') &&
      !/(ss|us|is)$/.test(word) &&
      !UNINFLECTED.has(word) &&
      word.length >= 4
    ) {
      addCandidate(candidates, word.slice(0, -1));
    }

    if (word.endsWith('ied') && word.length >= 5) {
      addCandidate(candidates, `${word.slice(0, -3)}y`);
    }
    if (word.endsWith('ed') && word.length >= 4 && !ED_EXCEPTIONS.has(word)) {
      const stem = word.slice(0, -2);
      addCandidate(candidates, stem);
      addCandidate(candidates, `${stem}e`);
      if (
        stem.length >= 4 &&
        stem.slice(-1) === stem.slice(-2, -1) &&
        !'aeiouwxy'.includes(stem.slice(-1))
      ) {
        addCandidate(candidates, stem.slice(0, -1));
      }
    }

    if (word.endsWith('ying') && word.length >= 6) {
      addCandidate(candidates, `${word.slice(0, -4)}ie`);
    }
    if (word.endsWith('ing') && word.length >= 5 && !ING_EXCEPTIONS.has(word)) {
      const stem = word.slice(0, -3);
      addCandidate(candidates, stem);
      addCandidate(candidates, `${stem}e`);
      if (
        stem.length >= 4 &&
        stem.slice(-1) === stem.slice(-2, -1) &&
        !'aeiouwxy'.includes(stem.slice(-1))
      ) {
        addCandidate(candidates, stem.slice(0, -1));
      }
    }

    if (word.endsWith('ier') && word.length >= 5) {
      addCandidate(candidates, `${word.slice(0, -3)}y`);
    }
    if (word.endsWith('iest') && word.length >= 6) {
      addCandidate(candidates, `${word.slice(0, -4)}y`);
    }

    return candidates;
  }

  function relationLabel(query, headword) {
    const q = normalize(query);
    const head = normalize(headword);
    if (q === head) return '原形';

    const irregular = IRREGULAR_REVERSE.get(q);
    if (irregular && irregular.base === head) return irregular.label;

    const reverse = IRREGULAR_REVERSE.get(head);
    if (reverse && reverse.base === q) return '原形';

    if (q.endsWith('iest')) return '最高级';
    if (q.endsWith('ier')) return '比较级';
    if (q.endsWith('ing')) return '现在分词';
    if (q.endsWith('ied') || q.endsWith('ed')) return '过去式 / 过去分词';
    if (q.endsWith('ies') || q.endsWith('es') || q.endsWith('s')) return '复数 / 第三人称单数';
    if (q.startsWith(head)) return '同词形态';
    if (head.startsWith(q)) return '原形';
    return '相关形态';
  }

  const SAMPLE_ENTRIES = [
    {
      id: 1,
      word: 'serendipity',
      forms: [],
      sentences: ['Serendipity is the accident of finding something good without looking for it.'],
      note: '意外的幸运；在无意中发现美好事物的能力。',
      related: [{ id: 4, word: 'ephemeral' }],
      date: '10.24',
    },
    {
      id: 2,
      word: 'apple',
      forms: ['apples'],
      sentences: ['She kept an apple in her bag for the walk home.'],
      note: '苹果。也可以指“珍视的人”：the apple of my eye。',
      related: [{ id: 3, word: 'study' }],
      date: '10.23',
    },
    {
      id: 3,
      word: 'study',
      forms: ['studies', 'studied'],
      sentences: ['I study the words I meet, not the ones I memorize.'],
      note: '学习；研究。名词还有“书房”的意思。',
      related: [{ id: 2, word: 'apple' }],
      date: '10.22',
    },
    {
      id: 4,
      word: 'ephemeral',
      forms: [],
      sentences: ['The light was beautiful because it was ephemeral.'],
      note: '短暂的；转瞬即逝的。',
      related: [{ id: 1, word: 'serendipity' }],
      date: '10.21',
    },
    {
      id: 5,
      word: 'run',
      forms: ['ran', 'running'],
      sentences: ['The thought kept running through my mind.'],
      note: '跑；运行；连续。熟词僻义：经营（run a shop）。',
      related: [],
      date: '10.20',
    },
  ];

  let entries = SAMPLE_ENTRIES.map((entry) => ({
    ...entry,
    forms: [...entry.forms],
    sentences: [...entry.sentences],
    related: entry.related.map((item) => ({ ...item })),
  }));
  let nextEntryId = Math.max(...entries.map((entry) => entry.id)) + 1;

  const demo = {
    query: '',
    matches: [],
    selected: null,
    pendingForm: '',
    matching: false,
    phase: 'idle',
    mode: 'new',
    target: null,
    sourceForm: '',
    relations: [],
    savedEntry: null,
  };

  const library = {
    view: 'words',
    query: '',
    expandedId: null,
  };

  let dom = {};
  let matchTimer = 0;
  let toastTimer = 0;
  let activeSection = 'home';
  let revealObserver = null;
  let scrollTicking = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function findMatches(rawQuery) {
    const query = normalize(rawQuery);
    if (!query) return [];

    const queryLemmas = lemmaCandidates(query);
    const results = [];

    entries.forEach((entry) => {
      const head = normalize(entry.word);
      const forms = entry.forms.map(normalize);
      let type = null;
      let score = 0;
      let label = '';

      if (query === head) {
        type = 'exact';
        score = 100;
        label = '完全匹配';
      } else if (forms.includes(query)) {
        type = 'stored';
        score = 96;
        label = '已记录形态';
      } else if (queryLemmas.has(head)) {
        type = 'derived';
        score = 88;
        label = relationLabel(query, head);
      } else if (forms.some((form) => queryLemmas.has(form))) {
        type = 'derived';
        score = 84;
        label = relationLabel(query, head);
      } else if (forms.some((form) => lemmaCandidates(form).has(query))) {
        type = 'related';
        score = 74;
        label = '词库中已有变体';
      } else if (lemmaCandidates(head).has(query)) {
        type = 'related';
        score = 72;
        label = '词库中已有变体';
      }

      if (!type) return;
      results.push({
        ...entry,
        match_type: type,
        relation_label: label,
        matched_form: type === 'derived' || type === 'stored' ? query : entry.word,
        _score: score,
      });
    });

    return results
      .sort((a, b) => b._score - a._score || a.id - b.id)
      .slice(0, 6)
      .map(({ _score, ...entry }) => entry);
  }

  function cacheDom() {
    dom = {
      header: $('#site-header'),
      progress: $('#scroll-progress-bar'),
      sections: $$('.site-section'),
      navLinks: $$('[data-nav]'),
      dockIndicator: $('#dock-indicator'),
      homeForm: $('#home-search'),
      homeQuery: $('#home-query'),
      demoForm: $('#demo-form'),
      demoQuery: $('#demo-query'),
      demoSubmit: $('#demo-submit'),
      demoMatch: $('#demo-match'),
      demoCaption: $('#demo-caption'),
      demoQuick: $('#demo-quick'),
      demoLoading: $('#demo-loading'),
      demoClear: $('#demo-clear'),
      demoPage: $('#demo-page'),
      demoComposer: $('#demo-composer'),
      libraryTabs: $('#library-tabs'),
      libraryQuery: $('#library-query'),
      libraryContent: $('#library-content'),
      libraryWordCount: $('#library-word-count'),
      librarySentenceCount: $('#library-sentence-count'),
      libraryUpdated: $('#library-updated'),
      copyRepo: $('#copy-repo'),
      toast: $('#site-toast'),
    };
  }

  function init() {
    cacheDom();
    if (!dom.demoForm || !dom.libraryContent) return;

    document.documentElement.classList.add('js');
    bindNavigation();
    bindHome();
    bindDemo();
    bindLibrary();
    bindCopy();
    renderLibrary();
    renderSearchUI();
    setupReveal();
    updateScrollUI();

    window.addEventListener(
      'scroll',
      () => {
        if (scrollTicking) return;
        scrollTicking = true;
        window.requestAnimationFrame(() => {
          updateScrollUI();
          scrollTicking = false;
        });
      },
      { passive: true },
    );
    window.addEventListener('resize', updateScrollUI, { passive: true });
    window.addEventListener('load', updateScrollUI, { once: true });
  }

  function bindNavigation() {
    dom.navLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        const hash = link.getAttribute('href');
        const target = hash ? document.querySelector(hash) : null;
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'start',
        });
        setActive(link.dataset.nav || 'home');
        try {
          window.history.replaceState(null, '', hash);
        } catch {
          // file:// previews can reject history operations; scrolling still works.
        }
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (activeSection === 'home') {
        event.preventDefault();
        dom.homeQuery.focus();
      } else if (activeSection === 'experience') {
        event.preventDefault();
        dom.demoQuery.focus();
      } else if (activeSection === 'features') {
        event.preventDefault();
        dom.libraryQuery?.focus();
      }
    });
  }

  function setActive(sectionId) {
    if (!sectionId) return;
    if (activeSection !== sectionId) activeSection = sectionId;
    const links = dom.navLinks;
    let index = 0;

    links.forEach((link, linkIndex) => {
      const isActive = link.dataset.nav === sectionId;
      if (isActive) index = linkIndex;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    if (dom.dockIndicator) {
      dom.dockIndicator.style.transform = `translate3d(${index * 100}%, 0, 0)`;
    }
  }

  function updateScrollUI() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const pageHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = pageHeight > 0 ? Math.min(1, Math.max(0, scrollTop / pageHeight)) : 0;

    if (dom.progress) dom.progress.style.transform = `scaleX(${progress})`;
    if (dom.header) dom.header.classList.toggle('is-scrolled', scrollTop > 14);

    const probe = scrollTop + window.innerHeight * 0.34;
    let current = dom.sections[0];
    dom.sections.forEach((section) => {
      if (section.offsetTop <= probe) current = section;
    });
    if (current?.dataset.section) setActive(current.dataset.section);
  }

  function bindHome() {
    dom.homeForm.addEventListener('submit', (event) => {
      event.preventDefault();
      goExperience(dom.homeQuery.value.trim());
    });

    $$('[data-try]').forEach((button) => {
      button.addEventListener('click', () => goExperience(button.dataset.try || ''));
    });

    $$('[data-demo-try]').forEach((button) => {
      button.addEventListener('click', () => {
        setDemoQuery(button.dataset.demoTry || '');
        dom.demoQuery.focus({ preventScroll: true });
      });
    });
  }

  function goExperience(query) {
    if (query) setDemoQuery(query);
    document.querySelector('#experience')?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
    window.setTimeout(() => {
      dom.demoQuery.focus({ preventScroll: true });
    }, reducedMotion ? 30 : 520);
  }

  function setDemoQuery(query) {
    window.clearTimeout(matchTimer);
    demo.query = query;
    dom.demoQuery.value = query;
    demo.matches = [];
    demo.selected = null;
    demo.pendingForm = '';
    demo.matching = false;
    demo.phase = 'idle';
    demo.mode = 'new';
    demo.target = null;
    demo.sourceForm = '';
    demo.relations = [];
    demo.savedEntry = null;
    dom.demoComposer.innerHTML = '';
    renderSearchUI();

    if (query.trim()) {
      demo.matching = true;
      renderSearchUI();
      scheduleMatch();
    }
  }

  function handleDemoInput() {
    window.clearTimeout(matchTimer);
    demo.query = dom.demoQuery.value;
    demo.matches = [];
    demo.selected = null;
    demo.pendingForm = '';
    demo.phase = 'idle';
    demo.mode = 'new';
    demo.target = null;
    demo.sourceForm = '';
    demo.relations = [];
    demo.savedEntry = null;
    dom.demoComposer.innerHTML = '';

    if (demo.query.trim()) {
      demo.matching = true;
      renderSearchUI();
      scheduleMatch();
    } else {
      demo.matching = false;
      renderSearchUI();
    }
  }

  function scheduleMatch() {
    window.clearTimeout(matchTimer);
    matchTimer = window.setTimeout(() => {
      if (!demo.query.trim() || demo.phase !== 'idle') return;
      demo.matches = findMatches(demo.query);
      demo.selected =
        demo.matches.find(
          (match) => match.match_type === 'exact' || match.match_type === 'stored',
        ) || null;
      demo.matching = false;
      renderSearchUI();
    }, 150);
  }

  function bindDemo() {
    dom.demoForm.addEventListener('submit', (event) => {
      event.preventDefault();
      openComposer();
    });

    dom.demoQuery.addEventListener('input', handleDemoInput);

    dom.demoQuery.addEventListener('keydown', (event) => {
      if (
        event.key === 'Tab' &&
        demo.matches[0] &&
        (demo.matches[0].match_type === 'derived' || demo.matches[0].match_type === 'related')
      ) {
        event.preventDefault();
        chooseMatch(demo.matches[0].id);
      }
    });

    dom.demoClear.addEventListener('click', () => {
      setDemoQuery('');
      dom.demoQuery.focus();
    });

    dom.demoMatch.addEventListener('click', (event) => {
      const row = event.target.closest('[data-match-id]');
      if (!row) return;
      chooseMatch(Number(row.dataset.matchId));
    });

    dom.demoComposer.addEventListener('click', (event) => {
      if (event.target.closest('[data-success-again]')) {
        resetDemo();
        return;
      }
      if (event.target.closest('[data-success-library]')) {
        goLibrary();
      }
    });
  }

  function chooseMatch(id) {
    const match = demo.matches.find((item) => item.id === id);
    if (!match) return;

    const original = demo.query.trim();
    const isSoft = match.match_type === 'derived' || match.match_type === 'related';
    demo.query = match.word;
    dom.demoQuery.value = match.word;
    demo.matches = findMatches(match.word);
    demo.selected =
      demo.matches.find(
        (item) => item.match_type === 'exact' || item.match_type === 'stored',
      ) || match;
    demo.pendingForm =
      isSoft && normalize(original) !== normalize(match.word) ? original : '';
    demo.matching = false;
    renderSearchUI();
    dom.demoQuery.focus();
  }

  function openComposer() {
    if (!demo.query.trim() || demo.phase !== 'idle' || demo.matching) return;

    const target =
      demo.selected && entries.find((entry) => entry.id === demo.selected.id)
        ? entries.find((entry) => entry.id === demo.selected.id)
        : null;
    demo.mode = target ? 'supplement' : 'new';
    demo.target = target || null;
    demo.sourceForm = target
      ? demo.pendingForm ||
        (normalize(demo.query) !== normalize(target.word) ? demo.query.trim() : '')
      : '';
    demo.relations = [];
    demo.phase = 'composing';
    renderSearchUI();
    renderComposer();

    window.setTimeout(() => {
      $('.composer-card', dom.demoComposer)?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
      });
    }, 80);
  }

  function renderSearchUI() {
    if (!dom.demoSubmit) return;

    const isSupp = Boolean(demo.selected) || (demo.phase === 'composing' && demo.mode === 'supplement');
    let label = '记词';
    if (demo.phase === 'saved') label = '已收录';
    else if (demo.phase === 'composing') label = demo.mode === 'supplement' ? '补充中' : '记录中';
    else if (demo.selected) label = '补充';

    dom.demoSubmit.disabled =
      demo.phase !== 'idle' || !demo.query.trim() || demo.matching;
    dom.demoSubmit.classList.toggle('is-supplement', isSupp);
    const labelNode = dom.demoSubmit.querySelector('span');
    if (labelNode) labelNode.textContent = label;
    const useNode = dom.demoSubmit.querySelector('use');
    if (useNode) {
      useNode.setAttribute(
        'href',
        demo.phase === 'saved' || demo.phase === 'composing'
          ? '#i-check'
          : demo.selected
            ? '#i-arrow-up-right'
            : '#i-plus',
      );
    }

    dom.demoQuery.readOnly = demo.phase !== 'idle';
    dom.demoLoading.hidden = !demo.matching;
    dom.demoClear.hidden = !(
      demo.phase === 'idle' &&
      demo.query.length > 0 &&
      !demo.matching
    );

    dom.demoPage.classList.toggle('is-idle', demo.phase === 'idle');
    dom.demoPage.classList.toggle('is-composing', demo.phase !== 'idle');
    dom.demoQuick.classList.toggle('is-hidden', demo.phase !== 'idle');
    dom.demoMatch.innerHTML = renderMatchPanel();

    if (demo.phase === 'idle' && demo.selected) {
      dom.demoCaption.innerHTML = `已选择 <b>${escapeHTML(demo.selected.word)}</b> · 点击「补充」继续`;
    } else if (demo.phase === 'idle' && demo.query.trim()) {
      dom.demoCaption.innerHTML = '按 <kbd>Tab</kbd> 取第一个候选 · 直接记词则单独收录';
    } else if (demo.phase === 'composing') {
      dom.demoCaption.textContent =
        demo.mode === 'supplement'
          ? '为已有词条补充新的语境'
          : '把遇见的语境一起留下';
    } else if (demo.phase === 'saved') {
      dom.demoCaption.textContent = '已保存在当前演示中 · 刷新页面即重置';
    } else {
      dom.demoCaption.innerHTML =
        '支持复数、过去式与不规则形态 · 按 <kbd>Tab</kbd> 取第一个候选';
    }
  }

  function renderMatchPanel() {
    if (!demo.query.trim() || demo.phase !== 'idle') return '';

    if (demo.matching) {
      return `
        <div class="match-panel match-panel--loading" aria-hidden="true">
          <div class="match-panel__head"><span class="eyebrow">SEARCHING INDEX</span></div>
          <div class="skeleton-row"><span></span><span></span></div>
          <div class="skeleton-row"><span></span><span></span></div>
        </div>`;
    }

    if (!demo.matches.length) {
      return `
        <div class="match-panel match-panel--new">
          <div class="new-match">
            <span class="new-match__icon">
              <svg class="icon" aria-hidden="true"><use href="#i-file"></use></svg>
            </span>
            <div>
              <p class="new-match__title">这个索引还没有被建立</p>
              <p class="new-match__copy">点击右侧「记词」，留下例句和属于你的理解。</p>
            </div>
          </div>
        </div>`;
    }

    const hasSoft = demo.matches.some(
      (match) => match.match_type === 'derived' || match.match_type === 'related',
    );

    return `
      <div class="match-panel">
        <div class="match-panel__head">
          <span class="eyebrow">词库匹配</span>
          <span class="match-panel__count">${pad2(demo.matches.length)}</span>
        </div>
        <div class="match-panel__list">
          ${demo.matches
            .map((match) => {
              const label = matchLabel(match);
              const note = match.note || match.sentences[0] || '还没有联想，补充它。';
              const showForm =
                match.match_type === 'derived' && match.matched_form !== match.word;
              return `
                <button
                  type="button"
                  class="match-row ${demo.selected?.id === match.id ? 'is-selected' : ''}"
                  data-match-id="${match.id}"
                >
                  <span class="match-row__body">
                    <span class="match-row__title">
                      <span class="match-row__word">${escapeHTML(match.word)}</span>
                      ${showForm ? `<span class="match-row__form">${escapeHTML(match.matched_form)}</span>` : ''}
                      <span class="match-badge match-badge--${match.match_type}">${escapeHTML(label)}</span>
                    </span>
                    <span class="match-row__note">${escapeHTML(note)}</span>
                  </span>
                  <span class="match-row__arrow">
                    <svg class="icon icon--small" aria-hidden="true"><use href="#i-arrow-up-right"></use></svg>
                  </span>
                </button>`;
            })
            .join('')}
        </div>
        <div class="match-panel__foot">
          ${
            hasSoft
              ? '<span><kbd>Tab</kbd> 取第一个到输入框</span><span>直接记词则单独收录</span>'
              : '<span>同形索引已存在 · 记词会自动变成「补充」</span>'
          }
        </div>
      </div>`;
  }

  function matchLabel(match) {
    if (match.match_type === 'exact') return '完全匹配';
    if (match.match_type === 'stored') return '已记录形态';
    if (match.match_type === 'related') return '已有变体';
    return match.relation_label;
  }

  function renderComposer() {
    const isUpdate = demo.mode === 'supplement' && demo.target;
    const word = isUpdate ? demo.target.word : demo.query.trim();
    const meta = isUpdate
      ? `<span>${pad2(demo.target.sentences.length)} 句</span>
         <span>${pad2(demo.target.related.length)} 关联</span>
         <span>${pad2(demo.target.forms.length)} 形态</span>
         ${demo.sourceForm ? `<span>+ ${escapeHTML(demo.sourceForm)}</span>` : ''}`
      : '<span>NEW ENTRY</span>';

    dom.demoComposer.innerHTML = `
      <div class="composer-wrap">
        <div class="composer-intro">
          <span class="eyebrow">
            <span class="pulse-dot ${isUpdate ? 'is-warm' : ''}"></span>
            ${isUpdate ? 'UPDATE EXISTING INDEX' : 'CREATE A NEW INDEX'}
          </span>
          <p>${
            isUpdate
              ? `为「${escapeHTML(word)}」补充新的语境、关联或理解。`
              : '把遇见的语境一起留下，记忆才有落点。'
          }</p>
        </div>
        <form class="composer-card glass" id="demo-composer-form">
          <header class="composer-head">
            <div class="composer-head__word">
              <span class="composer-word">${escapeHTML(word)}</span>
              <span class="composer-badge">${isUpdate ? '已有词条' : '新词条'}</span>
            </div>
            <div class="composer-head__meta">${meta}</div>
          </header>

          <label class="field field--full">
            <span class="field__label">
              <span class="field__index">01</span>
              例句
              <em>可选</em>
            </span>
            <textarea id="demo-sentence" rows="2" maxlength="2000" placeholder="写下你遇见它的那句话……"></textarea>
            <span class="field__hint">原文、台词，或者你自己造的一句。</span>
          </label>

          <div class="composer-grid">
            <div class="field">
              <span class="field__label">
                <span class="field__index">02</span>
                关联已有单词
              </span>
              <div class="relation-picker">
                <div class="relation-chips" id="demo-relations">
                  <span class="relation-placeholder">还没有关联词</span>
                </div>
                <div class="relation-search">
                  <svg class="icon icon--small" aria-hidden="true"><use href="#i-search"></use></svg>
                  <input id="demo-relation-input" type="text" placeholder="搜索并关联已有单词…" autocomplete="off" spellcheck="false" aria-label="关联已有单词" />
                </div>
                <div class="relation-results" id="demo-relation-results" hidden></div>
              </div>
              <span class="field__hint">复习时，它们会一起出现。</span>
            </div>

            <label class="field field--note">
              <span class="field__label">
                <span class="field__index">03</span>
                个人联想
              </span>
              <textarea id="demo-note" rows="5" maxlength="5000" placeholder="中文释义、词根、画面感、容易混淆的词……中英文都可以。"></textarea>
              <span class="field__hint">中文翻译直接写在这里，保存时不用再填一次。</span>
            </label>
          </div>

          <footer class="composer-actions">
            <p class="composer-actions__note">
              <span class="local-dot"></span>
              静态演示 · 不会上传
            </p>
            <div class="composer-actions__buttons">
              <button type="button" class="button button--ghost" id="demo-cancel">取消</button>
              <button type="submit" class="button button--primary">
                <svg class="icon icon--small" aria-hidden="true"><use href="#i-save"></use></svg>
                ${isUpdate ? '补充到词条' : '保存到演示词库'}
              </button>
            </div>
          </footer>
        </form>
      </div>`;

    const form = $('#demo-composer-form', dom.demoComposer);
    const sentenceInput = $('#demo-sentence', dom.demoComposer);
    const noteInput = $('#demo-note', dom.demoComposer);
    const relationInput = $('#demo-relation-input', dom.demoComposer);
    const relationResults = $('#demo-relation-results', dom.demoComposer);
    const relationChips = $('#demo-relations', dom.demoComposer);
    const cancelButton = $('#demo-cancel', dom.demoComposer);

    const renderRelationChips = () => {
      relationChips.innerHTML = demo.relations.length
        ? demo.relations
            .map(
              (item) => `
                <span class="relation-chip">
                  <span>${escapeHTML(item.word)}</span>
                  <button type="button" data-remove-relation="${item.id}" aria-label="移除关联词 ${escapeHTML(item.word)}">
                    <svg class="icon icon--tiny" aria-hidden="true"><use href="#i-x"></use></svg>
                  </button>
                </span>`,
            )
            .join('')
        : '<span class="relation-placeholder">还没有关联词</span>';
    };

    const renderRelationResults = () => {
      const needle = normalize(relationInput.value);
      if (!needle) {
        relationResults.hidden = true;
        relationResults.innerHTML = '';
        return;
      }

      const selectedIds = new Set(demo.relations.map((item) => item.id));
      const candidates = entries
        .filter((entry) => entry.id !== demo.target?.id && !selectedIds.has(entry.id))
        .filter(
          (entry) =>
            normalize(entry.word).includes(needle) ||
            normalize(entry.note).includes(needle) ||
            entry.forms.some((form) => normalize(form).includes(needle)),
        )
        .sort((a, b) => {
          const aExact = normalize(a.word) === needle ? 0 : 1;
          const bExact = normalize(b.word) === needle ? 0 : 1;
          return aExact - bExact || a.word.localeCompare(b.word);
        })
        .slice(0, 5);

      relationResults.hidden = false;
      relationResults.innerHTML = candidates.length
        ? candidates
            .map(
              (entry) => `
                <button type="button" class="relation-result" data-add-relation="${entry.id}">
                  <span class="relation-result__copy">
                    <span class="relation-result__word">${escapeHTML(entry.word)}</span>
                    <span class="relation-result__note">${escapeHTML(
                      entry.note || entry.sentences[0] || '未填写联想',
                    )}</span>
                  </span>
                  <svg class="icon icon--small" aria-hidden="true"><use href="#i-plus"></use></svg>
                </button>`,
            )
            .join('')
        : '<div class="relation-empty">没有匹配的已收录单词</div>';
    };

    const addRelation = (id) => {
      const entry = entries.find((item) => item.id === id);
      if (!entry || demo.relations.some((item) => item.id === id)) return;
      demo.relations.push({ id: entry.id, word: entry.word });
      relationInput.value = '';
      relationResults.hidden = true;
      relationResults.innerHTML = '';
      renderRelationChips();
      relationInput.focus();
    };

    renderRelationChips();

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      saveDemoEntry(sentenceInput.value, noteInput.value);
    });

    cancelButton.addEventListener('click', () => resetDemo());

    relationInput.addEventListener('input', renderRelationResults);
    relationInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const first = relationResults.querySelector('[data-add-relation]');
        if (first) addRelation(Number(first.dataset.addRelation));
      }
      if (event.key === 'Escape') {
        relationInput.value = '';
        relationResults.hidden = true;
      }
    });

    relationResults.addEventListener('click', (event) => {
      const result = event.target.closest('[data-add-relation]');
      if (!result) return;
      addRelation(Number(result.dataset.addRelation));
    });

    relationChips.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove-relation]');
      if (!remove) return;
      demo.relations = demo.relations.filter(
        (item) => item.id !== Number(remove.dataset.removeRelation),
      );
      renderRelationChips();
      relationInput.focus();
    });
  }

  function saveDemoEntry(sentence, note) {
    const cleanSentence = sentence.trim();
    const cleanNote = note.trim();
    let entry;

    if (demo.mode === 'supplement' && demo.target) {
      entry = entries.find((item) => item.id === demo.target.id);
      if (!entry) return;

      const source = demo.sourceForm.trim();
      if (
        source &&
        normalize(source) !== normalize(entry.word) &&
        !entry.forms.some((form) => normalize(form) === normalize(source))
      ) {
        entry.forms.push(source);
      }
      if (
        cleanSentence &&
        !entry.sentences.some(
          (item) => item.toLowerCase() === cleanSentence.toLowerCase(),
        )
      ) {
        entry.sentences.push(cleanSentence);
      }
      if (cleanNote && !entry.note.toLowerCase().includes(cleanNote.toLowerCase())) {
        entry.note = entry.note ? `${entry.note}\n\n${cleanNote}` : cleanNote;
      }

      const relationIds = new Set(entry.related.map((item) => item.id));
      demo.relations.forEach((item) => {
        if (!relationIds.has(item.id)) entry.related.push({ ...item });
      });
      entry.date = todayLabel();
    } else {
      const word = demo.query.trim();
      if (!word) return;
      entry = {
        id: nextEntryId,
        word,
        forms: [],
        sentences: cleanSentence ? [cleanSentence] : [],
        note: cleanNote,
        related: demo.relations.map((item) => ({ ...item })),
        date: todayLabel(),
      };
      nextEntryId += 1;
      entries.unshift(entry);
    }

    demo.savedEntry = entry;
    demo.phase = 'saved';
    renderSearchUI();
    renderSuccess();
    renderLibrary();
    showToast(demo.mode === 'supplement' ? '已补充到演示词条' : '已加入演示词库');
  }

  function renderSuccess() {
    const entry = demo.savedEntry;
    if (!entry) return;
    const isUpdate = demo.mode === 'supplement';

    dom.demoComposer.innerHTML = `
      <div class="save-success glass" aria-live="polite">
        <div class="save-success__mark">
          <svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg>
        </div>
        <span class="eyebrow">SAVED TO YOUR LOCAL DEMO</span>
        <h2 class="save-success__word">${escapeHTML(entry.word)}</h2>
        <p class="save-success__copy">
          ${isUpdate ? '新的语境已经补充进这个词条。' : '它已经进入你的语言索引，等待下一次重逢。'}
        </p>
        <div class="save-success__meta">
          <span><b>${pad2(entry.sentences.length)}</b> 例句</span>
          <span><b>${pad2(entry.related.length)}</b> 关联</span>
          <span><b>${pad2(entry.forms.length)}</b> 记录形态</span>
        </div>
        <div class="save-success__actions">
          <button type="button" class="button button--ghost" data-success-again>再记一个</button>
          <button type="button" class="button button--primary" data-success-library>
            查看词库
            <svg class="icon icon--small" aria-hidden="true"><use href="#i-arrow-right"></use></svg>
          </button>
        </div>
      </div>`;
  }

  function resetDemo() {
    window.clearTimeout(matchTimer);
    demo.query = '';
    demo.matches = [];
    demo.selected = null;
    demo.pendingForm = '';
    demo.matching = false;
    demo.phase = 'idle';
    demo.mode = 'new';
    demo.target = null;
    demo.sourceForm = '';
    demo.relations = [];
    demo.savedEntry = null;
    dom.demoQuery.value = '';
    dom.demoComposer.innerHTML = '';
    renderSearchUI();
    dom.demoQuery.focus();
  }

  function goLibrary() {
    library.view = 'words';
    library.query = '';
    library.expandedId = null;
    dom.libraryQuery.value = '';
    renderLibrary();
    document.querySelector('#library')?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  function bindLibrary() {
    dom.libraryTabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-view]');
      if (!tab) return;
      library.view = tab.dataset.view === 'sentences' ? 'sentences' : 'words';
      library.expandedId = null;
      renderLibrary();
    });

    dom.libraryQuery.addEventListener('input', () => {
      library.query = dom.libraryQuery.value;
      renderLibrary();
    });

    dom.libraryContent.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-expand]');
      if (!trigger) return;
      const id = Number(trigger.dataset.expand);
      library.expandedId = library.expandedId === id ? null : id;
      renderLibrary();
    });
  }

  function renderLibrary() {
    if (!dom.libraryContent) return;
    const needle = normalize(library.query);
    const totalWords = entries.length;
    const totalSentences = entries.reduce((sum, entry) => sum + entry.sentences.length, 0);

    dom.libraryWordCount.textContent = pad2(totalWords);
    dom.librarySentenceCount.textContent = pad2(totalSentences);
    dom.libraryUpdated.textContent = `${pad2(totalWords)} WORDS / ${pad2(totalSentences)} SENTENCES`;

    $$('[data-view]', dom.libraryTabs).forEach((tab) => {
      const active = tab.dataset.view === library.view;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    if (library.view === 'sentences') {
      const sentenceItems = entries.flatMap((entry) =>
        entry.sentences
          .filter(
            (sentence) =>
              !needle ||
              normalize(sentence).includes(needle) ||
              normalize(entry.word).includes(needle),
          )
          .map((sentence, index) => ({
            id: `${entry.id}-${index}`,
            text: sentence,
            word: entry.word,
          })),
      );

      dom.libraryContent.innerHTML = sentenceItems.length
        ? `<div class="sentence-list">${sentenceItems
            .map(
              (item, index) => `
                <article class="sentence-card glass">
                  <span class="sentence-card__number">${pad2(index + 1)}</span>
                  <div class="sentence-card__body">
                    <svg class="icon sentence-card__quote" aria-hidden="true"><use href="#i-quote"></use></svg>
                    <p>${escapeHTML(item.text)}</p>
                    <span class="sentence-card__source">from <b>${escapeHTML(item.word)}</b></span>
                  </div>
                </article>`,
            )
            .join('')}</div>`
        : `<div class="library-no-results">${
            library.query.trim()
              ? `没有找到包含「${escapeHTML(library.query.trim())}」的例句。`
              : '还没有保存任何例句。'
          }</div>`;
      return;
    }

    const filteredEntries = entries.filter((entry) => {
      if (!needle) return true;
      return (
        normalize(entry.word).includes(needle) ||
        normalize(entry.note).includes(needle) ||
        entry.sentences.some((sentence) => normalize(sentence).includes(needle)) ||
        entry.forms.some((form) => normalize(form).includes(needle)) ||
        entry.related.some((related) => normalize(related.word).includes(needle))
      );
    });

    if (!filteredEntries.length) {
      dom.libraryContent.innerHTML = `<div class="library-no-results">${
        library.query.trim()
          ? `没有找到与「${escapeHTML(library.query.trim())}」匹配的词。`
          : '词库还是空的。'
      }</div>`;
      return;
    }

    dom.libraryContent.innerHTML = `<div class="word-list">${filteredEntries
      .map((entry, index) => {
        const isOpen = library.expandedId === entry.id;
        const forms = entry.forms
          .slice(0, 3)
          .map((form) => `<span class="word-card__form">${escapeHTML(form)}</span>`)
          .join('');
        const extraForms =
          entry.forms.length > 3
            ? `<span class="word-card__form">+${entry.forms.length - 3}</span>`
            : '';
        const relatedCount = entry.related.length
          ? `<span><svg class="icon icon--tiny" aria-hidden="true"><use href="#i-link"></use></svg>${entry.related.length}</span>`
          : '';

        const detail = isOpen
          ? `
            <div class="word-card__detail">
              <div class="word-detail-grid">
                <div class="word-detail-block">
                  <h4>个人联想</h4>
                  <p class="${entry.note ? '' : 'is-muted'}">${escapeHTML(
                    entry.note || '还没有写下对这个词的理解。',
                  )}</p>
                </div>
                <div class="word-detail-block">
                  <h4>例句</h4>
                  ${
                    entry.sentences.length
                      ? `<div class="word-sentences">${entry.sentences
                          .map(
                            (sentence) => `
                              <p>
                                <svg class="icon icon--tiny" aria-hidden="true"><use href="#i-quote"></use></svg>
                                <span>${escapeHTML(sentence)}</span>
                              </p>`,
                          )
                          .join('')}</div>`
                      : '<p class="is-muted">还没有留下例句。</p>'
                  }
                </div>
              </div>
              ${
                entry.related.length
                  ? `<div class="word-related">
                       <h4>关联词</h4>
                       <div class="word-related__chips">
                         ${entry.related
                           .map(
                             (related) =>
                               `<span class="relation-chip relation-chip--static">${escapeHTML(related.word)}</span>`,
                           )
                           .join('')}
                       </div>
                     </div>`
                  : ''
              }
              <div class="word-detail-foot">
                <span>INDEX #${String(entry.id).padStart(3, '0')}</span>
                <span>收录于 ${escapeHTML(entry.date || '—')}</span>
                <span>${entry.forms.length} 个记录形态</span>
              </div>
            </div>`
          : '';

        return `
          <article class="word-card ${isOpen ? 'is-open' : ''}">
            <button type="button" class="word-card__main" data-expand="${entry.id}" aria-expanded="${isOpen}">
              <span class="word-card__number">${String(index + 1).padStart(3, '0')}</span>
              <span class="word-card__content">
                <span class="word-card__title-line">
                  <span class="word-card__word">${escapeHTML(entry.word)}</span>
                  ${forms}${extraForms}
                </span>
                <span class="word-card__note">${escapeHTML(
                  entry.note || entry.sentences[0] || '还没有联想。',
                )}</span>
              </span>
              <span class="word-card__meta">
                <span>${pad2(entry.sentences.length)} 句</span>
                ${relatedCount}
                <span>${escapeHTML(entry.date || '—')}</span>
                <svg class="icon word-card__chevron" aria-hidden="true"><use href="#i-chevron"></use></svg>
              </span>
            </button>
            ${detail}
          </article>`;
      })
      .join('')}</div>`;
  }

  function bindCopy() {
    dom.copyRepo?.addEventListener('click', async () => {
      const url = 'https://github.com/Yu-Sea/SeeEnglish';
      try {
        await navigator.clipboard.writeText(url);
        showToast('GitHub 地址已复制');
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          showToast('GitHub 地址已复制');
        } catch {
          showToast('复制失败，请手动打开 github.com/Yu-Sea/SeeEnglish');
        }
        document.body.removeChild(textarea);
      }
    });
  }

  function showToast(message) {
    if (!dom.toast) return;
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => {
      dom.toast.classList.remove('is-visible');
    }, 2200);
  }

  function setupReveal() {
    const items = $$('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('is-visible'));
      return;
    }

    revealObserver = new IntersectionObserver(
      (observedEntries) => {
        observedEntries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -7% 0px' },
    );

    items.forEach((item) => revealObserver.observe(item));

    // If a browser blocks the observer for any reason, never leave the page blank.
    window.setTimeout(() => {
      if (!document.querySelector('.reveal.is-visible')) {
        document.documentElement.classList.remove('js');
      }
    }, 1800);
  }

  init();
})();
