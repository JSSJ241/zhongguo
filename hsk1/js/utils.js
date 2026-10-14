/* =====================================================================
   utils.js — служебные функции
   =====================================================================
   Экспортирует в глобальный объект `U`:
     U.Storage     — работа с localStorage
     U.shuffle     — перемешать массив
     U.weightedSample — взвешенная выборка
     U.daysSince   — сколько дней с даты
     U.ageLabel    — человекочитаемая метка возраста
     U.todayKey    — ключ сегодняшнего дня (YYYY-MM-DD)
     U.speak       — озвучка иероглифов
     U.clickSound  — короткий тихий клик
     U.toast       — уведомление снизу экрана
     U.normalize   — нормализация ответа
     U.isCorrect   — мягкая проверка ответа
     U.insertTone  — вставить символ с тоном в поле ввода
     U.el          — быстрый поиск элемента по id
     U.escape      — защита HTML от инъекций
     U.praise      — случайная похвала
   ===================================================================== */

(function () {
  'use strict';

  /* ============================================================
     1. STORAGE — работа с localStorage
     ============================================================ */
  const NS = 'hsk1_v3_';   // namespace, чтобы не конфликтовать с другими приложениями

  const Storage = {
    /**
     * Сохранить значение
     * @param {string} key
     * @param {*} value  (будет сериализован в JSON)
     */
    set(key, value) {
      try {
        localStorage.setItem(NS + key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn('[Storage] Не удалось сохранить', key, e);
        return false;
      }
    },

    /**
     * Загрузить значение
     * @param {string} key
     * @param {*} fallback  значение по умолчанию
     */
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(NS + key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        console.warn('[Storage] Не удалось загрузить', key, e);
        return fallback;
      }
    },

    /**
     * Удалить ключ
     */
    remove(key) {
      try { localStorage.removeItem(NS + key); }
      catch (e) { /* игнор */ }
    },

    /**
     * Полностью очистить все данные приложения
     */
    clearAll() {
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(NS));
        keys.forEach(k => localStorage.removeItem(k));
        return keys.length;
      } catch (e) {
        return 0;
      }
    },

    /**
     * Экспорт всего в JSON-строку (для бэкапа)
     */
    exportAll() {
      const data = {};
      try {
        Object.keys(localStorage)
          .filter(k => k.startsWith(NS))
          .forEach(k => {
            const shortKey = k.slice(NS.length);
            try { data[shortKey] = JSON.parse(localStorage.getItem(k)); }
            catch { data[shortKey] = localStorage.getItem(k); }
          });
        return JSON.stringify({ __ns: NS, data }, null, 2);
      } catch (e) {
        return '{}';
      }
    },

    /**
     * Импорт из JSON-строки
     */
    importAll(jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (!parsed.data) throw new Error('Неверный формат');
        Object.entries(parsed.data).forEach(([k, v]) => {
          localStorage.setItem(NS + k, JSON.stringify(v));
        });
        return Object.keys(parsed.data).length;
      } catch (e) {
        console.error('[Storage] Ошибка импорта:', e);
        return 0;
      }
    }
  };

  /* ============================================================
     2. МАССИВЫ
     ============================================================ */

  /**
   * Перемешать массив (Fisher-Yates)
   */
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Взвешенная выборка без повторов.
   * @param {Array} arr    — исходный массив
   * @param {number} n     — сколько выбрать
   * @param {Function} weightFn  — функция, возвращающая вес элемента
   */
  function weightedSample(arr, n, weightFn) {
    const pool = arr.map(item => ({ item, weight: Math.max(0.01, weightFn(item)) }));
    const result = [];
    const max = Math.min(n, pool.length);

    for (let i = 0; i < max; i++) {
      const totalW = pool.reduce((s, x) => s + x.weight, 0);
      let r = Math.random() * totalW;
      let idx = 0;
      for (let j = 0; j < pool.length; j++) {
        r -= pool[j].weight;
        if (r <= 0) { idx = j; break; }
      }
      result.push(pool[idx].item);
      pool.splice(idx, 1);
    }
    return result;
  }

  /* ============================================================
     3. ДАТЫ
     ============================================================ */

  /**
   * Сколько полных дней прошло с даты
   */
  function daysSince(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  /**
   * Ключ дня в формате YYYY-MM-DD (для heatmap и streak)
   */
  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Метка возраста: "сегодня", "вчера", "3 дн.", "давно"
   */
  function ageLabel(iso) {
    const d = daysSince(iso);
    if (d <= 0) return 'сегодня';
    if (d === 1) return 'вчера';
    if (d < 7) return `${d} дн.`;
    if (d < 30) return `${Math.floor(d / 7)} нед.`;
    return 'давно';
  }

  /**
   * Сдвиг дня на N дней назад (для построения heatmap)
   */
  function shiftDay(dateKey, deltaDays) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  /* ============================================================
     4. ОЗВУЧКА (SpeechSynthesis)
     ============================================================ */
  let _zhVoice = null;
  let _speechAvailable = ('speechSynthesis' in window);

  function _pickZhVoice() {
    if (!_speechAvailable) return null;
    const voices = speechSynthesis.getVoices();
    if (!voices || !voices.length) return null;
    // Ищем именно китайский (упрощённый — предпочтительно)
    _zhVoice =
      voices.find(v => /zh[-_]CN/i.test(v.lang)) ||
      voices.find(v => /zh[-_]Hans/i.test(v.lang)) ||
      voices.find(v => /^zh/i.test(v.lang)) ||
      null;
    return _zhVoice;
  }

  // Голоса подгружаются асинхронно
  if (_speechAvailable) {
    _pickZhVoice();
    if (typeof speechSynthesis.onvoiceschanged !== 'undefined') {
      speechSynthesis.onvoiceschanged = _pickZhVoice;
    }
  }

  /**
   * Произнести текст по-китайски.
   * @param {string} text — что произнести
   * @param {object} opts — { rate, pitch }
   */
  function speak(text, opts = {}) {
    if (!_speechAvailable || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = opts.rate || 0.85;
      u.pitch = opts.pitch || 1.0;
      if (!_zhVoice) _pickZhVoice();
      if (_zhVoice) u.voice = _zhVoice;
      speechSynthesis.speak(u);
    } catch (e) {
      console.warn('[speak]', e);
    }
  }

  /**
   * Озвучить только иероглифы (без пиньиня и перевода)
   */
  function speakHanzi(text) {
    // Оставляем только CJK-символы
    const clean = String(text).replace(/[^\u4e00-\u9fff]/g, '');
    if (clean) speak(clean);
  }

  /* ============================================================
     5. ЗВУК НАЖАТИЯ (Web Audio API)
     ============================================================ */
  let _audioCtx = null;
  let _clickEnabled = true;

  function _ensureAudioCtx() {
    if (_audioCtx) return _audioCtx;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      _audioCtx = new Ctx();
    } catch (e) {
      return null;
    }
    return _audioCtx;
  }

  /**
   * Короткий тихий клик.
   * @param {string} type — 'click' | 'ok' | 'err'
   */
  function clickSound(type = 'click') {
    if (!_clickEnabled) return;
    const ctx = _ensureAudioCtx();
    if (!ctx) return;

    // Возобновляем контекст после пользовательского жеста
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    let freq = 880, dur = 0.05, vol = 0.04;
    if (type === 'ok')  { freq = 1320; dur = 0.08; vol = 0.05; }
    if (type === 'err') { freq = 320;  dur = 0.12; vol = 0.05; }

    osc.type = 'sine';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  /* ============================================================
     6. TOAST — уведомление снизу
     ============================================================ */
  let _toastTimer = null;

  function toast(msg, ms = 2200) {
    const el = document.getElementById('toast');
    if (!el) {
      console.log('[toast]', msg);
      return;
    }
    el.textContent = msg;
    el.classList.add('show');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  /* ============================================================
     7. НОРМАЛИЗАЦИЯ И ПРОВЕРКА ОТВЕТА
     ============================================================ */

  /**
   * Убрать диакритику (тоны): nǐ → ni, lǜ → lv
   */
  function stripTones(s) {
    return String(s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ü/g, 'v')
      .replace(/ǖ|ǘ|ǚ|ǜ/g, 'v');
  }

  /**
   * Привести строку к сравнимому виду:
   * нижний регистр, ё=е, убрать знаки препинания и пробелы
   */
  function normalize(s) {
    return String(s)
      .toLowerCase()
      .trim()
      .replace(/ё/g, 'е')
      .replace(/[.,!?;:'"«»()\[\]{}\-_/\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Мягкая проверка ответа.
   * @param {string} userAnswer
   * @param {string} correctRaw  — правильный ответ (может содержать варианты через "/")
   * @param {string} mode        — 'ru' | 'pinyin' | 'hanzi'
   * @returns {boolean}
   */
  function isCorrect(userAnswer, correctRaw, mode) {
    if (!userAnswer) return false;
    const variants = String(correctRaw).split('/').map(s => s.trim()).filter(Boolean);
    const ua = normalize(userAnswer);

    for (const variant of variants) {
      const nv = normalize(variant);

      // 1. Точное совпадение (после нормализации)
      if (ua === nv) return true;

      // 2. Для пиньиня — сравнение без тонов
      if (mode === 'pinyin') {
        const uaNoTone = stripTones(ua).replace(/[1-5]/g, '');
        const nvNoTone = stripTones(nv).replace(/[1-5]/g, '');
        if (uaNoTone === nvNoTone) return true;
      }

      // 3. Для русского — принимаем, если одно входит в другое (от 3 символов)
      if (mode === 'ru' && ua.length >= 3) {
        if (nv.includes(ua) || ua.includes(nv)) return true;
      }

      // 4. Для иероглифов — точное сравнение, но также принимаем, если
      //    пользователь написал только первый иероглиф слова
      if (mode === 'hanzi' && ua.length >= 1 && nv.length > ua.length) {
        if (nv.startsWith(ua)) return true;
      }
    }
    return false;
  }

  /* ============================================================
     8. ВСТАВКА ТОНА В ПОЛЕ ВВОДА
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
     9. DOM-ХЕЛПЕРЫ
     ============================================================ */
  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setText(id, text) {
    const e = document.getElementById(id);
    if (e) e.textContent = text;
  }

  function setHtml(id, html) {
    const e = document.getElementById(id);
    if (e) e.innerHTML = html;
  }

  /* ============================================================
     10. ПОХВАЛА — случайные радостные фразы
     ============================================================ */
  const PRAISES = [
    '✓ Верно!',
    '✓ Отлично!',
    '✓ Так держать!',
    '✓ Супер!',
    '✓ Молодец!',
    '✓ Точно!',
    '✓ Прекрасно!',
    '✓ Идеально!',
    '✓ Хорошо!',
    '✓ 对了！'
  ];

  function praise() {
    return PRAISES[Math.floor(Math.random() * PRAISES.length)];
  }

  /* ============================================================
     11. НАСТРОЙКИ ОЗВУЧКИ / КЛИКА
     Модуль settings.js будет их менять, а utils — использовать
     ============================================================ */
  function setSpeakEnabled(v) { /* noop: речь проверяется в speak() через флаг */ }
  function setClickEnabled(v) { _clickEnabled = !!v; }
  function isClickEnabled() { return _clickEnabled; }

  /* ============================================================
     12. ЭКСПОРТ
     ============================================================ */
  window.U = {
    // storage
    Storage,
    // массивы
    shuffle,
    weightedSample,
    // даты
    daysSince,
    todayKey,
    ageLabel,
    shiftDay,
    // звук и речь
    speak,
    speakHanzi,
    clickSound,
    setClickEnabled,
    isClickEnabled,
    // уведомление
    toast,
    // проверка ответов
    normalize,
    stripTones,
    isCorrect,
    insertTone,
    // DOM
    el,
    escapeHtml,
    setText,
    setHtml,
    // похвала
    praise
  };

  console.log('[utils.js] Загружено: U.Storage, U.shuffle, U.speak, U.toast, U.isCorrect');

})();
