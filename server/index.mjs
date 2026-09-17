// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/index.mjs — Claude 프록시 (선택 사항).
// API 키는 서버 환경변수(ANTHROPIC_API_KEY)로만 사용합니다.
// 절대 브라우저나 리포지토리에 키를 넣지 마세요.
//
// 실행: npm install && ANTHROPIC_API_KEY=sk-ant-... npm start
// CI 에서는 install/run/호출하지 않습니다.

import http from "node:http";
import Anthropic from "@anthropic-ai/sdk";

const PORT = process.env.PORT || 8787;
const MODEL = "claude-opus-5";

const MED_SYSTEM =
  "당신은 재택 돌봄 보조 도우미입니다. 한국어로 간결하고 친절하게 답하세요. " +
  "당신은 의료기기가 아니며 진단을 하지 않습니다. 모든 답변은 참고용 일반 정보이며, " +
  "증상이 지속·악화되면 반드시 의료 전문가와 상담하거나 응급 연락처로 연락하도록 권고하세요. " +
  "생체신호 값은 추정·데모이며 진단 근거가 아님을 명확히 하세요.";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CORS = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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
  return String(payload.text || "");
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
  try {
    const body = await readBody(req);
    const { task, payload } = JSON.parse(body || "{}");
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...CORS });
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: MED_SYSTEM,
      messages: [{ role: "user", content: buildUserMessage(task, payload) }],
    });
    stream.on("text", (t) => res.write(t));
    await stream.finalMessage();
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

export { serverHandler, buildUserMessage, MODEL };
