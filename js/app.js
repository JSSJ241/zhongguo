/* =====================================================================
   app.js — сборка приложения, роутер экранов, «Мои слова»
   =====================================================================
   Экспортирует:
     App.go(screenId)    — переключить экран
     App.init()          — запуск приложения
     App.refreshHome()   — обновить главный экран

     Words.show()        — открыть «Мои слова»
     Words.add()         — добавить слова из textarea
     Words.deleteWord(hz)
     Words.setFilter(f, btn)
   ===================================================================== */

(function () {
  'use strict';

  /* ============================================================
     1. Состояние
     ============================================================ */
  let currentScreen = 'screenHome';
  const screenHistory = [];
  let words = [];
  let currentFilter = 'all';   // all | today | problem | recent

  /* ============================================================
     2. РОУТЕР ЭКРАНОВ
     ============================================================ */
  function go(screenId) {
    const target = U.el(screenId);
    if (!target) {
      console.warn('[App.go] Экран не найден:', screenId);
      return;
    }

    // Запоминаем историю для кнопки «назад»
    if (currentScreen !== screenId) {
      screenHistory.push(currentScreen);
      if (screenHistory.length > 20) screenHistory.shift();
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    target.classList.add('active');
    currentScreen = screenId;

    // Наверх
    window.scrollTo(0, 0);

    // Обновляем главный экран при возврате
    if (screenId === 'screenHome') {
      Stats.refresh();
      if (window.Pet) Pet.render();
    }

    // Обновляем список слов при открытии
    if (screenId === 'screenWords') {
      renderWordList();
    }
  }

  function goBack() {
    if (screenHistory.length === 0) return false;
    const prev = screenHistory.pop();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = U.el(prev);
    if (target) target.classList.add('active');
    currentScreen = prev;
    window.scrollTo(0, 0);

    if (prev === 'screenHome') Stats.refresh();
    if (prev === 'screenWords') renderWordList();
    return true;
  }

  /* ============================================================
     3. ЭКРАН «МОИ СЛОВА»
     ============================================================ */
  const Words = {

    /* --- Загрузка в локальный массив --- */
    load() {
      const saved = U.Storage.get('words', null);
      words = Array.isArray(saved) ? saved : [];
    },

    save() {
      U.Storage.set('words', words);
    },

    /* --- Открыть экран --- */
    show() {
      this.load();
      renderWordList();
      go('screenWords');
    },

    /* --- Добавить слова из textarea --- */
    add() {
      const text = (U.el('inputArea').value || '').trim();
      if (!text) return;

      this.load();

      let added = 0;
      let skipped = 0;
      const now = new Date().toISOString();

      text.split('\n').forEach(line => {
        const parts = line.split('|').map(s => s.trim());
        if (parts.length < 3) return;

        const [hanzi, pinyin, ru] = parts;
        if (!hanzi || !pinyin || !ru) return;

        if (words.some(w => w.hanzi === hanzi)) {
          skipped++;
          return;
        }

        words.push({
          hanzi,
          pinyin,
          ru,
          added: now,
          shown: 0,
          wrong: 0,
          correct: 0
        });
        added++;
      });

      this.save();
      U.el('inputArea').value = '';
      renderWordList();

      if (added === 0 && skipped === 0) {
        U.toast('Формат: иероглиф | пиньинь | перевод');
      } else {
        U.toast(`✓ Добавлено: ${added}${skipped ? `, дублей: ${skipped}` : ''}`);
        U.clickSound('ok');
      }
    },

    /* --- Удалить слово --- */
    deleteWord(hanzi) {
      if (!confirm(`Удалить «${hanzi}»?`)) return;
      this.load();
      words = words.filter(w => w.hanzi !== hanzi);
      this.save();
      renderWordList();
      U.clickSound('click');
      U.toast('Удалено');
    },

    /* --- Фильтры --- */
    setFilter(filter, btnEl) {
      currentFilter = filter;
      document.querySelectorAll('.list-chip').forEach(c => c.classList.remove('active'));
      if (btnEl) btnEl.classList.add('active');
      renderWordList();
    }

  };

  /* ============================================================
     4. РЕНДЕР СПИСКА СЛОВ
     ============================================================ */
  function renderWordList() {
    const el = U.el('wordList');
    if (!el) return;

    // Синхронизируемся с хранилищем (могли измениться из training.js)
    const stored = U.Storage.get('words', []);
    if (Array.isArray(stored)) words = stored;

    // Заголовки со счётчиками
    U.setText('wordsCount', `${words.length} слов`);
    U.setText('listCount', `${words.length} слов`);

    if (words.length === 0) {
      el.innerHTML = '<div class="empty">Список пуст.<br>Добавь слова через поле выше или запусти тренировку — 150 слов HSK1 загрузятся автоматически.</div>';
      return;
    }

    // Применяем фильтр
    let list = [...words];
    const today = U.todayKey();

    if (currentFilter === 'today') {
      list = list.filter(w => {
        const d = new Date(w.added);
        const key =
          d.getFullYear() + '-' +
          String(d.getMonth() + 1).padStart(2, '0') + '-' +
          String(d.getDate()).padStart(2, '0');
        return key === today;
      });
    } else if (currentFilter === 'problem') {
      list = list.filter(w => (w.wrong || 0) > 0);
    } else if (currentFilter === 'recent') {
      list = list.filter(w => U.daysSince(w.added) < 7);
    }

    // Сортировка
    if (currentFilter === 'problem') {
      // По количеству ошибок — сверху
      list.sort((a, b) => (b.wrong || 0) - (a.wrong || 0));
    } else {
      // Свежие сверху
      list.sort((a, b) => new Date(b.added) - new Date(a.added));
    }

    if (list.length === 0) {
      el.innerHTML = '<div class="empty">По этому фильтру ничего нет</div>';
      return;
    }

    el.innerHTML = list.map(w => {
      // Значок «проблемное» если ошибок 3+
      const problemBadge = (w.wrong || 0) >= 3
        ? `<span class="word-badge">×${w.wrong}</span>`
        : '';

      // Экранируем hanzi для inline-обработчика
      const safeHz = w.hanzi.replace(/'/g, "\\'");

      return `
        <div class="word-row">
          <div class="word-hz">${U.escapeHtml(w.hanzi)}</div>
          <div class="word-py">${U.escapeHtml(w.pinyin)}</div>
          <div class="word-ru">${U.escapeHtml(w.ru)}</div>
          ${problemBadge}
          <div class="word-del" onclick="Words.deleteWord('${safeHz}')">✕</div>
        </div>
      `;
    }).join('');
  }

  /* ============================================================
     5. ОБНОВЛЕНИЕ ГЛАВНОГО ЭКРАНА
     ============================================================ */
  function refreshHome() {
    Stats.refresh();
  }

  /* ============================================================
     6. ИНИЦИАЛИЗАЦИЯ
     ============================================================ */
  function init() {
    console.log('[app.js] Запуск приложения...');

    // Проверяем наличие всех модулей
    if (!window.DATA)     console.error('✗ Модуль data.js не загружен');
    if (!window.U)        console.error('✗ Модуль utils.js не загружен');
    if (!window.Settings) console.error('✗ Модуль settings.js не загружен');
    if (!window.Stats)    console.error('✗ Модуль stats.js не загружен');
    if (!window.Radicals) console.error('✗ Модуль radicals.js не загружен');
    if (!window.Training) console.error('✗ Модуль training.js не загружен');
    if (!window.NewModes) console.error('✗ Модуль newmodes.js не загружен');
   
   
    // Инициализируем модули в правильном порядке
    try {
      if (window.Settings) Settings.init();
      if (window.Stats)    Stats.init();
      if (window.Radicals) Radicals.init();
      if (window.Training) Training.init();
      if (window.NewModes) NewModes.init();
      if (window.Pet)    Pet.init();
      if (window.Dragon) Dragon.init();
      if (window.Arcade) Arcade.init();
      if (window.Study)  Study.init();
    } catch (e) {
      console.error('[app.js] Ошибка при инициализации модулей:', e);
    }

    // Первичное заполнение главного экрана
    try {
      Stats.refresh();
    } catch (e) {
      console.error('[app.js] Ошибка при обновлении главного экрана:', e);
    }

    // Первичная загрузка слов в список (чтобы сразу было видно)
    Words.load();

    // Кнопка «назад» браузера
    setupBackButton();

    // Горячие клавиши (кроме тех, что уже обрабатываются другими модулями)
    setupKeyboard();

    // Автосохранение раз в минуту
    setupAutosave();

    console.log('[app.js] Приложение готово. Экран:', currentScreen);
  }

  /* ============================================================
     7. КНОПКА «НАЗАД» БРАУЗЕРА
     ============================================================ */
  function setupBackButton() {
    // Пуш состояния, чтобы отловить «назад»
    history.pushState({ app: true }, '', location.href);

    window.addEventListener('popstate', () => {
      // Если мы не на главном — идём в историю
      if (currentScreen !== 'screenHome' && goBack()) {
        history.pushState({ app: true }, '', location.href);
      } else {
        // На главной — разрешаем браузеру выйти
        // (не мешаем пользователю закрыть вкладку)
      }
    });
  }

  /* ============================================================
     8. ГОРЯЧИЕ КЛАВИШИ
     ============================================================ */
  function setupKeyboard() {
    document.addEventListener('keydown', e => {
      // ESC — назад
      if (e.key === 'Escape' && currentScreen !== 'screenHome') {
        // Ищем, куда вернуться: пробуем goBack()
        if (!goBack()) go('screenHome');
        return;
      }

      // Enter обрабатывается внутри training.js и newmodes.js — не мешаем
    });
  }

  /* ============================================================
     9. АВТОСОХРАНЕНИЕ
     ============================================================ */
  function setupAutosave() {
    // Каждую минуту пересохраняем состояние слов (на случай зависаний)
    setInterval(() => {
      // Загружаем актуальное и сохраняем — просто чтобы обновить дату
      const w = U.Storage.get('words', null);
      if (Array.isArray(w)) {
        U.Storage.set('words', w);
      }
    }, 60_000);
  }

  /* ============================================================
     10. ЭКСПОРТ
     ============================================================ */
  window.App = {
    go,
    goBack,
    init,
    refreshHome,
    _screen: () => currentScreen
  };

  window.Words = Words;

  /* ============================================================
     11. АВТОЗАПУСК
     ============================================================ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Скрипт загружен после DOMContentLoaded
    init();
  }

})();
