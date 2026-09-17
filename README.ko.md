<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
-->
# AI 케어 스테이션 — 인터랙티브 시뮬레이터 & 설계 문서

English: **[README.md](./README.md)**

거동이 불편한 환자·노인을 위한 **자동 세정 / 건조 / 체위 변경(욕창 예방) / 생체신호 모니터링** 재택
케어 스테이션 개념입니다. 이 저장소는 **빌드 없이 바로 실행되는 정적 사이트**로, 인터랙티브 케어
워크플로우 시뮬레이터와 설계/스펙·BOM 페이지를 제공합니다.

> ### ⚠️ **데모 모드 · 의료기기 아님 · 진단하지 않음**
> **이 사이트는 개념 데모일 뿐이며, 의료기기가 아니고 진단을 하지 않습니다.**
> **표시되는 모든 생체신호는 실제 측정이 아니라 시뮬레이션·추정 데모값입니다.**
> **실제 제작에는 의료기기 인증, 안전 공학 검토, 임상 검증이 필요합니다.**
> **본 내용은 의료 조언이 아닙니다.**
>
> 이 개념은 **의료 영상(X선·방사선) 요소를 의도적으로 완전히 배제**했습니다. 원래 아이디어는
> 샤워와 영상 촬영 베드를 함께 두었으나, 방사선·의료영상기기 영역을 피하기 위해 **영상 요소를
> 전부 제거**했습니다.

## 🔴 라이브 데모

**https://clsoftlab-lang.github.io/ai-care-shower-station/**

## 주요 기능

- **인터랙티브 케어 워크플로우 시뮬레이터** — 루틴(자동 샤워·건조·체위 변경·바이탈 체크)을 선택하면
  인라인 SVG 케어 스테이션이 단계별로 애니메이션되며 **물온도/유량/순한 모드/안전 인터록**(온도 상한·
  미끄럼 감지·보호자 호출)을 보여줍니다.
- **바이탈 모니터 목업** — 심박·체온·호흡·SpO2 (**시뮬레이션·추정 · 데모 · 진단 아님**).
- **케어 일정/기록** — 브라우저 `localStorage` 저장 (try/catch + 초기화 지원).
- **설계/스펙 페이지** — 방수 구조·온수/드레인·리프트/체위변경 기구·센서·보호자 알림.
- **BOM** — 개념 참고 단가 (**검증되지 않음 / reference not verified**).

## 로컬 실행

빌드가 필요 없습니다. 아무 정적 서버나 사용하세요:

```bash
python -m http.server 9026
# http://localhost:9026 접속
```

자체 검증 실행 (의존성·네트워크 불필요):

```bash
node check.mjs
```

## 🤖 AI 기능 (API 연동)

AI 기능 3종, **모두 "의료 조언 아님" 라벨 부착**:

1. **AI 돌봄 도우미 챗봇** — 욕창 예방·수분·피부 관리 등 일반 팁 + "전문가와 상담" 안내.
2. **케어 루틴 추천 / 일정 생성.**
3. **바이탈 이상 시 보호자 안내 문구 생성** — 의료 연락 권고, **진단하지 않음**.

> **⚠️ 모든 AI 출력은 참고용 일반 정보이며 의료 조언이 아니고, 진단이 아닙니다.**

**데모는 결정론적 Mock 제공자로 완전히 동작**합니다(키·네트워크 불필요). Mock 은 케어/바이탈
시뮬레이션을 재사용합니다.

**실제 Claude** 를 켜려면:

1. [`server/`](./server/) 의 프록시 실행 (`@anthropic-ai/sdk`, 모델 **`claude-opus-5`**).
2. **`ANTHROPIC_API_KEY`** 를 **서버 환경변수로만** 설정.
3. [`ai/config.js`](./ai/config.js) 의 `AI_ENDPOINT` 에 프록시 URL 지정.

> **🔐 키는 서버에서만 사용합니다. 절대 브라우저나 저장소에 API 키를 넣지 마세요.**
> Mock 데모는 키가 전혀 없어도 동작합니다.

## 프로젝트 구조

```
index.html            # 진입점 (루트)
styles.css            # 라이트 + 다크 테마
app.js                # UI 배선 (ES 모듈)
js/care-sim.js        # 순수 헬퍼: 케어 일정 / 바이탈 시뮬레이션
js/station-svg.js     # 인라인 SVG 케어 스테이션 도해 (순수)
ai/config.js          # AI_ENDPOINT = "" (기본 Mock)
ai/ai.js              # askAI(task, payload, {onToken}) — Mock 또는 프록시
server/               # 선택적 Claude 프록시 (키는 서버 전용)
data/*.json           # routines / specs / parts
check.mjs             # 자체 검증 (JSON + node --check + 단위테스트 + Mock + 키 스캔)
.github/workflows/    # CI (설치·네트워크 없음)
```

## 🎓 아이디어 출처 / Idea origin

**KR** — 이 개념은 **이일국 교수의 용인대학교 창업 수업**에서 나온 한 우수 학생의 아이디어에서
출발했습니다. 원래 아이디어의 **의료 영상(X선) 요소는 안전·규제상 완전히 제거**하고 재택 케어 개념으로
다시 구성했습니다. 문장 복사 없는 클린룸 구현이며 개인정보(PII)를 포함하지 않습니다. 아이디어를 나눠 준
학생에게 감사드립니다.

**EN** — This concept originated from a standout student idea in Dr. Lee Il-guk's
entrepreneurship class at Yongin University. The original medical-imaging (X-ray) element was
entirely removed and reframed for home care. Clean-room, no copied sentences, no PII.

## 기여자

Dr. Lee Il-guk (이일국), LWJ, LMJ, Claude.

## 라이선스

- 코드: **Apache-2.0** ([`LICENSE`](./LICENSE))
- 문서·미디어: **CC BY 4.0**

---

**Not an official Anthropic product.**
