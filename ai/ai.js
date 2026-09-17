// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// ai.js — askAI(task, payload, {onToken})
//   AI_ENDPOINT 가 비어있으면 결정론적 한국어 MockProvider 사용 (데모).
//   설정되어 있으면 서버 프록시로 POST + 스트리밍.
//
// 중요: 모든 AI 출력은 참고용이며 의료 조언이 아닙니다 (NOT medical advice).
// 진단하지 않으며, 이상 시 반드시 의료 전문가/응급 연락을 권합니다.

import { AI_ENDPOINT } from "./config.js";
import { simulateVitals, assessVitals, buildSchedule, formatDuration } from "../js/care-sim.js";

const MED_DISCLAIMER =
  "⚠️ 이 안내는 참고용이며 의료 조언이 아닙니다. 진단이 아니며, 증상이 지속·악화되면 의료 전문가와 상담하거나 응급 연락처로 연락하세요.";

/**
 * @param {"chat"|"routine"|"alert"|"digest"} task
 * @param {object} payload
 * @param {{onToken?: (t:string)=>void}} [opts]
 * @returns {Promise<string>}
 */
export async function askAI(task, payload = {}, { onToken } = {}) {
  if (!AI_ENDPOINT) {
    return runMock(task, payload, onToken);
  }
  // 무인(never-breaks): 실 엔드포인트 실패 / 429 {fallback:true} / 네트워크 오류 시
  // 자동으로 Mock 으로 폴백해 앱이 절대 멈추지 않게 합니다.
  try {
    return await realProvider(task, payload, onToken);
  } catch (_) {
    return runMock(task, payload, onToken);
  }
}

/** Mock 실행 (+ 선택적 로컬 스트리밍) */
async function runMock(task, payload, onToken) {
  const text = mockProvider(task, payload);
  if (onToken) await streamLocal(text, onToken);
  return text;
}

/** 로컬 스트리밍 흉내 (Mock) */
async function streamLocal(text, onToken) {
  const chunks = text.match(/[\s\S]{1,24}/g) || [text];
  for (const c of chunks) {
    onToken(c);
    await new Promise((r) => setTimeout(r, 12));
  }
}

/** 서버 프록시 호출 + 스트림 파싱 (실패 시 throw → askAI 가 Mock 으로 폴백) */
async function realProvider(task, payload, onToken) {
  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, payload }),
  });
  // 429 {fallback:true} (비용 한도 초과) → 폴백 신호. 그 외 오류도 throw.
  if (res.status === 429) throw new Error("AI 한도 초과 → Mock 폴백");
  if (!res.ok) throw new Error(`AI 서버 오류: ${res.status}`);
  if (!onToken || !res.body) {
    const data = await res.json().catch(() => null);
    return (data && data.text) || (await res.text());
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const t = decoder.decode(value, { stream: true });
    out += t;
    onToken(t);
  }
  return out;
}

/**
 * 결정론적 한국어 Mock. care-sim 헬퍼를 재사용합니다.
 * @param {string} task
 * @param {object} payload
 * @returns {string}
 */
export function mockProvider(task, payload = {}) {
  if (task === "chat") return mockChat(payload);
  if (task === "routine") return mockRoutine(payload);
  if (task === "alert") return mockAlert(payload);
  if (task === "digest") return mockDigest(payload);
  return `요청을 이해하지 못했습니다.\n\n${MED_DISCLAIMER}`;
}

/**
 * 오늘의 돌봄 팁 (무인 자동 다이제스트). chat mock 을 재사용하며
 * 케어 루틴 정보로 추천 루틴을 덧붙입니다. 오프라인(Mock)에서도 동작합니다.
 */
function mockDigest(payload) {
  const topic = String(payload.topic || "").trim();
  const tip = mockChat({ question: topic || "돌봄 일반 팁" });
  const routineName = payload.context && payload.context.routineName;
  const rec = routineName
    ? `\n\n오늘 추천 루틴: ${routineName} — 시뮬레이터에서 실행해 볼 수 있어요.`
    : "";
  const heading = topic ? `오늘의 돌봄 팁 · ${topic}` : "오늘의 돌봄 팁";
  // mockChat 이 이미 면책을 포함하므로 heading 만 앞에 붙입니다.
  return `【${heading}】\n${tip}${rec}`;
}

