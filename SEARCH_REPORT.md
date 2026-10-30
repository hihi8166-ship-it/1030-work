# 제목·저자 검색 확장 및 명언 검색 조사

확인일: 2026-10-30 (Asia/Seoul). GitHub push와 Pages 설정 변경은 하지 않았습니다.

이 문서는 명언 기능 구현 전의 조사 기록입니다. 이후 승인받아 Wikiquote 관련 문서 후보 검색을 구현했으며 최신 기능·검증은 [README.md](README.md)와 [QA_REPORT.md](QA_REPORT.md)를 확인하세요.

## 기존 프로젝트 보존

- 기존 로컬 백업 커밋 `af7e5f0`과 초기 커밋을 유지했습니다. 이번 작업은 Git 커밋이나 원격 변경을 수행하지 않았습니다.
- 작업 시작 시 과제 파일 5개가 수정 상태이고, `README.md`, `QA_REPORT.md`, `.vscode/`가 미추적 상태였습니다. 앞선 작업을 되돌리거나 덮어쓰지 않았습니다.
- 이번 런타임 변경은 `api.html`, `api.js`, `css/assignment.css`에만 적용했습니다. `index.html`, `crud.js`, 기존 빈 파일과 `.vscode/`는 이번 작업에서 수정하지 않았습니다.
- 저장 키 `my-book-library.books.v1`, 필수 필드 `id/title/author/status/memo`, 선택 `coverId` 및 `openlibrary:OL...W` / 직접 등록 ID 체계를 유지합니다.
- 검증은 임시 Chrome 프로필에서만 수행했습니다. 실제 사용자 브라우저의 데이터는 읽거나 초기화하지 않았습니다.

## 구현 내용과 변경 파일

| 파일 | 변경 |
| --- | --- |
| `api.html` | 제목·저자 검색 방식 라디오 선택 UI, 명언·문장 준비 중 문구. 명언용 버튼이나 API 호출은 없음 |
| `api.js` | `title`/`author` 파라미터, 안내·결과 초기화, 방식별 캐시, 요청 취소 및 최신 요청 번호 검사 |
| `css/assignment.css` | 기존 디자인에 맞춘 선택 버튼 스타일, 키보드 포커스와 줄바꿈 |
| `README.md` | 확장된 검색 기능과 캐시·파일 설명 갱신 |
| `QA_REPORT.md` | 기존 3차 결과를 보존하고 최신 보고서 링크 추가 |
| `SEARCH_REPORT.md` | 이번 검증과 조사 기록 |

