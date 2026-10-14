/* =====================================================================
   settings.js — настройки приложения
   =====================================================================
   Экспортирует в глобальный объект `Settings`:
     Settings.show()        — открыть экран настроек
     Settings.init()        — инициализация (загрузка сохранённых)
     Settings.get(key)      — получить значение
     Settings.set(key, v)   — установить значение
     Settings.setTheme(t)   — сменить тему
     Settings.setGoal(n)    — дневная цель
     Settings.toggleSpeak(el)
     Settings.toggleClick(el)
     Settings.togglePraise(el)
     Settings.exportData()
     Settings.importData()
     Settings.resetProgress()
   ===================================================================== */

(function () {
  'use strict';

  /* ============================================================
     1. Значения по умолчанию
     ============================================================ */
  const DEFAULTS = {
    theme: 'classic',       // classic | jade | night | minimal
    goal: 20,               // карточек в день
    speak: true,            // озвучка слов
    click: true,            // звук клика
    praise: true            // радостная похвала
  };

  /* ============================================================
     2. Внутреннее состояние
     ============================================================ */
  const state = { ...DEFAULTS };

  /* ============================================================
     3. Загрузка / сохранение
     ============================================================ */
  function load() {
    const saved = U.Storage.get('settings', {});
    Object.assign(state, DEFAULTS, saved);
  }

  function save() {
    U.Storage.set('settings', state);
  }

  function get(key) {
    return state[key];
  }

  function set(key, value) {
    state[key] = value;
    save();
    return value;
  }

  /* ============================================================
     4. ТЕМА
     ============================================================ */
  function applyTheme(theme) {
    const valid = ['classic', 'jade', 'night', 'minimal'];
    if (!valid.includes(theme)) theme = 'classic';
    document.body.dataset.theme = theme;

    // Обновляем активную точку в интерфейсе настроек
    document.querySelectorAll('.theme-swatch').forEach(sw => {
      sw.classList.toggle('active', sw.dataset.theme === theme);
    });

    // Мета-тег theme-color под цвет шапки
    const colors = {
      classic: '#c73e3a',
      jade: '#2f7d5c',
      night: '#1a1d24',
      minimal: '#1a1a1a'
    };
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colors[theme] || colors.classic);
  }

  function setTheme(theme) {
    set('theme', theme);
    applyTheme(theme);
    if (state.click) U.clickSound('click');
  }

  /* ============================================================
     5. ДНЕВНАЯ ЦЕЛЬ
     ============================================================ */
  function setGoal(n) {
    const goal = Math.max(5, Math.min(100, parseInt(n) || 20));
    set('goal', goal);

    // Обновляем отображение
    U.setText('goalValue', goal);
    U.setText('goalTarget', goal);

    // Обновляем прогресс-бар в главном меню
    if (window.Stats && typeof Stats.refresh === 'function') {
      Stats.refresh();
    }
  }

  /* ============================================================
     6. ТУМБЛЕРЫ
     ============================================================ */
  function toggleSpeak(el) {
    const newVal = !state.speak;
    set('speak', newVal);
    el.classList.toggle('on', newVal);

    // Сообщаем тренажёру
    if (window.Training && typeof Training.setSpeakEnabled === 'function') {
      Training.setSpeakEnabled(newVal);
    }

    // Проверяем через тестовую фразу
    if (newVal) U.speak('你好');

    U.toast(newVal ? '🔊 Озвучка включена' : '🔇 Озвучка выключена');
  }

  function toggleClick(el) {
    const newVal = !state.click;
    set('click', newVal);
    el.classList.toggle('on', newVal);
    U.setClickEnabled(newVal);

    if (newVal) U.clickSound('ok');

    U.toast(newVal ? '🔔 Звук включён' : '🔕 Звук выключен');
  }

  function togglePraise(el) {
    const newVal = !state.praise;
    set('praise', newVal);
    el.classList.toggle('on', newVal);
    U.toast(newVal ? '😊 Похвала включена' : '🤐 Похвала выключена');
  }

  /* ============================================================
     7. ЭКСПОРТ / ИМПОРТ ДАННЫХ
     ============================================================ */
  async function exportData() {
    try {
      const json = U.Storage.exportAll();

      // Пробуем через буфер обмена (на телефоне может не сработать)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(json);
        U.toast('📤 Данные скопированы в буфер обмена');
      } else {
        // Fallback — показать в диалоге
        prompt('Скопируй данные (Ctrl+C / Cmd+C):', json);
      }
    } catch (e) {
      console.error('[exportData]', e);
      U.toast('❌ Не удалось экспортировать');
    }
  }

  function importData() {
    const json = prompt('Вставь JSON-бэкап:');
    if (!json || !json.trim()) return;

    const count = U.Storage.importAll(json);
    if (count > 0) {
      U.toast(`📥 Импортировано ключей: ${count}. Перезагружаю...`);
      setTimeout(() => location.reload(), 1200);
    } else {
      U.toast('❌ Неверный формат данных');
    }
  }

  /* ============================================================
     8. СБРОС ПРОГРЕССА
     ============================================================ */
  function resetProgress() {
    const confirmed = confirm(
      '⚠ Сбросить прогресс слов?\n\n' +
      'Что удалится:\n' +
      '• счётчики показов и ошибок каждого слова\n' +
      '• дата добавления (все станут «новыми»)\n' +
      '• прогресс ключей\n' +
      '• статистика за неделю и streak\n\n' +
      'Сами слова останутся на месте.\n\n' +
      'Продолжить?'
    );
    if (!confirmed) return;

    // Пересобираем слова с нуля, сохраняя только hanzi/pinyin/ru
    const words = U.Storage.get('words', []);
    const reset = words.map(w => ({
      hanzi: w.hanzi,
      pinyin: w.pinyin,
      ru: w.ru,
      added: new Date().toISOString(),
      shown: 0,
      wrong: 0
    }));
    U.Storage.set('words', reset);

    // Чистим прогресс ключей
    U.Storage.set('radicals', {});

    // Чистим статистику
    U.Storage.set('stats', {
      streak: 0,
      lastDay: null,
      daily: {},
      history: []
    });

    U.toast('✓ Прогресс сброшен. Перезагружаю...');
    setTimeout(() => location.reload(), 1000);
  }

  /* ============================================================
     9. ЭКРАН НАСТРОЕК
     ============================================================ */
  function show() {
    // Перед показом синхронизируем UI с текущими значениями
    syncUI();
    if (window.App && typeof App.go === 'function') {
      App.go('screenSettings');
    }
  }

  function syncUI() {
    // Тема
    applyTheme(state.theme);

    // Ползунок цели
    const slider = U.el('goalSlider');
    if (slider) {
      slider.value = state.goal;
      U.setText('goalValue', state.goal);
    }

    // Тумблеры
    const swSpeak = U.el('swSpeak');
    if (swSpeak) swSpeak.classList.toggle('on', state.speak);

    const swClick = U.el('swClick');
    if (swClick) swClick.classList.toggle('on', state.click);

    const swPraise = U.el('swPraise');
    if (swPraise) swPraise.classList.toggle('on', state.praise);
  }

  /* ============================================================
     10. ИНИЦИАЛИЗАЦИЯ
     ============================================================ */
  function init() {
    load();
    applyTheme(state.theme);
    U.setClickEnabled(state.click);

    // Обновляем значения в UI (после того, как DOM готов)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', syncUI);
    } else {
      syncUI();
    }

    console.log('[settings.js] Инициализировано. Тема:', state.theme,
                '| Цель:', state.goal, '| Озвучка:', state.speak);
  }

  /* ============================================================
     11. ЭКСПОРТ
     ============================================================ */
  window.Settings = {
    init,
    show,
    get,
    set,
    setTheme,
    setGoal,
    toggleSpeak,
    toggleClick,
    togglePraise,
    exportData,
    importData,
    resetProgress,
    // для отладки
    _state: state
  };

  console.log('[settings.js] Загружено: Settings.init, Settings.setTheme, Settings.setGoal');

})();
