/* =====================================================================
   training.js — тренажёр слов
   =====================================================================
   Экспортирует в глобальный объект `Training`:
     Training.init()                 — инициализация
     Training.start()                — начать раунд
     Training.next()                 — следующий вопрос
     Training.toggleChip(input)      — вкл/выкл режим (чип)
     Training.playCurrent()          — озвучить текущее слово
     Training.setSpeakEnabled(v)     — приглушить/включить озвучку
     Training.insertTone(ch)         — вставить символ с тоном

   Формат слова в хранилище `words`:
     { hanzi, pinyin, ru, added, shown, wrong }
   ===================================================================== */

(function () {
  'use strict';

  /* ============================================================
     1. Константы
     ============================================================ */
  const QUESTIONS_PER_ROUND = 10;
  const OPTIONS_COUNT = 4;
  const INPUT_RATIO = 0.5;              // доля вопросов с вводом
  const WEIGHT = { today: 5, yesterday: 3, week: 2, old: 1 };
  const TONE_CHARS = [
    'ā','á','ǎ','à','ē','é','ě','è','ī','í','ǐ','ì',
    'ō','ó','ǒ','ò','ū','ú','ǔ','ù','ǖ','ǘ','ǚ','ǜ'
  ];
  const TITLES = {
    ru:     'Напиши перевод',
    pinyin: 'Напиши пиньинь',
    hanzi:  'Напиши иероглиф'
  };

  /* ============================================================
     2. Состояние
     ============================================================ */
  let words = [];              // все слова
  let queue = [];              // очередь раунда
  let current = null;          // текущий вопрос
  let score = 0;
  let answered = 0;
  let totalInRound = 0;
  let isAnswered = false;
  let speakEnabled = true;

  /* ============================================================
     3. Вспомогательные — вес слова
     ============================================================ */
  function weightOf(w) {
    const d = U.daysSince(w.added);
    let base =
      d <= 0  ? WEIGHT.today :
      d === 1 ? WEIGHT.yesterday :
      d < 7   ? WEIGHT.week :
                WEIGHT.old;
    base += (w.wrong || 0) * 2;
    base = Math.max(1, base - Math.floor((w.shown || 0) / 5));
    return base;
  }

  /* ============================================================
     4. Загрузка слов
     ============================================================ */
  function loadWords() {
    const saved = U.Storage.get('words', null);
    if (Array.isArray(saved) && saved.length > 0) {
      words = saved;
    } else {
      // Первый запуск — заливаем 150 слов HSK1
      words = DATA.buildWordObjects();
      saveWords();
    }
  }

  function saveWords() {
    U.Storage.set('words', words);
  }

  /* ============================================================
     5. Старт раунда
     ============================================================ */
  function start() {
    loadWords();

    if (words.length < 4) {
      U.toast('Нужно минимум 4 слова');
      return;
    }

    // Какие режимы включены (чипы)
    const enabled = [];
    if (U.el('mRu')     && U.el('mRu').checked)     enabled.push('ru');
    if (U.el('mPinyin') && U.el('mPinyin').checked) enabled.push('pinyin');
    if (U.el('mHanzi')  && U.el('mHanzi').checked)  enabled.push('hanzi');

    if (enabled.length === 0) {
      U.toast('Выбери хотя бы один режим');
      return;
    }

    const inputOn = U.el('mInput') ? U.el('mInput').checked : true;

    // Взвешенная выборка слов
    const n = Math.min(QUESTIONS_PER_ROUND, words.length);
    const selected = U.weightedSample(words, n, weightOf);

    // Формируем очередь: режим чередуется, тип вопроса — случайно
    queue = selected.map((w, idx) => ({
      word: w,
      mode: enabled[idx % enabled.length],
      input: inputOn && Math.random() < INPUT_RATIO
    }));

    score = 0;
    answered = 0;
    totalInRound = queue.length;

    U.setText('score', 0);

    // Показать экран тренажёра
    if (window.App && typeof App.go === 'function') {
      App.go('screenTrainer');
    }

    next();
  }

  /* ============================================================
     6. Следующий вопрос
     ============================================================ */
  function next() {
    if (queue.length === 0) {
      finishRound();
      return;
    }

    current = queue.shift();
    answered++;
    isAnswered = false;

    const w = current.word;
    const hanziEl = U.el('hanzi');
    const badge = U.el('badge');

    // === Что показываем на карточке ===
    if (current.mode === 'hanzi') {
      // показываем русский перевод, угадываем иероглиф
      hanziEl.textContent = w.ru;
      hanziEl.classList.add('small');
    } else {
      // показываем иероглиф
      hanziEl.textContent = w.hanzi;
      hanziEl.classList.remove('small');
    }

    // Анимация переворота
    hanziEl.style.animation = 'none';
    // вынужденная синхронизация
    void hanziEl.offsetWidth;
    hanziEl.style.animation = 'flipIn 0.45s ease';

    // === Бейдж ===
    if (U.daysSince(w.added) <= 0) {
      badge.textContent = 'новое сегодня';
      badge.className = 'badge new';
      badge.style.display = 'inline-block';
    } else if ((w.wrong || 0) > 0) {
      badge.textContent = `ошибок: ${w.wrong}`;
      badge.className = 'badge';
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }

    // === Вопрос ===
    U.setText('questionLabel', TITLES[current.mode]);

    // === Прогресс-бар ===
    const fill = U.el('progressFill');
    if (fill) fill.style.width = Math.round((answered - 1) / totalInRound * 100) + '%';

    // === Очистка ===
    const optionsEl = U.el('options');
    optionsEl.innerHTML = '';

    const fb = U.el('feedback');
    fb.className = 'feedback';
    fb.innerHTML = '';

    const nextBtn = U.el('nextBtn');
    nextBtn.style.display = 'none';

    // === Тональная клавиатура (только для пиньиня) ===
    const toneBar = U.el('toneBar');
    if (current.mode === 'pinyin' && current.input) {
      toneBar.innerHTML = TONE_CHARS.map(ch =>
        `<button onclick="Training.insertTone('${ch}')">${ch}</button>`
      ).join('');
      toneBar.classList.add('show');
    } else {
      toneBar.classList.remove('show');
      toneBar.innerHTML = '';
    }

    // === Формируем варианты или поле ввода ===
    if (current.input) {
      renderInputMode(w);
    } else {
      renderOptionsMode(w);
    }
  }

  /* ============================================================
     7. Режим ввода
     ============================================================ */
  function renderInputMode(w) {
    const optionsEl = U.el('options');

    // Поле ввода
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'answer-input' + (current.mode === 'hanzi' ? ' hanzi-inp' : '');
    inp.autocomplete = 'off';
    inp.autocorrect = 'off';
    inp.autocapitalize = 'off';
    inp.spellcheck = false;
    inp.placeholder =
      current.mode === 'hanzi'  ? '汉字…' :
      current.mode === 'pinyin' ? 'ni hao…' :
                                   'перевод…';
    optionsEl.appendChild(inp);

    // Кнопка «Проверить»
    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn btn-primary';
    checkBtn.textContent = '✓ Проверить';
    checkBtn.onclick = () => checkInput(inp.value);
    optionsEl.appendChild(checkBtn);

    // Кнопка «Не знаю»
    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn btn-secondary';
    skipBtn.textContent = '🤷 Не знаю';
    skipBtn.onclick = () => {
      inp.disabled = true;
      checkInput('');
    };
    optionsEl.appendChild(skipBtn);

    // Фокус (на телефоне откроется клавиатура)
    setTimeout(() => inp.focus(), 100);

    // Enter = проверить
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        checkBtn.click();
      }
    });
  }

  /* ============================================================
     8. Режим выбора
     ============================================================ */
  function renderOptionsMode(w) {
    const optionsEl = U.el('options');
    const fieldByMode = { ru: 'ru', pinyin: 'pinyin', hanzi: 'hanzi' };
    const field = fieldByMode[current.mode];
    const correct = w[field];

    // Неверные варианты — из этого же поля других слов
    const wrongValues = U.shuffle(
      words.map(x => x[field]).filter(v => v !== correct)
    ).slice(0, OPTIONS_COUNT - 1);

    // Если слов мало (меньше 4) — просто показываем, что есть
    const allOptions = U.shuffle([correct, ...wrongValues]);

    allOptions.forEach(v => {
      const b = document.createElement('div');
      b.className = 'option' + (current.mode === 'hanzi' ? ' hanzi-opt' : '');
      b.textContent = v;
      b.onclick = () => checkOption(b, v === correct);
      optionsEl.appendChild(b);
    });
  }

  /* ============================================================
     9. Вставка тона (для тональной клавиатуры)
     ============================================================ */
  function insertTone(ch) {
    const inp = document.querySelector('.answer-input');
    if (!inp) return;
    const start = inp.selectionStart ?? inp.value.length;
    const end = inp.selectionEnd ?? inp.value.length;
    const val = inp.value;
    inp.value = val.slice(0, start) + ch + val.slice(end);
    inp.selectionStart = inp.selectionEnd = start + ch.length;
    inp.focus();
  }

  /* ============================================================
     10. Проверка ответа — ввод
     ============================================================ */
  function checkInput(userAnswer) {
    if (isAnswered) return;
    isAnswered = true;

    const w = current.word;
    const field = current.mode;
    const correctRaw = w[field];
    const ok = U.isCorrect(userAnswer, correctRaw, field);

    // Блокируем всё
    document.querySelectorAll('#options button').forEach(b => b.disabled = true);
    const inp = document.querySelector('.answer-input');
    if (inp) {
      inp.disabled = true;
      inp.classList.add(ok ? 'correct' : 'wrong');
    }

    finishAnswer(ok, correctRaw, null);
  }

  /* ============================================================
     11. Проверка ответа — выбор
     ============================================================ */
  function checkOption(btn, correct) {
    if (isAnswered) return;
    isAnswered = true;

    // Блокируем все варианты
    document.querySelectorAll('.option').forEach(o => o.classList.add('disabled'));

    const w = current.word;
    const field = current.mode;
    const correctRaw = w[field];

    if (correct) {
      btn.classList.add('correct');
    } else {
      btn.classList.add('wrong');
      // Подсвечиваем правильный вариант
      document.querySelectorAll('.option').forEach(o => {
        if (o.textContent === correctRaw) o.classList.add('correct');
      });
    }

    finishAnswer(correct, correctRaw, btn);
  }

  /* ============================================================
     12. Общая обработка ответа
     ============================================================ */
  function finishAnswer(ok, correctRaw, btn) {
    const w = current.word;
    const fb = U.el('feedback');

    // Обновляем счётчики слова
    w.shown = (w.shown || 0) + 1;
    if (ok) {
      score++;
      U.setText('score', score);
      w.correct = (w.correct || 0) + 1;
    } else {
      w.wrong = (w.wrong || 0) + 1;
    }
    saveWords();

    // Записываем в статистику
    if (window.Stats && typeof Stats.recordAnswer === 'function') {
      Stats.recordAnswer(ok);
    }
     if (window.Pet && typeof Pet.feed === 'function') {
        Pet.feed(ok);
     }

    // Звук
    U.clickSound(ok ? 'ok' : 'err');

    // Фидбек
    if (ok) {
      fb.className = 'feedback ok show';
      const praise = (window.Settings && Settings.get('praise')) ? U.praise() : '✓ Верно!';
      fb.innerHTML = `${praise}
        <span class="answer-reveal">${w.hanzi} · ${w.pinyin} · ${w.ru}</span>`;
      if (ok && window.Study && typeof Study.showSentence === 'function') {
         Study.showSentence(w.hanzi, fb);
      }

      // Озвучка в режиме hanzi — после правильного ответа
      if (current.mode === 'hanzi' && speakEnabled) {
        U.speakHanzi(w.hanzi);
      }
    } else {
      fb.className = 'feedback err show';
      fb.innerHTML = `✗ Правильно: <b>${correctRaw}</b>
        <span class="answer-reveal">${w.hanzi} · ${w.pinyin} · ${w.ru}</span>`;

      // Озвучка при ошибке в режиме hanzi (для запоминания)
      if (current.mode === 'hanzi' && speakEnabled) {
        U.speakHanzi(w.hanzi);
      }
    }

    // Кнопка «Далее»
    const nextBtn = U.el('nextBtn');
    nextBtn.style.display = 'flex';
    nextBtn.focus();
  }

  /* ============================================================
     13. Озвучка текущего слова
     ============================================================ */
  function playCurrent() {
    if (current && current.word) {
      U.speakHanzi(current.word.hanzi);
    }
  }

  /* ============================================================
     14. Финальный экран
     ============================================================ */
  function finishRound() {
    const fill = U.el('progressFill');
    if (fill) fill.style.width = '100%';

    const percent = totalInRound > 0 ? Math.round((score / totalInRound) * 100) : 0;

    // Меняем опции
    const optionsEl = U.el('options');
    optionsEl.innerHTML = `
      <div class="finish">
        <span class="emoji">${percent >= 90 ? '🏆' :
                             percent >= 70 ? '🌟' : '💪'}</span>
        <h2>${percent >= 90 ? 'Отлично!' :
              percent >= 70 ? 'Хорошо!' : 'Ещё разок!'}</h2>
        <div class="big-score">${score} / ${totalInRound}</div>
        <div class="percent">${percent}% правильных</div>
        <button class="btn btn-primary" onclick="Training.start()">
          ▶ Ещё раунд
        </button>
        <button class="btn btn-secondary" onclick="App.go('screenHome'); Stats.refresh();">
          🏠 В меню
        </button>
      </div>
    `;

    // Верх — празднично
    const hanziEl = U.el('hanzi');
    hanziEl.textContent = '🎉';
    hanziEl.classList.remove('small');

    const badge = U.el('badge');
    badge.style.display = 'none';

    U.setText('questionLabel', 'Раунд завершён');

    const fb = U.el('feedback');
    fb.className = 'feedback';
    fb.innerHTML = '';

    const nextBtn = U.el('nextBtn');
    nextBtn.style.display = 'none';

    const toneBar = U.el('toneBar');
    toneBar.classList.remove('show');
    toneBar.innerHTML = '';

    U.clickSound('ok');

    // Обновляем главный экран (streak, цель и т.д.)
    if (window.Stats && typeof Stats.refresh === 'function') {
      // небольшая задержка, чтобы не мешать финальной анимации
      setTimeout(() => Stats.refresh(), 300);
    }
  }

  /* ============================================================
     15. Чипы режимов
     ============================================================ */
  function toggleChip(input) {
    const chip = input.closest('.mode-chip');
    if (chip) chip.classList.toggle('on', input.checked);

    if (input.id === 'mSpeak') {
      speakEnabled = input.checked;
    }
  }

  function setSpeakEnabled(v) {
    speakEnabled = !!v;
    const mSpeak = U.el('mSpeak');
    if (mSpeak) {
      mSpeak.checked = speakEnabled;
      const chip = mSpeak.closest('.mode-chip');
      if (chip) chip.classList.toggle('on', speakEnabled);
    }
  }

  /* ============================================================
     16. Инициализация
     ============================================================ */
  function init() {
    loadWords();
    speakEnabled = (window.Settings && Settings.get('speak')) !== false;

    // Синхронизация чипа озвучки с настройками
    const mSpeak = U.el('mSpeak');
    if (mSpeak) {
      mSpeak.checked = speakEnabled;
      const chip = mSpeak.closest('.mode-chip');
      if (chip) chip.classList.toggle('on', speakEnabled);
    }

    // Enter = «Далее» после ответа
    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const screenTrainer = U.el('screenTrainer');
      if (!screenTrainer || !screenTrainer.classList.contains('active')) return;
      const nextBtn = U.el('nextBtn');
      if (isAnswered && nextBtn && nextBtn.style.display !== 'none') {
        e.preventDefault();
        next();
      }
    });

    console.log('[training.js] Инициализировано. Слов в базе:', words.length,
                '| Озвучка:', speakEnabled);
  }

  /* ============================================================
     17. Экспорт
     ============================================================ */
  window.Training = {
    init,
    start,
    next,
    toggleChip,
    playCurrent,
    insertTone,
    setSpeakEnabled,
    // для отладки и других модулей
    _getWords: () => words,
    _saveWords: saveWords
  };

  console.log('[training.js] Загружено: Training.start, Training.next');

})();
