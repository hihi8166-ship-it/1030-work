# 최종 검증 및 배포 준비 보고

검증일: 2026-10-30 (Asia/Seoul).

## 최신 검증 — 다국어 저자·명언 검색 정확도 보완

`폴 발레리`/`Paul Valéry`/`Paul Valery`의 실제 Open Library HTTP 200 응답은 각각 총 0/889/889건이었습니다. 앱의 결과 유실이 아닌 API 이름 색인 차이로 확인했습니다. 한국어 0건에만 Wikidata의 정확한 인물·Open Library ID 연결을 보완합니다. 일반 제목·저자·Wikiquote 기능과 저장 계약, 백업 커밋은 유지합니다.

명언은 원래 Wikiquote 후보를 유지하면서 문헌으로 대조한 작가·작품·근거를 별도 영역에 표시합니다. 한국어 Wikiquote에서 `폴 발레리`와 `해변의 묘지` 문서는 실제 `missing` 응답이었습니다. 등록된 표현 외의 문장에 출처를 만들어 표시하지 않습니다.

최종 **53개 검사 PASS, FAIL 0개**입니다. 실제 Chrome·외부 API, 모의 장애/동명이인/지연 응답, 파일 보존/하위경로 검사를 구분한 표와 실행 로그는 [SEARCH_ACCURACY_REPORT.md](SEARCH_ACCURACY_REPORT.md)에 기록했습니다. `index.html`, `crud.js`, `PROJECT_STATE.md`, 사용자 VS Code 설정은 해시 비교로 이번 작업에서 불변임을 확인했습니다. Git 커밋·push·Pages 설정 변경은 하지 않았습니다.

## 이전 검증 — Wikiquote 명언·문장 검색 추가

한국어 Wikiquote 검색을 구현했습니다. 아래 최신 결과 이후에는 이전 3차 완료 당시의 기록을 보존합니다. 제목·저자 확장 당시의 조사 내용은 [SEARCH_REPORT.md](SEARCH_REPORT.md)의 과거 기록이며 ‘명언 미구현’ 상태는 이번 작업으로 변경되었습니다. Git 커밋·push·Pages 배포는 이번에도 하지 않았습니다.

### 보호 및 수정 범위

- 시작 시 기존 `.git`과 백업 커밋 `af7e5f0` 확인. 변경 전 과제 파일 5개는 수정 상태, 사용자 `.vscode/` 및 이전 보고서 3개는 미추적 상태였습니다. 기존 변경을 보존했습니다.
- 앱 변경: `api.html`, `api.js`, `css/assignment.css`. 문서 변경: `README.md`, `QA_REPORT.md`, 과거 기록임을 알리는 `SEARCH_REPORT.md` 안내 한 줄.
- `index.html`, `crud.js`, `PROJECT_STATE.md`, `css/style.css`, `js/app.js`, `.vscode/settings.json`의 SHA-256을 검증 전후 비교하여 동일함을 확인했습니다.
- 저장 키 `my-book-library.books.v1`, 필수 도서 구조와 `coverId`, 직접 등록/API ID 체계 유지. 실제 사용자 데이터는 읽거나 초기화하지 않았습니다.

### 구현 및 API 확인

