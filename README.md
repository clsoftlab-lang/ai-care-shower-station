<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
-->
# AI Care Station — Interactive Simulator & Design Doc

한국어 문서: **[README.ko.md](./README.ko.md)**

An assisted **auto-wash / drying / repositioning (pressure-ulcer prevention) / vital-sign
monitoring** care-station concept for **home care** of bedridden patients and older adults.
This repository is a **runnable, no-build static site**: an interactive care-workflow
simulator plus a design/spec + BOM page.

> ### ⚠️ **DEMO MODE · NOT A MEDICAL DEVICE · NO DIAGNOSIS**
> **This is a concept demonstration only. It is NOT a medical device and does NOT diagnose.**
> **All vital signs shown are SIMULATED / ESTIMATED demo values, not real measurements.**
> **A real build would require medical-device certification, safety engineering, and clinical
> validation.** **Nothing here is medical advice.**
>
> This concept **deliberately excludes any medical imaging (no X-ray, no radiation)**. The
> original idea paired a shower with an imaging bed; the imaging element was **entirely removed**
> to stay out of radiation and medical-device-imaging territory.

## 🔴 Live demo

**https://clsoftlab-lang.github.io/ai-care-shower-station/**

## Features

- **Interactive care-workflow simulator** — pick a routine (auto-shower · drying ·
  repositioning · vitals check), watch an animated inline-SVG care station step through it with
  **water temperature / flow / gentle-mode / safety interlocks** (temp cap, slip detection,
  caregiver call).
- **Vitals monitor mockup** — heart rate, temperature, respiration, SpO2 (**simulated /
  estimated · demo · not diagnostic**).
- **Care schedule / log** — saved in the browser via `localStorage` (with try/catch + reset).
- **Design / spec page** — waterproofing, hot water & drain, lift/repositioning mechanism,
  sensors, caregiver alerts.
- **BOM** — rough reference prices (**reference not verified**).

## Run locally

No build step. Any static file server works:

```bash
python -m http.server 9026
# open http://localhost:9026
```

Then run the self-checks (no dependencies, no network):

```bash
node check.mjs
```

## 🤖 AI 기능 (API 연동)

Three AI features, **all labelled NOT medical advice**:

1. **AI caregiving chatbot** — general tips (pressure-ulcer prevention, hydration, skin care)
   with a "consult a professional" caveat.
2. **Care-routine recommendation / schedule generation.**
3. **Caregiver-alert phrasing for out-of-range vitals** — advises contacting medical help,
   **never diagnoses**.

> **⚠️ All AI output is general reference information only — NOT medical advice, and never a
> diagnosis.**

**Demo runs entirely on a deterministic Mock provider** (no key, no network) that reuses the
care/vitals simulation.

To enable **real Claude**:

1. Start the proxy in [`server/`](./server/) (`@anthropic-ai/sdk`, model **`claude-opus-5`**).
2. Set **`ANTHROPIC_API_KEY`** as a **server-side environment variable only**.
3. Point the browser at it by setting `AI_ENDPOINT` in [`ai/config.js`](./ai/config.js).

> **🔐 Keys live server-side only. Never put an API key in the browser or in this repository.**
> The mock demo works with no key at all.

## Project layout

```
index.html            # entry (root)
styles.css            # light + dark theme
app.js                # UI wiring (ES module)
js/care-sim.js        # pure care-schedule / vitals-sim helper
js/station-svg.js     # inline-SVG care-station art (pure)
ai/config.js          # AI_ENDPOINT = "" (mock by default)
ai/ai.js              # askAI(task, payload, {onToken}) — mock or proxy
server/               # optional Claude proxy (key server-side only)
data/*.json           # routines / specs / parts
check.mjs             # self-checks (JSON + node --check + unit tests + mock + key scan)
.github/workflows/    # CI (no install, no network)
```

## 🎓 아이디어 출처 / Idea origin

**KR** — 이 개념은 **이일국(Dr. Lee Il-guk) 교수의 용인대학교(Yongin University) 창업 수업**에서
나온 한 우수 학생의 아이디어에서 출발했습니다. 원래 아이디어의 **의료 영상(X선) 요소는 안전·규제상
완전히 제거**하고 재택 케어 개념으로 다시 구성했습니다. 문장 복사 없는 클린룸 구현이며 개인정보(PII)를
포함하지 않습니다. 아이디어를 나눠 준 학생에게 감사드립니다.

**EN** — This concept originated from a standout student idea in **Dr. Lee Il-guk's
entrepreneurship class at Yongin University**. The original medical-imaging (X-ray) element was
**entirely removed** and the idea reframed for home care. Clean-room implementation with no
copied sentences and no personal data (PII). With gratitude to the student who shared the idea.

## Contributors

Dr. Lee Il-guk (이일국), LWJ, LMJ, Claude.

## License

- Code: **Apache-2.0** (see [`LICENSE`](./LICENSE))
- Documentation & media: **CC BY 4.0**

---

**Not an official Anthropic product.**
