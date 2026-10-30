# 전체 검색 시스템 개선 및 검증 보고

기록일: 2026-10-30 (Asia/Seoul).

## 보호한 상태

작업 시작 시 Git 작업 폴더는 깨끗했고 사용자 커밋 `dc313e0`(1030 14:00), 백업 `af7e5f0`을 확인했습니다. 이번에는 Git 커밋·push·Pages 설정 변경을 하지 않았습니다. `index.html`, `crud.js`, 저장 키 `my-book-library.books.v1`, 기존 작품 ID·도서 구조, `data/quote-references.json`, VS Code 설정을 유지했습니다. 실제 사용자 브라우저 데이터는 접근하거나 초기화하지 않았고 모든 검사는 격리된 임시 Chrome 프로필에서 수행했습니다.

## 1. 분석과 설계

| 기존 구조 | 실제 문제 | 개선 |
| --- | --- | --- |
| title/author + limit=10, offset 없음 | 첫 10권 이후 확인 불가 | 출처별 offset과 미표시 버퍼로 10권씩 더 보기 |
| 한국어 저자 검색 0건에만 Wikidata 사용 | 베르나르 베르베르는 1권이 있어 보완 생략 | 언어·기존 결과 유무와 무관하게 확인된 항목 보완 |
| 한국어·영어 이름 중심 | 다른 언어 별칭과 악센트 차이 제한 | 여러 언어 라벨·별칭/비교용 악센트 정규화 |
| API 순서 그대로 | 비슷한 기관명·공저 선집·교재가 앞에 노출 | 확인된 ID·저자 이름·제목 일치로 불러온 범위 정렬 |
| ID 변환 후 바로 검색 | 실제 Wikidata 항목에 병합 전 Open Library ID 존재 | redirect 레코드 대상 확인, 횟수·ID 형식 제한 |
| 작품 카드만 표시 | 같은 제목과 번역·판본의 혼동 | 작품 ID 중복 제거 + 실제 판본 목록/판본 ID 별도 표시 |
| 명언 원문 검색과 0건 정규화 | 부분 단어 후보가 많고 핵심 구절 시도 부족 | 전체 문장·등록 번역 표현/핵심 구절 최대 2회 보완 |
| 단순 페이지 메모리 캐시 | 페이지 상태·부분 성공 관리 부족 | 방식/정규화 검색어/선택 ID별 캐시와 페이지 상태 복사 |

## 2. 사용한 검색 구조

### 도서·저자

- Open Library의 원래 검색을 유지하고 Wikidata를 보완합니다. `wbsearchentities`는 최대 8개 항목, `wbgetentities`는 한 번에 항목 정보를 가져옵니다.
- 입력 문자로 검색 언어를 정하고 필요하면 두 번째 언어/구두점 표기를 시도합니다. 라벨·별칭은 한국어·영어·프랑스어·일본어·중국어·독일어·스페인어·러시아어를 대조합니다. 사람은 Q5, 작품은 P648의 OL…W ID를 확인합니다. 저자 ID가 없으면 확인한 같은 인물의 이름으로 보완하되 연결 정보를 표시합니다.
- 동명이인·같은 제목 또는 잘린 항목 검색은 자동 선택하지 않습니다. 설명과 Wikidata 링크를 보고 사용자가 선택할 수 있습니다. 한국 작가의 기존 결과도 삭제하지 않습니다.
- 확인한 저자 ID는 `q=author_key:(ID OR ...)`, 작품은 `q=key:(/works/ID OR ...)`로 조회합니다. 오래된 ID가 0건이면 Open Library의 `/type/redirect`와 `location`을 확인하며 최대 2개 ID·각 2단계만 따라갑니다. 외부 주소를 임의로 따라가지 않습니다.
- 결과 ID를 병합해 중복을 제거하고 최초 10권을 표시합니다. 제목이 같아도 다른 작품 ID는 삭제하지 않습니다. 더 보기는 기존 카드와 열린 판본 목록을 유지합니다. 늦은 응답은 요청 버전으로 무시합니다.
- 판본은 `/works/OL…W/editions.json?limit=10&offset=...`의 실제 `entries/size`를 사용합니다. OL…M 판본 ID·제목·출판일·언어와 원문 링크를 별도로 표시하고 판본 더 보기도 지원합니다. 저장은 기존 OL…W 작품 ID를 사용하므로 판본을 별도의 새 책으로 자동 저장하지 않습니다.
- 초기 정렬은 확인된 인물/작품 ID, 정확한 저자·제목 일치를 우선합니다. 공저자 수가 많은 선집은 단독 저자 작품보다 뒤에 배치합니다. 전체 카탈로그를 미리 읽어 전역 순위를 보장하지 않으며 추가 결과는 기존 순서를 보존해 뒤에 붙입니다.

