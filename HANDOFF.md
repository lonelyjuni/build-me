# BuildMe — Agent Handoff Document

> **작성일:** 2026-07-06 (KST)  
> **목적:** 다른 코딩 에이전트가 이어서 작업할 수 있도록 프로젝트 맥락·구현 상태·미완료 항목을 정리한 문서  
> **저장소:** https://github.com/lonelyjuni/build-me.git  
> **브랜치:** `main` (최신 커밋 `66e1b23` 기준)

---

## 1. 프로젝트 한 줄 요약

**BuildMe**는 거친 아이디어를 AI 인터뷰 → 목차(TOC) → 섹션별 집필 → 위키 기획서로 발전시키는 React 웹앱이다.  
로컬·Vercel 배포 모두 지원. **세션 데이터는 현재 브라우저 `localStorage`에만 저장**된다 (서버 DB 없음).

---

## 2. 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트 | React 19, TypeScript, Tailwind CSS 4, Vite 6 |
| 백엔드 | Express (`server.ts` + `api/app.ts`) |
| LLM (기본) | Google Gemini API (`@google/genai`) — Gemma 4 등 |
| LLM (대안) | Cursor Proxy — OpenAI 호환 HTTP (`api/cursorProxyClient.ts`) |
| 배포 | Vercel (`vercel.json`) — 프로덕션 URL: https://build-me-rho.vercel.app |
| 로컬 실행 | `npm run dev` → http://127.0.0.1:3000 |

---

## 3. 사용자(오너) 성향 · 규칙

- **한국어**로 설명 선호. 비전문가 — 어려운 용어는 쉬운 말 + 예시.
- 커밋/푸시는 **명시적으로 요청할 때만** 수행.
- 로컬 개발 시 `npm run dev` + 브라우저 사이드 패널 열기 규칙: `.cursor/rules/local-dev-browser.mdc`
- Karpathy 스타일 코딩 원칙: `.cursor/rules/karpathy-guidelines.mdc` (`alwaysApply: true`)

---

## 4. 디렉터리 구조 (핵심만)

```
build-me/
├── server.ts              # Vite + Express 통합 서버 (로컬 dev)
├── api/
│   ├── app.ts             # 모든 REST/SSE API, Gemini·Cursor 분기, admin 설정
│   ├── cursorProxyClient.ts  # Cursor Proxy OpenAI 클라이언트
│   ├── devLogger.ts       # 로컬 JSON 파일 로그 (Vercel에선 기본 off)
│   └── index.ts           # Vercel serverless 엔트리
├── src/
│   ├── App.tsx            # 메인 상태·채팅 플로우·설정 모달·세션 CRUD
│   ├── tocUtils.ts        # 목차 정규화/병합/오염 제목 필터 (중요)
│   ├── contentUtils.ts    # 초안 정제, 채팅 텍스트 조합, 표 마크다운 정규화
│   ├── types.ts
│   ├── components/
│   │   ├── ChatPanel.tsx      # 채팅 UI, 스트리밍, 마크다운 렌더
│   │   ├── DocPreview.tsx     # 집필 초안 / 목차 / 전체 위키 탭
│   │   ├── Sidebar.tsx        # 프로젝트 목록 (접힘 모드 지원)
│   │   ├── TableOfContents.tsx
│   │   ├── MarkdownView.tsx   # remark-gfm 표 렌더
│   │   └── ResizableSplitPane.tsx  # 채팅↔목차 너비 드래그 조절
│   └── devLogger.ts       # 클라이언트 → POST /api/dev/log
├── logs/                  # 로컬 로그 (gitignore, .gitkeep만 커밋)
├── .env.example
└── HANDOFF.md             # 이 파일
```

---

## 5. 데이터 저장 (현재 한계)

