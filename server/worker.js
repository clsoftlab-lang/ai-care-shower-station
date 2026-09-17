// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/worker.js — Cloudflare Workers 변형 (무료 티어 · 무인 운영).
//   Anthropic REST(POST /v1/messages) 를 직접 호출합니다.
//   API 키는 Worker 시크릿(ANTHROPIC_API_KEY)에서만 읽습니다:
//     wrangler secret put ANTHROPIC_API_KEY
//   절대 브라우저나 리포지토리에 키를 넣지 마세요.
//
// index.mjs 와 동일한 태스크 라우팅 + 모델/캐싱 규칙을 사용합니다.
// 비용 우선 기본 모델(claude-haiku-4-5), AI_MODEL 로 상향 가능.

const MED_SYSTEM =
  "당신은 재택 돌봄 보조 도우미입니다. 한국어로 간결하고 친절하게 답하세요. " +
  "당신은 의료기기가 아니며 진단을 하지 않습니다. 모든 답변은 참고용 일반 정보이며, " +
  "증상이 지속·악화되면 반드시 의료 전문가와 상담하거나 응급 연락처로 연락하도록 권고하세요. " +
  "생체신호 값은 추정·데모이며 진단 근거가 아님을 명확히 하세요.";

const SYSTEM_BLOCKS = [
  { type: "text", text: MED_SYSTEM, cache_control: { type: "ephemeral" } },
];

const MAX_TOKENS = { chat: 700, routine: 900, alert: 700 };
function maxTokensFor(task) {
  return MAX_TOKENS[task] || 700;
}

function buildUserMessage(task, payload) {
  if (task === "chat") {
    return `돌봄 관련 질문입니다. 일반 정보로 답해 주세요:\n${payload.question || payload.text || ""}`;
  }
  if (task === "routine") {
    return `다음 케어 루틴에 대한 시작 시각별 추천 일정과 주의사항을 만들어 주세요(시작 ${payload.startHHMM || "09:00"}):\n${JSON.stringify(payload.routine || {})}`;
  }
  if (task === "alert") {
    return `다음 추정 바이탈에 대해 보호자에게 전달할 안내 문구를 작성해 주세요(진단 금지):\n${JSON.stringify(payload.vitals || {})}`;
  }
  if (task === "digest") {
    return `오늘의 돌봄 팁을 만들어 주세요(주제: ${payload.topic || "일반 돌봄"}). 욕창 예방·수분·피부 관리 관점에서 2~3개의 짧은 실천 팁을 제시하세요:\n${JSON.stringify(payload.context || {})}`;
  }
  return String(payload.text || "");
}

// ---------- 비용 가드레일 (Worker 인스턴스 메모리 기준) ----------
const RATE_PER_MIN = 20;
const rateMap = new Map(); // ip -> { count, resetAt }
function rateLimited(ip) {
  const now = Date.now();
  let e = rateMap.get(ip);
  if (!e || now >= e.resetAt) {
    e = { count: 0, resetAt: now + 60_000 };
    rateMap.set(ip, e);
  }
  e.count += 1;
  return e.count > RATE_PER_MIN;
}

let usedTokens = 0;
let budgetMonth = new Date().getUTCMonth();
function budgetExceeded(cap) {
  const m = new Date().getUTCMonth();
  if (m !== budgetMonth) {
    budgetMonth = m;
    usedTokens = 0;
  }
  return usedTokens >= cap;
}
function addUsage(u) {
  if (!u) return;
  usedTokens +=
    (u.input_tokens || 0) +
    (u.output_tokens || 0) +
    (u.cache_creation_input_tokens || 0) +
    (u.cache_read_input_tokens || 0);
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": (env && env.CORS_ORIGIN) || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    const CORS = corsHeaders(env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    const url = new URL(request.url);
    if (request.method !== "POST" || !url.pathname.startsWith("/api/ai")) {
      return new Response("Not found", { status: 404, headers: CORS });
    }

    const MODEL = (env && env.AI_MODEL) || "claude-haiku-4-5";
    const IS_HAIKU = MODEL.startsWith("claude-haiku");
    const CAP = Number((env && env.AI_MONTHLY_TOKEN_CAP) || 2_000_000);

    // 비용 가드레일: 초과 시 429 {fallback:true} → 클라이언트는 Mock 으로 폴백.
    const ip = (request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    if (rateLimited(ip) || budgetExceeded(CAP)) {
      return new Response(JSON.stringify({ fallback: true }), {
        status: 429,
        headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
      });
    }

    let task, payload;
    try {
      const body = await request.json();
      task = body.task;
      payload = body.payload || {};
    } catch (_) {
      return new Response("잘못된 요청", { status: 400, headers: CORS });
    }

    const reqBody = {
      model: MODEL,
      max_tokens: maxTokensFor(task),
      system: SYSTEM_BLOCKS,
      messages: [{ role: "user", content: buildUserMessage(task, payload) }],
    };
    if (!IS_HAIKU) {
      reqBody.thinking = { type: "adaptive" };
      reqBody.output_config = { effort: (env && env.AI_EFFORT) || "low" };
    }

    try {
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(reqBody),
      });
      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => "");
        return new Response(`AI 오류: ${upstream.status} ${detail}`.trim(), {
          status: 502,
          headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS },
        });
      }
      const data = await upstream.json();
      addUsage(data && data.usage); // 응답의 usage 누적
      const text = Array.isArray(data.content)
        ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("")
        : "";
      return new Response(text, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS },
      });
    } catch (err) {
      return new Response(`AI 오류: ${err && err.message ? err.message : "unknown"}`, {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS },
      });
    }
  },
};