### 명언

- Wikiquote 원래 입력을 먼저 검색합니다. 전체 문구 일치가 약하면 따옴표를 사용한 전체 문장, 기존 문헌으로 확인한 번역 표현 또는 원래 입력의 짧은 핵심 구절로 최대 2회 추가 요청합니다. 새 번역이나 저자·출처를 생성하지 않습니다.
- pageid로 중복을 제거하고 스니펫의 전체 문구·연속 구절·단어 일치로 정렬합니다. 짧은 구절 확장으로만 찾은 후보의 점수는 보수적으로 낮춥니다. 최종 후보는 최대 10개입니다.
- 모든 Wikiquote 카드는 ‘관련 문서 후보 / 출처 미확인’입니다. 기존 별도 문헌 대조 목록은 수정하거나 항목을 추가하지 않았으며 일반 명언 검색 평가와 분리합니다. 알려지지 않은 문장에 확인 배지를 만들지 않습니다.

### 성능·장애

- 외부 호스트별 동시 요청 1개, 시작 간격 최소 1초. HTTP 429는 Retry-After 또는 기본 30초 동안 추가 호출을 중단합니다. 서버가 실패해도 우회 프록시나 다른 주소로 제한을 피하지 않습니다.
- 개별 요청 8초, 항목 보완 9초, 명언 확장 6초, 화면 요청 전체 20초 제한. 선택적 보완이 실패하거나 시간이 끝나도 이미 성공한 결과를 보존합니다.
- 검색 상태 20개, 항목 40개, 판본 페이지 30개를 메모리에 캐시합니다. 동일 진행 중 검색은 중복 실행하지 않습니다. 추가 조회 실패는 offset을 진행시키지 않으며 사용자 재시도를 지원합니다.
- 저장소·외부 HTML 삽입 방식은 바꾸지 않았습니다. 모든 외부 텍스트는 textContent로 표시하고 스니펫은 태그 제거 후 120자로 제한합니다. 원문 링크는 검증한 고정 도메인에서 생성합니다.

## 3. 실제 Chrome 전후 비교

아래는 같은 28개 검색어를 개선 전후 실제 외부 API와 Chrome으로 실행한 **최초 화면 표시 수**입니다. 전체 카탈로그의 고유 건수나 정확도 점수가 아닙니다. ‘더 보기’가 있으면 이후 작품을 이어 볼 수 있습니다. 모호한 항목을 아직 선택하지 않은 초기 상태도 그대로 기록했습니다.

| 방식 | 검색어 | 이전 표시 | 개선 후 표시 | 추가 결과 | 비고 |
| --- | --- | ---: | ---: | --- | --- |
| 저자 | 한강 | 10 | 10 | 있음 | 항목 선택 대기 |
| 저자 | 김영하 | 2 | 2 | 없음 | 항목 선택 대기 |
| 저자 | 김초엽 | 4 | 4 | 없음 |  |
| 저자 | 베르나르 베르베르 | 1 | 10 | 있음 |  |
| 저자 | 폴 발레리 | 10 | 10 | 있음 |  |
| 저자 | 헤르만 헤세 | 10 | 10 | 있음 |  |
| 저자 | 무라카미 하루키 | 10 | 10 | 있음 |  |
| 저자 | 조앤 K. 롤링 | 10 | 10 | 있음 |  |
| 저자 | Bernard Werber | 10 | 10 | 있음 |  |
| 저자 | Paul Valéry | 10 | 10 | 있음 | 항목 선택 대기 |
| 저자 | Paul Valery | 10 | 10 | 있음 | 항목 선택 대기 |
| 저자 | Hermann Hesse | 10 | 10 | 있음 | 항목 선택 대기 |
| 저자 | Haruki Murakami | 10 | 10 | 있음 | 항목 선택 대기 |
| 저자 | J. K. Rowling | 10 | 10 | 있음 | 항목 선택 대기 |
| 저자 | 김영하 신인작가 987654321 | 0 | 0 | 없음 |  |
| 제목 | 채식주의자 | 1 | 1 | 없음 |  |
| 제목 | 소년이 온다 | 1 | 1 | 없음 |  |
| 제목 | 개미 | 0 | 0 | 없음 | 항목 선택 대기 |
| 제목 | Le Petit Prince | 10 | 10 | 있음 |  |
| 제목 | The Little Prince | 10 | 10 | 있음 | 항목 선택 대기 |
| 제목 | Harry Potter | 0 | 10 | 있음 | 이전 검사 API 시간 초과; 알고리즘 개선 수치로 단정하지 않음 |
| 제목 | zxqv987654321unlikelybook | 0 | 0 | 없음 |  |
| 명언 | 바람이 분다 살아야겠다 | 10 | 10 | 없음 | 출처 미확인 후보 수 |
| 명언 | 가장 중요한 것은 눈에 보이지 않아 | 10 | 10 | 없음 | 출처 미확인 후보 수 |
| 명언 | 죽는 날까지 하늘을 우러러 한 점 부끄럼이 없기를 | 2 | 2 | 없음 | 출처 미확인 후보 수 |
| 명언 | 사람이 온다는 건 실은 어마어마한 일이다 | 4 | 4 | 없음 | 출처 미확인 후보 수 |
| 명언 | 나는 생각한다 고로 존재한다 | 10 | 10 | 없음 | 출처 미확인 후보 수 |
| 명언 | 없는문장zxqv987654321 | 0 | 0 | 없음 | 출처 미확인 후보 수 |

