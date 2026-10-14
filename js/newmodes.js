/* =====================================================================
   newmodes.js — особые тренировки (исправленная версия)
   ===================================================================== */

(function () {
  'use strict';

  const QUESTIONS_PER_ROUND = 10;
  const OPTIONS_COUNT = 4;

  let mode = null;
  let queue = [];
  let current = null;
  let score = 0;
  let answered = 0;
  let totalInRound = 0;
  let isAnswered = false;

  /* ============================================================
     Меню
     ============================================================ */
  function showMenu() {
    if (window.App && typeof App.go === 'function') {
      App.go('screenNewModes');
    }
  }

  function backToMenu() {
    queue = [];
    current = null;
    isAnswered = false;
    showMenu();
  }

  function backToHome() {
    if (window.App && typeof App.go === 'function') {
      App.go('screenHome');
      if (window.Stats) Stats.refresh();
    }
  }

  /* ============================================================
     Запуск
     ============================================================ */
  function start(m) {
    mode = m;
    score = 0;
    answered = 0;
    isAnswered = false;

    switch (mode) {
      case 'tones':      queue = buildTonesQueue();     break;
      case 'listening':  queue = buildListeningQueue(); break;
      case 'wordorder':  queue = buildWordOrderQueue(); break;
      case 'similar':    queue = buildSimilarQueue();   break;
      default:
        U.toast('Неизвестный режим');
        return;
    }

    if (queue.length === 0) {
      U.toast('Недостаточно данных для тренировки');
      return;
    }

    totalInRound = queue.length;
    U.setText('nScore', 0);

    const fill = U.el('nProgressFill');
    if (fill) fill.style.width = '0%';

    if (window.App && typeof App.go === 'function') {
      App.go('screenNewTrainer');
    }

    next();
  }

  /* ============================================================
     Очереди
     ============================================================ */
  function buildTonesQueue() {
    const tones = DATA.TONES || [];
    if (tones.length < OPTIONS_COUNT) return [];
    const selected = U.shuffle(tones).slice(0, Math.min(QUESTIONS_PER_ROUND, tones.length));
    return selected.map(t => ({
      tone: t,
      audio: Math.random() < 0.5
    }));
  }

  function buildListeningQueue() {
    const list = DATA.AUDIO_WORDS || [];
    if (list.length < OPTIONS_COUNT) return [];
    const allWords = DATA.WORDS_RAW;
    const byHanzi = {};
    allWords.forEach(([hz, py, ru]) => { byHanzi[hz] = { hz, py, ru }; });
    const selected = U.shuffle(list).slice(0, Math.min(QUESTIONS_PER_ROUND, list.length));
    return selected.map(hz => ({
      word: byHanzi[hz] || { hz, py: '', ru: '' }
    }));
  }

  function buildWordOrderQueue() {
    const sentences = DATA.SENTENCES || [];
    if (sentences.length === 0) return [];
    const selected = U.shuffle(sentences).slice(0, Math.min(QUESTIONS_PER_ROUND, sentences.length));
    return selected.map(s => ({
      sentence: s,
      shuffled: U.shuffle(s.words)
    }));
  }

  function buildSimilarQueue() {
    const groups = DATA.SIMILAR || [];
    if (groups.length === 0) return [];
    const questions = [];
    groups.forEach(group => {
      const n = Math.min(2, group.items.length);
      const chosen = U.shuffle(group.items).slice(0, n);
      chosen.forEach(item => {
        questions.push({ group, target: item });
      });
    });
    return U.shuffle(questions).slice(0, Math.min(QUESTIONS_PER_ROUND, questions.length));
  }

  /* ============================================================
     Следующий вопрос
     ============================================================ */
  function next() {
    if (queue.length === 0) { finishRound(); return; }

    current = queue.shift();
    answered++;
    isAnswered = false;

    const fill = U.el('nProgressFill');
    if (fill) fill.style.width = Math.round((answered - 1) / totalInRound * 100) + '%';

    const optionsEl = U.el('nOptions');
    optionsEl.innerHTML = '';
    const fb = U.el('nFeedback');
    fb.className = 'feedback';
    fb.innerHTML = '';
    const nextBtn = U.el('nNextBtn');
    nextBtn.style.display = 'none';
    const playBtn = U.el('nPlayBtn');
    playBtn.style.display = 'none';

    switch (mode) {
      case 'tones':      renderToneQuestion();      break;
      case 'listening':  renderListeningQuestion(); break;
      case 'wordorder':  renderWordOrderQuestion(); break;
      case 'similar':    renderSimilarQuestion();   break;
    }
  }

  /* ============================================================
     ТОНЫ
     ============================================================ */
  function renderToneQuestion() {
    const t = current.tone;
    const big = U.el('nBig');
    const hint = U.el('nHint');
    const playBtn = U.el('nPlayBtn');

    if (current.audio) {
      big.textContent = '🔊';
      big.classList.add('audio');
      hint.textContent = 'Послушай и выбери тон';
      playBtn.style.display = 'inline-flex';
      setTimeout(() => U.speak(t.variants[t.correct - 1]), 200);
    } else {
      big.textContent = t.variants[t.correct - 1];
      big.classList.remove('audio');
      hint.textContent = 'Какой это тон?';
      playBtn.style.display = 'inline-flex';
    }

    const toneLabels = ['1-й тон ˉ', '2-й тон ˊ', '3-й тон ˇ', '4-й тон ˋ'];
    const optionsEl = U.el('nOptions');

    toneLabels.forEach((label, i) => {
      const toneNum = i + 1;
      const b = document.createElement('div');
      b.className = 'option';
      b.textContent = `${label}   ${t.variants[i]}`;
      b.style.fontFamily = '"Noto Serif SC", serif';
      b.style.fontSize = '18px';
      b.onclick = () => checkToneAnswer(b, toneNum === t.correct);
      optionsEl.appendChild(b);
    });
  }

  function checkToneAnswer(btn, correct) {
    if (isAnswered) return;
    isAnswered = true;

    document.querySelectorAll('#nOptions .option').forEach(o => o.classList.add('disabled'));

    const t = current.tone;
    const correctTone = t.correct;
    const correctChar = t.variants[correctTone - 1];
    const fb = U.el('nFeedback');

    if (correct) {
      score++;
      U.setText('nScore', score);
      btn.classList.add('correct');
      U.clickSound('ok');
      fb.className = 'feedback ok show';
      fb.innerHTML = `${U.praise()}
        <span class="answer-reveal">${correctChar} — ${t.meaning}</span>`;
    } else {
      btn.classList.add('wrong');
      document.querySelectorAll('#nOptions .option').forEach(o => {
        if (o.textContent.includes(correctChar)) o.classList.add('correct');
      });
      U.clickSound('err');
      fb.className = 'feedback err show';
      fb.innerHTML = `✗ Правильно: <b>${correctChar}</b> — ${correctTone}-й тон
        <span class="answer-reveal">${t.meaning}</span>`;
    }

    U.speak(correctChar);
    _recordAnswer(correct);
    afterAnswer();
  }

  /* ============================================================
     АУДИРОВАНИЕ
     ============================================================ */
  function renderListeningQuestion() {
    const w = current.word;
    const big = U.el('nBig');
    const hint = U.el('nHint');
    const playBtn = U.el('nPlayBtn');

    big.textContent = '🔊';
    big.classList.add('audio');
    hint.textContent = 'Послушай и выбери иероглиф';
    playBtn.style.display = 'inline-flex';

    setTimeout(() => U.speak(w.hz), 300);

    const allWords = DATA.WORDS_RAW.filter(x => x[0] !== w.hz);
    const wrong = U.shuffle(allWords).slice(0, OPTIONS_COUNT - 1).map(x => x[0]);
    const options = U.shuffle([w.hz, ...wrong]);

    const optionsEl = U.el('nOptions');
    options.forEach(hz => {
      const b = document.createElement('div');
      b.className = 'option hanzi-opt';
      b.textContent = hz;
      b.onclick = () => checkListeningAnswer(b, hz === w.hz);
      optionsEl.appendChild(b);
    });
  }

  function checkListeningAnswer(btn, correct) {
    if (isAnswered) return;
    isAnswered = true;

    document.querySelectorAll('#nOptions .option').forEach(o => o.classList.add('disabled'));

    const w = current.word;
    const fb = U.el('nFeedback');

    if (correct) {
      score++;
      U.setText('nScore', score);
      btn.classList.add('correct');
      U.clickSound('ok');
      fb.className = 'feedback ok show';
      fb.innerHTML = `${U.praise()}
        <span class="answer-reveal">${w.hz} · ${w.py} · ${w.ru}</span>`;
    } else {
      btn.classList.add('wrong');
      document.querySelectorAll('#nOptions .option').forEach(o => {
        if (o.textContent === w.hz) o.classList.add('correct');
      });
      U.clickSound('err');
      fb.className = 'feedback err show';
      fb.innerHTML = `✗ Правильно: <b>${w.hz}</b>
        <span class="answer-reveal">${w.py} · ${w.ru}</span>`;
    }

    const big = U.el('nBig');
    big.classList.remove('audio');
    big.textContent = w.hz;
    big.style.color = '';

    U.speak(w.hz);
    _recordAnswer(correct);
    afterAnswer();
  }

  /* ============================================================
     ПОРЯДОК СЛОВ
     ============================================================ */
  function renderWordOrderQuestion() {
    const s = current.sentence;
    const big = U.el('nBig');
    const hint = U.el('nHint');

    big.textContent = s.ru;
    big.style.fontSize = '28px';
    big.classList.remove('audio');
    hint.textContent = 'Собери предложение';

    const optionsEl = U.el('nOptions');

    const answerZone = document.createElement('div');
    answerZone.className = 'answer-zone';
    answerZone.id = 'answerZone';
    optionsEl.appendChild(answerZone);

    const tilesZone = document.createElement('div');
    tilesZone.className = 'word-tiles';
    tilesZone.id = 'tilesZone';
    optionsEl.appendChild(tilesZone);

    const controls = document.createElement('div');
    controls.style.marginTop = '16px';
    controls.id = 'wordOrderControls';
    controls.innerHTML = `
      <button class="btn btn-primary" onclick="NewModes._checkWordOrder()">✓ Проверить</button>
      <button class="btn btn-secondary" onclick="NewModes._resetWordOrder()">↺ Сброс</button>
    `;
    optionsEl.appendChild(controls);

    current.shuffled.forEach((word) => {
      const t = document.createElement('div');
      t.className = 'word-tile';
      t.dataset.word = word;
      t.textContent = word;
      t.onclick = () => moveTile(t);
      tilesZone.appendChild(t);
    });
  }

  function moveTile(tile) {
    if (isAnswered) return;
    const answerZone = U.el('answerZone');
    const tilesZone = U.el('tilesZone');
    if (!answerZone || !tilesZone) return;

    if (tile.parentElement === tilesZone) {
      tile.classList.add('used');
      const clone = tile.cloneNode(true);
      clone.classList.remove('used');
      clone.onclick = () => returnTile(clone);
      answerZone.appendChild(clone);
    }
    U.clickSound('click');
  }

  function returnTile(tile) {
    if (isAnswered) return;
    const tilesZone = U.el('tilesZone');
    const word = tile.dataset.word;
    const originals = tilesZone.querySelectorAll('.word-tile');
    originals.forEach(o => {
      if (o.dataset.word === word && o.classList.contains('used')) {
        o.classList.remove('used');
      }
    });
    tile.remove();
    U.clickSound('click');
  }

  function checkWordOrder() {
    if (isAnswered) return;

    const answerZone = U.el('answerZone');
    if (!answerZone) return;

    const userWords = Array.from(answerZone.querySelectorAll('.word-tile'))
      .map(t => t.dataset.word);
    const correctWords = current.sentence.words;

    const ok = userWords.length === correctWords.length &&
               userWords.every((w, i) => w === correctWords[i]);

    isAnswered = true;
    document.querySelectorAll('#nOptions .word-tile').forEach(t => {
      t.classList.add('disabled');
    });

    const fb = U.el('nFeedback');
    const correctStr = correctWords.join(' ');

    if (ok) {
      score++;
      U.setText('nScore', score);
      U.clickSound('ok');
      fb.className = 'feedback ok show';
      fb.innerHTML = `${U.praise()}
        <span class="answer-reveal">${correctStr} — ${current.sentence.ru}</span>`;
    } else {
      U.clickSound('err');
      fb.className = 'feedback err show';
      fb.innerHTML = `✗ Правильно: <b>${correctStr}</b>
        <span class="answer-reveal">${current.sentence.ru}</span>`;
    }

    U.speak(correctStr);

    const controls = U.el('wordOrderControls');
    if (controls) controls.style.display = 'none';

    _recordAnswer(ok);
    afterAnswer();
  }

  function resetWordOrder() {
    if (isAnswered) return;
    const answerZone = U.el('answerZone');
    const tilesZone = U.el('tilesZone');
    if (!answerZone || !tilesZone) return;
    answerZone.innerHTML = '';
    tilesZone.querySelectorAll('.word-tile').forEach(t => t.classList.remove('used'));
    U.clickSound('click');
  }

  /* ============================================================
     ПОХОЖИЕ ИЕРОГЛИФЫ
     ============================================================ */
  function renderSimilarQuestion() {
    const g = current.group;
    const target = current.target;
    const big = U.el('nBig');
    const hint = U.el('nHint');
    const playBtn = U.el('nPlayBtn');

    big.textContent = target.ru;
    big.style.fontSize = '40px';
    big.classList.remove('audio');
    hint.textContent = `Выбери иероглиф · ${target.py}`;
    playBtn.style.display = 'inline-flex';

    const allItems = g.items.map(x => x.hz);
    const wrongFromGroup = allItems.filter(hz => hz !== target.hz);

    let wrongs = wrongFromGroup;
    if (wrongs.length < OPTIONS_COUNT - 1) {
      const others = [];
      DATA.SIMILAR.forEach(otherGroup => {
        if (otherGroup === g) return;
        otherGroup.items.forEach(it => {
          if (it.hz !== target.hz) others.push(it.hz);
        });
      });
      wrongs = wrongs.concat(U.shuffle(others));
    }

    const wrongList = U.shuffle(wrongs).slice(0, OPTIONS_COUNT - 1);
    const options = U.shuffle([target.hz, ...wrongList]);

    const optionsEl = U.el('nOptions');
    options.forEach(hz => {
      const b = document.createElement('div');
      b.className = 'option hanzi-opt';
      b.textContent = hz;
      b.onclick = () => checkSimilarAnswer(b, hz === target.hz);
      optionsEl.appendChild(b);
    });
  }

  function checkSimilarAnswer(btn, correct) {
    if (isAnswered) return;
    isAnswered = true;

    document.querySelectorAll('#nOptions .option').forEach(o => o.classList.add('disabled'));

    const target = current.target;
    const g = current.group;
    const fb = U.el('nFeedback');

    if (correct) {
      score++;
      U.setText('nScore', score);
      btn.classList.add('correct');
      U.clickSound('ok');
      fb.className = 'feedback ok show';
      fb.innerHTML = `${U.praise()}
        <span class="answer-reveal">${target.hz} · ${target.py} — ${target.ru}</span>`;
    } else {
      btn.classList.add('wrong');
      document.querySelectorAll('#nOptions .option').forEach(o => {
        if (o.textContent === target.hz) o.classList.add('correct');
      });
      U.clickSound('err');
      fb.className = 'feedback err show';
      fb.innerHTML = `✗ Правильно: <b>${target.hz}</b>
        <span class="answer-reveal">${target.py} — ${target.ru}</span>`;
    }

    if (g.tip) {
      const tip = document.createElement('div');
      tip.style.cssText = 'margin-top:10px; padding:10px; background:rgba(212,162,78,0.1); border-radius:8px; font-size:13px; color:var(--gray);';
      tip.textContent = '💡 ' + g.tip;
      U.el('nFeedback').appendChild(tip);
    }

    U.speak(target.hz);

    const big = U.el('nBig');
    big.textContent = target.hz;
    big.style.fontSize = '96px';

    _recordAnswer(correct);
    afterAnswer();
  }

  /* ============================================================
     Общая обработка после ответа
     ============================================================ */
  function afterAnswer() {
    const nextBtn = U.el('nNextBtn');
    nextBtn.style.display = 'flex';
  }

  // Запись в статистику + кормление панды
  function _recordAnswer(ok) {
    if (window.Stats && typeof Stats.recordAnswer === 'function') {
      Stats.recordAnswer(ok);
    }
    if (window.Pet && typeof Pet.feed === 'function') {
      Pet.feed(ok);
    }
  }

  /* ============================================================
     Кнопка «Послушать»
     ============================================================ */
  function play() {
    if (!current) return;
    if (mode === 'tones') {
      U.speak(current.tone.variants[current.tone.correct - 1]);
    } else if (mode === 'listening') {
      U.speak(current.word.hz);
    } else if (mode === 'similar') {
      U.speak(current.target.hz);
    } else if (mode === 'wordorder') {
      U.speak(current.sentence.words.join(''));
    }
  }

  /* ============================================================
     Финальный экран
     ============================================================ */
  function finishRound() {
    const fill = U.el('nProgressFill');
    if (fill) fill.style.width = '100%';

    const percent = totalInRound > 0 ? Math.round((score / totalInRound) * 100) : 0;

    const optionsEl = U.el('nOptions');
    optionsEl.innerHTML = `
      <div class="finish">
        <span class="emoji">${percent >= 90 ? '🏆' :
                             percent >= 70 ? '🌟' : '💪'}</span>
        <h2>${percent >= 90 ? 'Отлично!' :
              percent >= 70 ? 'Хорошо!' : 'Ещё разок!'}</h2>
        <div class="big-score">${score} / ${totalInRound}</div>
        <div class="percent">${percent}% правильных</div>
        <button class="btn btn-primary" onclick="NewModes.start('${mode}')">
          ▶ Ещё раунд
        </button>
        <button class="btn btn-secondary" onclick="NewModes.backToMenu()">
          ← К режимам
        </button>
      </div>
    `;

    const big = U.el('nBig');
    big.textContent = '🎉';
    big.classList.remove('audio');
    big.style.fontSize = '96px';
    big.style.color = '';

    U.setText('nHint', '');

    const playBtn = U.el('nPlayBtn');
    playBtn.style.display = 'none';

    const fb = U.el('nFeedback');
    fb.className = 'feedback';
    fb.innerHTML = '';

    const nextBtn = U.el('nNextBtn');
    nextBtn.style.display = 'none';

    U.clickSound('ok');

    if (window.Stats && typeof Stats.refresh === 'function') {
      setTimeout(() => Stats.refresh(), 300);
    }
  }

  /* ============================================================
     Инициализация
     ============================================================ */
  function init() {
    console.log('[newmodes.js] Инициализировано. Режимов доступно: 4',
                '(тоны, аудирование, порядок, похожие)');
  }

  /* ============================================================
     Экспорт
     ============================================================ */
  window.NewModes = {
    init,
    showMenu,
    start,
    next,
    play,
    backToMenu,
    backToHome,
    _checkWordOrder: checkWordOrder,
    _resetWordOrder: resetWordOrder
  };

  console.log('[newmodes.js] Загружено: NewModes.start, NewModes.showMenu');

})();