| 데이터 | 저장 위치 | 키 |
|--------|-----------|-----|
| 세션 목록·대화·목차 | 브라우저 `localStorage` | `buildme_sessions`, `buildme_active_id` |
| 채팅 패널 너비 비율 | `localStorage` | `buildme_chat_panel_percent` |
| API 키·모델 설정 | 서버 메모리 + `.env.local` | admin POST로 런타임 갱신 |

**미구현:** 서버 DB 동기화, 다기기 이어하기, 오라클 서버 영구 저장.  
사용자가 Oracle Linux VM(`168.107.36.218`) 보유 — Cursor Proxy 호스팅 중. 세션/로그 서버화는 **논의만 됨, 미구현**.

---

## 6. LLM 제공자 (이중 경로)

### 6.1 Google Gemini (기본)

- 환경 변수: `GEMINI_API_KEY`
- 모델: Gemma 4 31B / 26B 등 (`src/modelCatalog.ts`, `GET /api/models`)
- **자동 폴백 체인:** 한도 초과 시 하위 모델로 전환 (`routingEnabled`, 최대 120s 타임아웃)
- 관리자 설정에서 `selectedModelId`, `routingEnabled` 저장

### 6.2 Cursor Proxy (대안)

- 파일: `api/cursorProxyClient.ts`
- Base URL 기본값: `http://168.107.36.218:8765/v1`
- 환경 변수: `CURSOR_PROXY_BASE_URL`, `CURSOR_PROXY_API_KEY`
- **`composer-2.5`만 허용** — `composer-2.5-fast` 및 `*-fast`는 목록·요청 모두 차단
- 컨텍스트 한도 UI: **200,000 tokens** (`CURSOR_COMPOSER_25_CONTEXT_LIMIT`)
- OpenAI Chat Completions SSE 스트리밍 → BuildMe JSON 스키마로 파싱

### 6.3 설정 UI

- 모달: **모델 설정** (admin 비밀번호, 기본 `admin`)
- 탭: **Google Gemini** | **Cursor Proxy**
- **채팅에 사용할 LLM** 라디오 선택 → `activeProvider`
- `POST /api/chat` body: `llmProvider`, `cursorSelectedModelId`, `selectedModelId`, `routingEnabled`

---

## 7. 채팅 API 계약 (`POST /api/chat`)

**요청 body (주요 필드):**
```json
{
  "sessionState": { /* BrainstormSession */ },
  "userMessage": "string",
  "selectedModelId": "gemma-4-31b",
  "routingEnabled": true,
  "llmProvider": "gemini | cursor-proxy",
  "cursorSelectedModelId": "composer-2.5"
}
```

**응답:** `text/event-stream` — 줄 단위 JSON

| type | 설명 |
|------|------|
| `chunk` | 스트리밍 JSON 텍스트 조각 (reply, reasoning, updatedContent, critique 필드) |
| `status` | 모델 시도/폴백/스트리밍 단계 |
| `metadata` | `modelUsed`, `contextTokens`, `contextLimit`, `outputTokens` 등 |
| `error` | 스트림 중 오류 |

클라이언트(`App.tsx` `streamChat`)는 청크를 모아 JSON 파싱 후 `applyModelResponseToSession`으로 세션 갱신.

**AI 응답 JSON 필드 (서버 system prompt 기준):**
- `reply` — 대화창 (자연스러운 한국어, 마크다운 **굵게** 가능)
- `critique` — 대부분 빈 문자열. 맥킨지식 【】구분 템플릿 **금지**
- `updatedContent` — 집필 초안 탭 전용 순수 마크다운 본문
- `suggestedToc` — 목차 배열 (인터뷰 중에는 보내지 말 것)
- `reasoning`, `sessionStatus`, `currentSectionId`

---

## 8. 목차(TOC) 로직 — 버그가 많았던 영역

**핵심 파일:** `src/tocUtils.ts`, `src/App.tsx` (`applyModelResponseToSession`)