function mockChat(payload) {
  const q = String(payload.question || payload.text || "").trim();
  const topics = [
    {
      keys: ["욕창", "체위", "누워", "압박"],
      tip:
        "욕창 예방 팁 (일반 정보)\n" +
        "• 2시간 간격으로 체위를 바꿔 한 부위 압박을 줄이세요.\n" +
        "• 뼈가 돌출된 부위(엉치·발뒤꿈치)에 쿠션을 대주세요.\n" +
        "• 피부를 건조하고 청결하게 유지하고 발적·물집을 매일 확인하세요.",
    },
    {
      keys: ["수분", "물", "탈수", "마시"],
      tip:
        "수분 관리 팁 (일반 정보)\n" +
        "• 소량씩 자주 수분을 제공하고 하루 섭취량을 기록하세요.\n" +
        "• 소변 색이 진하거나 입안이 마르면 수분 부족 신호일 수 있습니다.\n" +
        "• 삼킴이 어려우면 점도 조절 음료를 고려하고 전문가와 상의하세요.",
    },
    {
      keys: ["피부", "보습", "건조", "발진"],
      tip:
        "피부 관리 팁 (일반 정보)\n" +
        "• 세정 후에는 두드려 말리고 보습제를 부드럽게 발라주세요.\n" +
        "• 너무 뜨거운 물은 피부를 건조하게 하므로 미온수를 사용하세요.\n" +
        "• 새로운 발진·짓무름은 조기에 확인하는 것이 중요합니다.",
    },
  ];
  const hit = topics.find((t) => t.keys.some((k) => q.includes(k)));
  const body = hit
    ? hit.tip
    : "돌봄 일반 팁\n" +
      "• 규칙적인 세정·건조·체위 변경으로 피부 문제를 예방하세요.\n" +
      "• 수분과 영양 섭취를 꾸준히 기록하세요.\n" +
      "• 평소와 다른 변화가 보이면 기록해 두었다가 전문가와 상의하세요.";
  return `${body}\n\n${MED_DISCLAIMER}`;
}

function mockRoutine(payload) {
  const routine = payload.routine;
  const start = payload.startHHMM || "09:00";
  if (!routine || !Array.isArray(routine.steps)) {
    return `추천할 루틴 정보가 없습니다.\n\n${MED_DISCLAIMER}`;
  }
  const sched = buildSchedule(routine, start);
  const lines = sched.steps.map(
    (s, i) => `${i + 1}. ${s.atClock} · ${s.name} (${formatDuration(s.seconds)})${s.gentle ? " · 순한 모드" : ""}`
  );
  return (
    `추천 케어 일정 — ${routine.name}\n` +
    `시작 ${start}, 총 소요 ${formatDuration(sched.totalSec)}\n\n` +
    lines.join("\n") +
    `\n\n체위 변경 단계는 욕창 예방을 위해 완만하게 진행됩니다. 대상자 상태에 맞게 간격을 조절하세요.` +
    `\n\n${MED_DISCLAIMER}`
  );
}

function mockAlert(payload) {
  const v = payload.vitals || simulateVitals(payload.seed || 1, payload.tick || 0);
  const a = assessVitals(v);
  const head =
    `바이탈 요약 (추정·데모): 심박 ${v.hr} bpm · 체온 ${v.tempC}°C · 호흡 ${v.resp}/분 · SpO2 ${v.spo2}%`;
  if (a.ok) {
    return (
      `${head}\n\n현재 추정값은 참고 범위 안입니다. 계속 관찰하고 평소와 다른 변화가 있으면 기록하세요.\n\n${MED_DISCLAIMER}`
    );
  }
  return (
    `${head}\n\n` +
    `주의: ${a.flags.join(", ")} 항목이 참고 범위를 벗어났습니다(추정값).\n` +
    `보호자 안내 문구:\n` +
    `"현재 ${a.flags.join("·")} 관련 수치가 평소와 다르게 측정되었습니다. 대상자의 의식·호흡·안색을 확인하고, ` +
    `증상이 있거나 불안하면 담당 의료진 또는 응급 연락처(예: 119)로 즉시 연락하세요."\n` +
    `\n이 시스템은 진단을 하지 않습니다.\n\n${MED_DISCLAIMER}`
  );
}
