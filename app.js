(function () {
  'use strict';
  const Q = window.QUESTIONS || [];
  const app = document.getElementById('app');
  const byId = new Map(Q.map(q => [q.id, q]));
  const LETTERS = ['1', '2', '3', '4', '5'];
  const PER_Q_SECONDS = 30;

  // ---------- storage (per-device conveniences, safe if unavailable) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const mistakes = () => new Set(store.get('mf_mistakes', []));
  const saveMistakes = s => store.set('mf_mistakes', [...s]);

  // ---------- theme ----------
  const root = document.documentElement;
  const savedTheme = store.get('mf_theme', null);
  if (savedTheme) root.dataset.theme = savedTheme;
  document.getElementById('themeBtn').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('mf_theme', root.dataset.theme);
  });
  document.getElementById('qcount').textContent = Q.length;

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const imgSrc = q => `img/${q.img}.png`;
  const formula = (q, extra = '') => `<div class="formula" data-zoom="${q.img}" ${extra}><img src="${imgSrc(q)}" alt="Формула к вопросу ${q.id}" loading="lazy"></div>`;
  const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
  const plural = (n, one, few, many) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many; };
  let cleanup = null; // per-screen teardown (timers, key handlers)
  function screen(html) {
    if (cleanup) { cleanup(); cleanup = null; }
    app.innerHTML = `<div class="fade">${html}</div>`;
    window.scrollTo(0, 0);
  }

  // zoom any formula
  document.addEventListener('click', e => {
    const z = e.target.closest('[data-zoom]');
    if (z && !z.closest('.zoom')) {
      const ov = document.createElement('div');
      ov.className = 'zoom';
      ov.innerHTML = `<div class="formula"><img src="img/${z.dataset.zoom}.png" alt="Формула крупно"></div>`;
      ov.addEventListener('click', () => ov.remove());
      document.body.appendChild(ov);
      return;
    }
    const go = e.target.closest('[data-go]');
    if (go) {
      const target = go.dataset.go === 'home' ? '' : '#/' + go.dataset.go;
      if (location.hash === target || (!target && location.hash === '#')) route(); else location.hash = target;
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.zoom').forEach(z => z.remove()); });

  // ---------- home ----------
  function home() {
    const m = mistakes().size;
    const best = store.get('mf_best', null);
    screen(`
      <section class="hero">
        <h1>Тренажёр <em>«Минимум формул»</em></h1>
        <p>Узнайте вещество по структурной формуле. ${Q.length} ${plural(Q.length, 'вопрос', 'вопроса', 'вопросов')} из старой DOS-программы тестирования — теперь с телефона, планшета или компьютера.</p>
        <div class="stats">
          <div class="stat"><b>${Q.length}</b><span>формул в базе</span></div>
          <div class="stat"><b>${m}</b><span>${plural(m, 'ошибка', 'ошибки', 'ошибок')} на повторение</span></div>
          <div class="stat"><b>${best == null ? '—' : best + '%'}</b><span>лучший экзамен</span></div>
        </div>
      </section>
      <section class="modes">
        <button class="mode" data-go="train"><div class="ic">✎</div><h3>Тренировка</h3><p>Ответ проверяется сразу, показывается правильный вариант. Ошибки сохраняются для повторения.</p></button>
        <button class="mode" data-go="exam"><div class="ic">⏱</div><h3>Экзамен</h3><p>Как в программе: случайные вопросы, ${PER_Q_SECONDS} секунд на ответ, итог и зачёт в конце.</p></button>
        <button class="mode" data-go="browse"><div class="ic">⌗</div><h3>Все формулы</h3><p>Каталог с поиском и правильными ответами. Можно скрыть ответы и учить как карточки.</p></button>
      </section>`);
  }

  // ---------- setup screen (shared by train/exam) ----------
  function setup(mode) {
    const isExam = mode === 'exam';
    const mset = mistakes();
    const counts = isExam ? [10, 20, 30, 50, 'all'] : [20, 50, 100, 'all'];
    let count = isExam ? 10 : 20, source = 'all', timer = true;
    const render = () => {
      const pool = source === 'mist' ? mset.size : Q.length;
      screen(`
        <div class="panel">
          <h2>${isExam ? 'Экзамен' : 'Тренировка'}</h2>
          <p class="sub">${isExam ? 'Правильность ответов покажем только в конце.' : 'После каждого ответа — проверка и правильный вариант.'}</p>
          ${isExam ? '' : `
          <div class="label">Какие вопросы</div>
          <div class="chips">
            <button class="chip" data-src="all" aria-pressed="${source === 'all'}">Все формулы</button>
            <button class="chip" data-src="mist" aria-pressed="${source === 'mist'}" ${mset.size ? '' : 'disabled'}>Мои ошибки (${mset.size})</button>
          </div>`}
          <div class="label">Количество вопросов</div>
          <div class="chips">${counts.map(c => `<button class="chip" data-count="${c}" aria-pressed="${count === c}">${c === 'all' ? 'Все (' + pool + ')' : c}</button>`).join('')}</div>
          ${isExam ? `<label class="switch"><input type="checkbox" id="tmr" ${timer ? 'checked' : ''}> Ограничение ${PER_Q_SECONDS} с на вопрос</label>` : ''}
          <div class="row">
            <button class="btn" id="start">Начать</button>
            <button class="btn ghost" data-go="home">Назад</button>
          </div>
        </div>`);
      app.querySelectorAll('[data-src]').forEach(b => b.onclick = () => { source = b.dataset.src; render(); });
      app.querySelectorAll('[data-count]').forEach(b => b.onclick = () => { count = b.dataset.count === 'all' ? 'all' : +b.dataset.count; render(); });
      const t = document.getElementById('tmr'); if (t) t.onchange = () => { timer = t.checked; };
      document.getElementById('start').onclick = () => {
        let pool = source === 'mist' ? Q.filter(q => mset.has(q.id)) : Q;
        pool = shuffle(pool);
        if (count !== 'all') pool = pool.slice(0, count);
        quiz({ mode, list: pool, timer: isExam && timer });
      };
    };
    render();
  }

  // ---------- quiz ----------
  function quiz({ mode, list, timer }) {
    const isExam = mode === 'exam';
    const state = { i: 0, results: [], started: Date.now() };
    const mset = mistakes();
    let tick = null, answered = false, order = [], qStart = 0;

    const keyHandler = e => {
      if (document.querySelector('.zoom')) return;
      const n = LETTERS.indexOf(e.key);
      if (n >= 0 && (!answered || isExam)) { const b = app.querySelector(`.ans[data-i="${n}"]`); if (b) b.click(); }
      else if ((e.key === 'Enter' || e.key === ' ') && answered) { e.preventDefault(); const nx = document.getElementById('next'); if (nx) nx.click(); }
    };
    document.addEventListener('keydown', keyHandler);
    const stop = () => { clearInterval(tick); document.removeEventListener('keydown', keyHandler); };

    function show() {
      clearInterval(tick);
      const q = list[state.i];
      answered = false;
      order = shuffle([0, 1, 2, 3, 4].filter(k => q.a[k]));
      qStart = Date.now();
      const left = PER_Q_SECONDS;
      app.innerHTML = `<div class="fade">
        <div class="qhead">
          <span>Вопрос ${state.i + 1} <span class="muted">из ${list.length}</span></span>
          ${timer ? `<span class="timer" id="tm">${left} с</span>` : `<span class="muted">${isExam ? '' : 'Верно: ' + state.results.filter(r => r.ok).length}</span>`}
        </div>
        <div class="bar"><i style="width:${state.i / list.length * 100}%"></i></div>
        <div class="card">
          <p class="qtext">${esc(q.q)}</p>
          ${formula(q)}
          <div class="answers">${order.map((k, n) => `<button class="ans" data-i="${n}" data-k="${k}"><span class="k">${n + 1}</span><span>${esc(q.a[k])}</span></button>`).join('')}</div>
          <div class="feedback" id="fb" aria-live="polite"></div>
          <div class="actions">
            <button class="btn ghost" id="quit">Завершить</button>
            <button class="btn" id="next" ${isExam ? 'disabled' : 'hidden'}>${state.i + 1 < list.length ? 'Дальше →' : 'Результат'}</button>
          </div>
          <div class="hint">Клавиши 1–5 — выбрать ответ, Enter — дальше. Нажмите на формулу, чтобы увеличить.</div>
        </div></div>`;
      app.querySelectorAll('.ans').forEach(b => b.onclick = () => choose(+b.dataset.k, b));
      document.getElementById('quit').onclick = () => finish(true);
      document.getElementById('next').onclick = next;
      if (timer) {
        tick = setInterval(() => {
          const s = PER_Q_SECONDS - Math.floor((Date.now() - qStart) / 1000);
          const el = document.getElementById('tm');
          if (el) { el.textContent = Math.max(0, s) + ' с'; el.classList.toggle('low', s <= 5); }
          if (s <= 0) { clearInterval(tick); if (!answered) choose(-1, null, true); next(); }
        }, 250);
      }
    }

    function choose(k, btn, timeout = false) {
      const q = list[state.i];
      const ok = k === q.c;
      const r = { id: q.id, chosen: k, ok, timeout, time: (Date.now() - qStart) / 1000 };
      if (isExam) {
        // allow changing the answer until "Дальше"
        state.results[state.i] = r;
        app.querySelectorAll('.ans').forEach(b => b.classList.toggle('sel', b === btn));
        answered = true;
        document.getElementById('next').disabled = false;
        return;
      }
      if (answered) return;
      answered = true;
      state.results[state.i] = r;
      app.querySelectorAll('.ans').forEach(b => {
        b.disabled = true;
        const bk = +b.dataset.k;
        if (bk === q.c) b.classList.add('ok');
        else if (b === btn) b.classList.add('bad');
      });
      const fb = document.getElementById('fb');
      fb.className = 'feedback ' + (ok ? 'ok' : 'bad');
      fb.textContent = ok ? 'Верно!' : 'Неверно. Правильный ответ: ' + q.a[q.c];
      if (ok) mset.delete(q.id); else mset.add(q.id);
      saveMistakes(mset);
      const nx = document.getElementById('next'); nx.hidden = false; nx.focus({ preventScroll: true });
    }

    function next() {
      if (!state.results[state.i]) state.results[state.i] = { id: list[state.i].id, chosen: -1, ok: false, timeout: true, time: PER_Q_SECONDS };
      state.i++;
      if (state.i >= list.length) finish(false); else { show(); window.scrollTo(0, 0); }
    }

    function finish(early) {
      stop();
      const res = state.results.filter(Boolean);
      if (isExam) {
        // exam mistakes also go to the repetition list
        res.forEach(r => r.ok ? mset.delete(r.id) : mset.add(r.id));
        saveMistakes(mset);
      }
      if (!res.length) { location.hash = ''; home(); return; }
      results({ mode, list, res, early, total: (Date.now() - state.started) / 1000 });
    }

    cleanup = stop;
    app.innerHTML = '';
    show();
  }

  // ---------- results ----------
  function grade(p) {
    if (p >= 80) return { pass: true, text: 'Зачтено · отлично' };
    if (p >= 65) return { pass: true, text: 'Зачтено · хорошо' };
    if (p > 50) return { pass: true, text: 'Зачтено · удовлетворительно' };
    return { pass: false, text: 'Не зачтено' };
  }
  function results({ mode, list, res, early, total }) {
    const isExam = mode === 'exam';
    const right = res.filter(r => r.ok).length;
    const asked = res.length;
    const p = pct(right, isExam ? list.length : asked);
    const g = grade(p);
    if (isExam && !early) { const best = store.get('mf_best', null); if (best == null || p > best) store.set('mf_best', p); }
    const wrong = res.filter(r => !r.ok);
    screen(`
      <div class="card result">
        <div class="ring" style="--p:${p}"><div>${p}%</div></div>
        ${isExam ? `<div class="verdict ${g.pass ? 'pass' : 'fail'}">${g.text}</div>` : '<h2 style="margin:6px 0 0">Тренировка завершена</h2>'}
        <div class="kv">
          <div><b>${right} / ${isExam ? list.length : asked}</b><span>правильных ответов</span></div>
          <div><b>${asked}</b><span>было задано${early ? ' (досрочно)' : ''}</span></div>
          ${isExam ? `<div><b>${res.filter(r => r.timeout).length}</b><span>просрочено время</span></div>` : ''}
          <div><b>${Math.round(total)} с</b><span>всего · ${(total / Math.max(1, asked)).toFixed(1)} с на вопрос</span></div>
        </div>
        <div class="row" style="justify-content:center">
          <button class="btn" id="again">Ещё раз</button>
          ${wrong.length ? '<button class="btn ghost" id="redo">Повторить ошибки</button>' : ''}
          <button class="btn ghost" data-go="home">На главную</button>
        </div>
      </div>
      ${wrong.length ? `<section class="review"><h3>Разбор ошибок (${wrong.length})</h3><div class="rev">
        ${wrong.map(r => { const q = byId.get(r.id); return `<div class="card rev-item">${formula(q)}<div>
          <div class="right">✓ ${esc(q.a[q.c])}</div>
          <div class="you">${r.chosen >= 0 ? '✗ Ваш ответ: ' + esc(q.a[r.chosen]) : '✗ Нет ответа (время вышло)'}</div></div></div>`; }).join('')}
      </div></section>` : ''}`);
    document.getElementById('again').onclick = () => setup(mode);
    const redo = document.getElementById('redo');
    if (redo) redo.onclick = () => quiz({ mode: 'train', list: shuffle(wrong.map(r => byId.get(r.id))), timer: false });
  }

  // ---------- browse ----------
  function browse() {
    let hide = store.get('mf_hide', false), term = '';
    screen(`
      <section class="hero" style="padding-bottom:0"><h1>Все формулы</h1><p>Поиск по названию. Включите «Скрыть ответы», чтобы проверять себя: нажатие на размытое название покажет ответ.</p></section>
      <input class="search" id="s" type="search" placeholder="Например: цитрат, витамин, АТФ…" autocomplete="off">
      <label class="switch"><input type="checkbox" id="hide" ${hide ? 'checked' : ''}> Скрыть ответы</label>
      <div class="grid" id="grid"></div>`);
    const grid = document.getElementById('grid');
    const norm = s => s.toLowerCase().replace(/ё/g, 'е');
    const draw = () => {
      const t = norm(term.trim());
      const list = t ? Q.filter(q => norm(q.a[q.c]).includes(t)) : Q;
      grid.innerHTML = list.length ? list.map(q => `
        <div class="tile ${hide ? 'hidden-ans' : ''}">
          ${formula(q)}
          <div class="num">№ ${q.id}${q.q.startsWith('На рисунке') ? '' : ' · ' + esc(q.q)}</div>
          <div class="name">${esc(q.a[q.c])}</div>
        </div>`).join('') : '<div class="empty">Ничего не найдено</div>';
    };
    document.getElementById('s').oninput = e => { term = e.target.value; draw(); };
    document.getElementById('hide').onchange = e => { hide = e.target.checked; store.set('mf_hide', hide); draw(); };
    grid.addEventListener('click', e => { const n = e.target.closest('.hidden-ans .name'); if (n) n.parentElement.classList.remove('hidden-ans'); });
    draw();
  }

  // ---------- router ----------
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    if (h === 'train') setup('train');
    else if (h === 'exam') setup('exam');
    else if (h === 'browse') browse();
    else home();
  }
  window.addEventListener('hashchange', route);
  route();
})();
