/* =====================================================================
   radicals.js — тренажёр ключей (радикалов)
   =====================================================================
   Экспортирует в глобальный объект `Radicals`:
     Radicals.init()
     Radicals.showList()                — открыть список всех ключей
     Radicals.openDetail(idx)           — карточка одного ключа
     Radicals.startTraining([idxs])     — начать раунд
     Radicals.nextQuestion()            — следующий вопрос
     Radicals.backToList()              — вернуться к списку
     Radicals.markMastered(glyph)       — отметить выученным

   Хранилище:
     ключ `radicals` → {
       "口": { shown: 5, wrong: 1, mastered: true },
       "氵": { shown: 2, wrong: 0, mastered: false },
       ...
     }
   ===================================================================== */

(function () {
  'use strict';

  /* ============================================================
     1. Настройки раунда
     ============================================================ */
  const QUESTIONS_PER_ROUND = 10;
  const OPTIONS_COUNT = 4;
  const MASTER_THRESHOLD = 3;   // показать 3 раза без ошибок → выучен

  /* ============================================================
     2. Состояние
     ============================================================ */
  let stats = {};               // { glyph: {shown, wrong, mastered} }
  let rQueue = [];
  let rCurrent = null;
  let rScore = 0;
  let rAnswered = 0;
  let rTotal = 0;
  let rIsAnswered = false;

  /* ============================================================
     3. Загрузка / сохранение
     ============================================================ */
  function load() {
    const saved = U.Storage.get('radicals', null);
    stats = (saved && typeof saved === 'object') ? saved : {};
  }

  function save() {
    U.Storage.set('radicals', stats);
  }

  function getStat(glyph) {
    return stats[glyph] || { shown: 0, wrong: 0, mastered: false };
  }

  /* ============================================================
     4. СПИСОК КЛЮЧЕЙ
     ============================================================ */
  function showList() {
    load();
    renderGrid();
    if (window.App && typeof App.go === 'function') {
      App.go('screenRadicals');
    }
  }

  function renderGrid() {
    const grid = U.el('radicalGrid');
    if (!grid) return;

    const radicals = DATA.RADICALS;
    let mastered = 0;

    grid.innerHTML = radicals.map((r, idx) => {
      const st = getStat(r.g);
      if (st.mastered) mastered++;
      const cls = st.mastered ? 'radical-card mastered' : 'radical-card';
      // Вторая строка — короткое название (без пиньиня)
      const shortName = r.n.split(' ').slice(1).join(' ') || r.n;
      return `<div class="${cls}" onclick="Radicals.openDetail(${idx})">
        <div class="radical-glyph">${r.g}</div>
        <div class="radical-name">${U.escapeHtml(shortName)}</div>
      </div>`;
    }).join('');

    U.setText('masteredCount', mastered);
    U.setText('radicalScore', `${mastered} / ${radicals.length}`);
  }

    /* ============================================================
     5. КАРТОЧКА ОДНОГО КЛЮЧА
     ============================================================ */
  function openDetail(idx) {
    const r = DATA.RADICALS[idx];
    if (!r) return;

    const st = getStat(r.g);

    U.setText('rGlyph', r.g);
    U.setText('rName', r.n);
    U.setText('rMean', r.m);
    U.setHtml('rExamples', (r.ex || []).map(e =>
      `<span class="ex">${U.escapeHtml(e)}</span>`
    ).join(''));

    const glyphEl = U.el('rGlyph');
    if (glyphEl) glyphEl.style.fontSize = '140px';

    U.setText('rQuestion', 'Изучи ключ');
    const optionsEl = U.el('rOptions');
    optionsEl.innerHTML = `
      <button class="btn btn-primary" onclick="Radicals.startTraining([${idx}])">
        ▶ Тренировать этот
      </button>
      <button class="btn btn-secondary" onclick="Radicals.showWords('${U.escapeHtml(r.g)}')">
        📚 Слова с этим ключом
      </button>
      <button class="btn btn-gold" onclick="Radicals.markMastered('${U.escapeHtml(r.g)}')">
        ✓ Я его знаю
      </button>
      <button class="btn btn-ghost" onclick="Radicals.backToList()">
        ← К списку
      </button>
    `;

    const fb = U.el('rFeedback');
    if (fb) { fb.className = 'feedback'; fb.innerHTML = ''; }

    const next = U.el('rNextBtn');
    if (next) next.style.display = 'none';

    const bar = U.el('rProgressFill');
    if (bar) bar.style.width = '0%';

    U.setText('rScore', 0);

    if (window.App && typeof App.go === 'function') {
      App.go('screenRadicalTrainer');
    }
  }

  /* ============================================================
     5.1 СЛОВА С ЭТИМ КЛЮЧОМ
     ============================================================ */
  function showWords(glyph) {
    if (window.Study && typeof Study.showRadicalWords === 'function') {
      const modal = document.getElementById('radicalWordsModal');
      if (modal) {
        modal.style.display = 'flex';
        Study.showRadicalWords(glyph);
      }
    }
  }

  /* ============================================================
     6. ОТМЕТКА «ИЗУЧЕНО»
     ============================================================ */
  function markMastered(glyph) {
    stats[glyph] = getStat(glyph);
    stats[glyph].mastered = true;
    save();
    U.clickSound('ok');
    U.toast(`✓ Ключ ${glyph} отмечен как изученный`);
    backToList();
  }

  function backToList() {
    showList();
  }

  /* ============================================================
     7. ТРЕНИРОВКА — ЗАПУСК РАУНДА
     ============================================================ */
  /**
   * @param {number[]|null} onlyIdxs  — если указано, тренируем только эти ключи
   */
  function startTraining(onlyIdxs = null) {
    load();

    const pool = onlyIdxs
      ? onlyIdxs.map(i => DATA.RADICALS[i]).filter(Boolean)
      : DATA.RADICALS;

    if (pool.length < 4) {
      U.toast('Нужно минимум 4 ключа для тренировки');
      return;
    }

    // Взвешенная выборка: проблемные чаще, выученные реже
    const selected = U.weightedSample(
      pool,
      Math.min(QUESTIONS_PER_ROUND, pool.length),
      (r) => {
        const st = getStat(r.g);
        let w = 3;
        w += st.wrong * 2;                       // +2 за каждую ошибку
        w -= Math.floor(st.shown / 5);           // -1 за 5 показов
        if (st.mastered) w -= 2;                 // выученные реже
        return Math.max(1, w);
      }
    );

    // Формируем очередь
    rQueue = selected.map(r => ({
      radical: r,
      mode: Math.random() < 0.5 ? 'glyph2name' : 'name2glyph'
    }));

    rScore = 0;
    rAnswered = 0;
    rTotal = rQueue.length;

    U.setText('rScore', 0);
    const bar = U.el('rProgressFill');
    if (bar) bar.style.width = '0%';

    if (window.App && typeof App.go === 'function') {
      App.go('screenRadicalTrainer');
    }

    nextQuestion();
  }

  /* ============================================================
     8. СЛЕДУЮЩИЙ ВОПРОС
     ============================================================ */
  function nextQuestion() {
    if (rQueue.length === 0) {
      finishRound();
      return;
    }

    rCurrent = rQueue.shift();
    rAnswered++;
    rIsAnswered = false;

    const r = rCurrent.radical;

    // Прогресс-бар
    const bar = U.el('rProgressFill');
    if (bar) bar.style.width = Math.round((rAnswered - 1) / rTotal * 100) + '%';

    const glyphEl = U.el('rGlyph');
    const nameEl = U.el('rName');
    const meanEl = U.el('rMean');
    const exEl = U.el('rExamples');

    if (rCurrent.mode === 'glyph2name') {
      // Показать глиф → выбрать название
      glyphEl.textContent = r.g;
      glyphEl.style.fontSize = '140px';
      nameEl.textContent = '?';
      meanEl.textContent = 'Выбери правильное название';
      exEl.innerHTML = '';
      U.setText('rQuestion', 'Что это за ключ?');
    } else {
      // Показать название → выбрать глиф
      glyphEl.textContent = '?';
      glyphEl.style.fontSize = '80px';
      nameEl.textContent = r.n;
      meanEl.textContent = r.m;
      exEl.innerHTML = '';
      U.setText('rQuestion', 'Выбери правильный глиф');
    }

    // Варианты
    const optionsEl = U.el('rOptions');
    optionsEl.innerHTML = '';

    if (rCurrent.mode === 'glyph2name') {
      const correct = r.n;
      const wrong = U.shuffle(
        DATA.RADICALS.filter(x => x.g !== r.g).map(x => x.n)
      ).slice(0, OPTIONS_COUNT - 1);

      U.shuffle([correct, ...wrong]).forEach(v => {
        const b = document.createElement('div');
        b.className = 'option';
        b.textContent = v;
        b.onclick = () => checkAnswer(b, v === correct);
        optionsEl.appendChild(b);
      });
    } else {
      const correct = r.g;
      const wrong = U.shuffle(
        DATA.RADICALS.filter(x => x.g !== r.g).map(x => x.g)
      ).slice(0, OPTIONS_COUNT - 1);

      U.shuffle([correct, ...wrong]).forEach(v => {
        const b = document.createElement('div');
        b.className = 'option hanzi-opt';
        b.textContent = v;
        b.onclick = () => checkAnswer(b, v === correct);
        optionsEl.appendChild(b);
      });
    }

    // Сброс фидбека и кнопки «Далее»
    const fb = U.el('rFeedback');
    if (fb) { fb.className = 'feedback'; fb.innerHTML = ''; }

    const next = U.el('rNextBtn');
    if (next) next.style.display = 'none';
  }

  /* ============================================================
     9. ПРОВЕРКА ОТВЕТА
     ============================================================ */
  function checkAnswer(btn, correct) {
    if (rIsAnswered) return;
    rIsAnswered = true;

    // Блокируем варианты
    document.querySelectorAll('#rOptions .option')
      .forEach(o => o.classList.add('disabled'));

    const r = rCurrent.radical;
    const fb = U.el('rFeedback');

    // Обновляем статистику ключа
    stats[r.g] = getStat(r.g);
    stats[r.g].shown++;

    if (correct) {
      rScore++;
      U.setText('rScore', rScore);
      btn.classList.add('correct');

      U.clickSound('ok');

      fb.className = 'feedback ok show';
      fb.innerHTML = `${U.praise()}
        <span class="answer-reveal">${r.g} · ${r.n} — ${r.m}</span>`;
    } else {
      stats[r.g].wrong++;
      btn.classList.add('wrong');

      U.clickSound('err');

      // Подсвечиваем правильный вариант
      const correctVal = rCurrent.mode === 'glyph2name' ? r.n : r.g;
      document.querySelectorAll('#rOptions .option').forEach(o => {
        if (o.textContent === correctVal) o.classList.add('correct');
      });

      fb.className = 'feedback err show';
      fb.innerHTML = `✗ Правильно: <b>${correctVal}</b>
        <span class="answer-reveal">${r.g} · ${r.n} — ${r.m}</span>`;
    }

    // Автоотметка «изучено»: показано ≥3, ошибок 0
    if (stats[r.g].shown >= MASTER_THRESHOLD &&
        stats[r.g].wrong === 0 &&
        !stats[r.g].mastered) {
      stats[r.g].mastered = true;
    }

    save();

    // Показываем ключ после ответа
    const glyphEl = U.el('rGlyph');
    const nameEl = U.el('rName');
    const meanEl = U.el('rMean');
    const exEl = U.el('rExamples');

    glyphEl.textContent = r.g;
    glyphEl.style.fontSize = '140px';
    nameEl.textContent = r.n;
    meanEl.textContent = r.m;
    exEl.innerHTML = (r.ex || []).map(e =>
      `<span class="ex">${U.escapeHtml(e)}</span>`
    ).join('');

    // Кнопка «Далее»
    const next = U.el('rNextBtn');
    if (next) next.style.display = 'flex';
  }

  /* ============================================================
     10. ФИНАЛ РАУНДА
     ============================================================ */
  function finishRound() {
    const bar = U.el('rProgressFill');
    if (bar) bar.style.width = '100%';

    const percent = rTotal > 0 ? Math.round((rScore / rTotal) * 100) : 0;

    // Меняем опции на экран финиша
    const optionsEl = U.el('rOptions');
    optionsEl.innerHTML = `
      <div class="finish">
        <span class="emoji">${percent >= 90 ? '🀄' : percent >= 70 ? '✨' : '💪'}</span>
        <h2>${percent >= 90 ? 'Мастер ключей!' :
              percent >= 70 ? 'Хорошо!' : 'Ещё разок!'}</h2>
        <div class="big-score">${rScore} / ${rTotal}</div>
        <div class="percent">${percent}% правильных</div>
        <button class="btn btn-gold" onclick="Radicals.startTraining()">
          ▶ Ещё раунд
        </button>
        <button class="btn btn-secondary" onclick="Radicals.backToList()">
          🀄 К списку ключей
        </button>
      </div>
    `;

    // Верхняя часть — празднично
    U.setText('rGlyph', '🎉');
    const glyphEl = U.el('rGlyph');
    if (glyphEl) glyphEl.style.fontSize = '120px';

    U.setText('rName', 'Раунд завершён');
    U.setText('rMean', '');
    U.setHtml('rExamples', '');
    U.setText('rQuestion', '');

    const fb = U.el('rFeedback');
    if (fb) { fb.className = 'feedback'; fb.innerHTML = ''; }

    const next = U.el('rNextBtn');
    if (next) next.style.display = 'none';

    U.clickSound('ok');
  }

  /* ============================================================
     11. ИНИЦИАЛИЗАЦИЯ
     ============================================================ */
  function init() {
    load();
    const mastered = Object.values(stats).filter(s => s.mastered).length;
    console.log('[radicals.js] Инициализировано. Изучено:', mastered,
                '/', DATA.RADICALS.length);
  }

  /* ============================================================
     12. ЭКСПОРТ
     ============================================================ */
  window.Radicals = {
    init,
    showList,
    openDetail,
    startTraining,
    nextQuestion,
    backToList,
    markMastered,
    showWords, 
    // для отладки
    _stats: () => stats
  };

  console.log('[radicals.js] Загружено: Radicals.showList, Radicals.startTraining');

})();
