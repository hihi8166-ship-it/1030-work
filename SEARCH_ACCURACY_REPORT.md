# 검색 정확도 원인 분석 및 개선 결과

확인일: 2026-10-30 (Asia/Seoul). Git 백업 `af7e5f0` 보존. Git 커밋·push·Pages 배포는 실행하지 않았습니다.

## 1. Open Library 실제 응답 비교

아래 수치는 수정 전에 읽기 전용으로 요청한 실제 JSON의 `numFound` 및 `docs.length`입니다. 조사 요청에는 `author=입력값`, `limit=10`, `fields=key,title,author_name,author_key,first_publish_year,cover_i`를 동일하게 사용했습니다. `author_key` 필드 추가는 비교를 위한 것이며 앱의 기존 표시 구조는 그대로 유지합니다.

| 입력 | HTTP | 전체 결과 numFound | 반환 docs | 저자·작품 존재 |
| --- | --- | --- | --- | --- |
| 폴 발레리 | 200 | 0 | 0 | 빈 배열 |
| Paul Valéry | 200 | 889 | 10 | `Paul Valéry` / `Monsieur Teste` 등 있음 |
| Paul Valery | 200 | 889 | 10 | 위와 같은 작가·작품 정보 있음 |
| 헤르만 헤세 | 200 | 0 | 0 | 빈 배열 |
| 한강 | 200 | 37 | 10 | `Han Kang`, `채식주의자`, `소년이 온다` 등 있음 |

요청 주소는 `https://openlibrary.org/search.json`이고 검색어는 URL 인코딩했습니다. HTTP 200과 CORS `*`를 확인했습니다. 결과 수는 API 데이터가 바뀌면 달라질 수 있습니다.

**원인:** 현재 예시에서는 악센트 유무보다 한국어 표기 연결 여부가 결과 차이를 만듭니다. 기존 앱은 `author=한국어 이름` 응답을 그대로 최대 10개 표시하므로 0건을 화면에서 누락시킨 것이 아닙니다. 라틴 문자 검색은 유효한 작품 정보를 반환하지만 첫 결과에 인명과 비슷한 학술행사 저자도 포함되어 있어, 문자 검색 순위만으로 특정 인물의 ID를 추정해서는 안 됩니다.

## 2. 검증된 다국어 인명 연결

