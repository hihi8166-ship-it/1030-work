# 3차 작업 전 프로젝트 보존 기록

기록일: 2026-10-30 (Asia/Seoul). 1차 CRUD 및 2차 Open Library 구현 상태를 로컬 Git 백업 커밋으로 보존합니다. GitHub push 및 배포는 하지 않습니다.

## 현재 구조

```text
index.html             첫 화면, CRUD 폼과 카드 목록
crud.js                CRUD 및 localStorage 저장
api.html               도서 검색 화면
api.js                 Open Library 검색 및 내 서재 추가
css/assignment.css     두 페이지의 공통 스타일
css/style.css          기존 파일, 보존
js/app.js              기존 파일, 보존
.vscode/settings.json  사용자 VS Code 설정, 백업 커밋에서 제외
```

## 저장 데이터 계약

- 저장 키: `my-book-library.books.v1`
- 값: 도서 객체의 JSON 배열
- 필수 필드: `id`, `title`, `author`, `status`, `memo`
- `status`: `읽을 예정`, `읽는 중`, `완독`
- 직접 등록 ID: UUID 또는 `book-시간-난수`
- API 등록 ID: `openlibrary:OL82563W` 형식의 작품 식별자
- 제목이나 저자를 수정해도 ID는 유지합니다.
- 기존 객체에 선택 필드를 추가할 수 있지만 필수 필드와 저장 키는 변경하지 않습니다.

```json
[
  {
    "id": "openlibrary:OL82563W",
    "title": "Harry Potter and the Philosopher's Stone",
    "author": "J. K. Rowling",
    "status": "읽을 예정",
    "memo": ""
  }
]
```

위 JSON은 구조 설명용 예시이며 실제 사용자 데이터의 복사본이 아닙니다. localStorage는 브라우저의 출처(프로토콜·호스트·포트)에 저장되므로 Git 커밋에는 포함되지 않습니다. 사용자 브라우저의 기존 데이터는 읽거나 초기화하지 않습니다. GitHub Pages 주소의 저장소는 로컬 개발 주소와 별개입니다.

## Git 확인

- 기존 Git 저장소 있음. 작업 시작 시 HEAD: `bb02b6b` (`init`).
- 기존 origin: `https://github.com/hihi8166-ship-it/1030-work.git`.
- 시작 시 수정: `index.html`.
- 시작 시 미추적 과제 파일: `api.html`, `api.js`, `crud.js`, `css/assignment.css`.
- `.vscode/`는 사용자 설정이므로 스테이징하지 않습니다.
- 백업 커밋 메시지: `backup: preserve CRUD and Open Library before final polish`.
- 백업 커밋은 이 기록과 과제 파일 5개만 포함합니다. 기존 빈 파일은 삭제하지 않습니다.

## 이후 확인 방법

`git log --oneline`에서 위 메시지의 커밋을 찾고 `git show <커밋>:<파일경로>`로 당시 파일을 확인할 수 있습니다. 현재 작업을 덮어쓰는 reset/checkout 복구 명령은 자동 실행하지 않습니다.
