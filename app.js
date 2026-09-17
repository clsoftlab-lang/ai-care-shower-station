// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// app.js — UI 배선. 순수 로직은 js/care-sim.js, AI는 ai/ai.js 에 있습니다.
// 의료기기 아님 · 진단 아님 · 바이탈은 시뮬레이션/추정 데모값입니다.

import {
  buildSchedule,
  activeStepIndex,
  simulateVitals,
  assessVitals,
  checkSafety,
  totalSeconds,
  formatDuration,
} from "./js/care-sim.js";
import { askAI } from "./ai/ai.js";
import { renderStation } from "./js/station-svg.js";

const $ = (id) => document.getElementById(id);
const LS_LOG = "acs.carelog.v1";
const LS_THEME = "acs.theme.v1";

const state = {
  routines: [],
  specs: null,
  parts: null,
  current: null, // 선택된 루틴
  schedule: null,
  simTimer: null,
  simElapsed: 0,
  slip: false,
  vitalsTimer: null,
  vitalsTick: 0,
  lastVitals: simulateVitals(1, 0),
};

// ---------- 초기화 ----------
init().catch((err) => console.error("초기화 실패:", err));

async function init() {
  applyStoredTheme();
  wireTheme();
  await loadData();
  buildRoutineSelect();
  renderSpecs();
  renderBom();
  renderLog();
  renderStationFrame(null, false);
  wireSimulator();
  wireVitals();
  wireCareLog();
  wireAI();
  onRoutineChange();
  loadDailyTip(); // 무인 자동 다이제스트 (오늘의 돌봄 팁)
}

// ---------- 무인 자동 다이제스트: 오늘의 돌봄 팁 ----------
// 페이지 로드 시 날짜 기반으로 주제를 골라 askAI 로 자동 생성합니다.
// AI_ENDPOINT 가 비어 있으면 Mock 으로, 실 엔드포인트 실패 시에도 Mock 으로 폴백합니다.
async function loadDailyTip() {
  const out = $("daily-tip-out");
  if (!out) return;
  const topics = ["욕창 예방", "수분 관리", "피부 관리"];
  const dayIndex = Math.floor(Date.now() / 86400000); // 날짜(UTC일) 기반 회전
  const topic = topics[dayIndex % topics.length];
  // 케어 루틴 정보를 컨텍스트로 함께 전달 (via care routines).
  const routineName = state.current ? state.current.name : (state.routines[0] && state.routines[0].name);
  out.textContent = "";
  try {
    await askAI(
      "digest",
      { topic, context: { routineName } },
      { onToken: (t) => { out.textContent += t; out.scrollTop = out.scrollHeight; } }
    );
  } catch (e) {
    out.textContent = "팁을 불러오지 못했습니다: " + (e.message || e);
  }
}

