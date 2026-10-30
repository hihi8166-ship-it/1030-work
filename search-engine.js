"use strict";

// API·인명 연결·정렬·페이지 상태를 담당합니다. 저장소에는 접근하지 않습니다.
window.LibrarySearch = (() => {
  const PAGE_SIZE = 10;
  const FIELDS = "key,title,author_name,author_key,first_publish_year,cover_i,edition_count,language";
  const identityCache = new Map();
  const editionCache = new Map();
  const hostQueues = new Map();
  const hostStarts = new Map();
  const hostCooldown = new Map();
  const text = (value) => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  const fold = (value) => text(value).normalize("NFD").replace(/\p{M}/gu, "")
    .toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const cacheKey = (mode, query, selected) => `${mode}:${text(query).toLowerCase()}:${selected?.id || ""}`;

  // 각 요청에 제한 시간을 두고 상위 취소 신호도 연결합니다.
  async function fetchJson(url, signal, timeout = 8000) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const origin = new URL(url, location.href).origin;
    let timer;
    try {
      // 외부 호스트별 동시 요청 1개, 요청 시작 간격 최소 1초를 지킵니다.
      const task = (hostQueues.get(origin) || Promise.resolve()).catch(() => {}).then(async () => {
        const checkAbort = () => { if (controller.signal.aborted) throw new DOMException("취소", "AbortError"); };
        checkAbort();
        if ((hostCooldown.get(origin) || 0) > Date.now()) {
          const error = new Error("API 요청 제한"); error.status = 429; throw error;
        }
        const gap = origin === location.origin ? 0 : Math.max(0, 1000 - (Date.now() - (hostStarts.get(origin) || 0)));
        if (gap) await new Promise((resolve) => setTimeout(resolve, gap));
        checkAbort(); hostStarts.set(origin, Date.now());
        timer = setTimeout(abort, timeout);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          if (response.status === 429) {
            const retry = response.headers?.get("Retry-After");
            const delay = retry && Number.isFinite(Number(retry)) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 30000;
            hostCooldown.set(origin, Date.now() + (Number.isFinite(delay) ? Math.max(1000, delay) : 30000));
          }
          const error = new Error(`HTTP ${response.status}`); error.status = response.status; throw error;
        }
        const data = await response.json();
        if (!data || data.error) throw new Error("API 응답 오류");
        return data;
      });
      hostQueues.set(origin, task.catch(() => {}));
      return await task;
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  }

  async function supplement(signal, action, timeout = 6000) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(abort, timeout);
    try { return await action(controller.signal); }
    finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  }

  function languageOf(query) {
    if (/[가-힣]/.test(query)) return "ko";
    if (/[ぁ-ヿ]/.test(query)) return "ja";
    if (/\p{Script=Han}/u.test(query)) return "zh";
    if (/\p{Script=Cyrillic}/u.test(query)) return "ru";
    return "en";
  }

  // 특정 이름 목록 없이, 여러 언어의 라벨·별칭과 외부 ID로 동일 항목을 확인합니다.
  async function resolveIdentity(kind, query, signal) {
    const key = `${kind}:${fold(query)}`;
    if (identityCache.has(key)) return identityCache.get(key);
    let search;
    const language = languageOf(query);
    const variants = [text(query), text(query).replace(/[.·]/g, " ").replace(/\s+/g, " ")];
    const fallbackLanguage = language === "zh" ? "ja" : language === "ja" ? "zh" : language === "en" ? "fr" : "en";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const params = new URLSearchParams({ action: "wbsearchentities", search: variants[attempt],
        language: attempt && variants[0] === variants[1] ? fallbackLanguage : language, uselang: "ko",
        type: "item", limit: "8", format: "json", origin: "*" });
      search = await fetchJson(`https://www.wikidata.org/w/api.php?${params}`, signal);
      if (!Array.isArray(search.search)) throw new Error("인명·작품 응답 오류");
      if (search.search.length) break;
    }
    const ids = [...new Set(search.search.map((item) => item.id).filter((id) => /^Q\d+$/.test(id)))].slice(0, 8);
    if (!ids.length) return { candidates: [], incomplete: false };
    const params = new URLSearchParams({ action: "wbgetentities", ids: ids.join("|"),
      props: "labels|aliases|claims|descriptions", languages: "ko|en|fr|ja|zh|de|es|ru",
      format: "json", origin: "*" });
    const data = await fetchJson(`https://www.wikidata.org/w/api.php?${params}`, signal);
    if (!data.entities || typeof data.entities !== "object") throw new Error("항목 정보 오류");
    const candidates = [];
    for (const id of ids) {
      const entity = data.entities[id];
      if (!entity || entity.missing !== undefined) continue;
      const names = [...Object.values(entity.labels || {}).map((label) => label.value),
        ...Object.values(entity.aliases || {}).flatMap((aliases) => aliases.map((alias) => alias.value))]
        .filter((name) => typeof name === "string");
      if (!names.some((name) => fold(name) === fold(query))) continue;
      const values = (property) => (entity.claims?.[property] || [])
        .filter((claim) => claim.rank !== "deprecated").map((claim) => claim.mainsnak?.datavalue?.value);
      const human = values("P31").some((value) => value?.id === "Q5");
      if (kind === "author" ? !human : human) continue;
      const pattern = kind === "author" ? /^OL\d+A$/ : /^OL\d+W$/;
      const externalIds = [...new Set(values("P648").filter((value) => typeof value === "string" && pattern.test(value)))];
      if (kind === "title" && !externalIds.length) continue;
      const name = entity.labels?.en?.value || entity.labels?.fr?.value || names[0];
      candidates.push({ id, kind, name, names: [...new Set(names)], externalIds,
        label: entity.labels?.ko?.value || name,
        description: entity.descriptions?.ko?.value || entity.descriptions?.en?.value || "설명 없음" });
    }
    const result = { candidates, incomplete: search["search-continue"] !== undefined };
    if (identityCache.size >= 40) identityCache.delete(identityCache.keys().next().value);
    identityCache.set(key, result);
    return result;
  }

  function source(params, label) {
    return { params, label, offset: 0, total: null, done: false };
  }

  function identitySource(candidate) {
    const ids = candidate.externalIds;
    if (ids.length) {
      const values = candidate.kind === "title" ? ids.map((id) => `/works/${id}`) : ids;
      return source({ q: `${candidate.kind === "title" ? "key" : "author_key"}:(${values.join(" OR ")})` }, "연결 ID");
    }
    return source({ author: candidate.name }, "확인된 별칭");
  }

  function validateDocs(data, quote = false) {
    const docs = quote ? data?.query?.search : data?.docs;
    if (!Array.isArray(docs) || docs.some((doc) => !doc || typeof doc !== "object" || Array.isArray(doc) ||
      (quote && (typeof doc.title !== "string" || !doc.title.trim() || doc.ns !== 0 || !Number.isSafeInteger(doc.pageid))))) {
      throw new Error("예상하지 못한 검색 응답");
    }
    return docs;
  }

  async function readSource(stream, signal) {
    const params = new URLSearchParams({ ...stream.params, limit: String(PAGE_SIZE), offset: String(stream.offset), fields: FIELDS });
    const data = await fetchJson(`https://openlibrary.org/search.json?${params}`, signal);
    const docs = validateDocs(data);
    const total = data.numFound ?? data.num_found;
    stream.total = Number.isSafeInteger(total) && total >= 0 ? total : null;
    stream.offset += docs.length;
    stream.failed = false;
    stream.done = docs.length === 0 || (stream.total !== null ? stream.offset >= stream.total : docs.length < PAGE_SIZE);
    return docs;
  }

  // 외부 ID가 병합된 경우 API의 redirect 레코드를 따라갑니다. 이름으로 추측하지 않습니다.
  async function followRedirects(candidate, session, signal) {
    const kind = candidate.kind === "title" ? "works" : "authors";
    const pattern = candidate.kind === "title" ? /^\/works\/(OL\d+W)$/ : /^\/authors\/(OL\d+A)$/;
    for (const id of candidate.externalIds.slice(0, 2)) {
      let current = id; const seen = new Set([id]);
      for (let hop = 0; hop < 2; hop += 1) {
        const metadata = await fetchJson(`https://openlibrary.org/${kind}/${current}.json`, signal);
        const match = typeof metadata.location === "string" ? metadata.location.match(pattern) : null;
        if (metadata.type?.key !== "/type/redirect" || !match || seen.has(match[1])) break;
        current = match[1]; seen.add(current);
        const redirected = { ...candidate, externalIds: [current] };
        const stream = identitySource(redirected); stream.label = "병합 ID"; session.sources.push(stream);
        try {
          const docs = await readSource(stream, signal);
          if (docs.length) {
            session.resolution.selected = { ...candidate, externalIds: [...candidate.externalIds, current] };
            mergeBooks(session, docs); return;
          }
        } catch (error) { stream.failed = true; throw error; }
      }
    }
  }

  function workId(doc) {
    return typeof doc.key === "string" ? doc.key.match(/^(?:\/works\/)?(OL\d+W)$/)?.[1] : null;
  }

  // 제목만 같다고 합치지 않습니다. 서로 다른 작품 ID는 그대로 남깁니다.
  function bookScore(doc, session) {
    const title = fold(doc.title), query = fold(session.query);
    let score = title === query ? 500 : title.includes(query) ? 80 : 0;
    if (session.mode === "author") {
      const names = session.resolution?.selected?.names || [session.query];
      const authors = Array.isArray(doc.author_name) ? doc.author_name : [];
      const matches = authors.some((author) => names.some((name) => fold(author) === fold(name)));
      const ids = session.resolution?.selected?.externalIds || [];
      const matchedId = Array.isArray(doc.author_key) && doc.author_key.some((id) => ids.includes(id));
      score = (matches ? 500 : 0) + (matchedId ? 300 : 0) - Math.min(authors.length, 100);
    } else if (session.resolution?.selected?.externalIds.includes(workId(doc))) score += 900;
    return score;
  }

  function mergeBooks(session, incoming) {
    const records = new Map(session.pool.map((doc) => [workId(doc), doc]));
    for (const doc of incoming) {
      const id = workId(doc);
      if (!id) continue;
      const previous = records.get(id);
      records.set(id, previous ? { ...previous, ...doc } : doc);
    }
    session.pool = [...records.values()];
  }

  function revealPage(session) {
    const shown = new Set(session.docs.map(workId));
    const next = session.pool.filter((doc) => !shown.has(workId(doc)))
      .sort((a, b) => bookScore(b, session) - bookScore(a, session)).slice(0, PAGE_SIZE);
    session.docs.push(...next);
    session.hasMore = session.pool.length > session.docs.length || session.sources.some((stream) => !stream.done);
    return session;
  }

  async function quoteRequest(query, signal) {
    const params = new URLSearchParams({ action: "query", list: "search", srsearch: query,
      srnamespace: "0", srlimit: "10", srprop: "snippet", format: "json", origin: "*" });
    return validateDocs(await fetchJson(`https://ko.wikiquote.org/w/api.php?${params}`, signal), true);
  }

  function quoteScore(doc, query) {
    const raw = String(doc.snippet || "").replace(/<[^>]*>/g, " ");
    const content = fold(raw), full = fold(query);
    const tokens = text(query).replace(/[\p{P}\p{S}]/gu, " ").split(/\s+/).filter((token) => token.length >= 2);
    const overlap = tokens.filter((token) => content.includes(fold(token))).length;
    let phraseScore = 0;
    for (let length = Math.min(6, tokens.length); length >= 2; length -= 1) {
      if (tokens.some((token, index) => index + length <= tokens.length && content.includes(fold(tokens.slice(index, index + length).join(" "))))) {
        phraseScore = length / tokens.length * 350; break;
      }
    }
    const score = (full && content.includes(full) ? 1000 : 0) + (fold(doc.title).includes(full) ? 200 : 0)
      + phraseScore + (tokens.length ? overlap / tokens.length * 150 : 0) + overlap;
    return score * (doc._queryWeight || 1);
  }

  // 문헌에 등록된 번역 표현과 원래 입력의 짧은 구절만 제한적으로 사용합니다.
  async function searchQuotes(query, signal, verifiedVariants) {
    const notices = [];
    const candidates = new Map();
    let successful = 0;
    let lastFailure = null;
    const collect = (docs, weight = 1) => {
      successful += 1;
      for (const doc of docs) {
        const candidate = { ...doc, _queryWeight: weight };
        const previous = candidates.get(doc.pageid);
        if (!previous || quoteScore(candidate, query) > quoteScore(previous, query)) candidates.set(doc.pageid, candidate);
      }
    };
    try { collect(await quoteRequest(query, signal)); }
    catch (error) { lastFailure = error; if (signal.aborted) throw error; notices.push("원래 문장 검색에 실패했습니다."); }
    const normalized = text(query).replace(/[“”"‘’'.,!?…。！？]/g, " ").replace(/\s+/g, " ").trim();
    const tokens = normalized.split(" ").filter(Boolean);
    const phrase = tokens.slice(0, tokens.length > 4 ? 3 : 2).join(" ");
    const variants = [...new Set([`"${normalized}"`,
      ...verifiedVariants.filter((variant) => fold(variant) !== fold(query)).slice(0, 1).map((variant) => `"${text(variant)}"`),
      ...(tokens.length > 2 ? [`"${phrase}"`] : [])])].filter((variant) => variant !== query);
    if (![...candidates.values()].some((doc) => quoteScore(doc, query) >= 1000)) {
      try {
        await supplement(signal, async (childSignal) => {
          for (const [index, variant] of variants.slice(0, 2).entries()) {
            // 짧은 구절 확장으로만 찾은 문서는 전체 문장 검색보다 보수적으로 평가합니다.
            collect(await quoteRequest(variant, childSignal), index === 0 ? 0.9 : 0.55);
            if ([...candidates.values()].some((doc) => quoteScore(doc, query) >= 1000)) break;
          }
        });
      } catch (error) { lastFailure = error; if (signal.aborted && !successful) throw error; notices.push("문구 확장 일부를 완료하지 못해 성공한 후보만 표시합니다."); }
    }
    if (!successful) throw lastFailure || new Error("명언 검색 실패");
    const docs = [...candidates.values()].sort((a, b) => quoteScore(b, query) - quoteScore(a, query)).slice(0, PAGE_SIZE);
    return { mode: "quote", query, docs, notices, hasMore: false, cacheable: !notices.length };
  }

  async function search(mode, query, signal, selected = null, verifiedVariants = []) {
    if (mode === "quote") return searchQuotes(query, signal, verifiedVariants);
    const session = { mode, query: text(query), docs: [], pool: [], sources: [], notices: [], resolution: null, hasMore: false, cacheable: true, cursor: 0 };
    const primary = source({ [mode]: session.query }, "입력 검색"); session.sources.push(primary);
    let primarySuccess = false;
    let primaryFailure = null;
    try { mergeBooks(session, await readSource(primary, signal)); primarySuccess = true; }
    catch (error) { primaryFailure = error; primary.failed = true; if (signal.aborted) throw error; session.notices.push("기본 검색 일부에 실패했습니다."); session.cacheable = false; }
    try {
      await supplement(signal, async (childSignal) => {
        const identity = selected ? { candidates: [selected], incomplete: false } : await resolveIdentity(mode, session.query, childSignal);
        if (identity.candidates.length === 1 && !identity.incomplete) {
          const candidate = identity.candidates[0];
          session.resolution = { selected: candidate, query: session.query, kind: mode };
          const stream = identitySource(candidate); session.sources.push(stream);
          let docs;
          try { docs = await readSource(stream, childSignal); }
          catch (error) { stream.failed = true; throw error; }
          mergeBooks(session, docs);
          if (!docs.length && candidate.externalIds.length) await followRedirects(candidate, session, childSignal);
        } else if (identity.candidates.length) {
          session.resolution = { candidates: identity.candidates, query: session.query, kind: mode,
            note: "동일 이름의 항목이 있거나 검색이 잘렸습니다. 설명을 확인한 뒤 선택해 주세요. 기존 결과는 유지됩니다." };
        }
      }, 9000);
    } catch (error) {
      if (signal.aborted && !session.pool.length) throw error;
      session.notices.push("다국어 연결 일부에 실패하여 기존 검색 결과를 유지합니다."); session.cacheable = false;
    }
    if (!primarySuccess && !session.pool.length) throw primaryFailure || new Error("도서 검색 실패");
    if (!signal.aborted && session.pool.length < PAGE_SIZE && session.sources.some((stream) => !stream.done && !stream.failed)) {
      const filled = await more(session, signal, true);
      filled.notices = [...session.notices, ...filled.notices];
      return filled;
    }
    return revealPage(session);
  }

  // 복사한 상태에만 다음 페이지를 합칩니다. 실패해도 기존 결과·offset은 보존됩니다.
  async function more(previous, signal, initialFill = false) {
    const session = structuredClone(previous);
    session.notices = [];
    let attempts = 0;
    while (session.pool.length - session.docs.length < PAGE_SIZE && session.sources.some((stream) => !stream.done && (!initialFill || !stream.failed)) && attempts < session.sources.length) {
      const index = session.cursor % session.sources.length; session.cursor += 1;
      const stream = session.sources[index];
      if (stream.done || (initialFill && stream.failed)) continue;
      attempts += 1;
      try { mergeBooks(session, await readSource(stream, signal)); }
      catch (error) {
        stream.failed = true;
        session.notices.push("추가 검색 일부에 실패했습니다. 기존 결과를 유지하며 다시 시도할 수 있습니다.");
        if (signal.aborted) break;
      }
    }
    return revealPage(session);
  }

  // 판본은 작품과 별개의 OL...M 식별자로 조회하되 서재 저장 ID는 바꾸지 않습니다.
  async function editions(work, offset, signal) {
    if (!/^OL\d+W$/.test(work)) throw new Error("작품 ID 오류");
    const key = `${work}:${offset}`;
    if (editionCache.has(key)) return editionCache.get(key);
    const params = new URLSearchParams({ limit: "10", offset: String(offset) });
    const data = await fetchJson(`https://openlibrary.org/works/${work}/editions.json?${params}`, signal);
    if (!Array.isArray(data.entries)) throw new Error("판본 응답 오류");
    const result = { entries: data.entries, total: Number.isSafeInteger(data.size) ? data.size : null };
    if (editionCache.size >= 30) editionCache.delete(editionCache.keys().next().value);
    editionCache.set(key, result); return result;
  }

  return { search, more, editions, fetchJson, cacheKey, fold, resolveIdentity, quoteScore };
})();
