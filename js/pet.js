/* =====================================================================
   pet.js — панда-питомец Сяо-Сяо
   =====================================================================
   Экспортирует `Pet`:
     Pet.init()
     Pet.feed(correct)         — вызвать после ответа в любом тренажёре
     Pet.render()              — отрисовать карточку панды
     Pet.pet()                 — погладить (тапнуть)
     Pet.getState()            — для отладки

   Хранилище:
     ключ `pet` → {
       xp: 0,
       level: 1,
       hunger: 100,       // 0..100
       joy: 100,          // 0..100
       lastVisit: "YYYY-MM-DD",
       lastFed: "YYYY-MM-DD",
       totalAnswers: 0,
       correctAnswers: 0,
       emoji: "🐼"
     }

   Логика:
     - Каждый правильный ответ: +1 XP, +5 сытости, +3 радости
     - Каждый неправильный: -2 сытости, -1 радости (но не меньше 0)
     - Раз в день без занятий: -15 сытости, -10 радости
     - 500 XP = новый уровень
     - 100 XP = панда «наелась», показывает счастливую мордочку
   ===================================================================== */

(function () {
  'use strict';

  /* ============================================================
     Константы
     ============================================================ */
  const XP_PER_LEVEL = 500;
  const HUNGER_PER_CORRECT = 5;
  const HUNGER_PER_WRONG = -2;
  const JOY_PER_CORRECT = 3;
  const JOY_PER_WRONG = -1;
  const DECAY_PER_DAY = { hunger: -15, joy: -10 };

  const LEVEL_EMOJI = ['🐾', '🐼', '🐼', '🐼', '🐼', '🐼', '🐼', '🐼', '🐼', '🐼'];

  /* ============================================================
     Состояние
     ============================================================ */
  let state = {
    xp: 0,
    level: 1,
    hunger: 100,
    joy: 100,
    lastVisit: null,
    lastFed: null,
    totalAnswers: 0,
    correctAnswers: 0
  };

  /* ============================================================
     Загрузка / сохранение
     ============================================================ */
  function load() {
    const saved = U.Storage.get('pet', null);
    if (saved && typeof saved === 'object') {
      state = Object.assign(state, saved);
    }
    applyDecay();
  }

  function save() {
    U.Storage.set('pet', state);
  }

  /* ============================================================
     Естественное «увядание» — если давно не заходила
     ============================================================ */
  function applyDecay() {
    const today = U.todayKey();
    if (!state.lastVisit) {
      state.lastVisit = today;
      return;
    }
    if (state.lastVisit === today) return;

    const days = U.daysSince(state.lastVisit + 'T00:00:00');
    if (days <= 0) return;

    const decay = Math.min(days, 5); // максимум 5 дней увядания
    state.hunger = clamp(state.hunger + DECAY_PER_DAY.hunger * decay, 0, 100);
    state.joy = clamp(state.joy + DECAY_PER_DAY.joy * decay, 0, 100);
    state.lastVisit = today;

    save();
  }

  /* ============================================================
     Помощники
     ============================================================ */
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function levelFromXP(xp) {
    return Math.floor(xp / XP_PER_LEVEL) + 1;
  }

  function xpInLevel(xp) {
    return xp % XP_PER_LEVEL;
  }

  /* ============================================================
     ОСНОВНОЕ: кормить (после каждого ответа)
     ============================================================ */
  function feed(correct) {
    state.totalAnswers++;
    if (correct) {
      state.correctAnswers++;
      state.xp += 1;
      state.hunger = clamp(state.hunger + HUNGER_PER_CORRECT, 0, 100);
      state.joy = clamp(state.joy + JOY_PER_CORRECT, 0, 100);
    } else {
      state.hunger = clamp(state.hunger + HUNGER_PER_WRONG, 0, 100);
      state.joy = clamp(state.joy + JOY_PER_WRONG, 0, 100);
    }

    // Проверяем повышение уровня
    const newLevel = levelFromXP(state.xp);
    if (newLevel > state.level) {
      state.level = newLevel;
      onLevelUp();
    }

    // Обновляем дату кормления
    const today = U.todayKey();
    if (state.lastFed !== today && correct) {
      state.lastFed = today;
    }

    save();
  }

  /* ============================================================
     Повышение уровня — тост и радость
     ============================================================ */
  function onLevelUp() {
    setTimeout(() => {
      U.toast(`🐼 Сяо-Сяо выросла! Уровень ${state.level}`, 3000);
    }, 500);
  }

  /* ============================================================
     Погладить — просто реакция
     ============================================================ */
  function pet() {
    state.joy = clamp(state.joy + 2, 0, 100);
    save();

    const reactions = [
      '🐼 Сяо-Сяо довольна!',
      '🐼 Сяо-Сяо мурлычет',
      '🐼 Сяо-Сяо улыбается',
      '🐼 Сяо-Сяо обнимает тебя',
      '🐼 谢谢！'
    ];
    U.toast(reactions[Math.floor(Math.random() * reactions.length)]);
    U.clickSound('ok');
    render();
  }

  /* ============================================================
     Случайная фраза панды — в зависимости от состояния
     ============================================================ */
  function petPhrase() {
    const h = state.hunger;
    const j = state.joy;
    const streak = (window.Stats && Stats.getStreak) ? Stats.getStreak() : 0;

    if (streak >= 7) return 'Ты супер! Я так рада 💕';
    if (h >= 90 && j >= 90) return 'Я сыта и счастлива! 🥰';
    if (h >= 90) return 'Спасибо, я наелась!';
    if (j >= 90) return 'Мне так весело с тобой!';
    if (h <= 20) return 'Я проголодалась... 🥺';
    if (j <= 20) return 'Мне немного грустно...';
    if (h <= 50) return 'Можно ещё поесть?';
    if (j <= 50) return 'Поиграй со мной?';
    return 'Привет! Рада тебя видеть 🌸';
  }

  /* ============================================================
     Рендер карточки панды (на главном экране)
     ============================================================ */
  function render() {
    const el = U.el('petCard');
    if (!el) return;

    const hungerPct = Math.round(state.hunger);
    const joyPct = Math.round(state.joy);
    const xpIn = xpInLevel(state.xp);
    const xpPct = Math.round(xpIn / XP_PER_LEVEL * 100);

    const emoji = state.hunger <= 30 ? '🐼' :
                  state.joy >= 80 ? '🐼' : '🐼';

    el.innerHTML = `
      <div class="pet-row" onclick="Pet.pet()">
        <div class="pet-emoji">${emoji}</div>
        <div class="pet-info">
          <div class="pet-name">
            Сяо-Сяо · Ур. ${state.level}
          </div>
          <div class="pet-phrase">${petPhrase()}</div>
          <div class="pet-bars">
            <div class="pet-bar">
              <span class="pet-bar-label">🍎</span>
              <div class="pet-bar-track">
                <div class="pet-bar-fill hunger" style="width:${hungerPct}%"></div>
              </div>
              <span class="pet-bar-num">${hungerPct}%</span>
            </div>
            <div class="pet-bar">
              <span class="pet-bar-label">😊</span>
              <div class="pet-bar-track">
                <div class="pet-bar-fill joy" style="width:${joyPct}%"></div>
              </div>
              <span class="pet-bar-num">${joyPct}%</span>
            </div>
          </div>
          <div class="pet-xp">
            XP ${xpIn} / ${XP_PER_LEVEL} · всего ${state.xp}
          </div>
        </div>
      </div>
    `;
  }

  /* ============================================================
     Инициализация
     ============================================================ */
  function init() {
    load();
    render();
    console.log('[pet.js] Инициализировано. Ур.', state.level,
                '| XP', state.xp,
                '| Сытость', Math.round(state.hunger) + '%',
                '| Радость', Math.round(state.joy) + '%');
  }

  /* ============================================================
     Экспорт
     ============================================================ */
  window.Pet = {
    init,
    feed,
    render,
    pet,
    getState: () => ({ ...state })
  };

  console.log('[pet.js] Загружено: Pet.init, Pet.feed, Pet.render');

})();
