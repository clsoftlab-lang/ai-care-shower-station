// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// station-svg.js — 케어 스테이션 인라인 SVG 도해 생성 (순수 함수).
// step 상태에 따라 물줄기·온풍·리프트 각도·경고를 그립니다.
// 색상은 currentColor/CSS 변수 대신 안전한 하드 팔레트를 쓰되 다크에서도 보이도록 함.

/**
 * @param {null|{id:string,name:string,tempC:number,flowLpm:number,gentle:boolean}} step
 * @param {boolean} safe 인터록 안전 여부
 * @param {boolean} slip 미끄럼 감지 여부
 * @returns {string} SVG 마크업
 */
export function renderStation(step, safe, slip) {
  const id = step ? step.id : "idle";
  const water = step && step.flowLpm > 0;
  const drying = id === "dry";
  const reposition = id === "reposition";
  const vitals = id === "vitals";
  const tilt = reposition ? 12 : 0;

  const waterJets = water
    ? `<g stroke="#3fb6c9" stroke-width="3" stroke-linecap="round" opacity="0.85">
         <line x1="230" y1="70" x2="220" y2="150"><animate attributeName="y2" values="120;160;120" dur="0.7s" repeatCount="indefinite"/></line>
         <line x1="280" y1="70" x2="278" y2="150"><animate attributeName="y2" values="130;165;130" dur="0.6s" repeatCount="indefinite"/></line>
         <line x1="330" y1="70" x2="335" y2="150"><animate attributeName="y2" values="125;160;125" dur="0.8s" repeatCount="indefinite"/></line>
       </g>`
    : "";

  const dryAir = drying
    ? `<g stroke="#e2a53a" stroke-width="2.5" stroke-linecap="round" opacity="0.7">
         <path d="M210,90 q30,15 60,0" fill="none"><animate attributeName="opacity" values="0.2;0.8;0.2" dur="1s" repeatCount="indefinite"/></path>
         <path d="M290,100 q30,15 60,0" fill="none"><animate attributeName="opacity" values="0.8;0.2;0.8" dur="1s" repeatCount="indefinite"/></path>
       </g>`
    : "";

  const vitalsPulse = vitals
    ? `<g stroke="#4fc98d" stroke-width="2.5" fill="none">
         <path d="M170,250 h30 l10,-22 l14,44 l12,-30 h40">
           <animate attributeName="opacity" values="0.3;1;0.3" dur="1.1s" repeatCount="indefinite"/>
         </path>
       </g>`
    : "";

  const warn = !safe || slip
    ? `<g>
         <circle cx="410" cy="55" r="20" fill="#c23b3b">
           <animate attributeName="opacity" values="1;0.35;1" dur="0.6s" repeatCount="indefinite"/>
         </circle>
         <text x="410" y="62" text-anchor="middle" font-size="22" fill="#fff" font-weight="bold">!</text>
         <text x="410" y="92" text-anchor="middle" font-size="11" fill="#c23b3b" font-weight="bold">보호자 호출</text>
       </g>`
    : `<g>
         <circle cx="410" cy="55" r="14" fill="#4fc98d"/>
         <text x="410" y="86" text-anchor="middle" font-size="11" fill="#4fc98d" font-weight="bold">정상</text>
       </g>`;

  const tempBadge = step && step.tempC
    ? `<g><rect x="30" y="40" rx="8" width="96" height="34" fill="#161e29" opacity="0.08"/>
         <text x="40" y="62" font-size="15" fill="#1e7f8f" font-weight="bold">${step.tempC}°C</text></g>`
    : "";

  const modeBadge = step
    ? `<text x="40" y="92" font-size="12" fill="#5a6a7d">${step.gentle ? "순한 모드" : "표준 모드"}</text>`
    : `<text x="40" y="62" font-size="14" fill="#5a6a7d">대기 중</text>`;

  return `
<svg viewBox="0 0 480 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="케어 스테이션: ${step ? esc(step.name) : "대기"}">
  <rect x="0" y="0" width="480" height="320" fill="none"/>
  <!-- 샤워 헤드 -->
  <rect x="215" y="40" width="130" height="18" rx="6" fill="#7a8aa0"/>
  <rect x="272" y="20" width="16" height="22" fill="#7a8aa0"/>
  ${waterJets}
  ${dryAir}
  <!-- 케어 베드 (체위 변경 시 기울어짐) -->
  <g transform="rotate(${tilt} 280 245)">
    <rect x="150" y="235" width="260" height="26" rx="10" fill="#1e7f8f"/>
    <rect x="150" y="258" width="260" height="10" rx="4" fill="#14636f"/>
    <!-- 대상자 실루엣 (추상) -->
    <circle cx="185" cy="222" r="15" fill="#c9d5e3"/>
    <rect x="200" y="212" width="185" height="22" rx="11" fill="#c9d5e3"/>
  </g>
  <!-- 리프트 다리 -->
  <rect x="165" y="266" width="12" height="42" fill="#7a8aa0"/>
  <rect x="383" y="266" width="12" height="42" fill="#7a8aa0"/>
  <!-- 드레인 -->
  <path d="M150,300 h260" stroke="#7a8aa0" stroke-width="4" stroke-dasharray="6 6"/>
  ${vitalsPulse}
  ${tempBadge}
  ${modeBadge}
  ${warn}
  <text x="240" y="18" text-anchor="middle" font-size="12" fill="#5a6a7d">개념 도해 · 의료기기 아님</text>
</svg>`;
}

function esc(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}
