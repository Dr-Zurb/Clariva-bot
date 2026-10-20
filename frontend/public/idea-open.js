/**
 * Cold-start idea sheet. The installed "New idea" icon opens this from the
 * phone, without waiting for a sleeping server. Keep the save behavior in
 * step with components/dashboard/social/IdeaCapture.tsx.
 */

const PENDING_KEY = "halo-idea-pending-v1";
const DRAFT_KEY = "halo-idea-draft";
const RESEND_AFTER_MS = 3 * 60 * 1000;
const SAME_CARD_WINDOW_MS = 10 * 60 * 1000;
const FILE_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/bmp",
  "image/tiff",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  ".gif",
  ".heic",
  ".heif",
  ".avif",
  ".bmp",
  ".tif",
  ".tiff",
  ".webm",
  ".m4v",
  ".3gp",
  ".avi",
  ".mkv",
  ".mp3",
  ".m4a",
  ".wav",
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".txt",
  ".csv",
  ".rtf",
  ".odt",
  ".ods",
  ".odp",
].join(",");

const EXT_TYPE = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/x-m4v",
  "3gp": "video/3gpp",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
};

const PHOTO_BYTES = 8 * 1024 * 1024;
const VIDEO_BYTES = 100 * 1024 * 1024;
const AUDIO_BYTES = 15 * 1024 * 1024;
const DOCUMENT_BYTES = 10 * 1024 * 1024;

export function apiBaseFor(hostname, stored) {
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "clariva-dev" ||
    hostname.endsWith(".ts.net")
  ) {
    return "";
  }
  return (stored || "").trim().replace(/\/$/, "");
}

export function ideaTitle(typed) {
  const title = typed.trim();
  return title || "untitled";
}

