"use strict";

const API_STORAGE_KEY = "my-book-library.books.v1";
const searchForm = document.querySelector("#search-form");
const queryInput = document.querySelector("#search-query");
const searchButton = document.querySelector("#search-button");
const resultsList = document.querySelector("#search-results");
const resultsSection = document.querySelector("#search-results-section");
const searchFeedback = document.querySelector("#search-feedback");
const saveFeedback = document.querySelector("#save-feedback");
const searchCache = new Map();
const loadMoreButton = document.querySelector("#load-more");
let searchSession = null;
const editionControllers = new Set();
let quoteReferencePromise = null;
const modeInputs = document.querySelectorAll('input[name="search-mode"]');
const searchModes = {
  title: { label: "책 제목", placeholder: "예: Harry Potter" },
  author: { label: "저자명", placeholder: "예: Hermann Hesse, J. K. Rowling" },
  quote: { label: "명언·문장", placeholder: "예: 가장 중요한 것은 눈에 보이지 않아" }
};
let activeRequest = null;
let requestVersion = 0;

// 진행 중인 요청을 취소하고 번호를 바꿔 늦게 도착한 이전 응답을 무시합니다.
function cancelSearch() {
  requestVersion += 1;
  if (activeRequest) activeRequest.controller.abort();
  activeRequest = null;
  loadMoreButton.disabled = false;
  loadMoreButton.textContent = "더 보기";
  searchButton.textContent = "검색";
  resultsSection.setAttribute("aria-busy", "false");
}