추가로 일본어 `村上春樹`, 프랑스어 악센트 `Émile Zola` 모두 실제 Chrome에서 10권과 더 보기를 확인했습니다. 실제 테스트 명단은 검증용 임시 파일에만 있었으며 런타임 검색 엔진에 작가나 작품별 예외 목록을 넣지 않았습니다.

추가 동작 검증:

- 베르나르 베르베르는 1권에서 첫 10권으로 확장됐고 더 보기로 20·30권까지 실제 확인했습니다. 이 30은 표본 검사 범위이며 작가의 전체 작품 수가 아닙니다.
- 김영하는 동명이인 중 소설가를 직접 선택한 뒤 기존 2권보다 많은 작품을 확인했습니다. 개미는 작품 항목을 선택한 뒤 실제 도서가 표시됐습니다.
- The Little Prince는 같은 제목의 다른 자료와 구별하기 위해 원작 항목을 선택했습니다. Wikidata Q25338의 OL10264W가 실제 redirect 레코드로 OL10263W를 가리켰고, 이를 확인한 뒤 생텍쥐페리 원작이 앞에 표시됐습니다.
- 폴 발레리 검색의 공저 선집은 단독 저자 작품보다 뒤로 이동했습니다. 라틴 문자 검색에 섞인 학술행사와 실제 작가는 동명이인/항목 선택 안내로 구분합니다.
- 명언 후보에 르네 데카르트가 추가됐지만 이를 문장의 확정 출처로 표시하지 않습니다. ‘사람이 온다는…’ 등 일부 문장은 여전히 관련성이 낮은 후보가 나타납니다. 명언 전반의 출처 정확도가 해결됐다고 보고하지 않습니다.
- 전후 검사 중 Harry Potter 시간 초과, 명언 API의 일시 실패가 관찰됐습니다. 최종 명언 6개는 요청 간격을 적용한 실제 재검사에서 모두 통신 오류 없이 완료했습니다. 외부 서비스의 항상 성공을 보장하지 않습니다.

## 4. 데이터 소스 검토

| 소스 | 비용·키 | 브라우저/Pages | 한국어·정확도·제한 | 결정 |
| --- | --- | --- | --- | --- |
| Open Library | 기본 공개 조회 키 없음 | 실제 Chrome CORS 확인, 정적 사용 | 한국어 표기와 서지 품질의 차이. 기본 비식별 요청 1초 1회 | 기존 검색 유지, ID·페이지·판본 보완 |
| Wikidata | 공개 구조화 데이터 CC0, 키 없음 | 실제 CORS 확인 | 다국어 라벨/별칭과 외부 ID, 누락·동명이인 있음. 429·서비스 정책 준수 | 확인 가능한 인물·작품 연결만 사용 |
| 한국어 Wikiquote | 공개 읽기 키 없음 | origin=* 실제 확인 | 한국어 문서 범위·번역 표현 한계. 인용 원문 권리는 별도 | 후보 검색·짧은 스니펫·원문 안내 유지 |
| Google Books | 공식 문서상 공개 데이터에도 API key 또는 OAuth 식별 필요 | 브라우저 이용 문서 있음, 이번 실제 CORS/할당량 미검증 | 한국어 범위·이번 정확도 미검증, 별도 프로젝트/사용 조건 필요 | 검토만, 런타임 추가하지 않음 |
| 네이버 책 검색 | Client ID/Secret 필요, 문서상 일 25,000회 | 직접 CORS 이번 미검증, 정적 코드에 Secret 포함 부적절 | 한국어 서비스이나 이번 실제 응답 정확도 미검증 | 검토만, 인증정보 넣지 않음 |

