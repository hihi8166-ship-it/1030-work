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
const authorNameCache = new Map();
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
  searchButton.textContent = "검색";
  resultsSection.setAttribute("aria-busy", "false");
}

// 검색 방식 변경 시 입력 안내와 결과를 초기화합니다. 캐시는 방식별로 유지합니다.
function changeSearchMode() {
  cancelSearch();
  const mode = document.querySelector('input[name="search-mode"]:checked').value;
  const label = searchModes[mode].label;
  document.querySelector("#search-heading").textContent = `${label}으로 검색`;
  document.querySelector('label[for="search-query"]').textContent = label;
  queryInput.value = "";
  queryInput.placeholder = searchModes[mode].placeholder;
  document.querySelector("#search-hint").textContent = mode === "quote"
    ? "한국어 Wikiquote의 관련 문서 후보를 최대 10개 찾습니다. 정확한 출처를 확정하는 검색이 아닙니다."
    : mode === "author" ? "한국어·원어 이름으로 최대 10권을 찾습니다. 결과가 없으면 Wikidata 인명 연결을 확인합니다."
    : `${label}으로 최대 10권을 찾습니다. 추가한 책은 ‘읽을 예정’으로 저장됩니다.`;
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

// 두 서비스 모두 URLSearchParams로 검색어를 인코딩합니다.
function createSearchUrl(mode, query) {
  if (mode === "quote") {
    const params = new URLSearchParams({ action: "query", list: "search", srsearch: query,
      srnamespace: "0", srlimit: "10", srprop: "snippet", format: "json", origin: "*" });
    return `https://ko.wikiquote.org/w/api.php?${params}`;
  }
  const params = new URLSearchParams({ [mode]: query, limit: "10",
    fields: "key,title,author_name,first_publish_year,cover_i" });
  return `https://openlibrary.org/search.json?${params}`;
}

// HTTP 200이어도 MediaWiki error 객체나 예상과 다른 응답은 오류로 처리합니다.
function getSearchDocs(data, mode) {
  const docs = mode === "quote" ? data?.query?.search : data?.docs;
  if (!data || data.error || !Array.isArray(docs) || docs.some((doc) =>
    !doc || typeof doc !== "object" || Array.isArray(doc) ||
    (mode === "quote" && (typeof doc.title !== "string" || !doc.title.trim() || doc.ns !== 0 ||
      !Number.isSafeInteger(doc.pageid) || doc.pageid <= 0)))) {
    throw new Error("예상하지 못한 API 응답");
  }
  return docs.slice(0, 10);
}

// 외부 보완 서비스는 5초 이내로 제한합니다. 상위 요청 취소도 함께 전달합니다.
async function withSupplementTimeout(signal, action) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, 5000);
  try { return await action(controller.signal); }
  finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data || data.error) throw new Error("API 응답 오류");
  return data;
}

