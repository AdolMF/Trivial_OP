(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /* =========================
     Preferencias visuales
     ========================= */
  const THEME_KEY = "triviadol_theme_v1";        // 'auto' | 'dark' | 'light'
  const CONTRAST_KEY = "triviadol_contrast_v1";  // 'normal' | 'high'
  const root = document.documentElement;
  const mmDark = window.matchMedia?.("(prefers-color-scheme: dark)");

  function applyTheme(mode) {
    // 'dark' -> data-theme="dark"; 'light' -> data-theme="light"; 'auto' -> sin atributo
    if (mode === "dark") {
      root.setAttribute("data-theme", "dark");
    } else if (mode === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
    localStorage.setItem(THEME_KEY, mode);
    const sel = $("#select-theme");
    if (sel) sel.value = mode;
  }

  function applyContrast(level) {
    if (level === "high") root.setAttribute("data-contrast", "high");
    else root.removeAttribute("data-contrast");
    localStorage.setItem(CONTRAST_KEY, level);
    const chk = $("#toggle-contrast");
    if (chk) chk.checked = level === "high";
  }

  function loadPrefs() {
    applyTheme(localStorage.getItem(THEME_KEY) || "auto");
    applyContrast(localStorage.getItem(CONTRAST_KEY) || "normal");
  }

  // Si el usuario está en 'auto', reaccionar a cambios del sistema
  mmDark?.addEventListener?.("change", () => {
    if ((localStorage.getItem(THEME_KEY) || "auto") === "auto") {
      applyTheme("auto");
    }
  });

  /* =========================
     Estado del juego (recortado a lo relevante del tema)
     ========================= */
  const state = {
    name: "",
    mode: "one-piece",
    total: 15,
    durationMs: 10000,
    order: [],
    idx: -1,
    current: null,
    currentStart: 0,
    currentEnds: 0,
    timerRAF: 0,
    locked: false,
    score: 0,
    breakdown: [],
    optionMap: []
  };

  // --- Highscores ---
  function keyHS(mode) { return `triviadol_scores_${mode}`; }
  function getHS(mode) { try { return JSON.parse(localStorage.getItem(keyHS(mode)) || "[]"); } catch { return []; } }
  function setHS(mode, list) { localStorage.setItem(keyHS(mode), JSON.stringify(list.slice(0, 10))); }
  function renderHS() {
    const mode = $("#select-hs-mode").value;
    const list = $("#highscores");
    list.innerHTML = "";
    const hs = getHS(mode);
    if (hs.length === 0) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "Sin récords todavía.";
      list.appendChild(li);
      return;
    }
    hs.forEach((r, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>#${i + 1}. ${r.name || "Jugador"}</span><strong>${r.score} pts</strong>`;
      list.appendChild(li);
    });
  }

  // --- Flujo del juego (sin cambios respecto a preguntas) ---
  function startGame() {
    const bank = (window.TRIVIADOL_BANKS || {})[state.mode];
    if (!bank || bank.length < state.total) {
      alert("Este modo no tiene suficientes preguntas todavía.");
      return;
    }
    state.name = ($("#input-name")?.value || "").trim();
    state.score = 0;
    state.breakdown = [];
    state.order = shuffle([...Array(bank.length).keys()]).slice(0, state.total);
    state.idx = -1;

    $("#label-name").textContent = state.name ? `Jugador: ${state.name}` : "";
    $("#label-score").innerHTML = `<strong>0 pts</strong>`;

    show("#screen-game");
    nextQuestion();
  }

  function nextQuestion() {
    const bank = (window.TRIVIADOL_BANKS || {})[state.mode];
    state.idx++;
    if (state.idx >= state.order.length) return endGame();

    $("#after-round").classList.add("hidden");
    $("#label-correct").textContent = "";
    $("#label-expl").textContent = "";
    $("#btn-next").disabled = true;
    state.locked = false;

    const qIndex = state.order[state.idx];
    state.current = bank[qIndex];

    $("#label-qtitle").textContent = `Pregunta ${state.idx + 1}`;
    $("#label-qprogress").textContent = `de ${state.order.length}`;
    $("#label-question").textContent = state.current.question;

    const img = $("#q-image");
    if (state.current.image) { img.src = state.current.image; img.classList.remove("hidden"); }
    else { img.classList.add("hidden"); }

    const opts = $("#options");
    opts.innerHTML = "";
    const shuffled = shuffle(state.current.options.map((text, idx) => ({ text, idx })));
    state.optionMap = shuffled.map((o) => o.idx);
    shuffled.forEach(({ text, idx }) => {
      const b = document.createElement("button");
      b.className = "option";
      b.textContent = text;
      b.addEventListener("click", () => selectAnswer(idx, b));
      opts.appendChild(b);
    });

    state.currentStart = Date.now();
    state.currentEnds = state.currentStart + state.durationMs;
    startTimer();
  }

  function selectAnswer(originalIdx, btn) {
    if (state.locked) return;
    state.locked = true;

    $$(".option").forEach((b) => b.classList.add("locked"));
    btn?.classList.remove("locked");

    const elapsed = Math.max(0, Math.min(state.durationMs, Date.now() - state.currentStart));
    const isCorrect = originalIdx === state.current.answer;
    let delta = 0;
    if (isCorrect) {
      const base = 1000, maxBonus = 500;
      const bonus = Math.round(maxBonus * (1 - elapsed / state.durationMs));
      delta = base + bonus;
      state.score += delta;
    }

    revealSolution(originalIdx, delta);

    state.breakdown.push({
      q: state.current.question,
      correctIndex: state.current.answer,
      myIndex: originalIdx,
      delta
    });
  }

  function revealSolution(myOriginalIdx, delta) {
    stopTimer();
    const correctIdx = state.current.answer;
    $$(".option").forEach((b, domIdx) => {
      const originalIdx = state.optionMap[domIdx];
      if (originalIdx === correctIdx) b.classList.add("correct");
      else if (originalIdx === myOriginalIdx) b.classList.add("wrong");
    });

    $("#label-correct").textContent =
      `Respuesta correcta: ${state.current.options[correctIdx]} ${delta > 0 ? `(+${delta} pts)` : "(0 pts)"}`;
    $("#btn-next").disabled = false;
    $("#after-round").classList.remove("hidden");
    $("#label-score").innerHTML = `<strong>${state.score} pts</strong>`;
  }

  function endGame() {
    show("#screen-end");
    $("#final-summary").textContent =
      `${state.name || "Jugador"} · ${state.score} pts · ${state.order.length} preguntas (${state.mode})`;

    const list = $("#final-breakdown");
    list.innerHTML = "";
    state.breakdown.forEach((r, i) => {
      const correct = state.current.options[r.correctIndex];
      const mine = state.current.options[r.myIndex] ?? "Sin respuesta";
      const li = document.createElement("li");
      li.innerHTML = `<span>#${i + 1}. ${r.q}</span><span>${r.delta} pts</span>`;
      const sub = document.createElement("div");
      sub.className = "muted";
      sub.textContent = `Tu respuesta: ${mine} · Correcta: ${correct}`;
      li.appendChild(sub);
      list.appendChild(li);
    });

    const hs = getHS(state.mode);
    hs.push({ name: state.name || "Jugador", score: state.score, at: Date.now() });
    hs.sort((a, b) => b.score - a.score);
    setHS(state.mode, hs);
    renderHS();
  }

  // --- Timer ---
  function startTimer() {
    const totalMs = state.durationMs;
    const bar = $("#timer-bar");
    const label = $("#timer-label");
    cancelAnimationFrame(state.timerRAF);

    function frame() {
      const left = state.currentEnds - Date.now();
      const ratio = Math.max(0, Math.min(1, left / totalMs));
      bar.style.transform = `scaleX(${ratio})`;
      label.textContent = Math.max(0, Math.ceil(left / 1000)) + "s";
      if (left <= 0) {
        cancelAnimationFrame(state.timerRAF);
        if (!state.locked) {
          state.locked = true;
          revealSolution(-1, 0);
          state.breakdown.push({ q: state.current.question, correctIndex: state.current.answer, myIndex: -1, delta: 0 });
        }
        return;
      }
      state.timerRAF = requestAnimationFrame(frame);
    }
    frame();
  }
  function stopTimer() { cancelAnimationFrame(state.timerRAF); }

  function show(id) {
    $$("#screen-home, #screen-game, #screen-end").forEach((el) => el.classList.remove("active"));
    $(id).classList.add("active");
  }

  /* =========================
     INIT
     ========================= */
  window.addEventListener("DOMContentLoaded", () => {
    // Preferencias visuales
    loadPrefs();
    $("#select-theme")?.addEventListener("change", (e) => applyTheme(e.target.value));
    $("#toggle-contrast")?.addEventListener("change", (e) => applyContrast(e.target.checked ? "high" : "normal"));

    // Juego
    $("#btn-start")?.addEventListener("click", startGame);
    $("#btn-next")?.addEventListener("click", nextQuestion);
    $("#btn-retry")?.addEventListener("click", () => show("#screen-home"));
    $("#btn-home")?.addEventListener("click", () => show("#screen-home"));
    $("#btn-clear-hs")?.addEventListener("click", () => {
      localStorage.removeItem(`triviadol_scores_${$("#select-hs-mode").value}`);
      renderHS();
    });

    $("#select-mode")?.addEventListener("change", (e) => {
      if (state.idx === -1 || state.idx >= state.order.length) {
        state.mode = e.target.value;
      } else {
        e.target.value = state.mode; // no cambiar si hay partida en curso
      }
    });

    $("#select-hs-mode")?.addEventListener("change", renderHS);
    renderHS();
  });
})();
