# 나만의 서재 · My Book Library

HTML, CSS, 순수 JavaScript로 만든 독서 기록 웹앱입니다. 별도 빌드, Node.js, 백엔드, 데이터베이스, 외부 UI 프레임워크를 사용하지 않습니다.

## 실행

VS Code에서 `index.html`을 Live Server로 엽니다. 현재 사용자 설정의 포트는 5505입니다. 파일을 직접 여는 `file://` 방식 대신 같은 HTTP 주소에서 두 페이지를 이용합니다.

- **내 서재**: 제목·저자·독서 상태·메모 등록, 카드 조회, 수정, 삭제, 수정 취소.
- **도서 검색**: 책 제목 또는 저자명을 선택한 뒤 버튼 또는 Enter로 Open Library 검색, 최대 10권 표시, 서재 추가.
- **명언·문장**: 한국어 Wikiquote에서 최대 10개의 관련 문서 후보를 찾습니다. 모든 후보는 ‘출처 미확인’으로 표시하며 원문 링크와 짧은 검색 결과 일부를 제공합니다. 문장의 저자나 출처 책을 확정하지 않습니다.
- **한국어 외국 작가명**: 기존 저자 검색이 0건일 때만 Wikidata의 정확한 한국어 이름/별칭·사람 유형·Open Library 저자 ID를 대조합니다. 유일한 인물만 연결하고 동명이인은 직접 선택합니다. 예: 폴 발레리 → Paul Valéry, 헤르만 헤세 → Hermann Hesse. 원래 결과가 있으면 유지하며 보완 API 장애로 기존 검색을 막지 않습니다.
- **문헌 대조 자료**: 별도로 확인한 `data/quote-references.json`의 표현과 정확히 일치할 때 작가·작품·근거 링크를 Wikiquote 후보와 분리해 표시합니다. 현재 「해변의 묘지」 관련 1개 항목만 수록했습니다. 등록되지 않은 문장을 추측해 채우지 않고 특정 한국어 판본의 문구도 확정하지 않습니다.
- **관련 도서 검색**: 후보의 버튼을 누르면 문서 제목이 입력된 별도 폼이 열립니다. 검색어를 수정하고 책 제목/저자명 방식을 직접 선택한 뒤 Open Library 검색을 실행합니다. 후보나 연결 검색만으로 책을 저장하지 않으며, 실제 도서의 ‘내 서재에 추가’를 눌러야 저장됩니다.
- 검색은 `fetch()`와 `async/await`로 실행합니다. 검색 방식과 검색어를 함께 키로 사용해 현재 페이지의 메모리에만 캐시합니다. 새 검색은 이전 요청을 중단하며, 늦은 이전 응답은 무시합니다.
- 표지가 없는 책은 기본 화면을 표시하고, 저장소 읽기·쓰기 오류나 API 오류는 메시지로 안내합니다.

## 파일 구조

```text
index.html              첫 화면 / CRUD
crud.js                 도서 등록·조회·수정·삭제
api.html                도서 검색
api.js                  Open Library·Wikiquote 검색 및 도서 연결·서재 추가
css/assignment.css      공통 반응형 디자인
data/quote-references.json  문헌 대조 출처 목록 (표현·작가·작품·근거 링크)
PROJECT_STATE.md        3차 작업 전 구조·저장 규칙·백업 기록
QA_REPORT.md            최종 검증 결과
SEARCH_REPORT.md        이전 제목·저자 확장 및 명언 API 조사 기록
SEARCH_ACCURACY_REPORT.md  다국어 검색 원인 분석·실제 응답 비교·최신 검사
css/style.css           기존 파일 보존 (현재 페이지에서 미사용)
js/app.js               기존 파일 보존 (현재 페이지에서 미사용)
```

## 저장 규칙

저장 키는 `my-book-library.books.v1`입니다. 값은 다음 필수 필드를 가진 객체들의 JSON 배열입니다.

| 필드 | 의미 |
| --- | --- |
| `id` | 직접 등록: UUID 또는 `book-...`; API 등록: `openlibrary:OL...W` |
| `title` | 책 제목 |
| `author` | 저자 이름 |
| `status` | 읽을 예정 / 읽는 중 / 완독 |
| `memo` | 메모 문자열 |
| `coverId` | 선택 필드. API 표지가 있으면 양의 정수 ID를 저장 |

선택 필드가 없는 기존 데이터도 그대로 표시합니다. 수정 시 ID와 표지 정보를 보존합니다. 동일 작품 ID의 API 도서는 중복 저장하지 않습니다. 직접 등록한 책은 제목이 같아도 별개의 도서로 관리합니다.

