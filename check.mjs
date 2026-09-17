// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// check.mjs — 의존성 없는 자체 검증 (CI 및 로컬).
//   1) data/*.json JSON 파싱
//   2) 모든 JS 파일 node --check (ai/ + server/ 포함)
//   3) index.html 필수 컨테이너 존재
//   4) 순수 헬퍼 단위 테스트
//   5) AI Mock 결정론 확인
//   6) AI_ENDPOINT 비어있음 + 브라우저/리포지토리에 실제 키(sk-ant + 20자+) 없음
//
// npm install/run 하지 않으며 실제 API 를 호출하지 않습니다.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
let pass = 0;
let fail = 0;
const fails = [];

function ok(name) { pass++; console.log(`  ✔ ${name}`); }
function bad(name, detail) { fail++; fails.push(name); console.log(`  x ${name} — ${detail}`); }
function assert(cond, name, detail = "") { cond ? ok(name) : bad(name, detail || "실패"); }

// ---------- 1) JSON 파싱 ----------
console.log("\n[1] data/*.json 파싱");
const dataFiles = ["routines.json", "specs.json", "parts.json"];
const data = {};
for (const f of dataFiles) {
  try {
    data[f] = JSON.parse(readFileSync(join(ROOT, "data", f), "utf8"));
    ok(`data/${f} 파싱`);
  } catch (e) {
    bad(`data/${f} 파싱`, e.message);
  }
}
assert(Array.isArray(data["routines.json"]?.routines) && data["routines.json"].routines.length >= 3,
  "routines >= 3개");
assert(Array.isArray(data["parts.json"]?.parts) && data["parts.json"].parts.length >= 5, "parts >= 5개");
assert(Array.isArray(data["specs.json"]?.sections) && data["specs.json"].sections.length >= 4, "specs >= 4섹션");

// ---------- 2) node --check 전체 JS ----------
console.log("\n[2] node --check (ai/ + server/ 포함)");
const jsFiles = collectJS(ROOT).filter((p) => !p.includes("node_modules"));
for (const p of jsFiles) {
  try {
    execFileSync(process.execPath, ["--check", p], { stdio: "pipe" });
    ok(`--check ${relative(ROOT, p)}`);
  } catch (e) {
    bad(`--check ${relative(ROOT, p)}`, (e.stderr || e.message || "").toString().split("\n")[0]);
  }
}
assert(jsFiles.some((p) => p.includes(`${"ai"}${sep()}`)), "ai/ JS 포함됨");
assert(jsFiles.some((p) => p.includes(`server${sep()}`)), "server/ JS 포함됨");

// ---------- 3) index.html 컨테이너 ----------
console.log("\n[3] index.html 필수 컨테이너");
const html = readFileSync(join(ROOT, "index.html"), "utf8");
const ids = [
  "app", "simulator", "routine-select", "sim-start", "step-list", "safety-panel",
  "care-station-svg", "sim-readout", "vitals", "vitals-monitor",
  "care-log", "care-log-list", "ai-features", "ai-chat", "ai-routine", "ai-alert",
  "specs", "specs-list", "bom", "bom-body", "idea-origin",
];
for (const id of ids) assert(html.includes(`id="${id}"`), `#${id} 존재`);
assert(/의료기기\s*아님/.test(html), "의료기기 아님 고지 존재");
assert(/X선|X-ray/i.test(html) ? /제거|removed/i.test(html) : true, "X선 언급은 '제거' 맥락에서만");

// ---------- 4) 순수 헬퍼 단위 테스트 ----------
console.log("\n[4] care-sim 단위 테스트");
const sim = await import("./js/care-sim.js");
{
  const routine = data["routines.json"].routines[0];
  const sched = sim.buildSchedule(routine, "09:00");
  assert(sched.steps.length === routine.steps.length, "buildSchedule 단계 수 일치");
  assert(sched.totalSec === sim.totalSeconds(routine), "totalSec == totalSeconds");
  assert(sched.steps[0].startSec === 0, "첫 단계 startSec=0");
  assert(sched.steps[0].atClock === "09:00", "첫 단계 시각=09:00");

  assert(sim.activeStepIndex(sched, 0) === 0, "activeStepIndex(0)=0");
  assert(sim.activeStepIndex(sched, sched.totalSec + 1) === -1, "종료 후 activeStepIndex=-1");

  const v1 = sim.simulateVitals(7, 5);
  const v2 = sim.simulateVitals(7, 5);
  assert(JSON.stringify(v1) === JSON.stringify(v2), "simulateVitals 결정론");
  assert(v1.hr >= 40 && v1.hr <= 140, "심박 범위 클램프");
  assert(v1.spo2 >= 80 && v1.spo2 <= 100, "SpO2 범위 클램프");

  const safeState = sim.checkSafety({ tempC: 39, flowLpm: 7, slip: false });
  assert(safeState.safe === true, "정상 상태 인터록 통과");
  const overTemp = sim.checkSafety({ tempC: 45, flowLpm: 7, slip: false });
  assert(overTemp.safe === false && overTemp.interlocks.length >= 1, "물온도 상한 인터록 발동");
  const slipState = sim.checkSafety({ tempC: 38, flowLpm: 5, slip: true });
  assert(slipState.safe === false, "미끄럼 감지 인터록 발동");

  const abn = sim.assessVitals({ hr: 200, tempC: 40, resp: 40, spo2: 70 });
  assert(abn.ok === false && abn.flags.length === 4, "assessVitals 이상 감지");
  const good = sim.assessVitals({ hr: 72, tempC: 36.6, resp: 16, spo2: 98 });
  assert(good.ok === true, "assessVitals 정상");

  assert(sim.formatDuration(90) === "1분 30초", "formatDuration");
  assert(sim.minToHHMM(sim.parseHHMM("23:59")) === "23:59", "parseHHMM/minToHHMM 왕복");
}

