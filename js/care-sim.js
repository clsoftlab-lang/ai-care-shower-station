// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// care-sim.js — 순수 함수 헬퍼 (부작용 없음).
// 케어 일정 생성 + 바이탈 시뮬레이션 + 안전 인터록 판정.
// 브라우저/Node/테스트에서 동일하게 동작하도록 순수하게 유지합니다.
// 의료기기 아님 · 진단 아님 · 모든 바이탈 값은 시뮬레이션/추정 데모값입니다.

/** 상한/기준값 (개념값, 검증되지 않음) */
export const LIMITS = Object.freeze({
  tempLimitC: 41, // 물온도 하드 상한
  flowMaxLpm: 9,
  // 바이탈 정상 참고 범위 (데모 · 진단 근거 아님)
  hrNormal: [50, 110],
  tempNormal: [35.5, 37.8],
  respNormal: [10, 24],
  spo2Normal: [92, 100],
});

/**
 * 결정론적 의사난수 (seed 기반). 테스트 재현성을 위해 사용.
 * @param {number} seed
 * @returns {() => number} 0..1 생성기
 */
export function makeRng(seed) {
  let s = (Math.floor(seed) % 2147483647) || 1;
  if (s <= 0) s += 2147483646;
  return function next() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * 루틴 총 소요 시간(초).
 * @param {{steps: Array<{seconds:number}>}} routine
 * @returns {number}
 */
export function totalSeconds(routine) {
  if (!routine || !Array.isArray(routine.steps)) return 0;
  return routine.steps.reduce((sum, s) => sum + (Number(s.seconds) || 0), 0);
}

/**
 * 시작 시각 + 루틴 → 각 단계의 시작/종료 오프셋이 담긴 일정.
 * @param {object} routine
 * @param {string} startHHMM "HH:MM" (기본 "09:00")
 * @returns {{routineId:string, startMin:number, totalSec:number, steps:Array}}
 */
export function buildSchedule(routine, startHHMM = "09:00") {
  const startMin = parseHHMM(startHHMM);
  let cursor = 0;
  const steps = (routine.steps || []).map((step) => {
    const start = cursor;
    const end = cursor + (Number(step.seconds) || 0);
    cursor = end;
    return {
      id: step.id,
      name: step.name,
      startSec: start,
      endSec: end,
      seconds: Number(step.seconds) || 0,
      tempC: Number(step.tempC) || 0,
      flowLpm: Number(step.flowLpm) || 0,
      gentle: !!step.gentle,
      note: step.note || "",
      atClock: minToHHMM(startMin + Math.floor(start / 60)),
    };
  });
  return {
    routineId: routine.id,
    startMin,
    totalSec: cursor,
    steps,
  };
}

/**
 * 특정 경과초에 활성인 단계 인덱스 반환 (-1 = 종료됨).
 * @param {object} schedule
 * @param {number} elapsedSec
 * @returns {number}
 */
export function activeStepIndex(schedule, elapsedSec) {
  const steps = schedule.steps || [];
  for (let i = 0; i < steps.length; i++) {
    if (elapsedSec < steps[i].endSec) return i;
  }
  return -1;
}

/**
 * 결정론적 바이탈 시뮬레이션 (데모/추정 · 진단 아님).
 * @param {number} seed
 * @param {number} tick 정수 tick (예: 초 단위)
 * @returns {{hr:number, tempC:number, resp:number, spo2:number}}
 */
export function simulateVitals(seed, tick) {
  const rng = makeRng(seed + tick * 7 + 1);
  const wobble = (base, amp) => base + (rng() - 0.5) * 2 * amp;
  const hr = Math.round(clamp(wobble(74, 8), 40, 140));
  const tempC = round1(clamp(wobble(36.6, 0.4), 34, 40));
  const resp = Math.round(clamp(wobble(16, 3), 6, 34));
  const spo2 = Math.round(clamp(wobble(97, 2), 80, 100));
  return { hr, tempC, resp, spo2 };
}

/**
 * 바이탈이 참고 범위를 벗어나는지 판정 (진단 아님 · 안내 목적).
 * @param {{hr:number,tempC:number,resp:number,spo2:number}} v
 * @returns {{ok:boolean, flags:string[]}}
 */
export function assessVitals(v) {
  const flags = [];
  if (v.hr < LIMITS.hrNormal[0] || v.hr > LIMITS.hrNormal[1]) flags.push("심박");
  if (v.tempC < LIMITS.tempNormal[0] || v.tempC > LIMITS.tempNormal[1]) flags.push("체온");
  if (v.resp < LIMITS.respNormal[0] || v.resp > LIMITS.respNormal[1]) flags.push("호흡");
  if (v.spo2 < LIMITS.spo2Normal[0]) flags.push("SpO2");
  return { ok: flags.length === 0, flags };
}

/**
 * 안전 인터록 판정. 물온도 상한 / 유량 상한 / 미끄럼 감지 확인.
 * @param {{tempC:number, flowLpm:number, slip?:boolean}} state
 * @returns {{safe:boolean, interlocks:string[]}}
 */
export function checkSafety(state) {
  const interlocks = [];
  if ((state.tempC || 0) > LIMITS.tempLimitC) interlocks.push("물온도 상한 초과 → 급수 차단");
  if ((state.flowLpm || 0) > LIMITS.flowMaxLpm) interlocks.push("유량 상한 초과 → 밸브 제한");
  if (state.slip) interlocks.push("미끄럼/이탈 감지 → 동작 정지·보호자 호출");
  return { safe: interlocks.length === 0, interlocks };
}

/**
 * 초 → "M분 S초" 표기.
 * @param {number} sec
 * @returns {string}
 */
export function formatDuration(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}초`;
  return `${m}분 ${r}초`;
}

// --- 내부 유틸 ---

/** @param {string} hhmm @returns {number} 분 */
export function parseHHMM(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return 9 * 60;
  const h = clamp(Number(m[1]), 0, 23);
  const min = clamp(Number(m[2]), 0, 59);
  return h * 60 + min;
}

/** @param {number} min @returns {string} "HH:MM" */
export function minToHHMM(min) {
  const total = ((Math.floor(min) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
function round1(n) {
  return Math.round(n * 10) / 10;
}
