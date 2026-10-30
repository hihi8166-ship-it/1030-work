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
let searching = false;

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
    localStorage.setItem(API_STORAGE_KEY, JSON.stringify([...library, savedBook]));
    setMessage(saveFeedback, `「${book.title}」을(를) 내 서재에 추가했습니다.`);
  } catch (error) {
    setMessage(saveFeedback, "저장하지 못했습니다. 저장 공간, 브라우저 설정 또는 기존 저장 데이터를 확인해 주세요. 기존 데이터는 초기화하지 않았습니다.", true);
  }
}

// textContent로 외부 문자열을 표시하고, 표지 로딩 실패 시 안내로 대체합니다.
function renderResults(docs) {
  resultsList.replaceChildren();
  document.querySelector("#result-count").textContent = `${docs.length}권`;
  for (const doc of docs) {
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
async function searchBooks(event) {
  event.preventDefault();
  if (searching) return;
  const query = queryInput.value.trim();
  if (!query) {
    setMessage(searchFeedback, "검색할 책 제목을 입력해 주세요.", true);
    queryInput.focus();
    return;
  }
  setMessage(saveFeedback, "");
  renderResults([]);
  searching = true;
  searchButton.disabled = true;
  resultsSection.setAttribute("aria-busy", "true");
  setMessage(searchFeedback, "책을 찾고 있습니다. 잠시 기다려 주세요…");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    let docs = searchCache.get(query);
    if (!docs) {
      const fields = "key,title,author_name,first_publish_year,cover_i";
      const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&limit=10&fields=${fields}`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data || !Array.isArray(data.docs) || data.docs.some((doc) => !doc || typeof doc !== "object" || Array.isArray(doc))) {
        throw new Error("예상하지 못한 API 응답");
      }
      docs = data.docs.slice(0, 10);
      // 최근 검색 20개만 메모리에 보관하며 페이지를 닫으면 사라집니다.
      if (searchCache.size >= 20) searchCache.delete(searchCache.keys().next().value);
      searchCache.set(query, docs);
    }
    renderResults(docs);
    setMessage(searchFeedback, docs.length ? `검색 결과 ${docs.length}권을 표시합니다.` : "검색 결과가 없습니다. 다른 책 제목으로 검색해 주세요.");
  } catch (error) {
    setMessage(searchFeedback, error.name === "AbortError"
      ? "요청 시간이 초과되었습니다. 잠시 후 다시 검색해 주세요."
      : "검색에 실패했습니다. 네트워크 또는 API 응답을 확인하고 잠시 후 다시 검색해 주세요.", true);
  } finally {
    clearTimeout(timeout);
    searching = false;
    searchButton.disabled = false;
    resultsSection.setAttribute("aria-busy", "false");
  }
}

searchForm.addEventListener("submit", searchBooks);