localStorage는 사용하는 브라우저와 출처(프로토콜·호스트·포트)에 저장됩니다. 로컬 개발 주소의 도서가 GitHub Pages 주소로 자동 이동하지는 않습니다. Git 커밋은 소스 백업이며 사용자 브라우저의 도서 데이터를 백업하지 않습니다. 앱은 기존 저장소를 초기화하지 않습니다.

## 배포할 파일

웹앱 실행 파일은 `index.html`, `crud.js`, `api.html`, `api.js`, `css/assignment.css`이며 문헌 대조 기능에는 `data/quote-references.json`도 필요합니다. 과제 설명용 문서도 함께 올릴 수 있습니다. 기존에 추적 중인 빈 파일 2개는 보존합니다. `.vscode/`, 임시 테스트 파일, 임시 브라우저 프로필은 배포용 커밋에 추가하지 않습니다.

## GitHub Pages 배포 절차 — 아직 실행하지 않음

1. 사용자 승인을 받은 뒤 기존 origin 저장소의 내용과 원격 브랜치를 다시 확인합니다. 기존 원격 작업이 있으면 먼저 차이를 검토하며 강제 push는 하지 않습니다. 새 저장소가 필요하면 생성 전에 별도 승인을 받습니다.
2. 검토한 과제 파일과 문서만 명시하여 로컬 커밋을 만듭니다. 사용자 승인 후 선택한 원격 브랜치로 일반 push합니다.
3. 사용자 승인 후 GitHub 저장소의 **Settings → Pages → Build and deployment → Deploy from a branch**를 선택합니다.
4. 배포할 브랜치와 **/(root)** 폴더를 선택합니다. 이 프로젝트는 루트의 `index.html`이 첫 화면입니다. 별도 빌드 명령이나 패키지 설치는 필요 없습니다.
5. Pages 배포 작업의 성공을 확인하고 GitHub가 표시하는 실제 URL을 엽니다. 프로젝트 사이트 URL의 일반 형식은 `https://<사용자명>.github.io/<저장소명>/`입니다. 이 형식은 제출 주소가 아닙니다.
6. 아래 기능 검사를 실제 배포 주소에서 마친 뒤 그 주소를 제출합니다.

근거: [GitHub Pages 게시 소스 설정 공식 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). 배포 설정이나 push는 현재 작업에서 실행하지 않았습니다.

## 배포 후 검사 순서

1. 실제 URL의 첫 화면과 `api.html`을 열어 메뉴, CSS, JS와 표지가 로딩되는지 확인합니다. 개발자 도구 Network에서 요청 경로와 상태를 확인합니다.
2. 제목·저자를 비운 제출과 공백 제출이 차단되는지 확인합니다.
3. 테스트 책을 직접 등록한 뒤 제목·저자·상태·메모를 모두 수정합니다.
4. 새로고침하고 브라우저를 완전히 닫았다가 같은 주소를 다시 열어 책이 유지되는지 확인합니다.
5. 도서 검색 화면에서 `Harry Potter`를 Enter로 검색합니다. 제목·저자·연도·표지를 확인하고 한 권을 추가합니다.
6. 같은 책을 다시 추가했을 때 중복 메시지가 표시되는지, 내 서재에서 수정·삭제 가능한지 확인합니다. 기존 직접 등록 책이 보존되는지도 확인합니다.
7. 개발자 도구의 Offline 설정으로 네트워크 오류 안내를 확인한 뒤 Online으로 복구합니다. 실제 결과 없음은 충분히 독특한 검색어로 확인합니다.
8. PC·태블릿·모바일 너비에서 가로 스크롤이나 메뉴 잘림이 없는지 확인합니다. 테스트 도서만 삭제하고 기존 도서는 유지합니다.
9. 명언·문장 모드에서 `가장 중요한 것은 눈에 보이지 않아`를 Enter로 검색합니다. ‘관련 문서 후보’·‘출처 미확인’, 짧은 검색 결과와 원문 링크를 확인합니다. 인물/작품 여부가 자동 확정되지 않는지 확인합니다.
10. 후보에서 ‘관련 도서 검색’을 눌러 검색어를 수정하고 제목 또는 저자 방식을 직접 선택합니다. 실제 도서 결과가 나타나고 자동 저장은 되지 않는지 확인합니다. 검색 중 다른 방식으로 바꿔도 이전 결과가 다시 나타나지 않는지 확인합니다.

## Wikiquote API와 콘텐츠 처리

요청 주소는 `https://ko.wikiquote.org/w/api.php`이며 아래 값을 `URLSearchParams`로 생성해 `fetch()` / `async` / `await`로 호출합니다.

