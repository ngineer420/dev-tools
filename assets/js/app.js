/* devboxkit.com — app logic.
   Pure, DOM-independent helper functions live at the top (exported for Node via
   `module.exports` so they can be sanity-checked outside the browser). DOM wiring
   lives below, inside an IIFE, and is only executed when `document` exists. */

/* ============================= JSON tool ============================= */

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Turns a byte offset in `input` into a 1-based {line, column}.
function positionToLineColumn(input, pos) {
  const upTo = input.slice(0, Math.max(0, pos));
  const lines = upTo.split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

// JSON.parse's thrown SyntaxError message format varies by engine. Recent V8
// (Node 20+/Chrome) already includes "(line X column Y)"; older V8 includes only
// "position N"; some engines include neither. Extract whatever is available and
// derive the rest from the raw input.
function locateJsonError(input, message) {
  let m = /line (\d+) column (\d+)/i.exec(message);
  if (m) {
    return { message, line: parseInt(m[1], 10), column: parseInt(m[2], 10), position: null };
  }
  m = /position (\d+)/i.exec(message);
  if (m) {
    const position = parseInt(m[1], 10);
    const { line, column } = positionToLineColumn(input, position);
    return { message, line, column, position };
  }
  return { message, line: null, column: null, position: null };
}

function formatJson(input, indent) {
  try {
    const parsed = JSON.parse(input);
    return { ok: true, value: JSON.stringify(parsed, null, indent === undefined ? 2 : indent) };
  } catch (e) {
    return { ok: false, error: locateJsonError(input, e.message) };
  }
}

function minifyJson(input) {
  try {
    const parsed = JSON.parse(input);
    return { ok: true, value: JSON.stringify(parsed) };
  } catch (e) {
    return { ok: false, error: locateJsonError(input, e.message) };
  }
}

// Lightweight tokenizer-based syntax highlighter for already-valid JSON text.
// Returns an HTML string (spans only, safe to assign via innerHTML) — never
// call this on untrusted/unparsed input from outside this tool's own output.
function highlightJson(jsonString) {
  const escaped = escapeHtml(jsonString);
  const tokenRe = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  return escaped.replace(tokenRe, (match) => {
    let cls;
    if (match.startsWith('"')) {
      cls = /:\s*$/.test(match) ? "jk" : "js";
    } else if (match === "true" || match === "false") {
      cls = "jb";
    } else if (match === "null") {
      cls = "jz";
    } else {
      cls = "jn";
    }
    return `<span class="${cls}">${match}</span>`;
  });
}

/* ============================= Base64 tool ============================= */

function base64Encode(str) {
  const input = str === undefined || str === null ? "" : String(str);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf-8").toString("base64");
  }
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64Decode(str) {
  const trimmed = (str === undefined || str === null ? "" : String(str)).trim();
  if (!trimmed) return { ok: false, message: "Input is empty." };

  const stripped = trimmed.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(stripped) || stripped.length % 4 !== 0) {
    return { ok: false, message: "Invalid Base64: contains characters outside the Base64 alphabet, or the length isn't a multiple of 4." };
  }

  try {
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(stripped, "base64");
      // Buffer.from('base64') silently ignores invalid chars rather than throwing;
      // round-trip re-encoding catches truncation/garbage that slipped through.
      if (buf.toString("base64").replace(/=+$/, "") !== stripped.replace(/=+$/, "")) {
        return { ok: false, message: "Invalid Base64: input does not decode cleanly." };
      }
      return { ok: true, value: buf.toString("utf-8") };
    }
    const binary = atob(stripped);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return { ok: true, value: new TextDecoder().decode(bytes) };
  } catch (e) {
    return { ok: false, message: "Invalid Base64 input: " + e.message };
  }
}

/* ============================= URL tool ============================= */

function urlEncode(str) {
  return encodeURIComponent(str === undefined || str === null ? "" : String(str));
}

function urlDecode(str) {
  const input = str === undefined || str === null ? "" : String(str);
  try {
    return { ok: true, value: decodeURIComponent(input) };
  } catch (e) {
    return { ok: false, message: "Invalid percent-encoding: " + e.message };
  }
}

/* ============================= Timestamp tool ============================= */

// Values with magnitude >= 1e12 are treated as milliseconds (that's already
// year ~33658 if read as seconds, so it's an unambiguous signal); everything
// smaller is treated as seconds. This is a heuristic, not exact science —
// documented in the UI next to the "Auto-detect" option.
function detectEpochUnit(value) {
  return Math.abs(value) >= 1e12 ? "milliseconds" : "seconds";
}

function epochToDate(rawValue, unit) {
  const value = typeof rawValue === "number" ? rawValue : Number(String(rawValue).trim());
  if (!Number.isFinite(value)) return { ok: false, message: "Enter a valid number." };

  const resolvedUnit = unit === "auto" ? detectEpochUnit(value) : unit;
  const ms = resolvedUnit === "seconds" ? value * 1000 : value;
  const date = new Date(ms);
  if (isNaN(date.getTime())) return { ok: false, message: "That value is out of range for a valid date." };

  return {
    ok: true,
    resolvedUnit,
    epochSeconds: Math.round(ms / 1000),
    epochMillis: Math.round(ms),
    iso: date.toISOString(),
    utc: date.toUTCString(),
    local: date.toString(),
  };
}