// 검색 방식 변경 시 입력 안내와 결과를 초기화합니다. 캐시는 방식별로 유지합니다.
function changeSearchMode() {
  cancelSearch();
  searchSession = null;
  loadMoreButton.hidden = true;
  const mode = document.querySelector('input[name="search-mode"]:checked').value;
  const label = searchModes[mode].label;
  document.querySelector("#search-heading").textContent = `${label}으로 검색`;
  document.querySelector('label[for="search-query"]').textContent = label;
  queryInput.value = "";
  queryInput.placeholder = searchModes[mode].placeholder;
  document.querySelector("#search-hint").textContent = mode === "quote"
    ? "한국어 Wikiquote의 관련 문서 후보를 최대 10개 찾습니다. 정확한 출처를 확정하는 검색이 아닙니다."
    : mode === "author" ? "여러 언어의 이름·별칭과 확인된 저자 ID를 함께 검색합니다. 작품은 10권씩 표시합니다."
    : "원래 제목과 확인 가능한 다국어 작품 ID를 함께 찾습니다. 작품은 10권씩 표시합니다.";
  document.querySelector("#related-search-panel").hidden = true;
  renderAuthorResolution(null);
  renderQuoteReferences([]);
  document.querySelector("#quote-notice").hidden = mode !== "quote";
  document.querySelector("#quote-credit").hidden = mode !== "quote";
  document.querySelector("#results-heading").textContent = mode === "quote" ? "관련 문서 후보" : "검색 결과";
  renderResults([]);
  setMessage(saveFeedback, "");
  setMessage(searchFeedback, `${label}을 입력하고 검색해 주세요.`);
}

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function makeText(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

// API의 key는 작품 식별자입니다. 두 표기 형식을 같은 ID로 통일합니다.
// key 형식: /works/OL82563W 또는 OL82563W
function getWorkId(key) {
  if (typeof key !== "string") return null;
  const match = key.match(/^(?:\/works\/)?(OL\d+W)$/);
  return match ? `openlibrary:${match[1]}` : null;
}

// 누락되거나 예상 형식과 다른 필드를 화면에 안전한 기본값으로 바꿉니다.
function normalizeBook(doc) {
  const authors = Array.isArray(doc.author_name)
    ? doc.author_name.filter((name) => typeof name === "string" && name.trim()) : [];
  return {
    id: getWorkId(doc.key),
    title: typeof doc.title === "string" && doc.title.trim() ? doc.title.trim() : "제목 정보 없음",
    author: authors.length ? authors.join(", ") : "저자 정보 없음",
    year: Number.isInteger(doc.first_publish_year) ? String(doc.first_publish_year) : "정보 없음",
    coverId: Number.isSafeInteger(doc.cover_i) && doc.cover_i > 0 ? doc.cover_i : null
  };
}

// 저장 직전에 최신 배열을 읽어 기존 책을 보존합니다. 잘못된 데이터는 덮어쓰지 않습니다.
function readLibrary() {
  const raw = localStorage.getItem(API_STORAGE_KEY);
  if (raw === null) return [];
  const stored = JSON.parse(raw);
  if (!Array.isArray(stored)) throw new Error("저장 형식 오류");
  const ids = new Set();
  for (const book of stored) {
    if (!book || typeof book.id !== "string" || !book.id || ids.has(book.id) ||
        typeof book.title !== "string" || !book.title.trim() ||
        typeof book.author !== "string" || !book.author.trim() ||
        !["읽을 예정", "읽는 중", "완독"].includes(book.status) || typeof book.memo !== "string") {
      throw new Error("저장 데이터 오류");
    }
    ids.add(book.id);
  }
  return stored;
}

// API 작품 ID를 id로 사용하여 수정 후에도 같은 작품의 중복 등록을 막습니다.
function addToLibrary(book) {
  try {
    const library = readLibrary();
    if (library.some((item) => item.id === book.id)) {
      setMessage(saveFeedback, "이미 내 서재에 있는 책입니다.");
      return;
    }
    const savedBook = {
      id: book.id,
      title: book.title,
      author: book.author,
      status: "읽을 예정",
      memo: ""
    };
    // 선택 필드만 추가하므로 표지 정보가 없는 기존 도서와도 호환됩니다.
    if (book.coverId) savedBook.coverId = book.coverId;
    localStorage.setItem(API_STORAGE_KEY, JSON.stringify([...library, savedBook]));
    setMessage(saveFeedback, `「${book.title}」을(를) 내 서재에 추가했습니다.`);
  } catch (error) {
    setMessage(saveFeedback, "저장하지 못했습니다. 저장 공간, 브라우저 설정 또는 기존 저장 데이터를 확인해 주세요. 기존 데이터는 초기화하지 않았습니다.", true);
  }
}

// API 스니펫의 태그를 제거하고 흔한 HTML 문자 참조만 텍스트로 해석합니다.
// 외부 HTML을 DOM에 파싱하거나 삽입하지 않으며, 출력은 항상 textContent를 사용합니다.
function snippetToText(snippet) {
  if (typeof snippet !== "string") return "관련 문장 일부가 제공되지 않았습니다. 원문을 확인해 주세요.";
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  const text = snippet
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, code) => {
      if (!code.startsWith("#")) return entities[code.toLowerCase()];
      const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
        ? String.fromCodePoint(value) : "�";
    })
    .replace(/\s+/g, " ").trim();
  if (!text) return "관련 문장 일부가 제공되지 않았습니다. 원문을 확인해 주세요.";
  const characters = Array.from(text);
  return characters.length > 120 ? `${characters.slice(0, 120).join("")}…` : text;
}

// 문서 제목을 제안하되 인물/작품을 추측하지 않고 사용자가 방식을 선택하게 합니다.
function prepareRelatedSearch(title) {
  const panel = document.querySelector("#related-search-panel");
  panel.hidden = false;
  document.querySelector("#related-document").textContent = `관련 문서 후보: ${title} · 출처 미확인`;
  const input = document.querySelector("#related-query");
  input.value = title.slice(0, 200);
  input.setCustomValidity("");
  document.querySelector("#related-mode").value = "";
  input.focus();
}