| 함수 | 역할 |
|------|------|
| `normalizeTocSections` | AI 평면 목차 → parentId, 그룹 헤더 정규화 |
| `filterDocumentTocSections` | 인터뷰 질문·오염 제목 제거 |
| `isPollutedTocTitle` | AI 답변 문장이 목차 제목으로 들어온 경우 감지 |
| `mergeTocSections` | 기존+제안 병합. **제안에 없는 기존 항목도 유지** (5장 추가 시 1~4장 보존) |
| `applySuggestedToc` | 집필 중 목차 업데이트 **기본 차단**, 단 `userRequestsTocUpdate()` 시 허용 |
| `userRequestsTocUpdate` | `옵션 D`, `목차 추가/신설`, `전체 목차 다시` 등 감지 |
| `parseTocOutlineFromReply` | suggestedToc 누락 시 reply에서 번호 목차 추출 폴백 |

**집필 중 목차 변경:** `writing`/`reviewing` 상태에서 `suggestedToc`가 무시되던 버그 수정됨. 옵션 선택·장 추가 시 반영.

**TOC follow-up:** AI가 reply만 쓰고 `suggestedToc` 비우면 `TOC_JSON_FOLLOWUP_PROMPT`로 재요청 (`handleSendMessage`).

---

## 9. UI/UX (최근 구현)

### 사이드바 (프로젝트 목록)
- 데스크톱: 기본 **접힘** (~56px), 왼쪽 끝 호버 또는 사이드바 호버 시 펼침 (320px)
- **대화창에 마우스/포커스** 시 자동 접힘 (`chatPanelInteractionProps`)
- 모바일: 기존 탭/오버레이 방식

### 채팅 ↔ 목차 너비
- `ResizableSplitPane.tsx` — 가운데 드래그, 28~72%, `localStorage` 저장

### 채팅 패널
- 입력창: 로딩 중에도 **활성** (전송 버튼만 로딩)
- 스트리밍: 추론 실시간 표시 → 답변 스트리밍 (`ReactMarkdown` + `chat-markdown` CSS)
- 로딩 UI 단순화: 「응답 작성 중…」 한 줄 (단계 뱃지 제거)

### 집필 초안 / 위키
- `MarkdownView` + `remark-gfm` — **표(table) 렌더링**
- `normalizeMarkdownTables()` — AI가 `||`로 한 줄에 이은 표 복구

---