function dateStringToEpoch(dateString) {
  if (!dateString) return { ok: false, message: "Enter a date/time." };
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return { ok: false, message: "Could not parse that date/time." };
  const ms = date.getTime();
  return {
    ok: true,
    epochSeconds: Math.round(ms / 1000),
    epochMillis: ms,
    iso: date.toISOString(),
    utc: date.toUTCString(),
    local: date.toString(),
  };
}

function nowEpoch() {
  const ms = Date.now();
  return { epochSeconds: Math.floor(ms / 1000), epochMillis: ms };
}

/* ============================= Regex tool ============================= */

function buildFlagString(flagObj) {
  let flags = "";
  if (flagObj.g) flags += "g";
  if (flagObj.i) flags += "i";
  if (flagObj.m) flags += "m";
  if (flagObj.s) flags += "s";
  if (flagObj.u) flags += "u";
  if (flagObj.y) flags += "y";
  return flags;
}

function testRegex(pattern, flags, text) {
  let re;
  try {
    re = new RegExp(pattern, flags);
  } catch (e) {
    return { ok: false, message: e.message };
  }

  const input = text === undefined || text === null ? "" : String(text);
  const matches = [];
  const hasG = flags.includes("g");

  if (hasG) {
    let m;
    let guard = 0;
    while ((m = re.exec(input)) !== null && guard < 100000) {
      matches.push(toMatchObj(m));
      if (m.index === re.lastIndex) re.lastIndex += 1; // avoid infinite loop on zero-length matches
      guard += 1;
    }
  } else {
    const m = re.exec(input);
    if (m) matches.push(toMatchObj(m));
  }

  return { ok: true, matches, pattern, flags };
}

function toMatchObj(m) {
  return {
    match: m[0],
    index: m.index,
    groups: m.slice(1),
    namedGroups: m.groups ? Object.assign({}, m.groups) : null,
  };
}

// Wraps each match's substring in `text` with a <mark>, HTML-escaping everything
// else. Assumes matches are sorted by index and non-overlapping (true for
// anything produced by testRegex above).
function highlightMatches(text, matches) {
  const input = text === undefined || text === null ? "" : String(text);
  if (!matches || !matches.length) return escapeHtml(input);

  let result = "";
  let last = 0;
  matches.forEach((m) => {
    if (m.index < last) return; // defensive: skip any overlap
    result += escapeHtml(input.slice(last, m.index));
    result += `<mark class="regex-match">${escapeHtml(m.match)}</mark>`;
    last = m.index + m.match.length;
  });
  result += escapeHtml(input.slice(last));
  return result;
}

/* ============================= UUID tool ============================= */

function bytesToUuid(bytes) {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function uuidV4() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  return bytesToUuid(bytes);
}

// Not a spec-faithful RFC 4122 v1 UUID (no real MAC address, no persistent
// clock sequence across calls) — a "time-ordered" UUID that packs the current
// timestamp into the same fields a real v1 UUID uses, with a random node ID
// and clock sequence. Good enough for roughly time-sortable IDs; labeled
// "v1-style" in the UI rather than claiming full v1 semantics.
function uuidV1Like() {
  const UUID_EPOCH_OFFSET_100NS = 122192928000000000n; // 1582-10-15 -> 1970-01-01, in 100ns units
  const timestamp = BigInt(Date.now()) * 10000n + UUID_EPOCH_OFFSET_100NS;

  const timeLow = Number(timestamp & 0xffffffffn);
  const timeMid = Number((timestamp >> 32n) & 0xffffn);
  const timeHiAndVersion = Number(((timestamp >> 48n) & 0x0fffn) | 0x1000n); // version 1

  const rand = new Uint8Array(8);
  crypto.getRandomValues(rand);
  const clockSeq = (((rand[0] << 8) | rand[1]) & 0x3fff) | 0x8000; // variant 10xx
  const node = rand.slice(2, 8); // random stand-in for a MAC address

  const hex = (n, width) => n.toString(16).padStart(width, "0");
  return [
    hex(timeLow, 8),
    hex(timeMid, 4),
    hex(timeHiAndVersion, 4),
    hex(clockSeq, 4),
    Array.from(node, (b) => hex(b, 2)).join(""),
  ].join("-");
}

function generateUuids(count, version) {
  const n = Math.max(1, Math.min(1000, Math.floor(Number(count) || 1)));
  const out = [];
  for (let i = 0; i < n; i++) out.push(version === "v1" ? uuidV1Like() : uuidV4());
  return out;
}

/* ============================= Hash generator tool ============================= */