| 파라미터 | 값 |
| --- | --- |
| `action` | `query` |
| `list` | `search` |
| `srsearch` | 사용자 입력 문장 |
| `srnamespace` | `0` (일반 문서) |
| `srlimit` | `10` |
| `srprop` | `snippet` |
| `format` | `json` |
| `origin` | `*` (비인증 CORS) |

응답의 `query.search`에서 `title`, `snippet`, `pageid`, `ns`를 확인합니다. API 자체 `error` 객체, HTTP 오류, 잘못된 JSON/구조, 15초 초과 요청도 처리합니다. 세 방식의 캐시는 분리하며 취소 신호를 무시하고 늦게 도착한 응답도 요청 번호로 걸러냅니다.

스니펫은 HTML을 DOM에 삽입하지 않고 태그 제거·문자 참조 해석 후 `textContent`로 출력합니다. 최대 120자와 생략 표시만 제공하고 누락된 문장을 만들어 채우지 않습니다. 원문 링크는 고정된 `https://ko.wikiquote.org/wiki/` 주소에 인코딩한 문서 제목으로 생성하며 새 창 링크에는 `noopener noreferrer`를 적용합니다.

각 카드의 원문 링크와 결과 아래 제공처·재사용 안내를 확인하세요. 위키 편집물의 라이선스와 인용 원문·번역문의 이용 조건은 구분해야 합니다. 120자 제한은 화면에서 과도한 복제를 줄이기 위한 기준이며 저작권상 허용 여부를 보증하는 기준은 아닙니다. 출처가 잘못 표기되거나 번역이 다른 자료가 있을 수 있으므로 실제 도서와 판본은 원문에서 별도로 확인해야 합니다.

## 데이터 출처

- [Open Library Search API](https://openlibrary.org/dev/docs/api/search): 선택한 방식의 `title` 또는 `author`, `limit=10`, `fields=key,title,author_name,first_publish_year,cover_i` 요청.
- [Open Library Covers API](https://openlibrary.org/dev/docs/api/covers): Cover ID 기반 이미지와 `default=false` 오류 처리를 사용.
- [MediaWiki Search API](https://www.mediawiki.org/wiki/API:Search), [비인증 CORS](https://www.mediawiki.org/wiki/API:Cross-site_requests#Unauthenticated_CORS_Requests): Wikiquote 관련 문서 후보 검색.
- [한국어 Wikiquote 재사용 안내](https://ko.wikiquote.org/wiki/위키인용집:저작권), [인용문과 위키 편집물의 권리 구분 안내](https://en.wikiquote.org/wiki/Wikiquote:Copyrights#Licensing_and_downstream_use).

API 키나 비밀번호는 필요하지 않습니다.

## 다국어 연결·정규화의 범위

Wikidata `wbsearchentities`로 최대 5개 후보를 찾고 `wbgetentities`로 한국어 이름/별칭, 사람(`P31=Q5`), Open Library 저자 ID(`P648`)를 확인합니다. 한국어 이름이 정확히 맞고 저자 ID가 있는 인물이 하나일 때만 `author_key`로 보완 검색합니다. 여러 사람 또는 잘린 검색 결과는 자동 선택하지 않으며 설명·Wikidata 링크와 선택 버튼을 제공합니다. 특정 작가의 이름 변환표를 하드코딩하지 않았습니다.

최초 한국어 0건 검색은 최대 네 단계(원래 Open Library → Wikidata 검색 → 인물 정보 일괄 조회 → 저자 ID 도서 검색)입니다. 보완 단계 전체를 5초로 제한하고 인명 30개·검색 20개를 현재 페이지 메모리에 캐시합니다. 보완 장애 결과는 검색 캐시에 고정하지 않으므로 같은 검색어로 재시도할 수 있습니다. 원래 결과가 있는 검색은 Wikidata를 호출하지 않습니다.

Wikiquote는 원래 입력을 먼저 검색하고 0건일 때만 유니코드·일부 구두점·공백을 정리해 한 차례 재검색합니다. 번역의 뜻이나 어미를 자동으로 바꾸지 않습니다. 별도 문헌 목록은 공백·일부 구두점을 제외한 등록 표현과의 정확한 일치만 사용합니다. 목록 파일을 읽지 못해도 Wikiquote 검색은 유지합니다. 자세한 실제 응답과 한계는 [검색 정확도 보고서](SEARCH_ACCURACY_REPORT.md)를 확인하세요.

다국어 데이터 근거: [Wikidata 접근 안내](https://www.wikidata.org/wiki/Wikidata:Data_access), [Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API).
