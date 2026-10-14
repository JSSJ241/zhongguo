/* =====================================================================
   stats.js — статистика, streak, цели, графики
   =====================================================================
   Экспортирует в глобальный объект `Stats`:
     Stats.init()              — загрузка сохранённых данных
     Stats.recordAnswer(ok)    — записать ответ (вызывается из тренажёра)
     Stats.refresh()           — перерисовать главный экран
     Stats.getStreak()         — текущий streak
     Stats.getTodayCount()     — сколько ответов сегодня
     Stats.getDaily()          — объект {дата: кол-во} для heatmap
     Stats.reset()             — сброс (используется при сбросе прогресса)

   Хранилище:
     ключ `stats` → {
       streak: 0,
       lastDay: "YYYY-MM-DD" | null,
       daily: { "2026-10-14": { total: 42, correct: 38 } },
       history: [ { day:"2026-10-14", total:42, correct:38 } ]
     }
   ===================================================================== */

(function () {
  'use strict';

  /* ============================================================
     1. Состояние
     ============================================================ */
  const DEFAULT = {
    streak: 0,
    lastDay: null,
    daily: {},       // { "YYYY-MM-DD": { total, correct } }
    history: []      // массив { day, total, correct } за последние 30 дней
  };

  let state = { ...DEFAULT };

  /* ============================================================
     2. Загрузка / сохранение
     ============================================================ */
  function load() {
    const saved = U.Storage.get('stats', null);
    if (saved && typeof saved === 'object') {
      state = Object.assign({}, DEFAULT, saved);
      if (!state.daily) state.daily = {};
      if (!state.history) state.history = [];
    } else {
      state = { ...DEFAULT };
    }
  }

  function save() {
    U.Storage.set('stats', state);
  }

  /* ============================================================
     3. STREAK
     ============================================================ */
  function updateStreak() {
    const today = U.todayKey();
    const yesterday = U.shiftDay(today, -1);

    if (state.lastDay === today) {
      // уже занималась сегодня — streak не меняется
      return;
    }

    if (state.lastDay === yesterday) {
      // вчера занималась — продолжаем streak
      state.streak = (state.streak || 0) + 1;
    } else if (state.lastDay === null) {
      // первый запуск
      state.streak = 1;
    } else {
      // пропуск больше дня — обнуляем
      state.streak = 1;
    }

    state.lastDay = today;
  }

  function getStreak() {
    // Если последний день не сегодня и не вчера — фактически streak уже сломан
    const today = U.todayKey();
    const yesterday = U.shiftDay(today, -1);
    if (state.lastDay !== today && state.lastDay !== yesterday) {
      return 0;
    }
    return state.streak || 0;
  }

  /* ============================================================
     4. ОТВЕТЫ
     ============================================================ */
  /**
   * Записать один ответ.
   * @param {boolean} correct
   */
  function recordAnswer(correct) {
    const today = U.todayKey();

    // инициализация дня
    if (!state.daily[today]) {
      state.daily[today] = { total: 0, correct: 0 };
    }
    state.daily[today].total++;
    if (correct) state.daily[today].correct++;

    // обновить streak
    updateStreak();

    // пересобрать history за последние 30 дней
    rebuildHistory();

    save();
  }

  function rebuildHistory() {
    const today = U.todayKey();
    const arr = [];
    for (let i = 29; i >= 0; i--) {
      const day = U.shiftDay(today, -i);
      const rec = state.daily[day] || { total: 0, correct: 0 };
      arr.push({ day, total: rec.total, correct: rec.correct });
    }
    state.history = arr;
  }

  /* ============================================================
     5. ГЕТТЕРЫ
     ============================================================ */
  function getTodayCount() {
    const today = U.todayKey();
    const rec = state.daily[today];
    return rec ? rec.total : 0;
  }

  function getTodayCorrect() {
    const today = U.todayKey();
    const rec = state.daily[today];
    return rec ? rec.correct : 0;
  }

  function getDaily() {
    return state.daily || {};
  }

  /* ============================================================
     6. ОТРИСОВКА ТЕПЛОВОЙ КАРТЫ
     ============================================================ */
  /**
   * Тепловая карта — 12 недель (84 дня).
   * Столбцы = недели, строки = дни недели (Пн..Вс).
   */
  function renderHeatmap() {
    const el = U.el('heatmap');
    if (!el) return;

    const WEEKS = 12;
    const today = U.todayKey();
    const daily = state.daily || {};

    // Находим ближайший понедельник к "today" и отсчитываем назад 12 недель
    const [y, m, d] = today.split('-').map(Number);
    const now = new Date(y, m - 1, d);
    const dow = (now.getDay() + 6) % 7; // 0=Пн, 6=Вс
    const monday = new Date(now);
    monday.setDate(now.getDate() - dow);

    // 12 недель × 7 дней
    let html = '';
    const totalCells = WEEKS * 7;

    // Сначала соберём все даты слева направо, сверху вниз (по столбцам)
    const dates = [];
    for (let col = 0; col < WEEKS; col++) {
      for (let row = 0; row < 7; row++) {
        const cellDate = new Date(monday);
        cellDate.setDate(monday.getDate() - (WEEKS - 1 - col) * 7 + row);
        const key =
          cellDate.getFullYear() + '-' +
          String(cellDate.getMonth() + 1).padStart(2, '0') + '-' +
          String(cellDate.getDate()).padStart(2, '0');
        dates.push({ key, isFuture: cellDate > now });
      }
    }

    // Считаем максимальное количество ответов за день (для шкалы уровней)
    let maxCount = 0;
    dates.forEach(({ key }) => {
      const c = daily[key] ? daily[key].total : 0;
      if (c > maxCount) maxCount = c;
    });

    // Функция уровня
    function levelFor(count) {
      if (count === 0) return 0;
      if (maxCount <= 4) return count >= 1 ? 2 : 0;
      const ratio = count / maxCount;
      if (ratio <= 0.25) return 1;
      if (ratio <= 0.5) return 2;
      if (ratio <= 0.75) return 3;
      return 4;
    }

    // grid-auto-flow: column → заполняем по столбцам сверху вниз
    dates.forEach(({ key, isFuture }) => {
      const count = daily[key] ? daily[key].total : 0;
      const lvl = isFuture ? 0 : levelFor(count);
      const cls = 'heat-cell' + (lvl > 0 ? ' l' + lvl : '');
      const title = `${key} — ${count} ответов`;
      html += `<div class="${cls}" title="${title}"></div>`;
    });

    el.innerHTML = html;

    // Диапазон
    const rangeText = U.el('activityRange');
    if (rangeText) {
      const first = dates[0].key;
      const last = dates[dates.length - 1].key;
      rangeText.textContent = `${first} → ${last}`;
    }
  }

  /* ============================================================
     7. ГРАФИК ТОЧНОСТИ ЗА НЕДЕЛЮ
     ============================================================ */
  function renderChart() {
    const chartEl = U.el('chart');
    const labelsEl = U.el('chartLabels');
    if (!chartEl || !labelsEl) return;

    const today = U.todayKey();
    const daily = state.daily || {};

    // Последние 7 дней
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const day = U.shiftDay(today, -i);
      const rec = daily[day] || { total: 0, correct: 0 };
      const acc = rec.total > 0 ? Math.round((rec.correct / rec.total) * 100) : 0;
      days.push({ day, total: rec.total, acc });
    }

    // Максимум по шкале = 100 (%)
    chartEl.innerHTML = days.map(d => {
      // Высота пропорциональна точности (0..100)
      const height = d.total > 0 ? d.acc : 0;
      const label = d.total > 0 ? `${d.acc}%` : '';
      return `<div class="chart-bar" style="height:${height}%;"
                   title="${d.day} — ${d.total} ответов, ${d.acc}%">
                ${label ? `<span>${label}</span>` : ''}
              </div>`;
    }).join('');

    // Метки дней недели
    const dayNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    labelsEl.innerHTML = days.map(d => {
      const [y, m, dd] = d.day.split('-').map(Number);
      const dt = new Date(y, m - 1, dd);
      const dow = (dt.getDay() + 6) % 7;
      return `<span>${dayNames[dow]}</span>`;
    }).join('');
  }

  /* ============================================================
     8. ОБНОВЛЕНИЕ ГЛАВНОГО ЭКРАНА
     ============================================================ */
  function refresh() {
    // Streak
    U.setText('streakNum', getStreak());
    // Сегодня
    U.setText('todayNum', getTodayCount());
    // Цель
    const goal = (window.Settings && Settings.get('goal')) || 20;
    const done = getTodayCount();
    U.setText('goalDone', Math.min(done, goal));
    U.setText('goalTarget', goal);
    const percent = Math.min(100, Math.round(done / goal * 100));
    const fill = U.el('goalFill');
    if (fill) fill.style.width = percent + '%';

    // Тепловая карта и график
    renderHeatmap();
    renderChart();

    // Панель активности — сколько слов в базе
    const words = U.Storage.get('words', []);
    const stat = U.el('homeStats');
    if (stat) stat.textContent = `${words.length} слов`;
  }

  /* ============================================================
     9. СБРОС
     ============================================================ */
  function reset() {
    state = { ...DEFAULT };
    save();
  }

  /* ============================================================
     10. ИНИЦИАЛИЗАЦИЯ
     ============================================================ */
  function init() {
    load();
    rebuildHistory();
    console.log('[stats.js] Инициализировано. Streak:', getStreak(),
                '| Сегодня:', getTodayCount(), 'ответов');
  }

  /* ============================================================
     11. ЭКСПОРТ
     ============================================================ */
  window.Stats = {
    init,
    refresh,
    recordAnswer,
    getStreak,
    getTodayCount,
    getTodayCorrect,
    getDaily,
    reset,
    // для отладки
    _state: () => state
  };

  console.log('[stats.js] Загружено: Stats.init, Stats.recordAnswer, Stats.refresh');

})();