// Self-contained MD5 (RFC 1321). SubtleCrypto has no MD5, so this is the one
// algorithm implemented by hand here; SHA-1/256/512 use crypto.subtle below.
function md5(message) {
  function rotl(x, n) { return (x << n) | (x >>> (32 - n)); }
  function toBytesUtf8(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.codePointAt(i);
      if (code > 0xffff) i++; // consumed a surrogate pair
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        bytes.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f)
        );
      }
    }
    return bytes;
  }

  const K = new Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;

  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  const bytes = toBytesUtf8(message === undefined || message === null ? "" : String(message));
  const bitLenLo = (bytes.length * 8) >>> 0;
  const bitLenHi = Math.floor(bytes.length / 0x20000000);

  const padded = bytes.slice();
  padded.push(0x80);
  while (padded.length % 64 !== 56) padded.push(0);
  for (let i = 0; i < 4; i++) padded.push((bitLenLo >>> (8 * i)) & 0xff);
  for (let i = 0; i < 4; i++) padded.push((bitLenHi >>> (8 * i)) & 0xff);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  for (let chunkStart = 0; chunkStart < padded.length; chunkStart += 64) {
    const M = new Array(16);
    for (let i = 0; i < 16; i++) {
      const o = chunkStart + i * 4;
      M[i] = (padded[o] | (padded[o + 1] << 8) | (padded[o + 2] << 16) | (padded[o + 3] << 24)) >>> 0;
    }

    let A = a0, B = b0, C = c0, D = d0;

    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl(F, S[i])) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  function toHexLE(n) {
    let hex = "";
    for (let i = 0; i < 4; i++) hex += ((n >>> (8 * i)) & 0xff).toString(16).padStart(2, "0");
    return hex;
  }

  return toHexLE(a0) + toHexLE(b0) + toHexLE(c0) + toHexLE(d0);
}

// Requires a secure context (crypto.subtle) — https:// or localhost.
async function subtleDigestHex(algorithm, text) {
  const bytes = new TextEncoder().encode(text === undefined || text === null ? "" : String(text));
  const buf = await crypto.subtle.digest(algorithm, bytes);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashText(text) {
  const [sha1, sha256, sha512] = await Promise.all([
    subtleDigestHex("SHA-1", text),
    subtleDigestHex("SHA-256", text),
    subtleDigestHex("SHA-512", text),
  ]);
  return { md5: md5(text), sha1, sha256, sha512 };
}

/* ============================= JWT decoder tool ============================= */

function base64UrlDecode(str) {
  let s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const binary = atob(s);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Decodes header + payload only — this is a decoder, not a verifier. The
// signature segment is surfaced as-is so users can see it exists, never
// checked against a key.
function decodeJwt(token) {
  const trimmed = (token || "").trim();
  if (!trimmed) return { ok: false, message: "Paste a JWT to decode." };
  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return { ok: false, message: `A JWT has 3 dot-separated parts (header.payload.signature); found ${parts.length}.` };
  }

  let header, payload;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]));
  } catch (e) {
    return { ok: false, message: "Could not decode/parse the header: " + e.message };
  }
  try {
    payload = JSON.parse(base64UrlDecode(parts[1]));
  } catch (e) {
    return { ok: false, message: "Could not decode/parse the payload: " + e.message };
  }

  const claimDates = {};
  ["iat", "exp", "nbf"].forEach((k) => {
    if (typeof payload[k] === "number") claimDates[k] = new Date(payload[k] * 1000).toString();
  });
  const expired = typeof payload.exp === "number" ? payload.exp * 1000 < Date.now() : null;

  return { ok: true, header, payload, signature: parts[2], claimDates, expired };
}

/* ============================= Password generator tool ============================= */

const PW_CHAR_SETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.<>?/~",
};
const PW_AMBIGUOUS_RE = /[il1LoO0|]/;

function buildPasswordCharset(options) {
  let charset = "";
  if (options.lower) charset += PW_CHAR_SETS.lower;
  if (options.upper) charset += PW_CHAR_SETS.upper;
  if (options.digits) charset += PW_CHAR_SETS.digits;
  if (options.symbols) charset += PW_CHAR_SETS.symbols;
  if (options.excludeAmbiguous) charset = charset.split("").filter((c) => !PW_AMBIGUOUS_RE.test(c)).join("");
  return charset;
}

function passwordStrengthLabel(bits) {
  if (bits < 40) return "Very weak";
  if (bits < 60) return "Weak";
  if (bits < 80) return "Reasonable";
  if (bits < 100) return "Strong";
  return "Very strong";
}

function generatePassword(options) {
  const length = Math.max(4, Math.min(256, Math.floor(Number(options.length) || 16)));
  const charset = buildPasswordCharset(options);
  if (!charset) return { ok: false, message: "Select at least one character set." };

  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  let value = "";
  for (let i = 0; i < length; i++) value += charset[randomValues[i] % charset.length];

  const bits = Math.round(length * Math.log2(charset.length));
  return { ok: true, value, bits, strength: passwordStrengthLabel(bits) };
}

/* ============================= JSON <-> CSV tool ============================= */

