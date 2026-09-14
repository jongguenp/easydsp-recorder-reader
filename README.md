# EasyDSP Recorder Reader

iPhone에서 EasyDSP `.rec` 파일을 직접 열고 분석하기 위한 offline-first 모바일 분석기입니다.

## 현재 MVP

- EasyDSP REC 내부 `m_DATA#` 채널 자동 탐색
- 사용자가 Ts(ms) 직접 입력
- 1 ms / 2 ms 빠른 선택
- 여러 REC 파일 불러오기
- 채널 표시/숨김
- `m_DATA0 → 체인 위치` 같은 별칭
- 채널별 색상
- 공통 Y Auto Scale / 채널별 Auto Scale
- 그래프 터치 커서: Sample, 시간, 값
- Min / Max 및 발생시간
- Mean / RMS
- A-B 오차 채널 생성
- 설정 LocalStorage 저장
- Service Worker 기반 오프라인 캐시

## 검증한 REC 계열

제공된 5개 EasyDSP REC 샘플은 모두 다음 구조로 해석되었습니다.

- 8 channels: `m_DATA0 ... m_DATA7`
- 1000 samples/channel
- point = little-endian Float64 X + Float64 Y
- X = sample index
- 실제 시간 = sample index × Ts

알 수 없는 REC 변형은 임의로 해석하지 않고 오류를 표시하도록 설계했습니다.

## iPhone 사용 목표

1. Safari에서 배포 주소를 최초 1회 엽니다.
2. 공유 → **홈 화면에 추가**를 누릅니다.
3. 이후 EasyDSP 앱 아이콘으로 실행합니다.
4. 파일 앱에서 REC를 선택합니다.
5. 분석 자체는 iPhone 내부에서 수행합니다.

REC 측정 데이터를 분석 서버로 업로드하는 코드는 없습니다.

## GitHub Pages

현재 저장소는 private입니다. GitHub 계정/플랜에 따라 private repository Pages 사용 가능 여부가 달라질 수 있습니다.
Pages가 활성화되면 이 저장소 루트(`main`)의 정적 앱을 그대로 배포할 수 있습니다.

## 다음 작업

- REC 파일 자체 IndexedDB 영구 저장
- 두 개 Cursor A/B 및 Δt/ΔY
- pinch zoom / pan
- 선택 구간 통계
- 단위/Scale/Offset
- 여러 REC 이벤트 정렬
- iPhone PWA 설치 UX 개선
