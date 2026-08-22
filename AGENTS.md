# 우리의 AI 한글 프로젝트 지침

## 제품 목적과 지원 범위

이 저장소는 브라우저 로컬 문서 저장과 검토형 서버 AI를 결합한 한국형 웹 워드프로세서다. 지원하지 않는 공급자·파일 형식·네트워크 상태를 성공으로 가장하지 않는다.

## 모듈 소유권

- `app/domain`: 버전 문서 스키마와 좌표·페이지 순수 규칙
- `app/editor`: 화면, 접근성, 사용자 명령과 application 조정
- `app/infrastructure`: IndexedDB, 파일 검증·변환, 내보내기
- `app/server`: 인증, 암호화 설정, AI 공급자와 사용량 정책
- `app/api`: HTTP 입력 검증과 DTO 응답만 담당
- `db`: D1 스키마·연결
- `drizzle`: 순서가 보존되는 D1 마이그레이션
- `scripts`: 아키텍처 자동 강제

의존 방향은 `presentation -> application -> domain` 및 `application -> infrastructure ports`다. `domain`은 React, HTTP, IndexedDB, D1, OpenAI를 import하지 않는다. UI는 D1·OpenAI SDK를 직접 호출하지 않는다.

## 동결 계약

- 문서 식별자: `our-ai-hangeul.document`
- 문서와 업로드 자산은 기본적으로 브라우저 로컬에 보관
- 자유 배치 개체 이동은 본문 흐름을 재배치하지 않음
- AI 출력은 미리보기 후 사용자 적용, 실행 취소 가능
- 연결되지 않은 AI는 `OPENAI_NOT_CONNECTED`로 차단
- HWP/HWPX/DOCX를 지원한다고 표시하지 않음

스키마 변경에는 버전 증가, 마이그레이션, 이전 fixture 테스트와 실패 복구 경로가 필요하다.

## 비밀값과 신뢰 경계

`.dev.vars`는 커밋하지 않는다. API 키는 서버 환경 또는 AES-256-GCM으로 암호화된 D1 레코드에만 둔다. 외부 요청은 동일 출처, JSON 콘텐츠형, 길이, 속도 제한을 검증한다. 파일 가져오기는 이름·MIME·크기·SVG 스크립트 위험을 검사한다.

## 필수 검증

```powershell
npm run verify
npm audit --omit=dev
```

UI 변경은 데스크톱과 390px 모바일에서 시작, 편집, 저장·재진입, AI 미연결, 관리자 상태, 콘솔 오류를 확인한다. 배포는 저장된 Git SHA와 동일한 빌드 아카이브로만 수행한다.

## 알려진 후속 범위

- HWPX/DOCX import/export와 왕복 호환성
- 계정, 클라우드 동기화, 공동 편집
- 실제 공급자 키·법무·폰트 라이선스 승인
- 큰 초기 편집기 청크의 추가 코드 분할