function csvEscapeField(value) {
  const s = value === undefined || value === null ? "" : String(value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function jsonToCsv(jsonString) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (e) {
    return { ok: false, message: "Invalid JSON: " + e.message };
  }
  if (!Array.isArray(data)) return { ok: false, message: "Top-level JSON must be an array of objects." };
  if (data.length === 0) return { ok: true, value: "" };
  if (!data.every((row) => row !== null && typeof row === "object" && !Array.isArray(row))) {
    return { ok: false, message: "Every array item must be a flat object (not an array or primitive)." };
  }

  const columns = [];
  const seen = new Set();
  data.forEach((row) => {
    Object.keys(row).forEach((k) => {
      if (!seen.has(k)) { seen.add(k); columns.push(k); }
    });
  });

  const lines = [columns.map(csvEscapeField).join(",")];
  data.forEach((row) => {
    lines.push(
      columns
        .map((col) => {
          const v = row[col];
          if (v === undefined || v === null) return "";
          if (typeof v === "object") return csvEscapeField(JSON.stringify(v));
          return csvEscapeField(v);
        })
        .join(",")
    );
  });
  return { ok: true, value: lines.join("\r\n") };
}

// Minimal RFC-4180-ish CSV row parser: quoted fields, embedded commas,
// embedded newlines, and doubled-quote escaping.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  row.push(field);
  rows.push(row);
  // Drop a single trailing empty row caused by a final trailing newline.
  if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") rows.pop();
  return rows;
}

function csvToJson(csvString) {
  const trimmed = csvString === undefined || csvString === null ? "" : String(csvString);
  if (!trimmed.trim()) return { ok: false, message: "Input is empty." };
  const rows = parseCsv(trimmed);
  if (!rows.length) return { ok: false, message: "No rows found." };
  const header = rows[0];
  const objects = rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((col, i) => { obj[col] = r[i] === undefined ? "" : r[i]; });
    return obj;
  });
  return { ok: true, value: JSON.stringify(objects, null, 2) };
}

/* ============================= HTML entity encoder/decoder tool ============================= */

const HTML_NAMED_ENCODE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function htmlEntityEncode(str) {
  const input = str === undefined || str === null ? "" : String(str);
  let out = "";
  for (const ch of input) {
    if (HTML_NAMED_ENCODE[ch]) { out += HTML_NAMED_ENCODE[ch]; continue; }
    const cp = ch.codePointAt(0);
    out += cp > 126 ? `&#${cp};` : ch;
  }
  return out;
}

const HTML_NAMED_DECODE = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  copy: "©", reg: "®", trade: "™", hellip: "…",
  mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", euro: "€", pound: "£",
  yen: "¥", cent: "¢", deg: "°", plusmn: "±",
  times: "×", divide: "÷", laquo: "«", raquo: "»",
};

function htmlEntityDecode(str) {
  const input = str === undefined || str === null ? "" : String(str);
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (Number.isNaN(code)) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return Object.prototype.hasOwnProperty.call(HTML_NAMED_DECODE, body) ? HTML_NAMED_DECODE[body] : match;
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    escapeHtml,
    positionToLineColumn,
    locateJsonError,
    formatJson,
    minifyJson,
    highlightJson,
    base64Encode,
    base64Decode,
    urlEncode,
    urlDecode,
    detectEpochUnit,
    epochToDate,
    dateStringToEpoch,
    nowEpoch,
    buildFlagString,
    testRegex,
    highlightMatches,
    bytesToUuid,
    uuidV4,
    uuidV1Like,
    generateUuids,
    md5,
    subtleDigestHex,
    hashText,
    base64UrlDecode,
    decodeJwt,
    buildPasswordCharset,
    passwordStrengthLabel,
    generatePassword,
    csvEscapeField,
    jsonToCsv,
    parseCsv,
    csvToJson,
    htmlEntityEncode,
    htmlEntityDecode,
  };
}

/* ============================= DOM wiring ============================= */