공식 근거: [Open Library 사용 지침·제한](https://openlibrary.org/developers/api), [Search API](https://openlibrary.org/dev/docs/api/search), [Wikidata 데이터·CC0·429 지침](https://www.wikidata.org/wiki/Wikidata:Data_access), [MediaWiki Search](https://www.mediawiki.org/wiki/API:Search), [Google Books 식별 요건](https://developers.google.com/books/docs/v1/using), [네이버 책 검색](https://developers.naver.com/docs/serviceapi/search/book/book.md). 표지·인용문은 메타데이터와 별개의 권리가 있을 수 있으므로 기존 제공처·원문·재사용 안내를 유지합니다. 무료 조회가 임의 콘텐츠 복제 허가라는 의미는 아닙니다.

## 5. 최종 검증

서로 다른 검사 이름 기준 **71 PASS, FAIL 0**입니다. 전후 검색어 28개 비교와 추가 원어명 2개는 별도 실측 자료입니다. 기능 검사의 PASS는 검색 출처 정답률 100%를 뜻하지 않습니다.

| 항목 | 결과 | 방법 |
| --- | --- | --- |
| 한국 작가 3명·외국 작가 한국어 5명·원어/악센트 | PASS | 실제 Open Library·Wikidata·Chrome |
| 동명이인·번역 제목 항목 선택 | PASS | 실제 Chrome의 설명·선택 UI와 API |
| 제목·저자 최초 10·20·30권 조회 | PASS | 실제 API·더 보기 클릭 |
| 동일 제목의 다른 작품·작품 ID 중복 | PASS | 모의 응답에서 25개 원시 항목의 24개 고유 작품까지 도달 |
| 실제 판본·번역 목록·판본 추가 페이지 | PASS | 실제 editions API·판본 ID·출판일·언어·원문 링크 |
| 판본 중복·오류 후 보존·재시도 | PASS | 모의 entries·503 응답 |
| 추가 조회 중 카드/열린 판본 목록 보존 | PASS | 실제 Chrome DOM 동일성 확인 |
| 명언 6종·빈 결과·후보/대조자료 구분 | PASS | 실제 Wikiquote + 기존 자료. 출처 정확도는 별개 |
| 명언 핵심 구절·순위·중복·부분 성공 | PASS | 실제 후보 비교 및 모의 응답 |
| 단일 API 장애·시간 초과·429 대기 | PASS | 모의 실패·중단 신호·Retry-After |
| 연속 검색·캐시·offset 보존 | PASS | 모의 지연/역순 응답·호출 수 |
| CRUD·저장·중복·새로고침·브라우저 재실행 | PASS | 임시 프로필 실제 Chrome |
| PC·태블릿·모바일 너비·콘솔 | PASS | 1440·768·390·320px, 예외/console.error 감지 0건 |
| Pages 하위경로 | PASS | 로컬 /1030-work/에서 앱·엔진·JSON HTTP 200 |
| 실물 모바일·다른 브라우저·실제 Pages URL | 미검증 | 배포하지 않음 |
| 전 문학 작품·모든 번역 제목·명언의 정확한 출처 | 미검증 | 데이터 범위상 완전성 보장 불가 |

검증 중 Chrome 종료가 지연된 한 번의 테스트 도구 오류는 격리된 프로세스만 정리하고 저장 유지·하위경로 검사를 재실행해 통과했습니다. 사용자 Chrome 프로필은 건드리지 않았습니다.

## 6. 변경 파일과 남은 한계

생성: `search-engine.js`, 이 보고서. 수정: `api.js`, `api.html`, `css/assignment.css`, `README.md`, `QA_REPORT.md`. 기존 CRUD·문헌 대조 데이터·백업 커밋은 그대로입니다.

모든 언어의 이름, 모든 카탈로그 레코드, 번역 제목을 연결할 수는 없습니다. 항목에 외부 ID가 없거나 동명이인인 경우 사용자의 선택·원어 검색이 필요합니다. 실제 서지의 중복 작품 ID, 잘못된 저자 정보, 번역/판본 메타데이터 누락도 남을 수 있습니다. 동일 제목을 무리하게 병합해 서로 다른 작품을 지우지 않습니다.

명언은 키워드·문구 검색이며 의미 기반 번역 검색이나 출처 판정 서비스가 아닙니다. 스니펫이 실제 문장의 일부를 포함하지 않거나 문서가 없으면 잘못된 후보가 남을 수 있습니다. 기존 수동 문헌 목록은 별도 확인 자료일 뿐 일반 명언의 정답률을 대신하지 않습니다. 추가 개선은 공인된 한국어 서지/전거 데이터와 사용 허가된 인용 자료를 검토한 뒤 진행해야 합니다.

페이지네이션은 데이터가 바뀌지 않는다는 전제에서 offset을 사용합니다. 검색 중 서버 색인이 변하거나 두 출처가 겹치므로 전체 고유 건수를 단순 합산하지 않습니다. 정렬은 현재 불러온 범위 안에서만 적용합니다. 실제 배포·제출 URL 검증은 수행하지 않았습니다.

<details>
<summary>검사 로그 (중복 이름 제외, 71개)</summary>

```text
PASS CRUD delete preserves original
PASS CRUD manual create
PASS CRUD reads API and original
PASS CRUD update retains ID
PASS CRUD whitespace validation
PASS HTML snippet not inserted
PASS HTTP 429 cooldown prevents repeat host requests
PASS JavaScript exceptions and console.error none
PASS LIVE all final quote calls completed without API error
PASS LIVE author identity expands nonempty Korean result
PASS LIVE author more keeps first page
PASS LIVE author third page
PASS LIVE chosen Korean novelist expanded
PASS LIVE edition metadata and trusted work link
PASS LIVE edition pagination appends
PASS LIVE edition publication language and original links
PASS LIVE editions API shows actual edition IDs
PASS LIVE final author search
PASS LIVE homonyms require selection
PASS LIVE load-more button click
PASS LIVE native Enter author search
PASS LIVE save duplicate and preserve existing
PASS LIVE selected original title ranked first
PASS LIVE title pagination
PASS LIVE translated title explicit work search
PASS LIVE translated title offers verified work
PASS LIVE unknown phrase has zero and no fabricated source
PASS LIVE work more preserves expanded card DOM
PASS Pages subpath HTTP 200 api.html
PASS Pages subpath HTTP 200 api.js
PASS Pages subpath HTTP 200 crud.js
PASS Pages subpath HTTP 200 css/assignment.css
PASS Pages subpath HTTP 200 data/quote-references.json
PASS Pages subpath HTTP 200 index.html
PASS Pages subpath HTTP 200 search-engine.js
PASS all 24 unique works reachable and end hidden
PASS base outage can still show supplement
PASS book results and pagination 1440px no overflow
PASS book results and pagination 320px no overflow
PASS book results and pagination 390px no overflow
PASS book results and pagination 768px no overflow
PASS browser restart preserves JSON and renders
PASS cached loaded pages no extra calls
PASS edition JavaScript errors none
PASS edition entries are distinct from work IDs
PASS edition failure preserves existing entries
PASS edition pagination deduplicates edition IDs
PASS edition retry keeps offset and reaches end
PASS empty full search expands bounded core phrase
PASS expanded editions 1440px no overflow
PASS expanded editions 320px no overflow
PASS expanded editions 390px no overflow
PASS expanded editions 768px no overflow
PASS frame runtime errors none
PASS mock initial fills 10 unique IDs
PASS old response cannot overwrite latest
PASS pagination failure does not advance offset
PASS pagination failure preserves cards and retry
PASS quote full phrase ranked and duplicates removed
PASS quote layout 320px
PASS quote layout 390px
PASS quote layout 768px
PASS quote partial success survives later errors
PASS quote remains unverified and safe links
PASS redirect record resolves canonical work and ranking
PASS reload storage persists
PASS same titles with different work IDs retained
PASS strong full sentence avoids expansion
PASS supplement outage preserves base success
PASS timeout reports error and clears loading
PASS verified source merged even with existing result
```

</details>