// ---------- 5) AI Mock 결정론 ----------
console.log("\n[5] AI Mock 결정론 + 면책");
const ai = await import("./ai/ai.js");
{
  const routine = data["routines.json"].routines[0];
  const chatA = ai.mockProvider("chat", { question: "욕창 예방 방법?" });
  const chatB = ai.mockProvider("chat", { question: "욕창 예방 방법?" });
  assert(chatA === chatB, "chat mock 결정론");
  assert(/의료 조언이 아닙니다/.test(chatA), "chat mock 의료 면책 포함");

  const rout = ai.mockProvider("routine", { routine, startHHMM: "09:00" });
  assert(rout.includes(routine.name), "routine mock 루틴명 포함");
  assert(/의료 조언이 아닙니다/.test(rout), "routine mock 면책");

  const alert = ai.mockProvider("alert", { vitals: { hr: 200, tempC: 40, resp: 40, spo2: 70 } });
  assert(/진단/.test(alert) && /의료 조언이 아닙니다/.test(alert), "alert mock 진단 금지+면책");
  assert(!/진단합니다|진단됨|질병명/.test(alert), "alert mock 진단 주장 없음");

  // 무인 자동 다이제스트 (오늘의 돌봄 팁)
  const digestA = ai.mockProvider("digest", { topic: "욕창 예방", context: { routineName: routine.name } });
  const digestB = ai.mockProvider("digest", { topic: "욕창 예방", context: { routineName: routine.name } });
  assert(digestA === digestB, "digest mock 결정론");
  assert(/오늘의 돌봄 팁/.test(digestA), "digest mock 제목 포함");
  assert(/의료 조언이 아닙니다/.test(digestA), "digest mock 의료 면책 포함");
}

// ---------- 6) 보안: AI_ENDPOINT 비어있음 + 실제 키 없음 ----------
console.log("\n[6] 보안 (키 노출 없음)");
const cfg = readFileSync(join(ROOT, "ai", "config.js"), "utf8");
assert(/export\s+const\s+AI_ENDPOINT\s*=\s*""/.test(cfg), "AI_ENDPOINT 빈 문자열");

const browserRepoFiles = jsFiles
  .filter((p) => !p.includes(`server${sep()}`))
  .concat([join(ROOT, "index.html")]);
// 문자열 결합으로 구성 → README 등의 sk-ant… 언급이 이 소스에서 오탐되지 않도록.
const keyRe = new RegExp("sk-" + "ant-[A-Za-z0-9_-]{20,}");
let leak = null;
for (const p of browserRepoFiles.concat(dataFiles.map((f) => join(ROOT, "data", f)))) {
  const txt = readFileSync(p, "utf8");
  if (keyRe.test(txt)) { leak = relative(ROOT, p); break; }
}
assert(leak === null, "브라우저/리포지토리에 실제 키(sk-ant+20자) 없음", leak ? `발견: ${leak}` : "");
// .env.example 의 placeholder 는 실제 키 형식이 아니어야 함
const envEx = readFileSync(join(ROOT, "server", ".env.example"), "utf8");
assert(!keyRe.test(envEx), ".env.example 는 실제 키 형식 아님(placeholder)");
// .gitignore 가 .env 를 제외하는지 확인
const gitignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
assert(/(^|\n)\.env(\s|$)/.test(gitignore) || /(^|\n)server\/\.env(\s|$)/.test(gitignore),
  ".gitignore 가 .env 제외");

// ---------- 결과 ----------
console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) {
  console.error("실패 항목: " + fails.join(", "));
  process.exit(1);
}
console.log("모든 검증 통과 ✅");

// ---------- 유틸 ----------
function collectJS(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) collectJS(p, acc);
    else if (/\.(mjs|js)$/.test(name)) acc.push(p);
  }
  return acc;
}
function sep() { return process.platform === "win32" ? "\\" : "/"; }
