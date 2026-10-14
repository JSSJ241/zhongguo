/* =====================================================================
   dragon.js — битва с драконом
   =====================================================================
   Экспортирует `Dragon`:
     Dragon.init()
     Dragon.start(levelIdx)      — начать бой с драконом уровня N (0..5)
     Dragon.next()               — следующий вопрос
     Dragon.answer(value)        — ответ на текущий вопрос
     Dragon.flee()               — сбежать из боя
     Dragon.renderHome()         — отрисовать карточку драконов на главной
     Dragon.getState()           — для отладки

   Хранилище:
     ключ `dragon` → {
       defeated: [],          // [0, 1, 2] — индексы побеждённых
       totalWins: 0,
       totalBattles: 0
     }
   ===================================================================== */

(function () {
  'use strict';

  /* ============================================================
     Уровни драконов
     ============================================================ */
  const DRAGONS = [
    {
      name: 'Зелёный',
      emoji: '🐉',
      difficulty: 'легко',
      questions: 10,
      hp: 60,
      yourHp: 100,
      dmgPerHit: 20,
      dmgToYou: 10,
      timer: 0,                  // нет таймера
      mode: 'options',           // выбор из 4
      questionType: 'ru'         // спрашиваем перевод
    },
    {
      name: 'Синий',
      emoji: '🐉',
      difficulty: 'легко',
      questions: 12,
      hp: 80,
      yourHp: 100,
      dmgPerHit: 20,
      dmgToYou: 10,
      timer: 0,
      mode: 'options',
      questionType: 'pinyin'
    },
    {
      name: 'Бирюзовый',
      emoji: '🐲',
      difficulty: 'средне',
      questions: 12,
      hp: 100,
      yourHp: 100,
      dmgPerHit: 20,
      dmgToYou: 12,
      timer: 10,                 // 10 секунд
      mode: 'options',
      questionType: 'hanzi'
    },
    {
      name: 'Фиолетовый',
      emoji: '🐲',
      difficulty: 'средне',
      questions: 12,
      hp: 120,
      yourHp: 100,
      dmgPerHit: 20,
      dmgToYou: 12,
      timer: 8,
      mode: 'options',
      questionType: 'audio'       // слушаешь и выбираешь
    },
    {
      name: 'Красный',
      emoji: '🐉',
      difficulty: 'сложно',
      questions: 15,
      hp: 150,
      yourHp: 100,
      dmgPerHit: 15,
      dmgToYou: 15,
      timer: 5,
      mode: 'input',              // пишешь сам
      questionType: 'ru'
    },
    {
      name: 'Золотой',
      emoji: '🐉',
      difficulty: 'хард',
      questions: 20,
      hp: 200,
      yourHp: 80,
      dmgPerHit: 15,
      dmgToYou: 20,
      timer: 5,
      mode: 'input',
      questionType: 'pinyin'
    }
  ];

  const PRAISE_HIT = ['⚡ Точный удар!', '💥 Критический удар!', '🔥 Мощно!', '✨ В точку!'];

  /* ============================================================
     Состояние
     ============================================================ */
  let progress = {
    defeated: [],
    totalWins: 0,
    totalBattles: 0
  };

  let battle = null;     // { dragonIdx, dragonHp, yourHp, qIndex, current, isAnswered }
  let timerInterval = null;
  let timeLeft = 0;

  /* ============================================================
     Загрузка / сохранение
     ============================================================ */
  function load() {
    const saved = U.Storage.get('dragon', null);
    if (saved && typeof saved === 'object') {
      progress = Object.assign(progress, saved);
    }
  }

  function save() {
    U.Storage.set('dragon', progress);
  }

  /* ============================================================
     Стартовый экран — карточки драконов
     ============================================================ */
  function renderHome() {
    const el = U.el('dragonList');
    if (!el) return;

    el.innerHTML = DRAGONS.map((d, i) => {
      const won = progress.defeated.includes(i);
      const locked = i > 0 && !progress.defeated.includes(i - 1);
      const cls = won ? 'dragon-card won' :
                  locked ? 'dragon-card locked' :
                  'dragon-card';
      const badge = won ? '✓ побеждён' : locked ? '🔒 закрыт' : '⚔ сразиться';

      return `
        <div class="${cls}" ${!locked ? `onclick="Dragon.start(${i})"` : ''}>
          <div class="dragon-emoji">${d.emoji}</div>
          <div class="dragon-info">
            <div class="dragon-name">${d.name}</div>
            <div class="dragon-meta">${d.difficulty} · ${d.questions} вопросов</div>
          </div>
          <div class="dragon-badge">${badge}</div>
        </div>
      `;
    }).join('');
  }

  /* ============================================================
     Старт боя
     ============================================================ */
  function start(dragonIdx) {
    if (dragonIdx >= DRAGONS.length) return;

    const d = DRAGONS[dragonIdx];

    battle = {
      dragonIdx,
      dragon: d,
      dragonHp: d.hp,
      dragonHpMax: d.hp,
      yourHp: d.yourHp,
      yourHpMax: d.yourHp,
      qIndex: 0,
      totalQ: d.questions,
      current: null,
      isAnswered: false
    };

    progress.totalBattles++;
    save();

    // Показываем экран
    if (window.App && typeof App.go === 'function') {
      App.go('screenDragon');
    }

    // Заполняем «шапку»
    renderBattleHeader();
    next();
  }

  /* ============================================================
     Отрисовка шапки боя (HP)
     ============================================================ */
  function renderBattleHeader() {
    if (!battle) return;

    const dragonHpPct = Math.round(battle.dragonHp / battle.dragonHpMax * 100);
    const yourHpPct = Math.round(battle.yourHp / battle.yourHpMax * 100);

    U.setHtml('dragonHeader', `
      <div class="battle-hp-row">
        <span>${battle.dragon.emoji} Дракон</span>
        <span>${battle.dragonHp} / ${battle.dragonHpMax}</span>
      </div>
      <div class="battle-hp-track">
        <div class="battle-hp-fill dragon" style="width:${dragonHpPct}%"></div>
      </div>
      <div class="battle-hp-row" style="margin-top:10px;">
        <span>❤️ Ты</span>
        <span>${battle.yourHp} / ${battle.yourHpMax}</span>
      </div>
      <div class="battle-hp-track">
        <div class="battle-hp-fill you" style="width:${yourHpPct}%"></div>
      </div>
      <div class="battle-q-counter">Вопрос ${battle.qIndex + 1} / ${battle.totalQ}</div>
    `);
  }

  /* ============================================================
     Следующий вопрос
     ============================================================ */
  function next() {
    if (!battle) return;

    if (battle.qIndex >= battle.totalQ) {
      endBattle(false);
      return;
    }

    battle.qIndex++;
    battle.isAnswered = false;

    // Выбираем случайное слово
    const words = U.Storage.get('words', []);
    if (!words.length) { endBattle(false); return; }

    const w = words[Math.floor(Math.random() * words.length)];
    battle.current = w;

    renderBattleHeader();
    renderQuestion(w);

    // Таймер
    if (battle.dragon.timer > 0) {
      startTimer(battle.dragon.timer);
    }
  }

  /* ============================================================
     Отрисовка вопроса
     ============================================================ */
  function renderQuestion(w) {
    const el = U.el('dragonOptions');
    el.innerHTML = '';

    const fb = U.el('dragonFeedback');
    fb.className = 'feedback';
    fb.innerHTML = '';

    U.el('dragonNextBtn').style.display = 'none';

    const type = battle.dragon.questionType;
    const mode = battle.dragon.mode;

    // === Что показываем ===
    if (type === 'audio') {
      U.setText('dragonQuestion', '🔊 Дракон произносит заклинание');
      U.speakHanzi(w.hanzi);
      // Кнопка повтора
      el.innerHTML += `<button class="btn btn-secondary" onclick="Dragon._replay()">🔊 Ещё раз</button>`;
    } else if (type === 'ru') {
      U.setText('dragonQuestion', 'Что означает это слово?');
      U.setHtml('dragonMainWord', `<div class="dragon-word hz">${U.escapeHtml(w.hanzi)}</div>`);
    } else if (type === 'pinyin') {
      U.setText('dragonQuestion', 'Как читается это слово?');
      U.setHtml('dragonMainWord', `<div class="dragon-word hz">${U.escapeHtml(w.hanzi)}</div>`);
    } else if (type === 'hanzi') {
      U.setText('dragonQuestion', 'Какой это иероглиф?');
      U.setHtml('dragonMainWord', `<div class="dragon-word" style="font-size:32px; color:var(--red-dark);">${U.escapeHtml(w.ru)}</div>`);
    }

    // === Ответ ===
    if (mode === 'options') {
      renderOptions(w, type);
    } else {
      renderInput(w, type);
    }
  }

  /* ============================================================
     Варианты (выбор из 4)
     ============================================================ */
  function renderOptions(w, type) {
    const words = U.Storage.get('words', []);
    const fieldMap = { ru: 'ru', pinyin: 'pinyin', hanzi: 'hanzi', audio: 'hanzi' };
    const field = fieldMap[type];
    const correct = w[field];

    const wrong = U.shuffle(
      words.map(x => x[field]).filter(v => v !== correct)
    ).slice(0, 3);

    const options = U.shuffle([correct, ...wrong]);
    const el = U.el('dragonOptions');

    options.forEach(v => {
      const b = document.createElement('div');
      b.className = 'option' + (type === 'audio' || type === 'hanzi' ? ' hanzi-opt' : '');
      b.textContent = v;
      b.onclick = () => answer(v === correct, b, correct);
      el.appendChild(b);
    });
  }

  /* ============================================================
     Поле ввода
     ============================================================ */
  function renderInput(w, type) {
    const el = U.el('dragonOptions');

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'answer-input';
    inp.autocomplete = 'off';
    inp.autocorrect = 'off';
    inp.autocapitalize = 'off';
    inp.spellcheck = false;
    inp.placeholder = type === 'ru' ? 'перевод…' : 'nǐ hǎo…';
    el.appendChild(inp);

    const fieldMap = { ru: 'ru', pinyin: 'pinyin' };
    const field = fieldMap[type];
    const correct = w[field];

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = '⚔ Атаковать';
    btn.onclick = () => answer(U.isCorrect(inp.value, correct, type), null, correct);
    el.appendChild(btn);

    setTimeout(() => inp.focus(), 100);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); btn.click(); }
    });
  }

  /* ============================================================
     Таймер
     ============================================================ */
  function startTimer(seconds) {
    stopTimer();
    timeLeft = seconds;
    updateTimerUI();

    timerInterval = setInterval(() => {
      timeLeft--;
      updateTimerUI();
      if (timeLeft <= 0) {
        stopTimer();
        if (!battle.isAnswered) {
          // время вышло — промах
          answer(false, null, null);
        }
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimerUI() {
    const el = U.el('dragonTimer');
    if (!el) return;
    if (timeLeft <= 0) {
      el.textContent = '';
      return;
    }
    el.textContent = `⏱ ${timeLeft} с`;
    el.classList.toggle('urgent', timeLeft <= 3);
  }

  /* ============================================================
     Обработка ответа
     ============================================================ */
  function answer(correct, btn, correctValue) {
    if (!battle || battle.isAnswered) return;
    battle.isAnswered = true;

    stopTimer();

    // Блокируем варианты
    document.querySelectorAll('#dragonOptions .option')
      .forEach(o => o.classList.add('disabled'));
    document.querySelectorAll('#dragonOptions button')
      .forEach(b => b.disabled = true);
    const inp = document.querySelector('#dragonOptions .answer-input');
    if (inp) inp.disabled = true;

    const fb = U.el('dragonFeedback');

    if (correct) {
      // Урон дракону
      const dmg = battle.dragon.dmgPerHit;
      battle.dragonHp = Math.max(0, battle.dragonHp - dmg);

      if (btn) btn.classList.add('correct');
      if (inp) inp.classList.add('correct');

      const praise = PRAISE_HIT[Math.floor(Math.random() * PRAISE_HIT.length)];
      fb.className = 'feedback ok show';
      fb.innerHTML = `${praise} −${dmg} HP`;

      U.clickSound('ok');
      if (window.Pet) Pet.feed(true);
      if (window.Stats) Stats.recordAnswer(true);

      // Озвучка слова
      if (battle.current) U.speakHanzi(battle.current.hanzi);
    } else {
      // Урон тебе
      const dmg = battle.dragon.dmgToYou;
      battle.yourHp = Math.max(0, battle.yourHp - dmg);

      if (btn) btn.classList.add('wrong');
      if (inp) inp.classList.add('wrong');

      // Подсветим правильный вариант
      if (correctValue && btn) {
        document.querySelectorAll('#dragonOptions .option').forEach(o => {
          if (o.textContent === correctValue) o.classList.add('correct');
        });
      }

      fb.className = 'feedback err show';
      const reveal = correctValue
        ? `Правильно: <b>${correctValue}</b>`
        : 'Время вышло!';
      fb.innerHTML = `💥 ${reveal} −${dmg} HP`;

      U.clickSound('err');
      if (window.Pet) Pet.feed(false);
      if (window.Stats) Stats.recordAnswer(false);
    }

    renderBattleHeader();

    // Проверяем победу/поражение
    if (battle.dragonHp <= 0) {
      endBattle(true);
      return;
    }
    if (battle.yourHp <= 0) {
      endBattle(false);
      return;
    }

    // Кнопка «Далее»
    setTimeout(() => {
      U.el('dragonNextBtn').style.display = 'flex';
      U.el('dragonNextBtn').focus();
    }, 400);
  }

  /* ============================================================
     Конец боя
     ============================================================ */
  function endBattle(won) {
    stopTimer();

    if (won) {
      const idx = battle.dragonIdx;
      if (!progress.defeated.includes(idx)) {
        progress.defeated.push(idx);
      }
      progress.totalWins++;
      save();

      U.setHtml('dragonOptions', `
        <div class="finish">
          <span class="emoji">🎉</span>
          <h2>Победа!</h2>
          <div class="big-score">${battle.dragon.emoji}</div>
          <div class="percent">
            ${battle.dragon.name} дракон повержен
          </div>
          <button class="btn btn-primary" onclick="Dragon.renderHome(); App.go('screenDragonMenu')">
            ▶ К списку драконов
          </button>
          <button class="btn btn-secondary" onclick="App.go('screenHome'); Stats.refresh();">
            🏠 В меню
          </button>
        </div>
      `);
    } else {
      U.setHtml('dragonOptions', `
        <div class="finish">
          <span class="emoji">💀</span>
          <h2>Поражение…</h2>
          <div class="big-score" style="color:#999;">${battle.dragon.emoji}</div>
          <div class="percent">
            Дракон оказался сильнее. Попробуй ещё раз!
          </div>
          <button class="btn btn-primary" onclick="Dragon.start(${battle.dragonIdx})">
            ⚔ Ещё раз
          </button>
          <button class="btn btn-secondary" onclick="Dragon.renderHome(); App.go('screenDragonMenu')">
            ← К списку
          </button>
        </div>
      `);
    }

    U.setText('dragonQuestion', '');
    U.setHtml('dragonMainWord', '');
    const fb = U.el('dragonFeedback');
    fb.className = 'feedback';
    fb.innerHTML = '';
    U.el('dragonNextBtn').style.display = 'none';
    U.setText('dragonTimer', '');

    if (window.Stats) setTimeout(() => Stats.refresh(), 300);
  }

  /* ============================================================
     Побег
     ============================================================ */
  function flee() {
    if (!battle) return;
    if (!confirm('Сбежать из боя? Прогресс не сохранится.')) return;
    stopTimer();
    battle = null;
    renderHome();
    if (window.App) App.go('screenDragonMenu');
  }

  /* ============================================================
     Инициализация
     ============================================================ */
  function init() {
    load();
    console.log('[dragon.js] Инициализировано. Побеждено:', progress.defeated.length,
                '/', DRAGONS.length);
  }

  /* ============================================================
     Экспорт
     ============================================================ */
  window.Dragon = {
    init,
    start,
    next,
    renderHome,
    flee,
    getState: () => ({ progress, battle }),
    _replay: () => { if (battle && battle.current) U.speakHanzi(battle.current.hanzi); }
  };

  console.log('[dragon.js] Загружено: Dragon.start, Dragon.renderHome');

})();