// 후보에는 저장 버튼을 제공하지 않습니다. 실제 도서는 Open Library에서 따로 선택합니다.
function createQuoteCard(doc) {
  const card = document.createElement("article");
  card.className = "book-card quote-card";
  const original = makeText("a", "Wikiquote 원문 보기", "source-link");
  original.href = `https://ko.wikiquote.org/wiki/${encodeURIComponent(doc.title.replace(/ /g, "_"))}`;
  original.target = "_blank";
  original.rel = "noopener noreferrer";
  original.setAttribute("aria-label", `${doc.title} Wikiquote 원문 보기 (새 창)`);
  const button = makeText("button", "관련 도서 검색");
  button.type = "button";
  button.addEventListener("click", () => prepareRelatedSearch(doc.title));
  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.append(button);
  card.append(makeText("span", "관련 문서 후보", "badge"), makeText("h3", doc.title),
    makeText("p", "출처 미확인", "candidate-status"), makeText("p", "검색 결과 일부", "snippet-label"),
    makeText("p", snippetToText(doc.snippet), "quote-snippet"), original, actions);
  return card;
}

// 로컬 문헌 목록도 공통 요청 제한과 오류 검사를 사용합니다.
async function fetchJson(url, signal) {
  return LibrarySearch.fetchJson(url, signal);
}

function externalLink(label, url) {
  const link = makeText("a", label, "source-link");
  link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
  return link;
}

function renderAuthorResolution(resolution) {
  const panel = document.querySelector("#author-resolution");
  panel.replaceChildren(); panel.hidden = !resolution;
  if (!resolution) return;
  panel.append(makeText("h2", resolution.kind === "title" ? "다국어 작품 연결" : "다국어 인명 연결"));
  if (resolution.selected) {
    const person = resolution.selected;
    panel.append(makeText("p", `${resolution.query} → ${person.name}`),
      makeText("p", person.description, "hint"), externalLink("Wikidata 항목 확인", `https://www.wikidata.org/wiki/${person.id}`));
  } else {
    panel.append(makeText("p", resolution.note));
    for (const person of resolution.candidates || []) {
      const row = document.createElement("div"); row.className = "identity-option";
      const button = makeText("button", `${person.label} · ${person.name} 선택`, "secondary");
      button.type = "button";
      button.addEventListener("click", () => {
        queryInput.value = resolution.query;
        searchBooks({ preventDefault() {} }, person);
      });
      row.append(makeText("p", person.description, "hint"),
        externalLink("항목 정보 확인", `https://www.wikidata.org/wiki/${person.id}`), button);
      panel.append(row);
    }
  }
}

// 별도 문헌 대조 목록은 정확히 등록된 표현에만 연결합니다. 위키 검색 결과와 섞지 않습니다.
function normalizeQuoteReference(text) {
  return text.normalize("NFKC").replace(/[\s“”"‘’'.,!?…·。！？]/g, "").toLowerCase();
}

async function findQuoteReferences(query) {
  try {
    if (!quoteReferencePromise) quoteReferencePromise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const records = await fetchJson("data/quote-references.json", controller.signal);
        if (!Array.isArray(records)) throw new Error("대조 자료 형식 오류");
        return records;
      } finally { clearTimeout(timer); }
    })().catch((error) => { quoteReferencePromise = null; throw error; });
    const records = await quoteReferencePromise;
    const normalized = normalizeQuoteReference(query);
    return records.filter((record) => Array.isArray(record.variants) && record.variants.some((variant) =>
      typeof variant === "string" && normalizeQuoteReference(variant) === normalized)).slice(0, 3);
  } catch (error) { return []; }
}

function renderQuoteReferences(records) {
  const panel = document.querySelector("#quote-references");
  panel.replaceChildren(); panel.hidden = !records.length;
  if (!records.length) return;
  panel.append(makeText("h2", "문헌으로 대조한 출처 자료"),
    makeText("p", "별도로 확인한 문헌 자료입니다. 아래 Wikiquote 관련 문서 후보의 출처를 확정하는 표시는 아닙니다.", "hint"));
  for (const record of records) {
    panel.append(makeText("span", "문헌 대조 · 작가/작품 확인", "badge"),
      makeText("h3", record.work), makeText("p", record.author), makeText("p", record.note, "hint"));
    for (const source of record.sources || []) {
      try {
        const url = new URL(source.url);
        if (url.protocol !== "https:" || !["fr.wikisource.org", "www.chungbuk.go.kr", "dl.nanet.go.kr"].includes(url.hostname)) continue;
        const row = document.createElement("p"); row.append(externalLink(source.label, url.href)); panel.append(row);
      } catch (error) { /* 잘못된 출처 링크는 표시하지 않습니다. */ }
    }
    const button = makeText("button", "이 작가의 관련 도서 검색", "secondary"); button.type = "button";
    button.addEventListener("click", () => prepareRelatedSearch(record.authorQuery)); panel.append(button);
  }
}