## 10. API 엔드포인트 목록

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/health` | 헬스체크 |
| GET | `/api/models` | Gemini 모델 목록 |
| GET | `/api/cursor-proxy/health` | Cursor Proxy 헬스 |
| GET | `/api/cursor-proxy/models` | Composer 2.5만 반환 |
| GET/POST | `/api/admin/settings` | 전역 설정 (비밀번호 필요) |
| POST | `/api/chat` | 메인 채팅 SSE |
| POST | `/api/dev/log` | 클라이언트 로그 수집 |
| GET | `/api/dev/logs` | 최근 로그 80건 (로컬 dev) |

---

## 11. 환경 변수 (`.env.example` 참고)

```env
GEMINI_API_KEY=...
CURSOR_PROXY_BASE_URL=http://168.107.36.218:8765/v1
CURSOR_PROXY_API_KEY=...          # 커밋 금지
BUILDME_LLM_PROVIDER=gemini       # gemini | cursor-proxy
BUILDME_ADMIN_PASSWORD=admin
BUILDME_DEV_LOG=1                 # 로컬 로그 (Vercel에선 VERCEL env로 off)
APP_URL=http://localhost:3000
```

---

## 12. 로컬 개발 · 디버깅

```bash
npm install
copy .env.example .env.local   # Windows
npm run dev                    # http://localhost:3000
npm run lint                   # tsc --noEmit
npm run build && npm run start # 프로덕션 모드 로컬
```

**로그 파일:** `logs/buildme-YYYY-MM-DD.log` (JSON lines)  
**카테고리:** `http`, `chat.request`, `chat.response`, `chat.error`, `chat.client`, `chat.model`

과거 이슈 예: 「전체 목차 다시 잡아달라」 시 gemma-4-31b 500 → fallback 26b 장시간 무응답 → UI 멈춤처럼 보임.  
대응: `status` SSE, 120s 타임아웃, 3차 fallback `gemini-2.5-flash`, TOC replace 트리거.

---

## 13. 최근 Git 히스토리 (요약)

```
66e1b23 Improve layout, markdown tables, and TOC updates during writing.
10ffe25 Add Cursor Proxy provider with Composer 2.5-only model list.
a730b64 Fix empty TOC when AI proposes outline in chat only
9a5caf7 Fix chat stream error handling and API reliability
...
```

`origin/main`과 동기화됨 (2026-07-06 푸시 완료).

---

## 14. 알려진 제약 · 주의사항

1. **API 키**는 `.env.local` / admin 설정에만. `manual.md`의 키를 git에 커밋하지 말 것.
2. **Vercel**에서는 파일 로그 없음 (`isDevLoggingEnabled()` false).
3. **Cursor Proxy** 응답 지연 ~5–17초/요청 (CLI spawn). Gemini보다 느림.
4. **세션**은 브라우저별 — 다른 PC/브라우저에서 공유 안 됨.
5. `api/app.ts` Gemini schema 일부 description에 깨진 한글(인코딩) 있을 수 있음 — 동작에는 영향 적음.
6. 프로덕션 admin 설정은 **서버 메모리** — 재시작 시 env 기본값으로 일부 초기화.

---

## 15. 사용자가 논의했으나 미구현인 항목

다음 에이전트가 이어갈 수 있는 백로그:

### A. 세션·대화 서버 저장 (Oracle Linux 활용)
- 사용자 VM: `168.107.36.218` (이미 Cursor Proxy 운영)
- 제안: Express + SQLite/PostgreSQL, `/api/sessions` CRUD
- `localStorage` → 서버 동기화 (오프라인 캐시 병행 가능)

### B. 실시간 운영 로그
- 현재: 로컬 파일 + `/api/dev/logs`
- 제안: 오라클에서 `pm2` 상시 실행 + `tail -f`, 또는 SSE `/api/dev/logs/stream`, 또는 Loki/Grafana

### C. 기타 UX
- 사이드바 「고정(pin)」 버튼 (요청 없음)
- Vercel + API-only-on-Oracle 분리 배포 (CORS)

---

## 16. 새 에이전트 빠른 시작 체크리스트

- [ ] `git clone` + `npm install` + `.env.local` 설정
- [ ] `npm run dev` → http://127.0.0.1:3000
- [ ] `npm run lint` 통과 확인
- [ ] 설정 → admin → Gemini / Cursor Proxy 탭 구조 이해
- [ ] `src/App.tsx`의 `streamChat`, `applyModelResponseToSession`, `handleSendMessage` 흐름 읽기
- [ ] `src/tocUtils.ts`의 `applySuggestedToc` / `userRequestsTocUpdate` 읽기
- [ ] 변경 후 로컬에서 채팅 1회 + 목차 변경 1회 수동 테스트
- [ ] 커밋/푸시는 **사용자 요청 시에만**

---

## 17. 연락 맥락 (대화에서 나온 실사용 시나리오)

- **라면 레시피 메뉴얼** 세션으로 TOC·집필 테스트 다수
- **옵션 D → 5장 추가** 시 목차 미반영 버그 → `tocUtils` 수정으로 해결
- **시각적 완성 기준** 표가 raw MD로 보이던 문제 → `remark-gfm` + `normalizeMarkdownTables`
- **비평 톤** 맥킨지 【구조 평가】 형식 → 자연스러운 `reply` 위주로 변경
- **Composer 2.5**만 사용 (Fast 절대 금지)

---

*이 문서는 에이전트 핸드오프용입니다. 구현 변경 시 관련 섹션을 함께 업데이트하세요.*