export function normalizeLink(value) {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!host || (host !== "localhost" && !host.includes("."))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function seedIdeaFields(input) {
  let title = (input.title || "").trim().slice(0, 200);
  let note = (input.note || "").trim();
  let link = (input.link || "").trim();
  if (!link && note) {
    const whole = normalizeLink(note);
    if (whole) {
      link = whole;
      note = "";
    }
  }
  if (!link) {
    const titleLink = normalizeLink(title);
    if (titleLink) {
      link = titleLink;
      title = "";
    }
  }
  const normalized = normalizeLink(link);
  if (normalized) link = normalized;
  if (link) title = "";
  else if (!title && note) {
    title = note.slice(0, 200);
    if (note.length <= 200) note = "";
  }
  return { title, note: note.slice(0, 1000), link: link.slice(0, 500) };
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(pad);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function readAccessToken(cookieHeader) {
  const jar = new Map();
  for (const part of String(cookieHeader || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    let value = part.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    jar.set(name, value);
  }
  let key = [...jar.keys()].find((name) => /^sb-[a-z0-9]+-auth-token$/.test(name));
  if (!key) {
    const chunk = [...jar.keys()].find((name) => /^sb-[a-z0-9]+-auth-token\.\d+$/.test(name));
    if (chunk) key = chunk.replace(/\.\d+$/, "");
  }
  if (!key) return "";
  let raw = jar.get(key) || "";
  if (!raw) {
    const chunks = [];
    for (let i = 0; ; i += 1) {
      const chunk = jar.get(`${key}.${i}`);
      if (!chunk) break;
      chunks.push(chunk);
    }
    raw = chunks.join("");
  }
  if (!raw) return "";
  try {
    const json = raw.startsWith("base64-") ? decodeBase64Url(raw.slice("base64-".length)) : raw;
    const session = JSON.parse(json);
    return typeof session.access_token === "string" ? session.access_token : "";
  } catch {
    return "";
  }
}

function extensionOf(name) {
  return (name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
}

function kindOf(file) {
  const type = file.type === "audio/x-wav" ? "audio/wav" : file.type;
  if (type.startsWith("image/")) return "photo";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  const ext = extensionOf(file.name);
  const mapped = EXT_TYPE[ext];
  if (!mapped) return type.startsWith("application/") || type.startsWith("text/") ? "document" : null;
  if (mapped.startsWith("image/")) return "photo";
  if (mapped.startsWith("video/")) return "video";
  if (mapped.startsWith("audio/")) return "audio";
  return "document";
}

export function fileIssue(file) {
  const kind = kindOf(file);
  if (!kind) return "Use a photo, a video, audio, or a document";
  if (kind === "photo" && file.size > PHOTO_BYTES) return "Photo is over 8 MB";
  if (kind === "video" && file.size > VIDEO_BYTES) return "Video is over 100 MB";
  if (kind === "audio" && file.size > AUDIO_BYTES) return "Audio is over 15 MB";
  if (kind === "document" && file.size > DOCUMENT_BYTES) return "Document is over 10 MB";
  return null;
}

export function contentTypeFor(file) {
  if (file.type === "audio/x-wav") return "audio/wav";
  if (file.type && Object.values(EXT_TYPE).includes(file.type)) return file.type;
  return EXT_TYPE[extensionOf(file.name)] || file.type || "application/octet-stream";
}

function readPending() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePending(ideas) {
  try {
    if (ideas.length === 0) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify(ideas));
  } catch {
    // The save in flight still runs when storage is blocked.
  }
}

function keepPending(idea) {
  writePending([...readPending().filter((item) => item.id !== idea.id), idea]);
}

function dropPending(id) {
  writePending(readPending().filter((item) => item.id !== id));
}

async function shrinkPhoto(file) {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size <= 280000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

async function postJson(token, url, body, keepalive) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    keepalive: Boolean(keepalive),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.error?.message || "Request failed");
  }
  return json.data;
}

export function bootIdeaOpen(doc) {
  const form = doc.getElementById("idea-form");
  const titleInput = doc.getElementById("idea-title");
  const noteInput = doc.getElementById("idea-note");
  const linkInput = doc.getElementById("idea-link");
  const status = doc.getElementById("idea-status");
  const error = doc.getElementById("idea-error");
  const pin = doc.getElementById("idea-pin");
  const sources = doc.getElementById("idea-sources");
  const picked = doc.getElementById("idea-picked");
  const fileName = doc.getElementById("idea-file-name");
  const filesInput = doc.getElementById("idea-files");
  if (!form || !titleInput || !noteInput || !linkInput || !filesInput) return;

  filesInput.setAttribute("accept", FILE_ACCEPT);
  const params = new URLSearchParams(location.search);
  const seeded = seedIdeaFields({
    title: params.get("title") || "",
    note: params.get("note") || "",
    link: params.get("link") || "",
  });
  titleInput.value = seeded.title;
  noteInput.value = seeded.note;
  linkInput.value = seeded.link;
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    if (draft && !seeded.title && !seeded.note && !seeded.link) {
      titleInput.value = draft.title || "";
      noteInput.value = draft.note || "";
      linkInput.value = draft.link || "";
    }
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // A blocked session store just leaves the fields as opened.
  }

  let file = null;
  const showError = (message) => {
    if (!error) return;
    error.hidden = !message;
    error.textContent = message || "";
  };

  pin?.addEventListener("click", () => {
    if (!sources) return;
    const open = sources.hidden;
    sources.hidden = !open;
    pin.setAttribute("aria-expanded", open ? "true" : "false");
  });
  doc.getElementById("idea-remove")?.addEventListener("click", () => {
    file = null;
    if (picked) picked.hidden = true;
    doc.querySelectorAll('input[type="file"]').forEach((input) => {
      input.value = "";
    });
  });
  doc.querySelectorAll("#idea-sources input").forEach((input) => {
    input.addEventListener("change", () => {
      const next = input.files?.[0] ?? null;
      const issue = next ? fileIssue(next) : null;
      if (issue) {
        showError(issue);
        input.value = "";
        return;
      }
      file = next;
      showError("");
      if (fileName) fileName.textContent = next?.name || "";
      if (picked) picked.hidden = !next;
      if (sources) sources.hidden = true;
      pin?.setAttribute("aria-expanded", "false");
    });
  });
  titleInput.addEventListener("input", () => {
    if (status) status.hidden = true;
  });

  const token = () => readAccessToken(doc.cookie) ;
  const base = () => apiBaseFor(location.hostname, localStorage.getItem("halo-idea-api"));

  void resend(token(), base());
  void fetch("/c/idea/wake", { credentials: "same-origin", keepalive: true }).catch(() => undefined);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const access = token();
    if (!access) {
      try {
        sessionStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            title: titleInput.value,
            note: noteInput.value,
            link: linkInput.value,
          })
        );
      } catch {
        // Login still continues. The typed idea may need to be entered again.
      }
      const next = `${location.pathname}${location.search}`;
      location.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    const issue = file ? fileIssue(file) : null;
    if (issue) {
      showError(issue);
      return;
    }
    const typedLink = linkInput.value.trim();
    const sourceUrl = typedLink ? normalizeLink(typedLink) : null;
    if (typedLink && !sourceUrl) {
      showError("Use a link");
      return;
    }
    const typedTitle = titleInput.value.trim();
    const note = noteInput.value.trim();
    const savedFile = file;
    const idea = {
      id: crypto.randomUUID(),
      title: ideaTitle(typedTitle),
      ...(note ? { note } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      at: Date.now(),
    };
    keepPending(idea);
    titleInput.value = "";
    noteInput.value = "";
    linkInput.value = "";
    file = null;
    if (picked) picked.hidden = true;
    doc.querySelectorAll('input[type="file"]').forEach((input) => {
      input.value = "";
    });
    showError("");
    if (status) status.hidden = false;
    if (doc.activeElement instanceof HTMLElement) doc.activeElement.blur();
    void finish(access, base(), idea, savedFile, typedTitle, typedLink, {
      stillEmpty() {
        return !titleInput.value.trim() && !noteInput.value.trim() && !linkInput.value.trim() && !file;
      },
      restoreFile(next) {
        file = next;
        if (fileName) fileName.textContent = next?.name || "";
        if (picked) picked.hidden = !next;
      },
    });
  });
}

