# 타이핑 성능 진단 및 개선 보고서

측정일: 2026-08-25  
대상: React 19 + Tiptap 3 기반 우리의 AI 한글 편집기

## 측정 조건과 한계

- Chrome DevTools 전용 trace 연결은 이 작업 환경에 없어서 브라우저 입력 자동화, 개발 전용 `beforeinput → requestAnimationFrame` probe, React render probe, Resource Timing, 단위 연산 벤치마크를 사용했다.
- DevTools의 Layout/Scripting/Rendering 세부 breakdown과 heap snapshot은 측정하지 않았으며 성공으로 표시하지 않는다.
- 브라우저 자동화 총 시간에는 도구 왕복 시간이 포함되므로 Key → Paint 수치로 해석하지 않는다.

## Before

- 키 입력 경로: `Tiptap onUpdate → getJSON → pages.map → 전체 EditorDocument state → EditorApp/PageCanvas/Toolbar 평가`
- 한글 composition: 앱 경계가 없어 조합 transaction마다 동일 경로가 실행될 수 있었다.
- React publication: 입력 transaction마다 1회.
- 300쪽·2,000회 합성 입력의 페이지 방문: 600,000회, 순수 문서 갱신 CPU 8.70ms. React reconciliation과 DOM 비용은 제외한 값이다.
- 전체 문서 통계: EditorApp render마다 모든 페이지를 순회했다.
- 페이지 DOM: 300쪽 본문·사진·표 트리를 모두 유지했다.
- 자동 저장: debounce는 있었지만 겹친 수동/자동 저장을 최신본 하나로 합치는 queue가 없었다.
- 브라우저 자동화 29자 총시간 proxy: 2,090ms, 문자당 72.07ms. 이는 Key → Paint가 아닌 end-to-end 제어 시간이다.

## 변경

1. 한글 composition 중에는 Tiptap DOM만 유지하고 `compositionend`에서 한 번만 문서 모델에 반영한다.
2. 일반 입력은 현재 쪽만 Map buffer에 보관하고 120ms 유휴 또는 최대 1,000ms에 한 번 합친다.
3. Tiptap transaction의 EditorApp 자동 rerender를 끄고 도구막대는 서식 selector만 구독한다.
4. IndexedDB 저장을 coalescing queue로 바꿔 저장 중 생긴 중간 revision은 건너뛰고 최신 snapshot만 다시 저장한다.
5. 문서 통계는 idle callback 또는 fallback timer에서 EditorChrome 내부만 갱신한다.
6. 20쪽 초과 문서는 현재 쪽 ±2쪽만 실제 본문 트리로 유지하고 나머지는 동일 높이 placeholder로 둔다.
7. 인쇄·PDF·PNG·HTML 직전에는 모든 페이지를 자동 복원한다.
8. 공동 편집 selection 전송은 160ms 유휴 배치, page snapshot은 기존 420ms debounce 뒤에 전송한다.

## After

- 개발 probe Key → Frame: 중앙값 3.4ms, p95 30.4ms, 최대 31.0ms.
- 50ms 이상 Long Task: 0건.
- 연속 11자 입력: EditorApp render 1회.
- 일반 입력 중 Resource Timing 신규 네트워크 요청: 0건.
- 300쪽·2,000회 합성 입력의 페이지 방문: buffer commit 300회, buffer 쓰기 2,000회, 순수 CPU 0.20ms.
- 300쪽 화면: 실제 `.page-margin` 3개, placeholder 297개. 2쪽을 활성화하면 실제 편집기가 전환되고 인접 4쪽만 유지된다.
- 한글 조합 테스트: `ㅎ → 하 → 한` 동안 문서 publication 0회, compositionend flush 1회.
- Autosave: 겹친 저장 2회 호출에서 첫 snapshot 완료 후 최신 snapshot 1회만 추가 저장.
- 오프라인/저장 실패: 상태는 오류로 표시하되 로컬 Tiptap 입력과 문서 buffer는 계속 동작.

## 페이지 수별 순수 갱신 벤치마크

| 쪽 | 기존 페이지 방문 | 개선 페이지 방문 | 기존 CPU | 개선 CPU |
|---:|---:|---:|---:|---:|
| 1 | 2,000 | 1 | 0.73ms | 0.19ms |
| 10 | 20,000 | 10 | 0.65ms | 0.10ms |
| 50 | 100,000 | 50 | 1.33ms | 0.08ms |
| 100 | 200,000 | 100 | 2.53ms | 0.19ms |
| 300 | 600,000 | 300 | 8.70ms | 0.20ms |

개선 CPU에는 2,000회의 O(1) buffer 교체와 마지막 1회의 페이지 merge가 포함된다. 벤치마크는 동일 프로세스에서 실행했으며 절대 시간보다 페이지 수에 따른 증가 경로 제거 여부를 판단하는 용도다.
