/* =====================================================================
   arcade.js — аркадные режимы
   =====================================================================
   Экспортирует `Arcade`:
     Arcade.init()
     Arcade.showMenu()
     Arcade.start('speed' | 'dictation' | 'tetris')
     Arcade.next()
     Arcade.stop()
     Arcade.backToMenu()
   ===================================================================== */

(function () {
  'use strict';

  /* ============================================================
     Константы
     ============================================================ */
  const SPEED_DURATION = 60;         // секунд для «Кто больше»
  const TETRIS_FALL_SPEED = 1800;    // мс — базовое время падения
  const TETRIS_LIVES = 3;
  const OPTIONS_COUNT = 4;

  /* ============================================================
     Состояние
     ============================================================ */
  let mode = null;
  let score = 0;
  let isAnswered = false;

  // Для «Кто больше»
  let speedTimer = null;
  let speedTimeLeft = 0;

  // Для «Диктанта»
  let dictationCurrent = null;

  // Для «Тетриса»
  let tetrisState = null;    // { falling, options, y, interval, lives, correct }

  /* ============================================================
     Меню
     ============================================================ */
  function showMenu() {
    if (window.App) App.go('screenArcadeMenu');
  }

  function backToMenu() {
    stopAll();
    showMenu();
  }

  function stopAll() {
    if (speedTimer) { clearInterval(speedTimer); speedTimer = null; }
    if (tetrisState && tetrisState.interval) {
      clearInterval(tetrisState.interval);
      tetrisState = null;
    }
  }

  /* ============================================================
     Старт
     ============================================================ */
  function start(m) {
    stopAll();
    mode = m;
    score = 0;
    isAnswered = false;

    if (window.App) App.go('screenArcade');

    if (mode === 'speed')     startSpeed();
    if (mode === 'dictation') startDictation();
    if (mode === 'tetris')    startTetris();
  }

  /* ============================================================
     РЕЖИМ 1: «КТО БОЛЬШЕ?» — 60 секунд
     ============================================================ */
  function startSpeed() {
    speedTimeLeft = SPEED_DURATION;

    U.setHtml('arcadeHeader', `
      <div class="speed-header">
        <div class="speed-timer" id="speedTimer">⏱ 60</div>
        <div class="speed-score">
          ⚡ <span id="speedScore">0</span> ответов
        </div>
      </div>
      <div class="progress-bar"><div class="progress-fill" id="arcadeProgress" style="width:100%"></div></div>
    `);

    speedTimer = setInterval(() => {
      speedTimeLeft--;
      const el = U.el('speedTimer');
      if (el) {
        el.textContent = `⏱ ${speedTimeLeft}`;
        el.classList.toggle('urgent', speedTimeLeft <= 10);
      }
      const fill = U.el('arcadeProgress');
      if (fill) fill.style.width = (speedTimeLeft / SPEED_DURATION * 100) + '%';

      if (speedTimeLeft <= 0) {
        clearInterval(speedTimer);
        speedTimer = null;
        finishSpeed();
      }
    }, 1000);

    next();
  }

  function finishSpeed() {
    stopAll();
    const words = U.Storage.get('words', []);
    const stats = U.Storage.get('arcadeStats', { speedBest: 0 });
    const isRecord = score > (stats.speedBest || 0);
    if (isRecord) {
      stats.speedBest = score;
      U.Storage.set('arcadeStats', stats);
    }

    U.setHtml('arcadeOptions', `
      <div class="finish">
        <span class="emoji">${isRecord ? '🏆' : '⚡'}</span>
        <h2>${isRecord ? 'Новый рекорд!' : 'Время вышло!'}</h2>
        <div class="big-score">${score}</div>
        <div class="percent">
          правильных ответов за 60 секунд<br>
          Лучший результат: ${stats.speedBest || score}
        </div>
        <button class="btn btn-primary" onclick="Arcade.start('speed')">
          ⚡ Ещё раз
        </button>
        <button class="btn btn-secondary" onclick="Arcade.backToMenu()">
          ← К режимам
        </button>
      </div>
    `);
    U.setHtml('arcadeMain', '');
    U.setText('arcadeQuestion', '');
  }

  /* ============================================================
     РЕЖИМ 2: «ДИКТАНТ» — слышишь → пишешь
     ============================================================ */
  function startDictation() {
    U.setHtml('arcadeHeader', `
      <div class="speed-header">
        <div class="dictation-counter">✍️ <span id="dictationNum">1</span> / 10</div>
        <div class="speed-score">✓ <span id="dictationScore">0</span></div>
      </div>
      <div class="progress-bar"><div class="progress-fill" id="arcadeProgress" style="width:0%"></div></div>
    `);
    score = 0;
    nextDictation();
  }

  function nextDictation() {
    const words = U.Storage.get('words', []);
    if (words.length === 0) { finishDictation(); return; }

    if (score === undefined) score = 0;
    if (!window._dictCounter) window._dictCounter = 0;
    window._dictCounter++;

    if (window._dictCounter > 10) {
      finishDictation();
      return;
    }

    U.setText('dictationNum', window._dictCounter);

    const w = words[Math.floor(Math.random() * words.length)];
    dictationCurrent = w;
    isAnswered = false;

    U.setHtml('arcadeMain', `
      <div class="dictation-word">
        <button class="play-btn" onclick="Arcade._replay()">🔊 Ещё раз</button>
      </div>
    `);
    U.setText('arcadeQuestion', 'Напиши иероглиф, который услышишь');

    U.speakHanzi(w.hanzi);

    const optionsEl = U.el('arcadeOptions');
    optionsEl.innerHTML = '';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'answer-input hanzi-inp';
    inp.autocomplete = 'off';
    inp.autocorrect = 'off';
    inp.autocapitalize = 'off';
    inp.spellcheck = false;
    inp.placeholder = '汉字…';
    optionsEl.appendChild(inp);

    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn btn-primary';
    checkBtn.textContent = '✓ Проверить';
    checkBtn.onclick = () => {
      const ok = inp.value.trim() === w.hanzi;
      U.isCorrect ? null : null;
      const passed = U.isCorrect(inp.value, w.hanzi, 'hanzi');
      answerDictation(passed, w);
    };
    optionsEl.appendChild(checkBtn);

    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn btn-secondary';
    skipBtn.textContent = '🤷 Не знаю';
    skipBtn.onclick = () => answerDictation(false, w);
    optionsEl.appendChild(skipBtn);

    setTimeout(() => inp.focus(), 100);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); checkBtn.click(); }
    });
  }

  function answerDictation(correct, w) {
    if (isAnswered) return;
    isAnswered = true;

    document.querySelectorAll('#arcadeOptions button').forEach(b => b.disabled = true);
    document.querySelectorAll('#arcadeOptions .answer-input').forEach(i => i.disabled = true);

    if (correct) {
      score++;
      U.setText('dictationScore', score);
      U.clickSound('ok');
      if (window.Pet) Pet.feed(true);
      if (window.Stats) Stats.recordAnswer(true);
    } else {
      U.clickSound('err');
      if (window.Pet) Pet.feed(false);
      if (window.Stats) Stats.recordAnswer(false);
    }

    const optionsEl = U.el('arcadeOptions');
    optionsEl.innerHTML += `
      <div class="feedback ${correct ? 'ok' : 'err'} show">
        ${correct ? U.praise() : '✗ Правильно: <b>' + w.hanzi + '</b>'}
        <span class="answer-reveal">${w.hanzi} · ${w.pinyin} · ${w.ru}</span>
      </div>
      <button class="btn btn-primary" onclick="Arcade._nextDictation()">Далее →</button>
    `;

    U.speakHanzi(w.hanzi);

    const fill = U.el('arcadeProgress');
    if (fill) fill.style.width = (window._dictCounter / 10 * 100) + '%';
  }

  function nextDictationPublic() {
    nextDictation();
  }

  function finishDictation() {
    window._dictCounter = 0;
    U.setHtml('arcadeOptions', `
      <div class="finish">
        <span class="emoji">${score >= 9 ? '🏆' : score >= 6 ? '🌟' : '💪'}</span>
        <h2>Диктант завершён</h2>
        <div class="big-score">${score} / 10</div>
        <div class="percent">${Math.round(score / 10 * 100)}% правильных</div>
        <button class="btn btn-primary" onclick="Arcade.start('dictation')">
          ✍️ Ещё раз
        </button>
        <button class="btn btn-secondary" onclick="Arcade.backToMenu()">
          ← К режимам
        </button>
      </div>
    `);
    U.setHtml('arcadeMain', '');
    U.setText('arcadeQuestion', '');
  }

  /* ============================================================
     РЕЖИМ 3: «ТЕТРИС» — падающие иероглифы
     ============================================================ */
  function startTetris() {
    const words = U.Storage.get('words', []);
    if (words.length < OPTIONS_COUNT) {
      U.toast('Нужно минимум 4 слова');
      return;
    }

    tetrisState = {
      lives: TETRIS_LIVES,
      score: 0,
      correct: 0,
      current: null,
      interval: null,
      spawnTimeout: null
    };

    U.setHtml('arcadeHeader', `
      <div class="speed-header">
        <div class="lives" id="tetrisLives">❤️❤️❤️</div>
        <div class="speed-score">⚡ <span id="tetrisScore">0</span></div>
      </div>
    `);

    spawnTetrisWord();
  }

  function spawnTetrisWord() {
    if (!tetrisState) return;

    const words = U.Storage.get('words', []);
    const w = words[Math.floor(Math.random() * words.length)];
    tetrisState.current = w;
    isAnswered = false;

    // 4 варианта: правильный + 3 неверных
    const wrong = U.shuffle(
      words.map(x => x.ru).filter(r => r !== w.ru)
    ).slice(0, OPTIONS_COUNT - 1);

    const options = U.shuffle([w.ru, ...wrong]);

    // Рендерим «небо» и «землю»
    U.setHtml('arcadeMain', `
      <div class="tetris-sky">
        <div class="tetris-word hz" id="tetrisWord">${w.hanzi}</div>
      </div>
      <div class="tetris-ground"></div>
    `);
    U.setText('arcadeQuestion', 'Успей выбрать перевод!');

    const optionsEl = U.el('arcadeOptions');
    optionsEl.innerHTML = '';
    options.forEach(ru => {
      const b = document.createElement('div');
      b.className = 'option';
      b.textContent = ru;
      b.onclick = () => tetrisAnswer(ru === w.ru, b);
      optionsEl.appendChild(b);
    });

    // Анимация падения
    const wordEl = U.el('tetrisWord');
    if (!wordEl) return;

    let progress = 0;
    const step = 100 / (TETRIS_FALL_SPEED / 50);
    const fallInterval = setInterval(() => {
      if (!tetrisState || isAnswered) {
        clearInterval(fallInterval);
        return;
      }
      progress += step;
      wordEl.style.top = progress + '%';
      if (progress >= 100) {
        clearInterval(fallInterval);
        tetrisMiss();
      }
    }, 50);

    tetrisState.interval = fallInterval;
  }

  function tetrisAnswer(correct, btn) {
    if (isAnswered || !tetrisState) return;
    isAnswered = true;

    if (tetrisState.interval) {
      clearInterval(tetrisState.interval);
      tetrisState.interval = null;
    }

    document.querySelectorAll('#arcadeOptions .option').forEach(o => {
      o.classList.add('disabled');
      if (o.textContent === tetrisState.current.ru) o.classList.add('correct');
    });

    if (correct) {
      tetrisState.score++;
      tetrisState.correct++;
      U.setText('tetrisScore', tetrisState.score);
      U.clickSound('ok');
      if (window.Pet) Pet.feed(true);
      if (window.Stats) Stats.recordAnswer(true);
      U.speakHanzi(tetrisState.current.hanzi);
    } else {
      btn.classList.add('wrong');
      tetrisState.lives--;
      U.clickSound('err');
      if (window.Pet) Pet.feed(false);
      if (window.Stats) Stats.recordAnswer(false);
      updateTetrisLives();
      U.speakHanzi(tetrisState.current.hanzi);
    }

    if (tetrisState.lives <= 0) {
      finishTetris();
      return;
    }

    setTimeout(() => {
      if (tetrisState) spawnTetrisWord();
    }, 600);
  }

  function tetrisMiss() {
    if (!tetrisState || isAnswered) return;
    isAnswered = true;

    tetrisState.lives--;
    U.clickSound('err');
    if (window.Pet) Pet.feed(false);
    if (window.Stats) Stats.recordAnswer(false);
    updateTetrisLives();

    // Подсветить правильный
    document.querySelectorAll('#arcadeOptions .option').forEach(o => {
      o.classList.add('disabled');
      if (o.textContent === tetrisState.current.ru) o.classList.add('correct');
    });

    if (tetrisState.lives <= 0) {
      finishTetris();
      return;
    }

    setTimeout(() => {
      if (tetrisState) spawnTetrisWord();
    }, 800);
  }

  function updateTetrisLives() {
    const el = U.el('tetrisLives');
    if (el) el.textContent = '❤️'.repeat(Math.max(0, tetrisState.lives));
  }

  function finishTetris() {
    const stats = U.Storage.get('arcadeStats', { tetrisBest: 0 });
    const isRecord = tetrisState.score > (stats.tetrisBest || 0);
    if (isRecord) {
      stats.tetrisBest = tetrisState.score;
      U.Storage.set('arcadeStats', stats);
    }

    const finalScore = tetrisState.score;
    if (tetrisState.interval) clearInterval(tetrisState.interval);
    tetrisState = null;

    U.setHtml('arcadeMain', '');
    U.setText('arcadeQuestion', '');
    U.setHtml('arcadeOptions', `
      <div class="finish">
        <span class="emoji">${isRecord ? '🏆' : '🎮'}</span>
        <h2>${isRecord ? 'Новый рекорд!' : 'Игра окончена'}</h2>
        <div class="big-score">${finalScore}</div>
        <div class="percent">
          Лучший результат: ${stats.tetrisBest || finalScore}
        </div>
        <button class="btn btn-primary" onclick="Arcade.start('tetris')">
          🎮 Ещё раз
        </button>
        <button class="btn btn-secondary" onclick="Arcade.backToMenu()">
          ← К режимам
        </button>
      </div>
    `);
  }

  /* ============================================================
     Общий следующий вопрос (для «Кто больше»)
     ============================================================ */
  function next() {
    if (mode !== 'speed') return;
    if (speedTimeLeft <= 0) return;

    const words = U.Storage.get('words', []);
    if (words.length === 0) return;

    const w = words[Math.floor(Math.random() * words.length)];
    isAnswered = false;

    U.setHtml('arcadeMain', `
      <div class="hanzi-card" style="padding: 30px 20px;">
        <div class="hanzi-main hz" style="font-size:72px;">${w.hanzi}</div>
      </div>
    `);
    U.setText('arcadeQuestion', 'Как переводится?');

    const wrong = U.shuffle(
      words.map(x => x.ru).filter(r => r !== w.ru)
    ).slice(0, OPTIONS_COUNT - 1);

    const options = U.shuffle([w.ru, ...wrong]);
    const optionsEl = U.el('arcadeOptions');
    optionsEl.innerHTML = '';

    options.forEach(ru => {
      const b = document.createElement('div');
      b.className = 'option';
      b.textContent = ru;
      b.onclick = () => speedAnswer(ru === w.ru, b, w);
      optionsEl.appendChild(b);
    });
  }

  function speedAnswer(correct, btn, w) {
    if (isAnswered) return;
    isAnswered = true;

    if (correct) {
      score++;
      U.setText('speedScore', score);
      U.clickSound('ok');
      if (window.Pet) Pet.feed(true);
      if (window.Stats) Stats.recordAnswer(true);
    } else {
      btn.classList.add('wrong');
      document.querySelectorAll('#arcadeOptions .option').forEach(o => {
        if (o.textContent === w.ru) o.classList.add('correct');
      });
      U.clickSound('err');
      if (window.Pet) Pet.feed(false);
      if (window.Stats) Stats.recordAnswer(false);
    }

    // Мгновенно следующий
    if (speedTimeLeft > 0) {
      setTimeout(() => {
        if (speedTimer) next();
      }, 200);
    }
  }

  /* ============================================================
     Повтор озвучки
     ============================================================ */
  function replay() {
    if (mode === 'dictation' && dictationCurrent) {
      U.speakHanzi(dictationCurrent.hanzi);
    }
  }

  /* ============================================================
     Инициализация
     ============================================================ */
  function init() {
    console.log('[arcade.js] Инициализировано. Режимов: 3 (speed, dictation, tetris)');
  }

  /* ============================================================
     Экспорт
     ============================================================ */
  window.Arcade = {
    init,
    showMenu,
    start,
    next,
    stop: stopAll,
    backToMenu,
    _replay: replay,
    _nextDictation: nextDictationPublic
  };

  console.log('[arcade.js] Загружено: Arcade.start, Arcade.showMenu');

})();