기존 도서 정보·표지·누락 데이터 처리와 서재 저장·중복 방지 코드를 재사용합니다. 요청은 `https://openlibrary.org/search.json?title=...` 또는 `?author=...`에 인코딩한 검색어와 `limit=10` 및 필요한 필드를 전달합니다. 근거: [공식 Search API 문서](https://openlibrary.org/dev/docs/api/search).

## 요청 충돌 방지

이전 코드는 검색 중 새 제출을 무시했습니다. 이번에는 새 검색을 허용하고 `AbortController`로 이전 요청을 취소합니다. 취소만으로 해결되지 않는 지연 응답도 요청 번호를 비교해 화면·캐시·오류·로딩 상태를 바꾸지 못하도록 처리합니다. 같은 진행 중 요청의 연타는 무시합니다. 방식 전환 또는 빈 검색어 제출도 이전 요청을 무효화합니다.

캐시 키는 `title:검색어` / `author:검색어`이며 현재 페이지의 최근 검색 20개만 보관합니다. localStorage 도서 데이터와는 별개입니다.

## 실제 브라우저 검증

Chrome headless를 실제 실행하고 DevTools Protocol로 Enter 키 입력·화면 너비 조정을 수행했습니다. 실제 외부 API와 테스트 응답을 구분합니다. **45개 검사 PASS, FAIL 0개**입니다.

| 항목 | 결과 | 실행 방식 |
| --- | --- | --- |
| 기존 제목 검색·최대 10권·정보·표지 | PASS | 실제 Open Library + 실제 Chrome, 표지 naturalWidth 확인 |
| Hermann Hesse / J. K. Rowling 저자 검색 | PASS | 실제 Open Library + 실제 Chrome |
| 제목/저자 방식 전환·안내·입력·결과 초기화 | PASS | 실제 Chrome 라디오 클릭 |
| 두 방식의 Enter 입력 | PASS | 실제 Chrome 키 입력 |
| 도서 저장·중복 방지·기존 책 보존 | PASS | 실제 제목·저자 검색 도서를 임시 localStorage에 저장 |
| CRUD 등록·조회·모든 필드 수정·삭제·필수값 검증 | PASS | 실제 Chrome에서 기존 CRUD 폼·카드 클릭, API ID·표지 보존 확인 |
| 새로고침·브라우저 종료 후 재실행 | PASS | 같은 임시 프로필/출처로 저장 JSON 유지 확인 |
| 방식별 캐시·검색어 인코딩·요청 연타 억제 | PASS | 실제 Chrome, fetch 테스트 응답과 호출 횟수 확인 |
| 지연 성공·지연 오류·방식 전환 중 응답 충돌 | PASS | 취소 신호를 무시하는 테스트 응답까지 역순으로 도착시켜 확인 |
| 로딩·결과 없음·HTTP·네트워크·비정상 응답·시간 초과 | PASS | 실제 Chrome에 오류 응답과 짧은 테스트용 타이머 제공 |
| 누락 필드·잘못된 ID·HTML 형태 문자열 | PASS | 실제 Chrome에 테스트 응답 제공 |
| PC·태블릿·모바일 배치 | PASS | 카드가 채워진 상태로 1440·768·390·320px 가로 넘침 검사 및 PC/모바일 캡처 검토 |
| JavaScript 예외·console.error | PASS | 테스트 중 감지 0건. 의도한 실패 메시지/외부 네트워크 실패와 구분 |
| 한국어 Wikiquote CORS 조사 | PASS | 앱 기능과 분리된 실제 브라우저 요청으로 JSON 읽기 확인 |
| 실물 모바일·Safari·Firefox | 미검증 | 실제 장비/다른 브라우저 테스트 없음 |
| 실제 GitHub Pages 주소 | 미검증 | 이번 작업에서도 배포하지 않음 |

## 명언·문장 검색 조사 — 기능 미구현

### Open Library

[Search API](https://openlibrary.org/dev/docs/api/search)는 제목·저자 등 도서 목록 정보를 찾는 API입니다. 이 API에서 임의의 본문 문장을 입력해 출처 도서를 확정하는 기능은 확인되지 않았습니다. 별도의 [개별 책 내부 검색 API](https://openlibrary.org/dev/docs/api/search_inside)는 문서화되어 있지만 실험적이며, 이미 알고 있는 Archive 항목 ID·저장 호스트·경로를 사용합니다. 따라서 출처를 모르는 문장의 전체 도서 역검색과는 용도가 다릅니다.

일반 제목·저자 검색은 무료·키 없이 HTTP 200을 확인했고 CORS `*`를 확인했습니다. 개별 책 내부 검색은 이번에 실행하지 않았으며, 해당 자료의 접근 권한·한국어 OCR 범위·브라우저 CORS는 미검증입니다. 모든 책의 본문을 검색할 수 있다고 가정하지 않습니다.

### 별도 공개 서비스 비교

| 항목 | Quotable | 한국어 Wikiquote / MediaWiki API |
| --- | --- | --- |
| 문서화된 기능 | 명언 내용·저자·태그 검색 | 위키 문서 텍스트 검색 |
| 무료·키 | 공식 문서상 무료 공개 API, 예시 요청에 키·인증 없음 | 이번 읽기 요청은 무료·로그인·키 없이 HTTP 200 |
| 실제 접근 | HTTPS 인증서 만료 오류로 실패. 인증서 검증을 우회하지 않음 | 한국어 검색 JSON 응답 확인 |
| CORS | TLS 실패로 미검증 | `origin=*` 요청의 CORS `*` 및 실제 Chrome 읽기 확인 |
| GitHub Pages | 현재 직접 연동을 추천하지 않음 | 정적 사이트에서 기술적으로 호출 가능. 실제 Pages 주소에서는 미검증 |
| 한국어 | 한국어 데이터·검색 지원을 확인하지 못함 | 한국어 문서 검색 가능. 번역 차이와 데이터 범위의 한계 있음 |
| 출처 도서 정확도 | 출처 책/판본을 확정하는 기능은 확인되지 않음 | 후보 문서는 찾지만 작품 ID·판본·쪽수를 자동 확정하지 않음 |

Quotable 근거: [운영 프로젝트 공식 README 및 검색 설명](https://github.com/lukePeavey/quotable#search-quotes-beta). README가 공개되어 있다는 사실과 현재 API가 정상 서비스된다는 사실은 구분했습니다. 이번 HTTPS 실패는 확인 환경에서의 결과이며 전 세계 장애로 단정하지 않습니다.

Wikiquote 근거: [MediaWiki Search](https://www.mediawiki.org/wiki/API:Search), [비인증 CORS 공식 문서](https://www.mediawiki.org/wiki/API:Cross-site_requests#Unauthenticated_CORS_Requests). 조사 요청은 `https://ko.wikiquote.org/w/api.php`의 `action=query&list=search&format=json&origin=*`에 사용자 예시 문장을 인코딩해 전달했습니다. 실제 후보에는 `어린 왕자`, `앙투안 드 생텍쥐페리` 외에도 다른 인물·주제 문서가 포함됐습니다. 원하는 책 하나가 확정되었다고 처리하지 않았습니다.

### 정확도와 저작권

한국어 번역은 번역자·판본에 따라 표현이 달라 문자열 일치만으로 출처를 확정하기 어렵습니다. 저자가 밝혀져도 그 저자의 특정 책이 출처라는 의미는 아닙니다. 위키 검색 순위도 출처 증명이 아니므로, 후보·원문 링크·확인 상태를 함께 제공하고 사용자가 확인하는 방식이 적합하다고 판단합니다.

무료 API나 오픈소스 코드 라이선스가 모든 인용문·번역문의 자유로운 재사용을 보장하지는 않습니다. Wikiquote의 편집·배열 라이선스와 인용 원문의 권리는 구분되어 있습니다. 원문/번역문과 데이터셋 각각의 사용 조건을 확인하고 출처를 남겨야 합니다. 근거: [Wikiquote 재사용 안내](https://en.wikiquote.org/wiki/Wikiquote:Copyrights#Licensing_and_downstream_use). 특정 문장의 사용 허용 여부를 이번 조사에서 법적으로 확정하지 않았습니다.

## 구현 대안 및 추천

아래 난이도는 현재 순수 JavaScript·GitHub Pages 과제를 기준으로 한 구현 판단입니다. 승인 전에는 어느 대안도 구현하지 않습니다.

| 대안 | 난이도 | 장점 | 제한 |
| --- | --- | --- | --- |
| 출처·판본·쪽수·사용 조건을 확인한 소규모 JSON 문장 목록 | 낮음~중간 | 한국어와 출처 품질을 직접 검증 가능, 키·CORS 문제 없음 | 등록된 문장만 검색 가능, 자료 검증과 권한 확인 필요 |
| Wikiquote 후보 문서와 원문 링크를 제시하고 사용자가 확인 | 중간 | 한국어·키 없는 브라우저 호출 가능 | 출처 책 자동 확정 불가, 라이선스 표시와 위키 내용 처리 필요 |
| 검색엔진/위키의 외부 검색 링크 제공 | 낮음 | 별도 API·인용문 복제 없이 조사 보조 | 앱 내부에서 출처 책을 반환하지 않음 |
| 허가된 본문 자료를 직접 색인 | 높음 | 보유한 본문 범위에서 문장 검색 가능 | 자료 이용권·OCR·번역·저장량·색인 작업 필요. 현재 과제 범위를 크게 늘림 |

**추천:** 이번 제출은 검증된 제목·저자 검색으로 완성하고 명언은 준비 중으로 유지합니다. 후속 승인을 받으면 먼저 소규모 출처 검증 JSON 목록으로 구현하는 방안이 적합합니다. 광범위한 탐색이 더 중요하면 Wikiquote를 ‘출처 후보 찾기’로 명시하고 사용자가 확인하는 방식을 권합니다. 임의 문장에 책 제목을 추측해 반환하지 않습니다.

## 배포 준비 상태

빌드 없는 정적 구조와 상대경로는 유지했습니다. 사용자는 명언 기능의 구현 여부를 결정할 수 있으며, 제목·저자 기능은 배포 준비 상태입니다. 기존 GitHub 저장소 push·Pages 설정 변경·실제 배포 URL 확인은 수행하지 않았습니다. 배포 승인은 이번 작업 범위에 포함하지 않았습니다.

<details>
<summary>브라우저 검사 실행 로그</summary>

```text
PASS LIVE title search 10 results
PASS LIVE title author year fields
PASS LIVE cover loaded
PASS LIVE API save preserves existing and ID
PASS mode switch resets query results and notices
PASS LIVE author search 10 results
PASS LIVE second author query
PASS title cache restored
PASS duplicate across modes
PASS new query aborts previous
PASS late success cannot overwrite latest
PASS old error and finally do not clear latest loading
PASS latest request completes normally
PASS same in-flight request deduplicated
PASS mode switch ignores prior response
PASS cache separated by mode and encoded params
PASS repeat uses cache
PASS blank query cancels stale response
PASS empty result notice
PASS HTTP failure
PASS network failure
PASS abnormal response
PASS missing fields and unsafe strings
PASS result cap 10
PASS timeout notice resets busy
PASS CRUD reads existing and API books
PASS API update preserves identifier and cover
PASS CRUD required validation
PASS manual create separate ID
PASS manual update all fields
PASS refresh preserves JSON
PASS API delete preserves existing
PASS manual delete
PASS LIVE author result saves to existing library
PASS author result duplicate prevented
PASS no frame runtime errors
PASS LIVE Enter search title
PASS LIVE Enter search author
PASS populated API mode UI 1440px no horizontal overflow
PASS populated API mode UI 768px no horizontal overflow
PASS populated API mode UI 390px no horizontal overflow
PASS populated API mode UI 320px no horizontal overflow
PASS research Wikiquote browser CORS
PASS application console errors none
PASS browser restart preserves storage
```

</details>
