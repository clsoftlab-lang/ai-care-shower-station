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

## 모델

- 모델 ID: `claude-opus-5`
- `max_tokens: 2048`, `thinking: { type: "adaptive" }`
- system 프롬프트에 **의료기기 아님 · 진단 금지 · 전문가 상담 권고** 규칙 포함

> ⚠️ 이 프로젝트는 개념 데모입니다. 의료기기가 아니며 진단을 하지 않습니다.
> AI 출력은 참고용 일반 정보이며 의료 조언이 아닙니다.
