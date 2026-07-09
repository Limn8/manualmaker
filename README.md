# ManualMaker

iorad 스타일의 **스크린샷 기반 인터랙티브 매뉴얼 메이커**입니다. 브라우저에서 완전히 동작하며 서버가 필요 없습니다 (모든 데이터는 로컬에 저장).

**Live:** https://manualmaker.vercel.app

## 기능

- **화면 캡처** — 브라우저 화면 공유 API로 원하는 창/화면을 캡처, 클립보드(Ctrl+V), 파일 업로드/드래그&드롭 지원, 원하는 영역만 크롭
- **단계 편집** — 이미지 위에 드래그로 강조 박스를 그리고 이동/리사이즈, 동작 지정(클릭/더블클릭/우클릭/텍스트 입력/스크롤/안내), 단계별 설명 입력
- **인터랙티브 재생** — 강조 영역을 클릭하거나 텍스트를 입력하면 다음 단계로 진행
- **내보내기**
  - **HTML** — 이미지와 뷰어가 모두 내장된 단일 HTML 파일 (오프라인 동작)
  - **PDF** — 단계별 한 페이지, 강조 박스와 설명 포함
  - **영상** — 강조 애니메이션이 포함된 WebM 영상
- **자동 저장** — IndexedDB에 자동 저장, JSON으로 프로젝트 내보내기/불러오기

## 개발

```bash
npm install
npm run dev     # 개발 서버
npm run build   # 프로덕션 빌드 (dist/)
```

## 기술 스택

Vite + React + TypeScript · jsPDF · MediaRecorder API · Screen Capture API

> 화면 캡처 기능은 HTTPS(또는 localhost) 환경에서만 동작합니다.
