(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const initial = () => ({
    score: 42.68,
    contribution: 0.04,
    meetings: 44,
    blockReviews: 4,
    blockCorrect: 4,
    stage: 'prompt',
  });

  const dom = {
    card: $('#rd-card'),
    prompt: $('#rd-prompt'),
    record: $('#rd-record'),
    result: $('#rd-result'),
    input: $('#rd-input'),
    reveal: $('#rd-reveal'),
    answer: $('#rd-answer-text'),
    correct: $('#rd-correct'),
    wrong: $('#rd-wrong'),
    next: $('#rd-next'),
    score: $('#rd-score'),
    level: $('.rd-score__level'),
    fill: $('#rd-score-fill'),
    blockChip: $('#rd-block-chip'),
    meetings: $('#rd-meetings'),
    meetingsTotal: $('#rd-meetings-total'),
    contribution: $('#rd-contribution'),
    dots: $('#rd-dots'),
    delta: $('#rd-delta'),
    resultAccuracy: $('#rd-result-accuracy'),
    resultContribution: $('#rd-result-contribution'),
    resultScore: $('#rd-result-score'),
  };

  if (!dom.card || !dom.input || !dom.reveal) return;

  let state = initial();

  const formatScore = (score) => score.toFixed(3);
  const formatContribution = (contribution) => contribution.toFixed(3);

  function levelFor(score) {
    if (score < 10) return '刚刚开始';
    if (score < 30) return '开始有形状';
    if (score < 55) return '有了轮廓';
    if (score < 75) return '逐渐成形';
    if (score < 100) return '接近 CET-4';
    return '越过 CET-4';
  }

  function render() {
    dom.score.textContent = formatScore(state.score);
    dom.level.textContent = levelFor(state.score);
    dom.fill.style.width = `${Math.min(100, Math.max(0, state.score))}%`;
    dom.blockChip.textContent = `本档 ${Math.min(state.blockReviews, 5)} / 5`;
    dom.meetings.textContent = `${Math.min(state.blockReviews, 5)} / 5`;
    dom.meetingsTotal.textContent = String(state.meetings);
    dom.contribution.textContent = formatContribution(state.contribution);
    [...dom.dots.children].forEach((dot, index) => {
      dot.classList.toggle('is-on', index < state.blockReviews);
    });
  }

  function showStage(stage) {
    dom.prompt.hidden = stage !== 'prompt';
    dom.record.hidden = stage !== 'record';
    dom.result.hidden = stage !== 'result';
    state.stage = stage;
  }

  function resetInput() {
    dom.input.value = '';
    dom.input.classList.remove('is-empty');
    dom.input.removeAttribute('aria-invalid');
  }

  function reveal() {
    const answer = dom.input.value.trim();
    if (!answer) {
      dom.input.classList.add('is-empty');
      dom.input.setAttribute('aria-invalid', 'true');
      dom.input.focus();
      return;
    }
    dom.input.classList.remove('is-empty');
    dom.input.removeAttribute('aria-invalid');
    dom.answer.textContent = answer;
    showStage('record');
  }

  function assess(correct) {
    if (state.stage !== 'record') return;
    const delta = correct ? 0.01 : 0.006;
    state.contribution = Math.min(0.05, state.contribution + delta);
    state.score += delta;
    state.meetings += 1;
    state.blockReviews = 5;
    state.blockCorrect = correct ? 5 : 4;

    dom.delta.textContent = `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(3)}`;
    dom.resultAccuracy.textContent = `${state.blockCorrect} / 5`;
    dom.resultContribution.textContent = formatContribution(state.contribution);
    dom.resultScore.textContent = formatScore(state.score);
    render();
    showStage('result');
  }

  function next() {
    state.blockReviews = 0;
    state.blockCorrect = 0;
    state.stage = 'prompt';
    resetInput();
    showStage('prompt');
    render();
    dom.input.focus({ preventScroll: true });
  }

  dom.reveal.addEventListener('click', reveal);
  dom.correct.addEventListener('click', () => assess(true));
  dom.wrong.addEventListener('click', () => assess(false));
  dom.next.addEventListener('click', next);
  dom.input.addEventListener('input', () => {
    if (dom.input.value.trim()) {
      dom.input.classList.remove('is-empty');
      dom.input.removeAttribute('aria-invalid');
    }
  });
  dom.input.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      reveal();
    }
  });

  resetInput();
  showStage('prompt');
  render();
})();
