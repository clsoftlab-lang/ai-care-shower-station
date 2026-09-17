<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
-->
# AI 프록시 서버 (선택 사항)

이 폴더는 실제 Claude 연동을 위한 **선택적** 백엔드 프록시입니다.
데모 사이트는 이 서버 없이 **Mock 모드**로 완전히 동작합니다.

## 왜 서버가 필요한가

**API 키는 절대 브라우저나 리포지토리에 두면 안 됩니다.** 키는 서버 환경변수로만
사용하고, 브라우저는 이 서버에만 요청합니다.

## 실행

```bash
cd server
cp .env.example .env      # .env 에 ANTHROPIC_API_KEY 입력 (커밋 금지)
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start
```

기본 포트 `8787`, 엔드포인트 `POST /api/ai`.

## 프론트 연결

서버를 띄운 뒤 `ai/config.js` 의 `AI_ENDPOINT` 에 프록시 URL을 넣으세요:

```js
export const AI_ENDPOINT = "http://localhost:8787/api/ai";
```

## 요청 형식

```json
{ "task": "chat" | "routine" | "alert", "payload": { } }
```

응답은 `text/plain` 스트림입니다.

## 모델 · 비용 최적화

- 기본 모델(비용 우선): `claude-haiku-4-5` — `AI_MODEL` 환경변수로 교체 가능
  (품질을 높이려면 `claude-sonnet-5` 또는 `claude-opus-5`).
- **Prompt caching**: 안정적인 system 프롬프트를 `cache_control:{type:'ephemeral'}` 블록으로
  전송 → 반복 호출 시 캐시 히트로 비용 절감.
- **thinking/effort**: `claude-haiku-*` 는 adaptive thinking / effort 를 보내지 않습니다
  (400 방지). 그 외 모델은 `thinking:{type:'adaptive'}` + `output_config.effort`(기본 `low`).
- **출력 상한**: 태스크별 modest `max_tokens`(기본 ~700).
- **비용 가드레일**: IP 당 분당 요청 제한(`AI_RATE_PER_MIN`, 기본 20) + 월 토큰 예산
  (`AI_MONTHLY_TOKEN_CAP`, 기본 2,000,000). 초과 시 HTTP 429 `{fallback:true}` 응답 →
  프론트는 자동으로 Mock 으로 폴백합니다.
- system 프롬프트에 **의료기기 아님 · 진단 금지 · 전문가 상담 권고** 규칙 포함.

## 무인 배포 — Cloudflare Workers (무료 티어)

서버를 직접 관리하지 않고(무인) 무료로 배포하려면 [`worker.js`](./worker.js) 변형을 사용하세요.
Anthropic REST(`POST /v1/messages`)를 직접 호출하며 동일한 태스크 라우팅·모델·캐싱 규칙을 씁니다.

```bash
cd server
npm install -g wrangler          # 최초 1회
wrangler secret put ANTHROPIC_API_KEY   # 키는 시크릿으로만 (리포지토리에 넣지 말 것)
wrangler deploy                  # wrangler.toml 사용
```

배포 후 출력된 Worker URL(`https://<name>.<subdomain>.workers.dev/api/ai`)을
`ai/config.js` 의 `AI_ENDPOINT` 에 넣으면 됩니다. 설정 값(모델·CORS·토큰 예산)은
[`wrangler.toml`](./wrangler.toml) 의 `[vars]` 에서 조정합니다.

> ⚠️ 이 프로젝트는 개념 데모입니다. 의료기기가 아니며 진단을 하지 않습니다.
> AI 출력은 참고용 일반 정보이며 의료 조언이 아닙니다.
