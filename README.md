# 우리의 AI 한글

브라우저에서 동작하는 한국형 AI 워드프로세서 MVP입니다. 텍스트 흐름과 자유 배치 개체를 분리해, 이미지를 움직여도 본문이 재배치되지 않습니다. 문서와 업로드 자산은 사용자의 IndexedDB에 저장하고, AI를 명시적으로 실행할 때만 필요한 텍스트를 서버에 보냅니다.

## 구현 범위

- A4 다중 페이지, 문단·제목·목록·정렬·글꼴·글자 크기·색상·형광펜·표
- 이미지/일반 파일 자유 배치, 이동·크기·회전·정렬·잠금·복제·앞뒤 순서
- IndexedDB 자동 저장, 최근 문서, 중단 복구, 80단계 실행 취소/다시 실행
- 이미지·TXT·CSV·내부 JSON 가져오기
- HWPX·DOCX·ODT·RTF·HTML·Markdown·TXT 가져오기와 HWPX·DOCX·ODT·RTF·PDF·HTML·TXT·내부 JSON 내보내기
- D1 공유 문서·버전 이력, 보호된 R2 사진/첨부 파일 기기 간 동기화
- Durable Objects/WebSocket 기반 참여자·커서·선택 영역과 페이지 변경 실시간 전파
- 같은 페이지의 충돌을 막는 페이지 단위 편집권(서로 다른 페이지는 동시 편집)
- 1920×1080 크기 조절 팝업, 전체화면 전환, 설치형 PWA 독립 창
- 서버 측 OpenAI Responses API, 모델 라우팅, 결과 미리보기 후 사용자 적용
- D1 관리자 설정·모델 레지스트리·사용량·감사 기록

구형 HWP/DOC 바이너리와 완전한 서식 왕복, 사용자 계정, 같은 페이지를 여러 사람이 동시에 입력하는 CRDT 병합은 아직 지원하지 않습니다. 지원하지 않는 문서 파일은 성공으로 가장하지 않고 로컬 첨부 개체로 보관합니다.

## 실행과 검증

```powershell
npm install
npm run dev
npm run verify
npm audit --omit=dev
```

`npm run verify`는 타입 검사, 단위 테스트, 아키텍처 경계 검사, 린트, 프로덕션 빌드를 순서대로 실행합니다.

## 서버 환경 변수

`.dev.vars.example`을 참고해 로컬 `.dev.vars` 또는 Sites 런타임 환경에 설정합니다.

- `ADMIN_PASSWORD_HASH`: PBKDF2-SHA256 관리자 비밀번호 해시
- `SESSION_SECRET`: 관리자 세션 HMAC 비밀값
- `SETTINGS_ENCRYPTION_KEY`: D1에 저장하는 공급자 키의 AES-256-GCM 암호화 키
- `OPENAI_API_KEY`: 선택 사항. 설정하지 않으면 UI가 `OPENAI_NOT_CONNECTED`를 표시합니다.
- `APP_ENV`: `development` 또는 `production`
- `COLLAB_WORKER_URL`: R2·Durable Objects 공동 편집 Worker의 HTTPS 주소

비밀값을 소스, HTML, 클라이언트 저장소, 빌드 산출물에 넣지 마십시오.

## 책임 경계

```text
presentation (app/editor)
        -> application hooks/use cases
        -> domain (document, geometry)
        -> ports/infrastructure (IndexedDB, import/export)

API routes -> server services -> Sites D1 / OpenAI
collaboration Worker -> Sites share-code validation / R2 / Durable Objects
```

문서 스키마는 `our-ai-hangeul.document`와 버전 번호로 식별합니다. 마이그레이션되지 않는 입력, 경로가 포함된 파일명, 스크립트 가능한 SVG, 크기 제한 초과 파일은 거부합니다.

## 출시 전 승인 항목

- 실제 OpenAI API 키와 비용 한도
- 서비스명·상표, 개인정보 처리방침, 이용약관, 생성물 책임 고지
- 상용 배포에서 사용할 한글 웹폰트 라이선스와 번들 전략
- HWPX/DOCX 호환성 fixture 및 왕복 손실 기준