if (typeof document !== "undefined") {
  (() => {
    "use strict";

    function flash(el) {
      el.classList.add("show");
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove("show"), 1100);
    }

    async function copyText(text, flashEl) {
      try {
        await navigator.clipboard.writeText(text);
        flash(flashEl);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        flash(flashEl);
      }
    }

    function showError(el, message) {
      el.textContent = message;
      el.classList.add("show");
    }
    function hideError(el) {
      el.textContent = "";
      el.classList.remove("show");
    }

    /* ---- theme toggle ---- */
    (function initTheme() {
      const stored = localStorage.getItem("dbk-theme");
      if (stored) document.documentElement.setAttribute("data-theme", stored);
      const toggle = document.getElementById("theme-toggle");
      if (!toggle) return;
      toggle.addEventListener("click", () => {
        const current =
          document.documentElement.getAttribute("data-theme") ||
          (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("dbk-theme", next);
      });
    })();

    /* ---- tabs / tool menu ---- */
    (function initTabs() {
      const tabIds = [
        "tab-json", "tab-base64", "tab-url", "tab-timestamp", "tab-regex",
        "tab-uuid", "tab-hash", "tab-jwt", "tab-password", "tab-csv", "tab-entity",
      ];
      const tabs = tabIds.map((id) => document.getElementById(id)).filter(Boolean);
      // No tool menu on this page; nothing to wire up.
      if (!tabs.length) return;

      const panels = {};
      let allPanels = true;
      tabs.forEach((t) => {
        const p = document.getElementById(t.getAttribute("aria-controls"));
        panels[t.id] = p;
        if (!p) allPanels = false;
      });
      // Only the homepage keeps all five tool panels in the DOM. On a standalone
      // tool page the menu links are plain navigation — do not intercept them.
      if (!allPanels) return;

      // Clean-path <-> tab id mapping for pushState / popstate.
      const pathToId = {
        "/json-formatter": "tab-json",
        "/base64-encode-decode": "tab-base64",
        "/url-encoder-decoder": "tab-url",
        "/unix-timestamp-converter": "tab-timestamp",
        "/regex-tester": "tab-regex",
        "/uuid-generator": "tab-uuid",
        "/hash-generator": "tab-hash",
        "/jwt-decoder": "tab-jwt",
        "/password-generator": "tab-password",
        "/json-csv-converter": "tab-csv",
        "/html-entity-encoder": "tab-entity",
      };

      function tabIdForPath(pathname) {
        const clean = pathname.replace(/\.html$/, "").replace(/\/+$/, "");
        return pathToId[clean] || "tab-json"; // "/" (home) defaults to JSON Formatter
      }

      function activate(tab, opts) {
        const options = opts || {};
        tabs.forEach((t) => {
          const active = t === tab;
          t.setAttribute("aria-selected", String(active));
          t.tabIndex = active ? 0 : -1;
          t.classList.toggle("active", active);
          if (active) t.setAttribute("aria-current", "page");
          else t.removeAttribute("aria-current");
          panels[t.id].hidden = !active;
          panels[t.id].classList.toggle("active", active);
        });
        if (options.focus) tab.focus();
        if (options.push) {
          history.pushState({ tool: tab.id }, "", tab.getAttribute("href"));
        }
      }

      tabs.forEach((tab, i) => {
        tab.addEventListener("click", (e) => {
          // Real anchors: middle-click / modified click still open the standalone
          // page. Only intercept plain left-clicks for instant in-page switching.
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          activate(tab, { push: true, focus: true });
        });
        tab.addEventListener("keydown", (e) => {
          let target;
          if (e.key === "ArrowRight") target = tabs[(i + 1) % tabs.length];
          else if (e.key === "ArrowLeft") target = tabs[(i - 1 + tabs.length) % tabs.length];
          else if (e.key === "Home") target = tabs[0];
          else if (e.key === "End") target = tabs[tabs.length - 1];
          if (target) {
            e.preventDefault();
            activate(target, { push: true, focus: true });
          }
        });
      });

      // Browser back/forward restores the correct panel without pushing new state.
      window.addEventListener("popstate", (e) => {
        const id = (e.state && e.state.tool) || tabIdForPath(location.pathname);
        const tab = document.getElementById(id);
        if (tab) activate(tab, { push: false, focus: false });
      });

      // Normalize initial state. Default active on load = JSON Formatter; if the
      // page was loaded directly at a clean tool path, reflect that instead.
      const initial = document.getElementById(tabIdForPath(location.pathname)) || tabs[0];
      activate(initial, { push: false, focus: false });
    })();

    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    /* ---- JSON tool ---- */
    (function jsonTool() {
      const input = document.getElementById("json-input");
      const output = document.getElementById("json-output");
      const errorEl = document.getElementById("json-error");
      const copyFlash = document.getElementById("json-copy-flash");
      if (!input || !output) return;

      function render(result) {
        if (result.ok) {
          hideError(errorEl);
          output.innerHTML = highlightJson(result.value);
          output.dataset.raw = result.value;
        } else {
          output.innerHTML = "";
          output.dataset.raw = "";
          const { message, line, column, position } = result.error;
          let loc = "";
          if (line !== null && column !== null) loc = ` (line ${line}, column ${column})`;
          else if (position !== null) loc = ` (character ${position})`;
          showError(errorEl, `Invalid JSON: ${message}${loc}`);
        }
      }

      document.getElementById("json-format").addEventListener("click", () => render(formatJson(input.value, 2)));
      document.getElementById("json-minify").addEventListener("click", () => render(minifyJson(input.value)));
      document.getElementById("json-clear").addEventListener("click", () => {
        input.value = "";
        output.innerHTML = "";
        output.dataset.raw = "";
        hideError(errorEl);
        input.focus();
      });
      document.getElementById("json-copy").addEventListener("click", () => {
        copyText(output.dataset.raw || "", copyFlash);
      });

      render(formatJson(input.value, 2));
    })();

    /* ---- Base64 tool ---- */
    (function base64Tool() {
      const input = document.getElementById("b64-input");
      const output = document.getElementById("b64-output");
      const errorEl = document.getElementById("b64-error");
      const copyFlash = document.getElementById("b64-copy-flash");
      if (!input || !output) return;

      document.getElementById("b64-encode").addEventListener("click", () => {
        hideError(errorEl);
        const value = base64Encode(input.value);
        output.textContent = value;
      });
      document.getElementById("b64-decode").addEventListener("click", () => {
        const result = base64Decode(input.value);
        if (result.ok) {
          hideError(errorEl);
          output.textContent = result.value;
        } else {
          output.textContent = "";
          showError(errorEl, result.message);
        }
      });
      document.getElementById("b64-clear").addEventListener("click", () => {
        input.value = "";
        output.textContent = "";
        hideError(errorEl);
        input.focus();
      });
      document.getElementById("b64-copy").addEventListener("click", () => {
        copyText(output.textContent || "", copyFlash);
      });
    })();

    /* ---- URL tool ---- */
    (function urlTool() {
      const input = document.getElementById("url-input");
      const output = document.getElementById("url-output");
      const errorEl = document.getElementById("url-error");
      const copyFlash = document.getElementById("url-copy-flash");
      if (!input || !output) return;

      document.getElementById("url-encode").addEventListener("click", () => {
        hideError(errorEl);
        output.textContent = urlEncode(input.value);
      });
      document.getElementById("url-decode").addEventListener("click", () => {
        const result = urlDecode(input.value);
        if (result.ok) {
          hideError(errorEl);
          output.textContent = result.value;
        } else {
          output.textContent = "";
          showError(errorEl, result.message);
        }
      });
      document.getElementById("url-clear").addEventListener("click", () => {
        input.value = "";
        output.textContent = "";
        hideError(errorEl);
        input.focus();
      });
      document.getElementById("url-copy").addEventListener("click", () => {
        copyText(output.textContent || "", copyFlash);
      });
    })();

    /* ---- Timestamp tool ---- */
    (function timestampTool() {
      const epochInput = document.getElementById("ts-epoch-input");
      const unitSelect = document.getElementById("ts-unit");
      const epochError = document.getElementById("ts-epoch-error");
      const dateInput = document.getElementById("ts-date-input");
      const dateError = document.getElementById("ts-date-error");
      const copyFlash = document.getElementById("ts-copy-flash");
      if (!epochInput || !dateInput) return;

      const outLocal = document.getElementById("ts-out-local");
      const outUtc = document.getElementById("ts-out-utc");
      const outIso = document.getElementById("ts-out-iso");
      const outSeconds = document.getElementById("ts-out-seconds");
      const outMillis = document.getElementById("ts-out-millis");
      const outUnit = document.getElementById("ts-out-unit");

      function paint(result) {
        outLocal.textContent = result.local;
        outUtc.textContent = result.utc;
        outIso.textContent = result.iso;
        outSeconds.textContent = String(result.epochSeconds);
        outMillis.textContent = String(result.epochMillis);
        outUnit.textContent = result.resolvedUnit || "—";
      }

      document.getElementById("ts-now").addEventListener("click", () => {
        const now = nowEpoch();
        epochInput.value = String(now.epochSeconds);
        unitSelect.value = "seconds";
        hideError(epochError);
        paint(epochToDate(now.epochSeconds, "seconds"));
      });

      document.getElementById("ts-to-date").addEventListener("click", () => {
        const result = epochToDate(epochInput.value, unitSelect.value);
        if (result.ok) {
          hideError(epochError);
          paint(result);
        } else {
          showError(epochError, result.message);
        }
      });

      document.getElementById("ts-to-epoch").addEventListener("click", () => {
        const result = dateStringToEpoch(dateInput.value);
        if (result.ok) {
          hideError(dateError);
          paint(result);
        } else {
          showError(dateError, result.message);
        }
      });

      document.getElementById("ts-copy").addEventListener("click", () => {
        copyText(outSeconds.textContent || "", copyFlash);
      });
    })();

    /* ---- Regex tool ---- */
    (function regexTool() {
      const patternInput = document.getElementById("regex-pattern");
      const testInput = document.getElementById("regex-test");
      const errorEl = document.getElementById("regex-error");
      const highlightEl = document.getElementById("regex-highlight");
      const matchesEmptyEl = document.getElementById("regex-matches-empty");
      const matchesEl = document.getElementById("regex-matches");
      if (!patternInput || !testInput) return;

      const flagIds = { g: "regex-flag-g", i: "regex-flag-i", m: "regex-flag-m", s: "regex-flag-s", u: "regex-flag-u", y: "regex-flag-y" };

      function currentFlags() {
        const obj = {};
        Object.keys(flagIds).forEach((k) => { obj[k] = document.getElementById(flagIds[k]).checked; });
        return buildFlagString(obj);
      }

      function renderMatches(matches) {
        matchesEl.innerHTML = "";
        if (!matches.length) {
          matchesEl.hidden = true;
          matchesEmptyEl.hidden = false;
          matchesEmptyEl.textContent = "No matches found.";
          return;
        }
        matchesEmptyEl.hidden = true;
        matchesEl.hidden = false;
        matches.forEach((m, i) => {
          const li = document.createElement("li");
          const groupsText = m.groups.length
            ? m.groups.map((g, gi) => `<span>$${gi + 1}: ${g === undefined ? "(no match)" : escapeHtml(g)}</span>`).join("  ")
            : "";
          const namedText = m.namedGroups
            ? Object.keys(m.namedGroups).map((k) => `<span>${escapeHtml(k)}: ${escapeHtml(m.namedGroups[k] ?? "(no match)")}</span>`).join("  ")
            : "";
          li.innerHTML =
            `<span class="match-index">#${i + 1} at index ${m.index}</span><strong>${escapeHtml(m.match)}</strong>` +
            (groupsText ? `<div class="match-groups">${groupsText}</div>` : "") +
            (namedText ? `<div class="match-groups">${namedText}</div>` : "");
          matchesEl.appendChild(li);
        });
      }

      function run() {
        const pattern = patternInput.value;
        const flags = currentFlags();
        const text = testInput.value;
        const result = testRegex(pattern, flags, text);
        if (!result.ok) {
          showError(errorEl, `Invalid regular expression: ${result.message}`);
          highlightEl.innerHTML = escapeHtml(text);
          renderMatches([]);
          return;
        }
        hideError(errorEl);
        highlightEl.innerHTML = highlightMatches(text, result.matches);
        renderMatches(result.matches);
      }

      document.getElementById("regex-run").addEventListener("click", run);
      document.getElementById("regex-clear").addEventListener("click", () => {
        patternInput.value = "";
        testInput.value = "";
        highlightEl.innerHTML = "";
        hideError(errorEl);
        renderMatches([]);
        patternInput.focus();
      });

      run();
    })();

    /* ---- UUID tool ---- */
    (function uuidTool() {
      const countInput = document.getElementById("uuid-count");
      const output = document.getElementById("uuid-output");
      const copyFlash = document.getElementById("uuid-copy-flash");
      const versionBtns = {
        v4: document.getElementById("uuid-version-v4"),
        v1: document.getElementById("uuid-version-v1"),
      };
      if (!countInput || !output || !versionBtns.v4) return;

      let version = "v4";
      function setVersion(v) {
        version = v;
        versionBtns.v4.setAttribute("aria-pressed", String(v === "v4"));
        versionBtns.v1.setAttribute("aria-pressed", String(v === "v1"));
      }
      versionBtns.v4.addEventListener("click", () => setVersion("v4"));
      versionBtns.v1.addEventListener("click", () => setVersion("v1"));

      function render() {
        output.textContent = generateUuids(countInput.value, version).join("\n");
      }

      document.getElementById("uuid-generate").addEventListener("click", render);
      document.getElementById("uuid-clear").addEventListener("click", () => {
        output.textContent = "";
      });
      document.getElementById("uuid-copy").addEventListener("click", () => {
        copyText(output.textContent || "", copyFlash);
      });

      render();
    })();

    /* ---- Hash generator tool ---- */
    (function hashTool() {
      const input = document.getElementById("hash-input");
      const errorEl = document.getElementById("hash-error");
      const copyFlash = document.getElementById("hash-copy-flash");
      const outputs = {
        md5: document.getElementById("hash-out-md5"),
        sha1: document.getElementById("hash-out-sha1"),
        sha256: document.getElementById("hash-out-sha256"),
        sha512: document.getElementById("hash-out-sha512"),
      };
      if (!input || !outputs.md5) return;

      async function run() {
        if (!window.crypto || !crypto.subtle) {
          showError(errorEl, "SHA hashing needs a secure context (HTTPS or localhost). MD5 alone can't cover this.");
          return;
        }
        try {
          const result = await hashText(input.value);
          hideError(errorEl);
          outputs.md5.textContent = result.md5;
          outputs.sha1.textContent = result.sha1;
          outputs.sha256.textContent = result.sha256;
          outputs.sha512.textContent = result.sha512;
        } catch (e) {
          showError(errorEl, "Could not compute hashes: " + e.message);
        }
      }

      document.getElementById("hash-run").addEventListener("click", run);
      document.getElementById("hash-clear").addEventListener("click", () => {
        input.value = "";
        Object.values(outputs).forEach((el) => { el.textContent = "—"; });
        hideError(errorEl);
        input.focus();
      });
      document.querySelectorAll(".hash-copy-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = document.getElementById(btn.dataset.target);
          copyText(target && target.textContent !== "—" ? target.textContent : "", copyFlash);
        });
      });

      run();
    })();

    /* ---- JWT decoder tool ---- */
    (function jwtTool() {
      const input = document.getElementById("jwt-input");
      const errorEl = document.getElementById("jwt-error");
      const headerOut = document.getElementById("jwt-header-output");
      const payloadOut = document.getElementById("jwt-payload-output");
      const claimsEl = document.getElementById("jwt-claims");
      const headerFlash = document.getElementById("jwt-copy-header-flash");
      const payloadFlash = document.getElementById("jwt-copy-payload-flash");
      if (!input || !headerOut || !payloadOut) return;

      function claimItem(label, value) {
        const div = document.createElement("div");
        div.className = "result-item";
        div.innerHTML = `<div class="result-label">${escapeHtml(label)}</div><div class="result-value">${escapeHtml(value)}</div>`;
        return div;
      }

      function render() {
        const result = decodeJwt(input.value);
        claimsEl.innerHTML = "";
        if (!result.ok) {
          showError(errorEl, result.message);
          headerOut.innerHTML = "";
          headerOut.dataset.raw = "";
          payloadOut.innerHTML = "";
          payloadOut.dataset.raw = "";
          return;
        }
        hideError(errorEl);
        const headerJson = JSON.stringify(result.header, null, 2);
        const payloadJson = JSON.stringify(result.payload, null, 2);
        headerOut.innerHTML = highlightJson(headerJson);
        headerOut.dataset.raw = headerJson;
        payloadOut.innerHTML = highlightJson(payloadJson);
        payloadOut.dataset.raw = payloadJson;

        ["iat", "nbf", "exp"].forEach((k) => {
          if (result.claimDates[k]) claimsEl.appendChild(claimItem(k, result.claimDates[k]));
        });
        if (result.expired !== null) {
          claimsEl.appendChild(claimItem("Status", result.expired ? "Expired" : "Not expired"));
        }
        claimsEl.appendChild(claimItem("Signature (unverified)", result.signature));
      }

      document.getElementById("jwt-decode").addEventListener("click", render);
      document.getElementById("jwt-clear").addEventListener("click", () => {
        input.value = "";
        headerOut.innerHTML = "";
        headerOut.dataset.raw = "";
        payloadOut.innerHTML = "";
        payloadOut.dataset.raw = "";
        claimsEl.innerHTML = "";
        hideError(errorEl);
        input.focus();
      });
      document.getElementById("jwt-copy-header").addEventListener("click", () => {
        copyText(headerOut.dataset.raw || "", headerFlash);
      });
      document.getElementById("jwt-copy-payload").addEventListener("click", () => {
        copyText(payloadOut.dataset.raw || "", payloadFlash);
      });

      render();
    })();

    /* ---- Password generator tool ---- */
    (function passwordTool() {
      const lengthInput = document.getElementById("pw-length");
      const lengthValue = document.getElementById("pw-length-value");
      const output = document.getElementById("pw-output");
      const bitsEl = document.getElementById("pw-bits");
      const strengthEl = document.getElementById("pw-strength");
      const errorEl = document.getElementById("pw-error");
      const copyFlash = document.getElementById("pw-copy-flash");
      if (!lengthInput || !output) return;

      const optionIds = { lower: "pw-lower", upper: "pw-upper", digits: "pw-digits", symbols: "pw-symbols", excludeAmbiguous: "pw-exclude-ambiguous" };

      function currentOptions() {
        const opts = { length: lengthInput.value };
        Object.keys(optionIds).forEach((k) => { opts[k] = document.getElementById(optionIds[k]).checked; });
        return opts;
      }

      function render() {
        const result = generatePassword(currentOptions());
        if (!result.ok) {
          showError(errorEl, result.message);
          output.textContent = "";
          bitsEl.textContent = "—";
          strengthEl.textContent = "—";
          return;
        }
        hideError(errorEl);
        output.textContent = result.value;
        bitsEl.textContent = `~${result.bits} bits`;
        strengthEl.textContent = result.strength;
      }

      lengthInput.addEventListener("input", () => {
        lengthValue.textContent = lengthInput.value;
      });
      document.getElementById("pw-generate").addEventListener("click", render);
      document.getElementById("pw-copy").addEventListener("click", () => {
        copyText(output.textContent || "", copyFlash);
      });

      lengthValue.textContent = lengthInput.value;
      render();
    })();

    /* ---- JSON <-> CSV tool ---- */
    (function csvTool() {
      const input = document.getElementById("csv-input");
      const output = document.getElementById("csv-output");
      const errorEl = document.getElementById("csv-error");
      const copyFlash = document.getElementById("csv-copy-flash");
      if (!input || !output) return;

      let lastFormat = "csv"; // drives the downloaded filename/MIME type

      function downloadText(text, filename, mime) {
        const blob = new Blob([text], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      document.getElementById("csv-to-csv").addEventListener("click", () => {
        const result = jsonToCsv(input.value);
        if (result.ok) {
          hideError(errorEl);
          output.textContent = result.value;
          lastFormat = "csv";
        } else {
          output.textContent = "";
          showError(errorEl, result.message);
        }
      });
      document.getElementById("csv-to-json").addEventListener("click", () => {
        const result = csvToJson(input.value);
        if (result.ok) {
          hideError(errorEl);
          output.textContent = result.value;
          lastFormat = "json";
        } else {
          output.textContent = "";
          showError(errorEl, result.message);
        }
      });
      document.getElementById("csv-clear").addEventListener("click", () => {
        input.value = "";
        output.textContent = "";
        hideError(errorEl);
        input.focus();
      });
      document.getElementById("csv-copy").addEventListener("click", () => {
        copyText(output.textContent || "", copyFlash);
      });
      document.getElementById("csv-download").addEventListener("click", () => {
        if (!output.textContent) return;
        const filename = lastFormat === "json" ? "data.json" : "data.csv";
        const mime = lastFormat === "json" ? "application/json" : "text/csv";
        downloadText(output.textContent, filename, mime);
      });
    })();

    /* ---- HTML entity encoder/decoder tool ---- */
    (function htmlEntityTool() {
      const input = document.getElementById("entity-input");
      const output = document.getElementById("entity-output");
      const copyFlash = document.getElementById("entity-copy-flash");
      if (!input || !output) return;

      document.getElementById("entity-encode").addEventListener("click", () => {
        output.textContent = htmlEntityEncode(input.value);
      });
      document.getElementById("entity-decode").addEventListener("click", () => {
        output.textContent = htmlEntityDecode(input.value);
      });
      document.getElementById("entity-clear").addEventListener("click", () => {
        input.value = "";
        output.textContent = "";
        input.focus();
      });
      document.getElementById("entity-copy").addEventListener("click", () => {
        copyText(output.textContent || "", copyFlash);
      });
    })();
  })();
}