function normalizePersonName(name) {
  return name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

// 검색 순위가 아니라 정확한 한국어 이름/별칭, 사람(Q5), OL 저자 ID를 확인합니다.
// 동명이인이 여럿이거나 검색이 잘린 경우 자동 선택하지 않습니다.
async function findAuthorNames(query, signal) {
  const cacheKey = normalizePersonName(query);
  if (authorNameCache.has(cacheKey)) return authorNameCache.get(cacheKey);
  const searchParams = new URLSearchParams({ action: "wbsearchentities", search: query,
    language: "ko", uselang: "ko", type: "item", limit: "5", format: "json", origin: "*" });
  const search = await fetchJson(`https://www.wikidata.org/w/api.php?${searchParams}`, signal);
  if (!Array.isArray(search.search)) throw new Error("인명 검색 응답 오류");
  const ids = search.search.map((item) => item.id).filter((id) => /^Q\d+$/.test(id)).slice(0, 5);
  if (!ids.length) return { candidates: [], incomplete: false };
  const entityParams = new URLSearchParams({ action: "wbgetentities", ids: ids.join("|"),
    props: "labels|aliases|claims|descriptions", languages: "ko|en", format: "json", origin: "*" });
  const data = await fetchJson(`https://www.wikidata.org/w/api.php?${entityParams}`, signal);
  if (!data.entities || typeof data.entities !== "object") throw new Error("인명 정보 응답 오류");
  const candidates = [];
  for (const id of ids) {
    const entity = data.entities[id];
    if (!entity || entity.missing !== undefined) continue;
    const names = [entity.labels?.ko?.value, ...(entity.aliases?.ko || []).map((alias) => alias.value)];
    if (!names.some((name) => typeof name === "string" && normalizePersonName(name) === cacheKey)) continue;
    const values = (property) => (entity.claims?.[property] || [])
      .filter((claim) => claim.rank !== "deprecated").map((claim) => claim.mainsnak?.datavalue?.value);
    if (!values("P31").some((value) => value?.id === "Q5")) continue;
    const authorIds = [...new Set(values("P648").filter((value) => typeof value === "string" && /^OL\d+A$/.test(value)))].slice(0, 10);
    const name = entity.labels?.en?.value;
    if (!authorIds.length || typeof name !== "string" || !name.trim()) continue;
    candidates.push({ id, name, label: entity.labels?.ko?.value || query,
      description: entity.descriptions?.ko?.value || entity.descriptions?.en?.value || "설명 없음", authorIds });
  }
  const result = { candidates, incomplete: search["search-continue"] !== undefined };
  if (authorNameCache.size >= 30) authorNameCache.delete(authorNameCache.keys().next().value);
  authorNameCache.set(cacheKey, result);
  return result;
}

// 검증된 인물 항목의 저자 ID로 검색해 비슷한 이름의 다른 저자 혼입을 줄입니다.
async function searchAuthorIds(candidate, signal) {
  const ids = candidate.authorIds.filter((id) => /^OL\d+A$/.test(id));
  if (!ids.length) throw new Error("저자 식별자 없음");
  const params = new URLSearchParams({ q: `author_key:(${ids.join(" OR ")})`, limit: "10",
    fields: "key,title,author_name,cover_i,first_publish_year" });
  return getSearchDocs(await fetchJson(`https://openlibrary.org/search.json?${params}`, signal), "author");
}

// 기존 검색을 먼저 실행합니다. 보완이 실패하면 원래 결과를 그대로 반환합니다.
async function searchWithEnhancements(mode, query, signal, selectedAuthor) {
  if (selectedAuthor) {
    const docs = await searchAuthorIds(selectedAuthor, signal);
    return { docs, resolution: { selected: selectedAuthor, query } };
  }
  const docs = getSearchDocs(await fetchJson(createSearchUrl(mode, query), signal), mode);
  if (mode === "author" && docs.length === 0 && /[가-힣]/.test(query)) {
    try {
      return await withSupplementTimeout(signal, async (childSignal) => {
        const names = await findAuthorNames(query, childSignal);
        if (names.candidates.length === 1 && !names.incomplete) {
          const selected = names.candidates[0];
          const expanded = await searchAuthorIds(selected, childSignal);
          return expanded.length ? { docs: expanded, resolution: { selected, query } }
            : { docs, resolution: { note: "인명은 연결했지만 도서 결과가 없어 기존 검색 결과를 유지했습니다." } };
        }
        return { docs, resolution: { query, candidates: names.candidates,
          note: names.incomplete ? "인명 후보가 많아 자동 연결하지 않았습니다. 아래 후보를 확인하거나 원어 이름으로 검색해 주세요."
            : names.candidates.length > 1 ? "동명이인 후보가 있습니다. 설명과 인명 정보를 확인한 뒤 직접 선택해 주세요."
            : "정확히 연결할 인명 정보를 찾지 못했습니다. 원어 이름으로도 검색해 보세요." } };
      });
    } catch (error) {
      if (signal.aborted) throw error;
      return { docs, cacheable: false, resolution: { note: "다국어 인명 연결에 실패하여 기존 검색 결과를 유지했습니다. 원어 이름으로 검색할 수 있습니다." } };
    }
  }
  // 구두점·공백만 정리합니다. 번역의 뜻이나 어미를 임의로 바꾸지 않습니다.
  const normalized = query.normalize("NFKC").replace(/[“”"‘’'.,!?…。！？]/g, " ").replace(/\s+/g, " ").trim();
  if (mode === "quote" && !docs.length && normalized && normalized !== query) {
    try {
      const retry = await withSupplementTimeout(signal, (childSignal) => fetchJson(createSearchUrl(mode, normalized), childSignal));
      return { docs: getSearchDocs(retry, mode) };
    } catch (error) { if (signal.aborted) throw error; }
  }
  return { docs };
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
  panel.append(makeText("h2", "다국어 인명 연결"));
  if (resolution.selected) {
    const person = resolution.selected;
    panel.append(makeText("p", `${resolution.query} → ${person.name}`),
      makeText("p", person.description, "hint"), externalLink("Wikidata 인명 정보 확인", `https://www.wikidata.org/wiki/${person.id}`));
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
        externalLink("인명 정보 확인", `https://www.wikidata.org/wiki/${person.id}`), button);
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
function renderResults(docs) {
  resultsList.replaceChildren();
  const isQuote = document.querySelector('input[name="search-mode"]:checked').value === "quote";
  document.querySelector("#result-count").textContent = isQuote ? `${docs.length}개 문서` : `${docs.length}권`;
  for (const doc of docs) {
    if (isQuote) {
      resultsList.append(createQuoteCard(doc));
      continue;
    }
    const book = normalizeBook(doc);
    const card = document.createElement("article");
    card.className = "book-card search-card";
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
    card.append(cover, makeText("h3", book.title), makeText("p", book.author, "author"),
      makeText("p", `최초 출판연도: ${book.year}`, "publish-year"), actions);
    resultsList.append(card);
  }
}

// 버튼과 Enter는 같은 submit 이벤트를 사용합니다. 입력 중에는 API를 호출하지 않습니다.
async function searchBooks(event, selectedAuthor = null) {
  event.preventDefault();
  const mode = document.querySelector('input[name="search-mode"]:checked').value;
  if (!Object.hasOwn(searchModes, mode)) return;
  if (selectedAuthor && mode !== "author") return;
  const query = queryInput.value.trim();
  if (!query) {
    cancelSearch();
    renderAuthorResolution(null);
    renderQuoteReferences([]);
    document.querySelector("#related-search-panel").hidden = true;
    renderResults([]);
    setMessage(saveFeedback, "");
    setMessage(searchFeedback, `검색할 ${searchModes[mode].label}을 입력해 주세요.`, true);
    queryInput.focus();
    return;
  }
  const cacheKey = `${mode}:${query}${selectedAuthor ? `:${selectedAuthor.id}` : ""}`;
  // 같은 요청의 연타는 무시하고, 다른 검색은 이전 요청을 중단한 뒤 즉시 실행합니다.
  if (activeRequest?.key === cacheKey) return;
  cancelSearch();
  const version = requestVersion;
  document.querySelector("#related-search-panel").hidden = true;
  setMessage(saveFeedback, "");
  renderAuthorResolution(null);
  renderQuoteReferences([]);
  renderResults([]);
  searchButton.textContent = "재검색";
  resultsSection.setAttribute("aria-busy", "true");
  setMessage(searchFeedback, mode === "quote" ? "관련 문서 후보를 찾고 있습니다. 잠시 기다려 주세요…" : "책을 찾고 있습니다. 잠시 기다려 주세요…");
  const controller = new AbortController();
  activeRequest = { key: cacheKey, controller };
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    if (mode === "quote") {
      const references = await findQuoteReferences(query);
      if (version !== requestVersion) return;
      renderQuoteReferences(references);
    }
    let result = searchCache.get(cacheKey);
    if (!result) {
      result = await searchWithEnhancements(mode, query, controller.signal, selectedAuthor);
      if (version !== requestVersion) return;
      // 최근 검색 20개만 메모리에 보관하며 페이지를 닫으면 사라집니다.
      if (result.cacheable !== false) {
        if (searchCache.size >= 20) searchCache.delete(searchCache.keys().next().value);
        searchCache.set(cacheKey, result);
      }
    }
    if (version !== requestVersion) return;
    const docs = result.docs;
    renderResults(docs);
    renderAuthorResolution(result.resolution || null);
    if (mode === "quote") {
      setMessage(searchFeedback, docs.length ? `${docs.length}개의 관련 문서 후보입니다. 출처는 원문에서 확인해 주세요.`
        : "관련 문서가 없습니다. 표현을 바꾸거나 짧은 문장으로 검색해 주세요.");
    } else {
      setMessage(searchFeedback, docs.length ? `검색 결과 ${docs.length}권을 표시합니다.` : `검색 결과가 없습니다. 다른 ${searchModes[mode].label}으로 검색해 주세요.`);
    }
  } catch (error) {
    if (version !== requestVersion) return;
    setMessage(searchFeedback, error.name === "AbortError"
      ? "요청 시간이 초과되었습니다. 잠시 후 다시 검색해 주세요."
      : "검색에 실패했습니다. 네트워크 또는 API 응답을 확인하고 잠시 후 다시 검색해 주세요.", true);
  } finally {
    clearTimeout(timeout);
    if (version === requestVersion) {
      activeRequest = null;
      searchButton.textContent = "검색";
      resultsSection.setAttribute("aria-busy", "false");
    }
  }
}

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
