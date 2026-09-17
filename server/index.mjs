// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/index.mjs — Claude 프록시 (선택 사항) · 저비용·무인 지향.
// API 키는 서버 환경변수(ANTHROPIC_API_KEY)로만 사용합니다.
// 절대 브라우저나 리포지토리에 키를 넣지 마세요.
//
// 실행: npm install && ANTHROPIC_API_KEY=sk-ant-... npm start
// CI 에서는 install/run/호출하지 않습니다.
//
// 비용 최적화:
//  - 기본 모델은 저비용 우선(claude-haiku-4-5). AI_MODEL 로 상향 가능.
//  - 안정적인 system 프롬프트를 prompt caching(cache_control) 으로 재사용.
//  - 태스크별 modest max_tokens 상한.
//  - IP 당 분당 요청 제한 + 월 토큰 예산(초과 시 429 {fallback:true}).

import http from "node:http";
import Anthropic from "@anthropic-ai/sdk";

const PORT = process.env.PORT || 8787;

// 비용 우선 기본값. 품질을 높이려면 AI_MODEL 을 claude-sonnet-5 또는
// claude-opus-5 로 올릴 수 있습니다.
const MODEL = process.env.AI_MODEL || "claude-haiku-4-5";

// Haiku 4.5 는 adaptive thinking / effort 를 받지 않습니다(400 방지).
const IS_HAIKU = MODEL.startsWith("claude-haiku");

const MED_SYSTEM =
  "당신은 재택 돌봄 보조 도우미입니다. 한국어로 간결하고 친절하게 답하세요. " +
  "당신은 의료기기가 아니며 진단을 하지 않습니다. 모든 답변은 참고용 일반 정보이며, " +
  "증상이 지속·악화되면 반드시 의료 전문가와 상담하거나 응급 연락처로 연락하도록 권고하세요. " +
  "생체신호 값은 추정·데모이며 진단 근거가 아님을 명확히 하세요.";

// 안정적인 system 프롬프트를 cache_control 로 표시 → 반복 호출 시 캐시 히트로 비용 절감.
const SYSTEM_BLOCKS = [
  { type: "text", text: MED_SYSTEM, cache_control: { type: "ephemeral" } },
];

// 태스크별 modest 출력 상한(기본 700). 정말 필요한 태스크만 상향.
const MAX_TOKENS = { chat: 700, routine: 900, alert: 700 };
function maxTokensFor(task) {
  return MAX_TOKENS[task] || 700;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CORS = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ---------- 비용 가드레일 ----------
// 1) IP 당 분당 요청 제한 (in-memory).
const RATE_PER_MIN = Number(process.env.AI_RATE_PER_MIN || 20);
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

// 2) 월 토큰 예산 (in-memory, 월 롤오버 시 리셋).
const MONTHLY_TOKEN_CAP = Number(process.env.AI_MONTHLY_TOKEN_CAP || 2_000_000);
let usedTokens = 0;
let budgetMonth = new Date().getUTCMonth();
function budgetExceeded() {
  const m = new Date().getUTCMonth();
  if (m !== budgetMonth) {
    budgetMonth = m;
    usedTokens = 0;
  }
  return usedTokens >= MONTHLY_TOKEN_CAP;
}
function addUsage(u) {
  if (!u) return;
  usedTokens +=
    (u.input_tokens || 0) +
    (u.output_tokens || 0) +
    (u.cache_creation_input_tokens || 0) +
    (u.cache_read_input_tokens || 0);
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

// 태스크별 요청 파라미터(모델/캐싱/effort 규칙 공유).
function buildParams(task, payload) {
  const params = {
    model: MODEL,
    max_tokens: maxTokensFor(task),
    system: SYSTEM_BLOCKS,
    messages: [{ role: "user", content: buildUserMessage(task, payload) }],
  };
  if (!IS_HAIKU) {
    // Haiku 가 아닐 때만 adaptive thinking + effort 를 사용.
    params.thinking = { type: "adaptive" };
    params.output_config = { effort: process.env.AI_EFFORT || "low" };
  }
  return params;
}

const serverHandler = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method !== "POST" || !req.url.startsWith("/api/ai")) {
    res.writeHead(404, { "Content-Type": "text/plain", ...CORS });
    res.end("Not found");
    return;
  }

  // 비용 가드레일: 한도 초과 시 429 {fallback:true} → 클라이언트는 Mock 으로 폴백.
  const ip = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.socket?.remoteAddress || "unknown";
  if (rateLimited(ip) || budgetExceeded()) {
    res.writeHead(429, { "Content-Type": "application/json; charset=utf-8", ...CORS });
    res.end(JSON.stringify({ fallback: true }));
    return;
  }

  try {
    const body = await readBody(req);
    const { task, payload } = JSON.parse(body || "{}");
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...CORS });
    const stream = client.messages.stream(buildParams(task, payload || {}));
    stream.on("text", (t) => res.write(t));
    const final = await stream.finalMessage();
    addUsage(final && final.usage); // 스트림 최종 메시지의 usage 누적
    res.end();
  } catch (err) {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain", ...CORS });
    res.end(`AI 오류: ${err && err.message ? err.message : "unknown"}`);
  }
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// 직접 실행될 때만 서버를 띄웁니다 (테스트/검사에서는 import만 가능).
if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\\\/g, "/")}`) {
  http.createServer(serverHandler).listen(PORT, () => {
    console.log(`AI 프록시 서버 실행 중: http://localhost:${PORT}/api/ai (model: ${MODEL})`);
  });
}

export { serverHandler, buildUserMessage, buildParams, MODEL };