// textContent로 외부 문자열을 표시하고, 표지 로딩 실패 시 안내로 대체합니다.
function renderResults(docs, append = false) {
  if (!append) {
    for (const controller of editionControllers) controller.abort();
    editionControllers.clear();
    resultsList.replaceChildren();
  }
  const existing = new Set(Array.from(resultsList.querySelectorAll(".search-card"), (card) => card.dataset.workId));
  const isQuote = document.querySelector('input[name="search-mode"]:checked').value === "quote";
  document.querySelector("#result-count").textContent = isQuote ? `${docs.length}개 문서` : `${docs.length}권`;
  for (const doc of docs) {
    if (isQuote) {
      resultsList.append(createQuoteCard(doc));
      continue;
    }
    const book = normalizeBook(doc);
    if (append && existing.has(book.id)) continue;
    const card = document.createElement("article");
    card.className = "book-card search-card";
    card.dataset.workId = book.id;
    const cover = makeText("div", "표지 정보 없음", "cover-placeholder");
    if (book.coverId) {
      const image = document.createElement("img");
      image.className = "book-cover";
      image.alt = `${book.title} 표지`;
      image.loading = "lazy";
      image.width = 150;
      image.height = 210;
      image.addEventListener("error", () => image.replaceWith(makeText("div", "표지를 불러올 수 없습니다", "cover-placeholder")), { once: true });
      image.src = `https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg?default=false`;
      cover.replaceChildren(image);
      cover.className = "cover-area";
    }
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const add = makeText("button", book.id ? "내 서재에 추가" : "식별자 없음 · 추가 불가");
    add.type = "button";
    add.disabled = !book.id;
    add.setAttribute("aria-label", `${book.title} 내 서재에 추가`);
    add.addEventListener("click", () => addToLibrary(book));
    actions.append(add);
    const editionInfo = Number.isSafeInteger(doc.edition_count) && doc.edition_count > 0
      ? `작품 단위 · 등록 판본 ${doc.edition_count}개` : "작품 단위 · 판본 수 정보 없음";
    const editions = document.createElement("p"); editions.className = "edition-info";
    editions.append(makeText("span", editionInfo));
    if (book.id) {
      editions.append(document.createElement("br"), externalLink("판본·번역 정보 보기", `https://openlibrary.org/works/${book.id.slice("openlibrary:".length)}`));
    }
    card.append(cover, makeText("h3", book.title), makeText("p", book.author, "author"),
      makeText("p", `최초 출판연도: ${book.year}`, "publish-year"), editions, actions);
    if (book.id) card.insertBefore(createEditionDetails(book.id.slice("openlibrary:".length)), actions);
    resultsList.append(card);
  }
}