async function finish(token, base, idea, savedFile, typedTitle, typedLink, ui) {
  const titleInput = document.getElementById("idea-title");
  const noteInput = document.getElementById("idea-note");
  const linkInput = document.getElementById("idea-link");
  const status = document.getElementById("idea-status");
  const error = document.getElementById("idea-error");
  try {
    let sent = idea;
    if (savedFile) {
      const small = await shrinkPhoto(savedFile);
      const filePath = await uploadFile(token, base, small);
      sent = { ...idea, filePath };
      keepPending(sent);
    }
    await postJson(
      token,
      `${base}/api/v1/social/cards`,
      {
        title: sent.title,
        stage: "thoughts",
        ...(sent.note ? { words: { note: sent.note } } : {}),
        ...(sent.sourceUrl ? { sourceUrl: sent.sourceUrl } : {}),
        ...(sent.filePath ? { filePath: sent.filePath } : {}),
      },
      true
    );
    dropPending(idea.id);
  } catch (err) {
    if (!ui.stillEmpty()) return;
    dropPending(idea.id);
    if (titleInput) titleInput.value = typedTitle;
    if (noteInput) noteInput.value = idea.note || "";
    if (linkInput) linkInput.value = typedLink;
    ui.restoreFile(savedFile);
    if (status) status.hidden = true;
    if (error) {
      error.hidden = false;
      error.textContent =
        err instanceof Error && err.message ? `Not saved: ${err.message}` : "Not saved. Tap Add again.";
    }
  }
}

async function uploadFile(token, base, file) {
  const supabaseUrl = (localStorage.getItem("halo-idea-supabase") || "").replace(/\/$/, "");
  const anon = localStorage.getItem("halo-idea-anon") || "";
  if (!supabaseUrl || !anon) throw new Error("Could not upload the file");
  const minted = await postJson(token, `${base}/api/v1/social/cards/uploads`, {
    contentType: contentTypeFor(file),
  });
  const target = new URL(`${supabaseUrl}/storage/v1/object/upload/sign/social-card-files/${minted.path}`);
  target.searchParams.set("token", minted.token);
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  const res = await fetch(target, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      "x-upsert": "false",
    },
    body,
  });
  if (!res.ok) throw new Error("Could not upload the file");
  return minted.path;
}

async function resend(token, base) {
  if (!token) return;
  const now = Date.now();
  const waiting = readPending().filter((idea) => now - idea.at > RESEND_AFTER_MS);
  if (waiting.length === 0) return;
  let cards = [];
  try {
    const res = await fetch(`${base}/api/v1/social/cards`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) return;
    cards = Array.isArray(json.data?.cards) ? json.data.cards : [];
  } catch {
    return;
  }
  for (const idea of waiting) {
    const landed = cards.some(
      (card) =>
        card.title === idea.title &&
        (card.sourceUrl ?? undefined) === idea.sourceUrl &&
        Date.parse(card.createdAt) >= idea.at - SAME_CARD_WINDOW_MS
    );
    if (landed) {
      dropPending(idea.id);
      continue;
    }
    try {
      await postJson(token, `${base}/api/v1/social/cards`, {
        title: idea.title,
        stage: "thoughts",
        ...(idea.note ? { words: { note: idea.note } } : {}),
        ...(idea.sourceUrl ? { sourceUrl: idea.sourceUrl } : {}),
        ...(idea.filePath ? { filePath: idea.filePath } : {}),
      });
      dropPending(idea.id);
    } catch {
      // Stays on the phone for the next open.
    }
  }
}

if (typeof document !== "undefined" && document.body?.dataset.ideaOpen === "1") {
  bootIdeaOpen(document);
}
