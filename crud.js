"use strict";

const STORAGE_KEY = "my-book-library.books.v1";
const readingStatuses = ["읽을 예정", "읽는 중", "완독"];
const form = document.querySelector("#book-form");
const titleInput = document.querySelector("#title");
const authorInput = document.querySelector("#author");
const statusInput = document.querySelector("#status");
const memoInput = document.querySelector("#memo");
const feedback = document.querySelector("#feedback");
const list = document.querySelector("#book-list");
const cancelButton = document.querySelector("#cancel-button");
let books = [];
let editingId = null;
let storageReady = true;

// 저장된 JSON을 배열로 바꿉니다. 손상된 데이터는 임의로 덮어쓰지 않습니다.
function loadBooks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("잘못된 저장 형식");
    const ids = new Set();
    for (const book of parsed) {
      if (!book || typeof book.id !== "string" || !book.id || ids.has(book.id) ||
          typeof book.title !== "string" || !book.title.trim() ||
          typeof book.author !== "string" || !book.author.trim() ||
          !readingStatuses.includes(book.status) || typeof book.memo !== "string") {
        throw new Error("잘못된 도서 데이터");
      }
      ids.add(book.id);
    }
    return parsed;
  } catch (error) {
    storageReady = false;
    showMessage("저장 데이터를 읽을 수 없습니다. 브라우저의 저장소 설정이나 기존 데이터를 확인한 뒤 새로고침해 주세요. 기존 데이터는 보존됩니다.", true);
    return [];
  }
}

// 저장에 성공한 경우에만 화면의 배열도 바꿔 저장 결과와 화면을 일치시킵니다.
function saveBooks(nextBooks) {
  if (!storageReady) {
    showMessage("저장소를 사용할 수 없어 변경하지 않았습니다. 저장소를 확인한 뒤 새로고침해 주세요.", true);
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextBooks));
    books = nextBooks;
    return true;
  } catch (error) {
    showMessage("저장하지 못했습니다. 저장 공간과 브라우저 설정을 확인해 주세요. 입력 내용은 유지됩니다.", true);
    return false;
  }
}

function showMessage(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle("error", isError);
}

// 사용자 입력은 textContent로 표시하여 HTML 코드가 실행되지 않도록 합니다.
function createTextElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

// Read: 배열의 책마다 카드를 만들어 목록에 표시합니다.
function renderBooks() {
  list.replaceChildren();
  document.querySelector("#book-count").textContent = `${books.length}권`;
  document.querySelector("#empty-message").hidden = books.length > 0;
  for (const book of books) {
    const card = document.createElement("article");
    card.className = "book-card";
    const badge = createTextElement("span", book.status, `badge status-${readingStatuses.indexOf(book.status)}`);
    const heading = createTextElement("h3", book.title);
    const author = createTextElement("p", book.author, "author");
    const memo = createTextElement("p", book.memo || "아직 작성한 메모가 없어요.", "memo");
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const edit = createTextElement("button", "수정", "secondary");
    edit.type = "button";
    edit.setAttribute("aria-label", `${book.title} 수정`);
    edit.addEventListener("click", () => startEdit(book.id));
    const remove = createTextElement("button", "삭제", "delete-button");
    remove.type = "button";
    remove.setAttribute("aria-label", `${book.title} 삭제`);
    remove.addEventListener("click", () => deleteBook(book.id));
    actions.append(edit, remove);
    card.append(badge, heading, author, memo, actions);
    list.append(card);
  }
}

// Update 준비: 선택한 책을 입력 폼으로 가져오고 수정할 ID를 기억합니다.
function startEdit(id) {
  const book = books.find((item) => item.id === id);
  if (!book) return;
  editingId = id;
  titleInput.value = book.title;
  authorInput.value = book.author;
  statusInput.value = book.status;
  memoInput.value = book.memo;
  document.querySelector("#form-heading").textContent = "책 정보 수정";
  document.querySelector("#submit-button").textContent = "수정 내용 저장";
  cancelButton.hidden = false;
  titleInput.focus();
  showMessage("책 정보를 수정한 뒤 저장해 주세요.");
}

// 수정이 끝나거나 취소되면 폼을 등록 상태로 되돌립니다.
function resetForm() {
  editingId = null;
  form.reset();
  titleInput.setCustomValidity("");
  authorInput.setCustomValidity("");
  document.querySelector("#form-heading").textContent = "새 책 등록";
  document.querySelector("#submit-button").textContent = "서재에 등록";
  cancelButton.hidden = true;
}

// Delete: 삭제 확인 후 해당 ID의 책만 제외한 배열을 저장합니다.
function deleteBook(id) {
  const book = books.find((item) => item.id === id);
  if (!book || !window.confirm(`「${book.title}」을(를) 서재에서 삭제할까요?`)) return;
  if (!saveBooks(books.filter((item) => item.id !== id))) return;
  if (editingId === id) resetForm();
  renderBooks();
  showMessage("책을 삭제했습니다.");
}

// 최신 브라우저의 UUID를 사용하고, 지원하지 않으면 충돌 여부를 확인해 ID를 만듭니다.
function createId() {
  let id;
  do {
    id = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `book-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } while (books.some((book) => book.id === id));
  return id;
}

// Create / Update: 양끝 공백을 제거하고 필수값을 확인한 뒤 JSON으로 저장합니다.
form.addEventListener("submit", (event) => {
  event.preventDefault();
  for (const input of [titleInput, authorInput]) {
    input.setCustomValidity(input.value.trim() ? "" : "공백을 제외한 내용을 입력해 주세요.");
  }
  if (!form.reportValidity()) return;
  if (!readingStatuses.includes(statusInput.value)) {
    showMessage("독서 상태를 선택해 주세요.", true);
    return;
  }
  const isEditing = editingId !== null;
  const book = {
    id: editingId || createId(),
    title: titleInput.value.trim(),
    author: authorInput.value.trim(),
    status: statusInput.value,
    memo: memoInput.value.trim()
  };
  const nextBooks = isEditing
    ? books.map((item) => item.id === editingId ? book : item)
    : [...books, book];
  if (!saveBooks(nextBooks)) return;
  resetForm();
  renderBooks();
  showMessage(isEditing ? "책 정보를 수정했습니다." : "새 책을 서재에 등록했습니다.");
  titleInput.focus();
});

for (const input of [titleInput, authorInput]) {
  input.addEventListener("input", () => input.setCustomValidity(""));
}
cancelButton.addEventListener("click", () => {
  resetForm();
  showMessage("수정을 취소했습니다.");
  titleInput.focus();
});

books = loadBooks();
renderBooks();

// 다른 탭에서 API 도서를 추가하면 최신 목록을 반영해 이전 배열로 덮어쓰지 않게 합니다.
window.addEventListener("storage", (event) => {
  if (event.storageArea !== localStorage || (event.key !== STORAGE_KEY && event.key !== null)) return;
  books = loadBooks();
  if (editingId && !books.some((book) => book.id === editingId)) resetForm();
  renderBooks();
});