// 클릭한 작품의 실제 판본만 10개씩 표시합니다. 판본 제목이 같아도 ID로 구분합니다.
function createEditionDetails(work) {
  const details = document.createElement("details"); details.className = "edition-details";
  details.append(makeText("summary", "판본·번역 목록"), makeText("p", "같은 작품의 판본입니다. 서재에는 작품 단위로 저장됩니다.", "hint"));
  const list = document.createElement("div");
  const message = makeText("p", "", "hint"); message.setAttribute("role", "status");
  const more = makeText("button", "판본 더 보기", "secondary"); more.type = "button"; more.hidden = true;
  details.append(list, message, more);
  let offset = 0, loading = false, loaded = false;
  const seen = new Set();
  async function load() {
    if (loading) return;
    loading = true; more.disabled = true; message.textContent = "판본을 불러오고 있습니다…";
    const controller = new AbortController(); editionControllers.add(controller);
    try {
      const page = await LibrarySearch.editions(work, offset, controller.signal);
      if (!details.isConnected) return;
      for (const entry of page.entries) {
        const id = typeof entry?.key === "string" ? entry.key.match(/^\/books\/(OL\d+M)$/)?.[1] : null;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const item = document.createElement("div"); item.className = "edition-item";
        const languages = Array.isArray(entry.languages) ? entry.languages.map((language) => {
          const code = language?.key?.match(/^\/languages\/([a-z]{2,3})$/)?.[1];
          if (!code) return null;
          try { return new Intl.DisplayNames(["ko"], { type: "language" }).of(code); } catch (error) { return code; }
        }).filter(Boolean) : [];
        item.append(makeText("strong", typeof entry.title === "string" ? entry.title : "제목 정보 없음"),
          makeText("p", `판본 ID: ${id} · 출판: ${typeof entry.publish_date === "string" ? entry.publish_date : "정보 없음"}`, "hint"),
          makeText("p", `언어: ${languages.length ? languages.join(", ") : "정보 없음"}`, "hint"),
          externalLink("이 판본 원문 정보", `https://openlibrary.org/books/${id}`));
        list.append(item);
      }
      offset += page.entries.length; loaded = true;
      more.hidden = !page.entries.length || (page.total !== null ? offset >= page.total : page.entries.length < 10);
      more.textContent = "판본 더 보기";
      message.textContent = seen.size ? `${seen.size}개 판본을 표시합니다.` : "제공된 판본 정보가 없습니다.";
    } catch (error) {
      if (details.isConnected && !controller.signal.aborted) { message.textContent = "판본을 불러오지 못했습니다. 기존 정보는 유지됩니다."; more.hidden = false; more.textContent = "다시 불러오기"; }
    } finally { editionControllers.delete(controller); loading = false; more.disabled = false; }
  }
  details.addEventListener("toggle", () => { if (details.open && !loaded) load(); });
  more.addEventListener("click", load);
  return details;
}

// 검색 상태와 화면을 함께 갱신합니다. 합친 검색의 전체 건수를 추정해 표시하지 않습니다.
function showSearchSession(session, append = false) {
  renderResults(session.docs, append);
  renderAuthorResolution(session.resolution || null);
  loadMoreButton.hidden = !session.hasMore;
  const message = session.mode === "quote"
    ? session.docs.length ? `${session.docs.length}개의 관련 문서 후보를 문구 관련도순으로 표시합니다. 출처는 원문에서 확인해 주세요.`
      : "관련 문서가 없습니다. 표현을 바꾸거나 짧은 문장으로 검색해 주세요."
    : session.docs.length ? `${session.docs.length}개 작품을 표시합니다.${session.hasMore ? " 더 보기로 추가 작품을 확인하세요." : ""}`
      : "검색 결과가 없습니다. 다른 표기나 검색어로 검색해 주세요.";
  setMessage(searchFeedback, [message, ...(session.notices || [])].join(" "));
}

function rememberSearch(key, session) {
  if (!searchCache.has(key) && searchCache.size >= 20) searchCache.delete(searchCache.keys().next().value);
  searchCache.set(key, session);
}