`https://ko.wikiquote.org/w/api.php`에 `action=query`, `list=search`, `srsearch=입력값`, `srnamespace=0`, `srlimit=10`, `srprop=snippet`, `format=json`, `origin=*`를 `URLSearchParams`로 전달합니다. 실제 Chrome에서 `query.search` 배열과 `title/snippet/pageid/ns` 필드를 읽었습니다. `fetch` 응답을 브라우저에서 읽을 수 있었으므로 CORS 동작도 실제 확인했습니다. 근거: [MediaWiki Search](https://www.mediawiki.org/wiki/API:Search), [CORS 공식 문서](https://www.mediawiki.org/wiki/API:Cross-site_requests).

문서마다 관련 문서 후보·출처 미확인, 최대 120자의 스니펫 텍스트, 신뢰 도메인의 원문 링크, 관련 도서 검색 버튼을 표시합니다. 인물이나 작품 여부를 추정하지 않습니다. 연결 폼에서 검색어와 제목/저자 방식을 사용자가 결정하고, 실제 Open Library 도서만 기존 버튼으로 저장할 수 있습니다.

### 사용자 요청 18개 항목 검증

실제 Chrome headless와 임시 프로필을 사용했습니다. 세 방식의 Enter 키는 Chrome DevTools Protocol의 실제 키 입력으로 검사했습니다. **총 68개 검사 PASS, 최종 FAIL 0개**입니다. 보호 파일 해시 및 HTTP 경로 검사도 이 수에 포함합니다.

| 번호 | 검증 항목 | 결과 | 실제 실행 / 모의 응답 구분 |
| --- | --- | --- | --- |
| 1 | 기존 제목 검색 | PASS | 실제 Open Library·Chrome, 10권 확인 |
| 2 | 기존 저자명 검색 | PASS | 실제 Open Library·Chrome, Hermann Hesse 결과 확인 |
| 3 | 명언·문장 검색 | PASS | 실제 Wikiquote·Chrome, 사용자 예시 문장 검색 |
| 4 | 실제 응답·CORS | PASS | 실제 브라우저 응답 JSON을 읽고 구조 확인 |
| 5 | 최대 10개 | PASS | 실제 결과 수 확인 + 모의 응답 12개에서 10개로 제한 |
| 6 | 관련 문서 후보·출처 미확인 표시 | PASS | 실제 후보마다 배지·상태와 전체 안내 확인 |
| 7 | 원문 링크 | PASS | 신뢰 도메인·인코딩·rel 검사 및 실제 원문 페이지를 열어 문서 제목 요소 확인 |
| 8 | 관련 도서 연결 | PASS | 실제 제목/저자 검색으로 연결, 검색어 수정·방식 직접 선택·자동 저장 없음 확인 |
| 9 | 결과 없음 | PASS | 실제 Chrome에서 빈 Wikiquote 모의 응답과 안내 검사 |
| 10 | 네트워크·API 오류 | PASS | 모의 HTTP 503·네트워크 실패·HTTP 200의 MediaWiki error·잘못된 JSON/구조·시간 초과 검사 |
| 11 | 전환·Enter | PASS | 세 방식 실제 Enter 검색, 전환 시 결과/안내/연결 폼 초기화 확인 |
| 12 | 이전 응답 충돌 방지 | PASS | 모의 응답 순서를 역전하고 오래된 성공·오류·finally·방식 전환 응답을 검사 |
| 13 | 기존 CRUD | PASS | 실제 브라우저 등록·조회·모든 필드 수정·삭제·필수값 검사 |
| 14 | localStorage 보존 | PASS | 기존 객체 유지, Wikiquote/연결만으로 저장 안 됨, 새로고침 및 Chrome 종료·재실행 후 JSON 일치 |
| 15 | Open Library 저장·중복 방지 | PASS | 실제 API 도서 저장 및 중복 버튼 검사, 수정 시 ID/표지 유지 |
| 16 | 반응형 | PASS | 실제 Chrome 1440·768·390·320px 및 모바일 연결 폼 가로 넘침 없음, 캡처 검토 |
| 17 | JavaScript 콘솔 | PASS | 검사 중 감지한 JavaScript 예외·console.error 0건. 의도한 API 실패·네트워크 오류와 구분 |
| 18 | Pages 하위경로 | PASS | 로컬 `/1030-work/`에서 5개 앱 파일 HTTP 200 및 실제 브라우저 동작 |
| 추가 | 실제 모바일 장비·다른 브라우저 | 미검증 | Chrome 너비 조정만 수행 |
| 추가 | 실제 GitHub Pages URL | 미검증 | 사용자 지시에 따라 미배포 |

### 오류 처리·안전성 및 한계

- MediaWiki는 HTTP 200에서도 `error`를 반환할 수 있어 별도 검사합니다. 구조가 다른 응답은 빈 결과로 숨기지 않고 오류로 표시합니다.
- 스니펫 HTML을 실행하거나 DOM에 삽입하지 않습니다. 태그 제거·문자 참조 해석 후 textContent로 표시하며 악성 HTML 형태의 입력, 잘못된 문자 참조, 긴 문자열을 모의 테스트했습니다.
- 요청 취소뿐 아니라 버전 번호를 재사용하여 이전 응답·오류·로딩 종료가 새 화면을 덮어쓰지 못하도록 했습니다. 캐시도 세 방식별로 구분됩니다.
- 기능 검사에서 남아 있는 앱 오류는 발견하지 못했습니다. 결과 관련성은 출처 정확성을 보증하지 않으며 한국어 번역·색인 범위 때문에 원하는 후보가 없을 수 있습니다.
- 연결 폼은 인물/작품을 자동 판별하지 않습니다. 문서 제목을 검색어로 제안할 뿐이며, 검색어를 수정하고 방식을 직접 선택해야 합니다.
- 출처 링크·제공처·재사용 안내를 표시하고 스니펫을 짧게 제한했습니다. [한국어 Wikiquote 저작권 안내](https://ko.wikiquote.org/wiki/위키인용집:저작권)와 [인용 원문/편집물 권리 구분](https://en.wikiquote.org/wiki/Wikiquote:Copyrights#Licensing_and_downstream_use)을 확인했습니다. 표시 길이 제한이 개별 원문이나 번역문의 재사용 허가를 보증하지는 않습니다.
- 정적 구조와 상대경로는 유지되어 배포 준비 상태입니다. 실제 GitHub 커밋·push·설정 변경·제출 URL 확인은 수행하지 않았습니다.

---

## 이전 3차 완료 기록

## 보존 및 Git 상태

| 항목 | 결과 |
| --- | --- |
| 3차 작업 전 로컬 백업 | 커밋 `af7e5f0` — `backup: preserve CRUD and Open Library before final polish` |
| 백업 포함 파일 | 과제 소스 5개 및 `PROJECT_STATE.md` |
| 기존 파일 | 삭제·초기화 없음. `css/style.css`, `js/app.js` 보존 |
| 사용자 VS Code 설정 | `.vscode/`는 수정·스테이징하지 않음 |
| 사용자 브라우저 데이터 | 접근·삭제·초기화하지 않음. 검증은 임시 Chrome 프로필 사용 |
| 현재 최종 변경 | 작업 폴더에 보존. 최종 변경의 커밋·push는 배포 승인 후 진행 예정 |
| origin 읽기 전용 확인 | `https://github.com/hihi8166-ship-it/1030-work.git`, 원격 `master`는 `bb02b6b` |
| GitHub 변경 | 저장소 생성, push, Pages 설정 변경 없음 |

## 과제 요구사항 및 기능별 결과

PASS는 아래 명시한 방법으로 확인한 항목입니다. 실제 GitHub Pages 검증을 로컬 검증으로 대신하여 PASS 처리하지 않았습니다.

| 요구사항 / 기능 | 결과 | 확인 방법 |
| --- | --- | --- |
| HTML·CSS·순수 JavaScript, 빌드 없는 정적 앱 | PASS | 코드·파일 구성 검토. 프레임워크·Node.js·백엔드·DB 의존성 없음 |
| 첫 화면 `index.html`, 지정 파일 구조 | PASS | 파일 검토 및 HTTP 요청 |
| 직접 도서 등록·목록 조회·수정·삭제 | PASS | 실제 Chrome에서 DOM 조작, 클릭, 폼 제출, JSON 검사 |
| 제목·저자·독서 상태·메모 수정 | PASS | 실제 Chrome에서 네 필드 변경 및 저장 확인 |
| 필수 입력·공백 검증, 수정/삭제 취소, 빈 목록 | PASS | 실제 Chrome에서 정상·예외 입력 및 취소 확인 |
| localStorage JSON 저장 및 고유 ID | PASS | 실제 Chrome 저장소 검사 |
| 새로고침 후 유지 | PASS | 실제 페이지 새로고침 후 카드 재표시 확인 |
| 브라우저 재실행 후 유지 | PASS | Chrome 종료 후 같은 임시 프로필과 같은 출처로 새 프로세스를 실행하여 JSON 전체 일치 및 카드 수 확인 |
| 실제 Open Library 요청·결과 10권·정보 표시 | PASS | 외부 API를 호출하는 실제 Chrome에서 확인 |
| 실제 Enter 키로 검색 | PASS | Chrome DevTools Protocol의 실제 키 입력 전송 후 외부 API 검색 결과 확인 |
| 실제 표지 이미지 로드 | PASS | 실제 Chrome에서 이미지 `naturalWidth > 0` 확인 |
| 누락 필드·잘못된 식별자·빈 검색어·검색 결과 없음 | PASS | 실제 Chrome에 테스트 응답/입력을 제공하여 확인 |
| 로딩·HTTP·네트워크·JSON·비정상 응답·시간 초과 | PASS | 실제 Chrome에서 fetch 응답과 실패를 모의하여 확인. 실제 API 장애를 발생시킨 검사는 아님 |
| 검색 도서 서재 저장·중복 방지·수정·삭제 | PASS | 실제 API 도서와 테스트 도서로 확인. 수정 후에도 중복 방지 유지 |
| 기존 CRUD 데이터 및 표지 선택 정보 보존 | PASS | 저장 전후 기존 객체와 ID·표지 ID 검사 |
| 탭 간 저장 반영·손상 저장소 보존·복구 후 저장 | PASS | 동일 출처 두 프레임의 실제 storage 이벤트와 손상/복구 순서로 확인 |
| 두 페이지 통일 디자인·현재 메뉴 표시·카드형 UI | PASS | 실제 브라우저 DOM 및 PC·모바일 캡처 검토 |
| PC·태블릿·모바일 반응형 | PASS | 1440·768·390·320px 너비에서 빈 검색 화면 및 결과/서재 카드가 채워진 화면의 가로 넘침 확인 |
| 모바일 실물 기기·Safari·Firefox | 미검증 | Chrome의 화면 너비 조정으로만 검사 |
| 외부 문자열 안전한 DOM 출력·검색어 인코딩 | PASS | 코드 검토 및 HTML 형태의 테스트 문자열·특수문자 검색어로 확인 |
| 민감정보 미포함·저장소 초기화 코드 없음 | PASS | 앱 HTML/JS 코드 검토 및 정적 문자열 검사 |
| JavaScript 문법·실행 오류 | PASS | 실제 Chrome에서 두 스크립트 로드 및 동작 수행. 최종 검사에서 감지된 예외 0건 |
| HTML 구조·중복 ID·label/ARIA 대상 | PASS | Python 표준 HTML 파서를 이용한 자체 구조 검사. W3C 공식 검증기 사용은 아님 |
| 상대경로·CSS/JS 연결·GitHub Pages 하위경로 | PASS | `/1030-work/` 경로를 로컬에서 재현하여 앱 파일 5개 HTTP 200, 스타일 규칙 로드 확인 |
| 한글 주석·미사용 코드 점검 | PASS | 주요 함수 주석 검토. 미사용 `.back-link` CSS 삭제. 기존 빈 JS/CSS 파일은 보존 |
| Git 공백 오류 | PASS | `git diff --check` 실행 |
| 배포할 파일·절차·배포 후 검증 안내 | PASS | `README.md`에 기록 |
| 실제 GitHub Pages 배포·배포 주소 기능 검사 | 미검증 | 사용자 승인 전이므로 실행하지 않음 |
| 최종 제출 URL 확인 | 미검증 | 배포 후 GitHub가 반환하는 실제 주소에서 확인 예정 |

서로 다른 브라우저 검사 64개 PASS, 최종 FAIL 0개입니다. 별도로 정적 검사 5개를 통과했습니다. Python은 로컬 검증 도구로만 사용했고, 웹앱 실행에는 필요하지 않습니다.

## 수정 파일

| 파일 | 변경 내용 |
| --- | --- |
| `index.html` | 본문 바로가기, 검색 페이지 안내 링크, 메타 설명, 인라인 파비콘 |
| `api.html` | 본문 바로가기, 메타 설명, 같은 파비콘 |
| `crud.js` | 실제/기본 표지 표시, 선택 필드 보존, 정상 저장 데이터 복구 시 저장 차단 해제 |
| `api.js` | 기존 필수 구조를 유지하고 선택 필드 `coverId` 저장 |
| `css/assignment.css` | 도서 표지 중심 카드, 통일된 밝은 디자인, 모바일·태블릿 배치, 접근성 스타일 |
| `PROJECT_STATE.md` | 3차 작업 전 상태와 저장 키 기록. 백업 커밋에 포함 |
| `README.md` | 실행·저장 규칙·파일 목록·배포 절차·배포 후 검사 방법 |
| `QA_REPORT.md` | 이 검증 보고서 |

## 발견한 오류와 조치

| 문제 | 수정 및 확인 |
| --- | --- |
| 다른 탭에서 손상 저장소를 정상 데이터로 복구해도 내 서재 탭의 저장 차단이 남음 | 변경 전 실제 브라우저에서 FAIL 재현. 정상 배열 또는 저장 항목 부재를 읽으면 저장 상태를 복구하도록 수정. 재검사 PASS |
| 내 서재 카드에는 표지가 없고 기존 수정 객체 생성 방식은 새 선택 정보를 잃을 수 있음 | API 저장에 선택 `coverId` 추가. 기존 도서는 기본 표지 표시. 수정 시 기존 객체 복사로 선택 정보 보존. 실제 API 도서로 재검사 PASS |
| 태블릿에서 API 결과가 한 열로만 배치됨 | 태블릿 API 결과를 두 열로 표시. 네 가지 너비에서 가로 넘침 없음 |

## 남은 확인 사항 및 승인 경계

- 실제 모바일 기기와 다른 브라우저에서는 확인하지 않았습니다.
- 실제 표지 로드 성공을 확인했으며, 별도 캡처 검사에서는 일부 외부 표지 로딩 실패도 관찰했습니다. 실패 시 대체 안내를 표시하고 도서 정보와 저장 버튼은 유지합니다.
- 로컬 출처의 localStorage는 배포 출처로 자동 이전되지 않습니다. 저장 키 `my-book-library.books.v1`은 그대로 유지했습니다.
- GitHub Pages 배포 준비는 완료했지만 실제 배포는 하지 않았습니다. 따라서 제출 가능한 실제 URL은 아직 확인하지 않았습니다.
- 다음 승인 범위: 기존 origin 저장소에 과제 변경을 일반 push하고, Pages의 소스를 `master` / `/(root)`로 설정한 뒤 실제 URL에서 두 페이지와 주요 기능을 확인하는 작업. 원격 상태는 실행 직전에 다시 확인하며 강제 push는 하지 않습니다.
- 새 저장소가 필요하면 생성 전에 별도 승인을 요청합니다.

<details>
<summary>최종 브라우저 검사 실행 로그 (중복 제외)</summary>

```text
PASS LIVE API search 1 to 10 cards
PASS LIVE title author year
PASS LIVE cover image loaded
PASS LIVE API save and preserve existing
PASS API optional cover ID saved
PASS CRUD reads live API book
PASS API update retains ID all fields
PASS editing preserves cover metadata
PASS duplicate after edit
PASS refresh preserves books
PASS API delete preserves existing
PASS whitespace validation
PASS manual create unique ID
PASS manual update all fields
PASS edit cancel
PASS delete cancel
PASS delete and empty message
PASS blank query no request
PASS encoded query limit
PASS missing fields fallback
PASS safe DOM and invalid identifier
PASS cover failure fallback
PASS save and duplicate
PASS cross-tab storage sync
PASS cache avoids repeated calls
PASS empty search result
PASS HTTP error
PASS network error
PASS abnormal response
PASS invalid JSON
PASS loading visible
PASS limit 10 and busy reset
PASS corrupted storage not overwritten
PASS storage recovery permits save
PASS request timeout
PASS no runtime errors
PASS LIVE Enter key starts search
PASS LIVE stored API book has coverId
PASS api.html current-page navigation
PASS api.html viewport 1440px no overflow
PASS api.html viewport 768px no overflow
PASS api.html viewport 390px no overflow
PASS api.html viewport 320px no overflow
PASS index.html current-page navigation
PASS index.html viewport 1440px no overflow
PASS index.html viewport 768px no overflow
PASS index.html viewport 390px no overflow
PASS index.html viewport 320px no overflow
PASS rendered CSS stylesheets loaded
PASS browser restart preserves JSON exactly
PASS browser restart renders all saved cards
PASS Pages subpath HTTP 200 index.html
PASS Pages subpath HTTP 200 api.html
PASS Pages subpath HTTP 200 crud.js
PASS Pages subpath HTTP 200 api.js
PASS Pages subpath HTTP 200 css/assignment.css
PASS api.html populated cards 1440px no overflow
PASS api.html populated cards 768px no overflow
PASS api.html populated cards 390px no overflow
PASS api.html populated cards 320px no overflow
PASS index.html populated cards 1440px no overflow
PASS index.html populated cards 768px no overflow
PASS index.html populated cards 390px no overflow
PASS index.html populated cards 320px no overflow
```

</details>

<details>
<summary>최신 Wikiquote 통합 검사 실행 로그 (68개)</summary>

```text
PASS LIVE title search 10 books
PASS LIVE book fields displayed
PASS LIVE cover image
PASS book save preserves original
PASS book duplicate prevented
PASS LIVE author search
PASS quote mode clears previous and shows caution
PASS LIVE Wikiquote CORS and response structure
PASS Wikiquote all required params
PASS LIVE quote results capped 10
PASS LIVE titles snippets and candidate labels
PASS quote results never auto-save
PASS trusted original links and rel
PASS bridge prefills but requires explicit mode
PASS bridge cannot auto-select type or book
PASS LIVE editable bridge title search
PASS LIVE bridge author search
PASS bridge searches do not save books
PASS blank query no request
PASS quote no results notice
PASS empty result cache used
PASS snippet safe text without HTML elements
PASS malicious title cannot change link host
PASS snippet length capped and invalid entities safe
PASS missing snippet fallback
PASS quote rendering cap 10
PASS HTTP error notice
PASS network error notice
PASS HTTP 200 MediaWiki error notice
PASS invalid JSON notice
PASS invalid response shape rejected
PASS new quote aborts previous and shows loading
PASS late quote success ignored
PASS old errors cannot clear new loading
PASS same in-flight request ignored
PASS mode switch ignores old quote response
PASS three mode caches separated
PASS timeout releases busy state
PASS CRUD reads original and API
PASS API update preserves ID and cover
PASS CRUD required input validation
PASS manual create unique ID
PASS manual update
PASS refresh preserves books
PASS CRUD deletes API and manual preserving original
PASS no frame runtime errors
PASS LIVE Wikiquote original page opens
PASS LIVE Enter search title
PASS LIVE Enter search author
PASS LIVE Enter search quote
PASS quote result layout 1440px
PASS quote result layout 768px
PASS quote result layout 390px
PASS quote result layout 320px
PASS related search panel mobile layout
PASS application console errors none
PASS browser restart preserves JSON
PASS Pages subpath HTTP 200 index.html
PASS Pages subpath HTTP 200 crud.js
PASS Pages subpath HTTP 200 api.html
PASS Pages subpath HTTP 200 api.js
PASS Pages subpath HTTP 200 css/assignment.css
PASS preserved file index.html
PASS preserved file crud.js
PASS preserved file PROJECT_STATE.md
PASS preserved file css/style.css
PASS preserved file js/app.js
PASS preserved file .vscode/settings.json
```

</details>