[Wikibase 공식 API](https://www.mediawiki.org/wiki/Wikibase/API)의 실제 응답을 확인했습니다.

| 항목 | 한국어 이름 | 외국어 이름 | 인물 유형 | Open Library ID |
| --- | --- | --- | --- | --- |
| Q200639 | 폴 발레리 | Paul Valéry | P31=Q5 | OL4280541A, OL60350A, OL2088611A, OL4495406A |
| Q25973 | 헤르만 헤세 | Hermann Hesse | P31=Q5 | OL76437A |
| Q5646626 | 한강 | Han Kang | P31=Q5 | OL2671323A |

`한강`은 Wikidata 검색에서 강 이름과 작가 항목이 함께 반환됐습니다. 폴 발레리 검색에는 대학도 포함됐습니다. 따라서 검색 1위를 그대로 번역 이름으로 사용하지 않습니다.

구현 순서:

1. 기존 Open Library 저자 검색을 먼저 실행합니다. 1건이라도 있으면 그대로 유지하고 Wikidata를 호출하지 않습니다.
2. 한국어 입력이 0건일 때만 `wbsearchentities`로 최대 5개 후보를 요청합니다.
3. 후보 ID를 모아 `wbgetentities` 1회로 한국어 이름·별칭, 사람 여부, Open Library 저자 ID를 확인합니다. 폐기된(deprecated) 주장은 제외합니다.
4. 이름이 정확히 맞고 사람이며 유효한 저자 ID가 있는 항목이 유일할 때만 자동 연결합니다. 검색이 잘렸거나 동명이인이 있으면 사용자가 설명·Wikidata 링크를 확인하고 직접 선택합니다.
5. 연결한 P648 저자 ID들로 `q=author_key:(ID OR ID...)`, `limit=10` 검색을 실행합니다. 해당 ID 검색은 실제 HTTP 200, 총 783건, 반환 10건을 확인했습니다. 공저/선집도 포함될 수 있습니다.
6. 보완 결과가 없거나 인명 API가 실패하면 원래 결과를 유지하고 안내합니다. 작가별 한국어→영어 고정 매핑은 없습니다.

인명 정보는 페이지 메모리에 최대 30개, 도서 검색은 20개 캐시합니다. 보완 단계 전체는 5초로 제한하고 상위 검색 취소와 연결했습니다. 최초 한국어 0건 검색은 최대 4회 요청입니다. 실제 Chrome 최종 검사에서 폴 발레리는 **4회, 약 5.89초**였고 같은 검색 반복은 추가 요청 0회였습니다. 이는 한 번의 측정값이며 항상 같은 속도를 보장하지 않습니다. 정상 결과가 있던 한강은 Open Library 1회만 호출했습니다.

## 3. Wikiquote 실제 검색과 원인

모든 요청은 `https://ko.wikiquote.org/w/api.php`의 `action=query&list=search&srnamespace=0&srlimit=10&srprop=snippet&format=json&origin=*`에 각 `srsearch`를 전달했습니다.

| 입력 | HTTP | 전체 totalhits | 관찰 |
| --- | --- | --- | --- |
| 바람이 분다 살아야겠다 | 200 | 13 | 상위 10개에 재봉틀, 김민기, 속담 등. 기대한 작가·작품 없음 |
| 바람이 분다 | 200 | 1 | 가나다순 한국 속담 |
| 살아야겠다 | 200 | 392 | ‘살’ 등 일부 표현이 강조되는 광범위한 결과 |
| 살아야 한다 | 200 | 392 | 여러 인물·주제 문서 |
| 폴 발레리 | 200 | 0 | 결과 없음 |
| 해변의 묘지 | 200 | 0 | 결과 없음 |

추가로 `action=query&prop=info&titles=폴 발레리|해변의 묘지&redirects=1`을 요청했고 HTTP 200에서 두 제목 모두 `missing`임을 확인했습니다. 폴 발레리 Wikidata 항목에도 한국어 Wikiquote 연결이 없었습니다.

**원인:** 이 검색은 입력 문장의 의미를 번역해 출처를 식별하는 서비스가 아닙니다. 실제 응답은 부분 단어와 관련된 문서를 반환했고, 두 제목의 한국어 문서도 현재 존재하지 않습니다. 한국어 번역 표현의 차이도 실제 서지 자료에서 확인했습니다. 단순 공백·구두점 정리로 없는 문서를 생성하거나 다른 번역을 자동 추론할 수는 없습니다.

## 4. 명언 보완과 증거

- 원래 Wikiquote 검색과 후보를 유지합니다. 원래 입력이 0건일 때만 NFKC·일부 구두점·공백 정리 후 한 번 더 요청합니다. 문장 뜻이나 어미를 임의로 바꾸지 않습니다.
- 별도 `data/quote-references.json`은 검토한 표현·작가·작품·출처 링크·검토일을 기록하는 확장 가능한 목록입니다. 현재 한 작품, 등록 표현 4개만 포함합니다. 유사도나 생성 모델로 출처를 추측하지 않습니다.
- 공백·구두점만 제외한 등록 표현과 정확히 일치할 때 ‘문헌으로 대조한 출처 자료’를 표시합니다. Wikiquote 후보 영역·개수와 섞지 않습니다.
- 관련 문서 후보는 모두 계속 ‘출처 미확인’입니다. 문헌 자료는 작가·작품 연결을 확인한 것으로 표시하되 특정 한국어 번역자·판본 문구는 확정하지 않습니다. 원문을 대량 복제하지 않고 서지 정보와 근거 링크를 제공합니다.

확인 근거:

1. [프랑스어 원문](https://fr.wikisource.org/wiki/Le_Cimeti%C3%A8re_marin): Paul Valéry의 작품 제목과 마지막 절의 대응 구절을 확인했습니다.
2. [충북도정소식](https://www.chungbuk.go.kr/cbnews/selectBbsNttView.do?bbsNo=2953&key=5218&nttNo=399856&pageIndex=2203&pageUnit=10&searchCnd=all&searchCtgry=&searchKrwd=): 사용자 문장과 띄어쓰기만 다른 한국어 구절에 폴 발레리·해변의 묘지라는 주석이 있습니다.
3. [국회도서관 서지 및 출판사 소개](https://dl.nanet.go.kr/detail/MONO1201642435): 작가·시선집·수록 작품 및 서로 다른 한국어 번역 표현을 확인했습니다. 책소개는 도서관이 수록한 출판사 소개임을 구분합니다.

따라서 사용자 예시는 별도 문헌 영역에서 폴 발레리·「해변의 묘지」로 안내할 수 있지만, 임의의 한국어 문장이나 Wikiquote 유사 검색 결과에 같은 확정 표시를 붙이지 않습니다. 자동 도서 저장도 하지 않습니다.

## 5. 검증 결과

Chrome headless 실제 프로세스·임시 브라우저 프로필로 검사했습니다. 최종 **53개 PASS, FAIL 0개**이며 파일 보존·HTTP 경로 검사도 포함합니다. 실제 데이터와 모의 검사를 아래처럼 구분합니다.

| 항목 | 결과 | 실행 방식 |
| --- | --- | --- |
| 폴 발레리 → 도서 표시·인명 연결 근거 | PASS | 실제 Open Library·Wikidata, 실제 Chrome CORS·Enter 입력 |
| Paul Valéry / Paul Valery | PASS | 실제 Open Library·Chrome |
| 헤르만 헤세 | PASS | 실제 다국어 조회·Chrome |
| 한강 | PASS | 실제 한국어 저자 결과 보존, Wikidata 호출 없음 |
| 기존 제목 검색 | PASS | 실제 Harry Potter 검색·Chrome |
| 바람이 분다 살아야겠다 | PASS | 실제 Wikiquote 후보 유지 + 별도 문헌 자료 표시 |
| 문장 부호·검증된 번역 표현 | PASS | 실제 검색과 로컬 근거 목록의 등록 표현 매칭 |
| 미등록 문장 | PASS | 근거 자료를 임의로 표시하지 않음 |
| 이름 연결 캐시·요청 수 | PASS | 실제 요청 계측 및 같은 검색 반복 |
| 기존 결과·서비스 장애·장애 후 재시도 | PASS | Chrome에서 모의 응답·네트워크 실패 |
| 동명이인·강 이름·명시적 선택 | PASS | 모의 Wikidata 인물/비인물 응답. 자동 오연결 없음 |
| 보완 시간 초과·자료 파일 실패/복구 | PASS | Chrome의 모의 타이머·중단 신호, 기본 검색 계속 동작 |
| 정규화 재검색·연속 검색 충돌 | PASS | 모의 요청/응답 순서 역전·늦은 오류 |
| CRUD·API 저장·중복 방지 | PASS | 실제 Chrome·임시 저장소, ID·선택 표지 정보 보존 |
| 새로고침·브라우저 재실행 | PASS | 저장된 JSON 유지 확인 |
| 반응형·콘솔 | PASS | 1440·768·390·320px 넘침 없음, 캡처 검토, 감지한 예외/console.error 0건 |
| 하위경로·JSON 자산 | PASS | `/1030-work/`에서 HTML·JS·CSS·JSON HTTP 200 |
| 기존 파일 보존 | PASS | index.html·crud.js·PROJECT_STATE.md·VS Code 설정 해시 동일 |
| 실물 모바일·다른 브라우저·실제 Pages 주소 | 미검증 | 실제 배포하지 않음 |

## 6. 변경 파일과 한계

변경: `api.js`(일반 인명 연결·장애 격리·캐시·문헌 표시), `api.html`(분리된 안내 영역), `css/assignment.css`(기존 색상의 반응형 안내 스타일), `README.md`, `QA_REPORT.md`. 생성: `data/quote-references.json`, 이 보고서.

저장 키 `my-book-library.books.v1`과 기존 도서 구조/ID는 변경하지 않았습니다. 사용자 브라우저 데이터는 접근·삭제하지 않았습니다. 기존 작업 변경과 백업 커밋을 보존했습니다.

Wikidata 이름·별칭·저자 ID가 없거나 중복된 인물은 자동 연결할 수 없습니다. 데이터 자체의 오류와 Open Library 서지의 공저·중복·누락까지 보장하지 않습니다. 원래 저자 검색에 결과가 있으면 그대로 유지하므로 그 기존 검색의 정확도를 별도로 보증하지 않습니다. 인명 정보 확인 링크를 제공합니다.

문헌 대조 목록은 현재 한 작품뿐이며 전 문학 작품을 역검색하는 서비스가 아닙니다. 자료를 늘릴 때에는 표현·작가·작품·근거 링크를 직접 검토해야 합니다. 실제 공개 배포와 URL 검증은 이번 작업에 포함하지 않았습니다.

<details>
<summary>최종 검사 실행 로그 (53개)</summary>

```text
PASS LIVE Korean Paul returns books
PASS LIVE exact Wikidata identity and author IDs
PASS repeated Korean search cached
PASS LIVE Korean author book save keeps original and API ID
PASS duplicate prevented
PASS LIVE accented original search
PASS LIVE unaccented original search
PASS LIVE second Korean foreign author
PASS LIVE Korean writer retains original books
PASS LIVE title unchanged
PASS LIVE original Wikiquote candidates retained
PASS LIVE verified reference separate from candidates
PASS reference evidence and no automatic saving
PASS punctuation reference normalization
PASS documented translation variant
PASS unknown quote never gets verified answer
PASS existing results survive without Wikidata dependency
PASS Wikidata failure preserves original empty result
PASS supplement failures not frozen in cache
PASS ambiguous humans never auto-selected
PASS explicit identity selection uses bound original query and ID
PASS non-human matching label rejected
PASS normalized quote retry used without invented source
PASS old success cannot replace latest
PASS old failure cannot clear current loading
PASS base API errors still reported
PASS CRUD read existing and API books
PASS API update keeps ID metadata
PASS manual create distinct ID
PASS manual update
PASS reload retains cards
PASS delete API and manual preserving original
PASS frame runtime errors none
PASS LIVE Korean author Enter search
PASS quote reference layout 1440px
PASS quote reference layout 768px
PASS quote reference layout 390px
PASS quote reference layout 320px
PASS application runtime and console errors none
PASS browser restart keeps JSON
PASS Pages subpath HTTP 200 api.html
PASS Pages subpath HTTP 200 api.js
PASS Pages subpath HTTP 200 css/assignment.css
PASS Pages subpath HTTP 200 data/quote-references.json
PASS file unchanged index.html
PASS file unchanged crud.js
PASS file unchanged PROJECT_STATE.md
PASS file unchanged .vscode/settings.json
PASS supplement timeout preserves original and releases loading
PASS reference file timeout does not block Wikiquote
PASS reference fetch can recover after failure
PASS blank input clears old evidence and identity
PASS quote normalization is a real second request
```

</details>