// 버튼과 Enter는 같은 경로를 사용합니다. 새 검색은 이전 요청과 페이지 상태를 취소합니다.
async function searchBooks(event, selected = null) {
  event.preventDefault();
  const mode = document.querySelector('input[name="search-mode"]:checked').value;
  if (!Object.hasOwn(searchModes, mode) || (selected && selected.kind !== mode)) return;
  const query = queryInput.value.normalize("NFKC").replace(/\s+/g, " ").trim();
  const key = LibrarySearch.cacheKey(mode, query, selected);
  if (query && activeRequest?.key === key) return;
  cancelSearch();
  const version = requestVersion;
  searchSession = null; loadMoreButton.hidden = true;
  document.querySelector("#related-search-panel").hidden = true;
  renderAuthorResolution(null); renderQuoteReferences([]); renderResults([]); setMessage(saveFeedback, "");
  if (!query) { setMessage(searchFeedback, "검색어를 입력해 주세요.", true); queryInput.focus(); return; }
  const controller = new AbortController();
  activeRequest = { key, controller };
  resultsSection.setAttribute("aria-busy", "true"); searchButton.textContent = "재검색";
  setMessage(searchFeedback, "검색하고 있습니다. 잠시 기다려 주세요…");
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const references = mode === "quote" ? await findQuoteReferences(query) : [];
    if (version !== requestVersion) return;
    renderQuoteReferences(references);
    let session = searchCache.get(key);
    if (!session) {
      session = await LibrarySearch.search(mode, query, controller.signal, selected, references.flatMap((record) => record.variants));
      if (version !== requestVersion) return;
      session.cacheKey = key;
      if (session.cacheable !== false) {
        rememberSearch(key, session);
      }
    }
    if (version !== requestVersion) return;
    searchSession = session; showSearchSession(session);
  } catch (error) {
    if (version === requestVersion) setMessage(searchFeedback, error.status === 429
      ? "API 요청이 많아 잠시 쉬고 있습니다. 잠시 후 다시 검색해 주세요."
      : error.name === "AbortError" ? "요청 시간이 초과되었습니다. 다시 검색해 주세요."
      : "검색에 실패했습니다. 네트워크 또는 API 응답을 확인해 주세요.", true);
  } finally {
    clearTimeout(timer);
    if (version === requestVersion) {
      activeRequest = null; searchButton.textContent = "검색";
      resultsSection.setAttribute("aria-busy", "false");
    }
  }
}

// 기존 카드를 유지한 채 다음 작품을 합칩니다. 실패·취소 시 이전 상태를 보존합니다.
async function loadMoreBooks() {
  if (!searchSession?.hasMore || activeRequest) return;
  const previous = searchSession;
  cancelSearch(); const version = requestVersion;
  const controller = new AbortController();
  activeRequest = { key: `more:${previous.cacheKey}`, controller };
  loadMoreButton.disabled = true; loadMoreButton.textContent = "추가 검색 중…";
  resultsSection.setAttribute("aria-busy", "true");
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const session = await LibrarySearch.more(previous, controller.signal);
    if (version !== requestVersion) return;
    searchSession = session;
    if (!session.notices.length) rememberSearch(session.cacheKey, session);
    showSearchSession(session, true);
  } catch (error) {
    if (version === requestVersion) setMessage(searchFeedback, "추가 검색에 실패했습니다. 기존 결과는 유지됩니다. 다시 더 보기를 눌러 주세요.", true);
  } finally {
    clearTimeout(timer);
    if (version === requestVersion) {
      activeRequest = null; loadMoreButton.disabled = false; loadMoreButton.textContent = "더 보기";
      resultsSection.setAttribute("aria-busy", "false");
    }
  }
}

loadMoreButton.addEventListener("click", loadMoreBooks);
searchForm.addEventListener("submit", searchBooks);
for (const input of modeInputs) input.addEventListener("change", changeSearchMode);

// 후보 연결 폼에서 사용자가 방식을 선택해야 실제 도서 검색을 실행합니다.
document.querySelector("#related-search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#related-query");
  const query = input.value.trim();
  const mode = document.querySelector("#related-mode").value;
  input.setCustomValidity(query ? "" : "공백을 제외한 검색어를 입력해 주세요.");
  if (!event.currentTarget.reportValidity() || !["title", "author"].includes(mode)) return;
  document.querySelector(`input[name="search-mode"][value="${mode}"]`).checked = true;
  changeSearchMode();
  queryInput.value = query;
  queryInput.focus();
  searchBooks(event);
});
document.querySelector("#related-query").addEventListener("input", (event) => event.target.setCustomValidity(""));
document.querySelector("#related-cancel").addEventListener("click", () => {
  document.querySelector("#related-search-panel").hidden = true;
  resultsList.querySelector("button")?.focus();
});