async function loadData() {
  const [routines, specs, parts] = await Promise.all([
    fetchJSON("./data/routines.json"),
    fetchJSON("./data/specs.json"),
    fetchJSON("./data/parts.json"),
  ]);
  state.routines = routines.routines || [];
  state.specs = specs;
  state.parts = parts;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 로드 실패: ${res.status}`);
  return res.json();
}

// ---------- 테마 ----------
function applyStoredTheme() {
  try {
    const t = localStorage.getItem(LS_THEME);
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (_) { /* localStorage 불가 시 무시 */ }
}
function wireTheme() {
  $("theme-toggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const isDark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(LS_THEME, next); } catch (_) { /* 무시 */ }
  });
}

// ---------- 루틴 선택 ----------
function buildRoutineSelect() {
  const sel = $("routine-select");
  sel.innerHTML = "";
  for (const r of state.routines) {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.name;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", onRoutineChange);
}

function onRoutineChange() {
  const id = $("routine-select").value;
  state.current = state.routines.find((r) => r.id === id) || state.routines[0];
  stopSim();
  state.schedule = buildSchedule(state.current, $("start-time").value || "09:00");
  renderStepList(-1);
  renderStationFrame(null, false);
  $("safety-panel").innerHTML = `<span class="ok">✔ 대기 중 — 인터록 정상</span>`;
  $("sim-readout").innerHTML = readoutHTML({ tempC: 0, flowLpm: 0, gentle: true }, "대기");
}

// ---------- 시뮬레이터 ----------
function wireSimulator() {
  $("sim-start").addEventListener("click", startSim);
  $("sim-stop").addEventListener("click", stopSim);
  $("start-time").addEventListener("change", () => {
    state.schedule = buildSchedule(state.current, $("start-time").value || "09:00");
    renderStepList(-1);
  });
  $("sim-slip").addEventListener("click", () => {
    state.slip = !state.slip;
    $("sim-slip").classList.toggle("primary", state.slip);
    tickSim(true);
  });
}

function startSim() {
  if (!state.current) return;
  stopSim();
  state.schedule = buildSchedule(state.current, $("start-time").value || "09:00");
  state.simElapsed = 0;
  state.simTimer = setInterval(() => {
    state.simElapsed += 1;
    tickSim(false);
  }, 250); // 1초 = 250ms (4배속 데모)
  tickSim(false);
}

function stopSim() {
  if (state.simTimer) { clearInterval(state.simTimer); state.simTimer = null; }
}

function tickSim(forceRedraw) {
  const sched = state.schedule;
  if (!sched) return;
  const idx = activeStepIndex(sched, state.simElapsed);
  if (idx === -1 && !forceRedraw) {
    stopSim();
    renderStepList(sched.steps.length); // 모두 완료
    renderStationFrame(null, false);
    $("sim-readout").innerHTML = readoutHTML({ tempC: 0, flowLpm: 0, gentle: true }, "완료");
    $("safety-panel").innerHTML = `<span class="ok">✔ 루틴 완료 — 인터록 정상</span>`;
    return;
  }
  const step = sched.steps[Math.max(0, idx)];
  const safety = checkSafety({ tempC: step.tempC, flowLpm: step.flowLpm, slip: state.slip });
  renderStepList(idx);
  renderStationFrame(step, safety.safe);
  $("sim-readout").innerHTML = readoutHTML(step, step.name);
  renderSafety(safety);
}

function readoutHTML(step, label) {
  return (
    `<div class="metric"><div class="k">단계</div><div class="v">${escapeHTML(label)}</div></div>` +
    `<div class="metric"><div class="k">물온도</div><div class="v">${step.tempC ? step.tempC + "°C" : "—"}</div></div>` +
    `<div class="metric"><div class="k">유량</div><div class="v">${step.flowLpm ? step.flowLpm + " L/min" : "—"}</div></div>` +
    `<div class="metric"><div class="k">모드</div><div class="v">${step.gentle ? "순한" : "표준"}</div></div>`
  );
}

function renderStepList(activeIdx) {
  const ol = $("step-list");
  ol.innerHTML = "";
  const steps = state.schedule ? state.schedule.steps : [];
  steps.forEach((s, i) => {
    const li = document.createElement("li");
    li.textContent = `${s.atClock} · ${s.name} (${formatDuration(s.seconds)})`;
    if (i === activeIdx) li.className = "active";
    else if (activeIdx === -1) li.className = "";
    else if (i < activeIdx || activeIdx >= steps.length) li.className = "done";
    ol.appendChild(li);
  });
}

function renderSafety(safety) {
  const panel = $("safety-panel");
  if (safety.safe) {
    panel.innerHTML = `<span class="ok">✔ 모든 인터록 정상 (물온도 상한·유량·미끄럼 감시)</span>`;
    return;
  }
  panel.innerHTML = safety.interlocks.map((x) => `<div class="lock">⛔ ${escapeHTML(x)}</div>`).join("");
}

function renderStationFrame(step, safe) {
  $("care-station-svg").innerHTML = renderStation(step, safe, state.slip);
}

// ---------- 바이탈 모니터 ----------
function wireVitals() {
  $("vitals-toggle").addEventListener("click", toggleVitals);
  renderVitals(state.lastVitals);
  $("vitals-status").textContent = "정지됨 (시뮬레이션·추정)";
}

function toggleVitals() {
  if (state.vitalsTimer) {
    clearInterval(state.vitalsTimer);
    state.vitalsTimer = null;
    $("vitals-status").textContent = "정지됨 (시뮬레이션·추정)";
    return;
  }
  state.vitalsTimer = setInterval(() => {
    state.vitalsTick += 1;
    state.lastVitals = simulateVitals(7, state.vitalsTick);
    renderVitals(state.lastVitals);
  }, 1000);
  $("vitals-status").textContent = "측정 중 (시뮬레이션·추정 · 진단 아님)";
}

function renderVitals(v) {
  const a = assessVitals(v);
  const cards = [
    { label: "심박 (추정)", value: v.hr, unit: "bpm", flag: a.flags.includes("심박") },
    { label: "체온 (추정)", value: v.tempC, unit: "°C", flag: a.flags.includes("체온") },
    { label: "호흡 (추정)", value: v.resp, unit: "/분", flag: a.flags.includes("호흡") },
    { label: "SpO2 (추정)", value: v.spo2, unit: "%", flag: a.flags.includes("SpO2") },
  ];
  $("vitals-monitor").innerHTML = cards
    .map(
      (c) =>
        `<div class="vital${c.flag ? " flag" : ""}"><div class="label">${c.label}</div>` +
        `<div class="value">${c.value}</div><div class="unit">${c.unit}</div></div>`
    )
    .join("");
}

// ---------- 케어 기록 ----------
function wireCareLog() {
  $("log-add").addEventListener("click", () => {
    if (!state.current) return;
    const entry = {
      t: new Date().toISOString(),
      routine: state.current.name,
      dur: totalSeconds(state.current),
    };
    const log = readLog();
    log.unshift(entry);
    writeLog(log.slice(0, 50));
    renderLog();
  });
  $("log-reset").addEventListener("click", () => {
    writeLog([]);
    renderLog();
  });
}

function readLog() {
  try {
    const raw = localStorage.getItem(LS_LOG);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}
function writeLog(arr) {
  try { localStorage.setItem(LS_LOG, JSON.stringify(arr)); } catch (_) { /* 무시 */ }
}
function renderLog() {
  const ul = $("care-log-list");
  const log = readLog();
  if (!log.length) {
    ul.innerHTML = `<li class="empty">기록이 없습니다. 루틴을 실행하고 "기록 추가"를 눌러 보세요.</li>`;
    return;
  }
  ul.innerHTML = log
    .map((e) => {
      const d = new Date(e.t);
      const when = isNaN(d) ? e.t : d.toLocaleString("ko-KR");
      return `<li><span>${escapeHTML(e.routine)}</span><span class="muted">${escapeHTML(when)} · ${formatDuration(e.dur)}</span></li>`;
    })
    .join("");
}

// ---------- 설계/스펙 ----------
function renderSpecs() {
  $("specs-note").textContent = state.specs.meta.disclaimer;
  $("specs-list").innerHTML = state.specs.sections
    .map(
      (s) =>
        `<div class="spec-card"><h3>${escapeHTML(s.title)}</h3><ul>` +
        s.items.map((it) => `<li>${escapeHTML(it)}</li>`).join("") +
        `</ul></div>`
    )
    .join("");
}

// ---------- BOM ----------
function renderBom() {
  $("bom-note").textContent = state.parts.meta.disclaimer;
  const fmt = (n) => n.toLocaleString("ko-KR") + "원";
  let total = 0;
  $("bom-body").innerHTML = state.parts.parts
    .map((p) => {
      const sum = p.qty * p.unitPrice;
      total += sum;
      return (
        `<tr><td>${escapeHTML(p.name)}</td><td>${escapeHTML(p.category)}</td>` +
        `<td class="num">${p.qty}</td><td class="num">${fmt(p.unitPrice)}</td>` +
        `<td class="num">${fmt(sum)}</td><td>${escapeHTML(p.note || "")}</td></tr>`
      );
    })
    .join("");
  $("bom-total").textContent = fmt(total);
}

// ---------- AI 기능 ----------
function wireAI() {
  $("ai-chat-send").addEventListener("click", sendChat);
  $("ai-chat-input").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
  $("ai-routine-gen").addEventListener("click", async () => {
    const out = $("ai-routine-out");
    out.textContent = "생성 중…";
    await streamTo(out, "routine", { routine: state.current, startHHMM: $("start-time").value || "09:00" });
  });
  $("ai-alert-gen").addEventListener("click", async () => {
    const out = $("ai-alert-out");
    out.textContent = "생성 중…";
    await streamTo(out, "alert", { vitals: state.lastVitals });
  });
}

async function sendChat() {
  const input = $("ai-chat-input");
  const q = input.value.trim();
  if (!q) return;
  const log = $("ai-chat-log");
  log.textContent += (log.textContent ? "\n\n" : "") + "🙋 " + q + "\n🤖 ";
  input.value = "";
  const start = log.textContent.length;
  try {
    await askAI("chat", { question: q }, { onToken: (t) => { log.textContent += t; log.scrollTop = log.scrollHeight; } });
  } catch (e) {
    log.textContent = log.textContent.slice(0, start) + "오류: " + (e.message || e);
  }
}

async function streamTo(el, task, payload) {
  el.textContent = "";
  try {
    await askAI(task, payload, { onToken: (t) => { el.textContent += t; el.scrollTop = el.scrollHeight; } });
  } catch (e) {
    el.textContent = "오류: " + (e.message || e);
  }
}

// ---------- 유틸 ----------
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
