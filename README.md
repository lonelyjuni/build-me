# BuildMe — 로컬 실행 & 디버깅

## 빠른 시작

1. 의존성 설치
   ```bash
   npm install
   ```

2. 환경 변수 설정  
   `.env.example`을 복사해 `.env.local`을 만든 뒤 `GEMINI_API_KEY`를 넣습니다.

   ```bash
   copy .env.example .env.local
   ```

3. 로컬 서버 실행
   ```bash
   npm run dev
   ```

4. 브라우저에서 열기  
   http://localhost:3000

온라인(Vercel)과 달리, 로컬에서는 **프론트 + API가 같은 서버**에서 돌아가서 네트워크·스트리밍 오류를 바로 추적할 수 있습니다.

---

## 로컬 로그 (디버깅용)

`npm run dev`로 실행하면 (Vercel이 아닐 때) 자동으로 로그가 쌓입니다.

| 위치 | 설명 |
|------|------|
| `logs/buildme-YYYY-MM-DD.log` | 하루 단위 JSON 로그 파일 |
| 터미널 | 같은 내용이 `[BuildMe:카테고리]` 형태로 출력 |
| http://localhost:3000/api/dev/logs | 최근 로그 80건 JSON 조회 |

### 기록되는 내용

- **http** — API 요청 경로
- **chat.request** — 채팅 시작 (세션 ID, 사용자 메시지, 모델)
- **chat.model** — 모델 실패·폴백
- **chat.response** — 스트림 완료 (토큰, 소요 시간, 응답 길이)
- **chat.error** — 서버 오류
- **chat.client** — 브라우저 쪽 스트림·파싱·오류

로그 끄기: `.env.local`에 `BUILDME_DEV_LOG=0`

---

## 배포 전 체크리스트

1. 로컬에서 `npm run dev`로 재현
2. `logs/` 파일 또는 `/api/dev/logs`로 원인 확인
3. 수정 후 `npm run build` 통과 확인
4. 커밋·푸시 → Vercel 배포

---

## 기타 명령

```bash
npm run build    # 프로덕션 빌드
npm run start    # 빌드 결과물로 서버 실행
npm run lint     # TypeScript 검사
```
