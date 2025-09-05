// Trivial One Piece - Local/Offline
// Usa window.QUESTIONS desde questions.js

(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const fmtSecs = (msLeft) => Math.max(0, Math.ceil(msLeft / 1000)) + "s";

  const state = {
    name: "",
    total: 15,
    durationMs: 15000,
    order: [],
    idx: -1,
    current: null,
    currentStart: 0,
    currentEnds: 0,
    timerRAF: 0,
    locked: false,
    score: 0,
    breakdown: [],
    optionMap: [] // índice de botón -> índice original
  };

  const HS_KEY = "optrivial_highscores_v1";
  function getHS(){ try{ return JSON.parse(localStorage.getItem(HS_KEY)||"[]"); }catch{ return []; } }
  function setHS(list){ localStorage.setItem(HS_KEY, JSON.stringify(list.slice(0,10))); }
  function renderHS(){
    const list = $("#highscores"); if(!list) return;
    const hs = getHS(); list.innerHTML="";
    if (hs.length===0){ const li=document.createElement("li"); li.className="muted"; li.textContent="Sin récords todavía."; list.appendChild(li); return; }
    hs.forEach((r,i)=>{ const li=document.createElement("li"); li.innerHTML=`<span>#${i+1}. ${escapeHtml(r.name||"Jugador")}</span><strong>${r.score} pts</strong>`; list.appendChild(li); });
  }

  function startGame(){
    if (!Array.isArray(window.QUESTIONS) || window.QUESTIONS.length===0) {
      alert("No se cargó el banco de preguntas (questions.js).");
      return;
    }
    const QUESTIONS = window.QUESTIONS;

    state.name = ($("#input-name")?.value||"").trim();
    state.total = Number($("#select-count")?.value||15);
    state.durationMs = Number($("#select-seconds")?.value||15)*1000;
    state.score = 0; state.breakdown=[];

    const limit = Math.min(state.total, QUESTIONS.length);
    state.order = shuffle([...Array(QUESTIONS.length).keys()]).slice(0, limit);
    state.idx = -1;

    $("#label-name").textContent = state.name ? `Jugador: ${state.name}` : "";
    $("#label-score").innerHTML = `<strong>0 pts</strong>`;

    show("#screen-game");
    nextQuestion(QUESTIONS);
  }

  function nextQuestion(QUESTIONS = window.QUESTIONS){
    state.idx += 1;
    if (state.idx >= state.order.length) return endGame();

    $("#after-round").classList.add("hidden");
    $("#label-correct").textContent = "";
    $("#label-expl").textContent = "";
    $("#btn-next").disabled = true;
    state.locked = false;

    const qIndex = state.order[state.idx];
    state.current = QUESTIONS[qIndex];

    $("#label-qtitle").textContent = `Pregunta ${state.idx + 1}`;
    $("#label-qprogress").textContent = `de ${state.order.length}`;
    $("#label-question").textContent = state.current.question;

    const img = $("#q-image");
    if (state.current.image){ img.src = state.current.image; img.classList.remove("hidden"); }
    else { img.classList.add("hidden"); }

    // Barajar respuestas y guardar mapa DOM->índice original
    const opts = $("#options"); opts.innerHTML = "";
    const shuffled = shuffle(state.current.options.map((text, idx)=>({text, idx})));
    state.optionMap = shuffled.map(o => o.idx);
    shuffled.forEach(({text, idx})=>{
      const b = document.createElement("button");
      b.className = "option";
      b.textContent = text;
      b.addEventListener("click", ()=>selectAnswer(idx, b));
      opts.appendChild(b);
    });

    state.currentStart = Date.now();
    state.currentEnds = state.currentStart + state.durationMs;
    startTimer();
  }

  function selectAnswer(originalIdx, btn){
    if (state.locked) return;
    state.locked = true;

    $$(".option").forEach(b=>b.classList.add("locked"));
    btn?.classList.remove("locked");

    const elapsed = Math.max(0, Math.min(state.durationMs, Date.now()-state.currentStart));
    const isCorrect = originalIdx === state.current.answer;
    let delta = 0;
    if (isCorrect){
      const base=1000, maxBonus=500;
      const bonus = Math.round(maxBonus * (1 - elapsed/state.durationMs));
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

  function revealSolution(myOriginalIdx, delta){
    stopTimer();
    const correctOriginalIdx = state.current.answer;

    // Pintar correcto/incorrecto respetando el barajado
    $$(".option").forEach((b, domIdx)=>{
      const originalIdx = state.optionMap[domIdx];
      if (originalIdx === correctOriginalIdx) b.classList.add("correct");
      else if (originalIdx === myOriginalIdx) b.classList.add("wrong");
    });

    $("#label-correct").textContent = `Respuesta correcta: ${state.current.options[correctOriginalIdx]} ${delta>0?`(+${delta} pts)`:"(0 pts)"}`;
    $("#label-expl").textContent = state.current.explanation || "";
    $("#btn-next").disabled = false;
    $("#after-round").classList.remove("hidden");
    $("#label-score").innerHTML = `<strong>${state.score} pts</strong>`;
  }

  function endGame(){
    show("#screen-end");
    $("#final-summary").textContent = `${state.name || "Jugador"} · ${state.score} pts · ${state.order.length} preguntas`;

    const list = $("#final-breakdown");
    list.innerHTML = "";
    const QUESTIONS = window.QUESTIONS;
    state.breakdown.forEach((r,i)=>{
      const q = QUESTIONS.find(q=>q.question===r.q) || state.current;
      const correct = q.options[r.correctIndex];
      const mine = q.options[r.myIndex] ?? "Sin respuesta";
      const li = document.createElement("li");
      li.innerHTML = `<span>#${i+1}. ${escapeHtml(r.q)}</span><span>${r.delta} pts</span>`;
      const sub = document.createElement("div");
      sub.className="muted"; sub.style.marginTop="4px";
      sub.textContent = `Tu respuesta: ${mine} · Correcta: ${correct}`;
      li.appendChild(sub); list.appendChild(li);
    });

    const hs = getHS(); hs.push({ name: state.name||"Jugador", score: state.score, at: Date.now() });
    hs.sort((a,b)=>b.score-a.score); setHS(hs); renderHS();
  }

  function startTimer(){
    const totalMs = Math.max(0, state.currentEnds - Date.now());
    const bar = $("#timer-bar"); const label = $("#timer-label");
    cancelAnimationFrame(state.timerRAF);

    function frame(){
      const left = state.currentEnds - Date.now();
      const ratio = Math.max(0, Math.min(1, left/totalMs));
      bar.style.transform = `scaleX(${Number.isFinite(ratio)?ratio:0})`;
      label.textContent = fmtSecs(left);
      if (left <= 0){
        cancelAnimationFrame(state.timerRAF);
        if (!state.locked){
          state.locked = true;
          revealSolution(-1, 0);
          state.breakdown.push({ q: state.current.question, correctIndex: state.current.answer, myIndex: -1, delta:0 });
        }
        return;
      }
      state.timerRAF = requestAnimationFrame(frame);
    }
    frame();
  }
  function stopTimer(){ cancelAnimationFrame(state.timerRAF); }

  function escapeHtml(s){
    return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }
  function show(id){
    $$("#screen-home, #screen-game, #screen-end").forEach(el=>el.classList.remove("active"));
    $(id).classList.add("active");
  }

  window.addEventListener("DOMContentLoaded", ()=>{
    $("#btn-start")?.addEventListener("click", startGame);
    $("#btn-next")?.addEventListener("click", ()=>nextQuestion());
    $("#btn-retry")?.addEventListener("click", ()=>show("#screen-home"));
    $("#btn-home")?.addEventListener("click", ()=>show("#screen-home"));
    $("#btn-clear-hs")?.addEventListener("click", ()=>{ localStorage.removeItem(HS_KEY); renderHS(); });
    renderHS();
  });
})();
