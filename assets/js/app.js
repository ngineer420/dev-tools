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

// RFC 9562 version 7: a 48-bit big-endian Unix timestamp in milliseconds
// followed by random bits, so lexicographic order matches creation order. That
// is the property v4 lacks and the reason v7 is worth having — a v7 primary key
// clusters in a B-tree index instead of scattering across it.
//
// Layout:
//   bytes 0-5   unix_ts_ms, big-endian
//   byte  6     version nibble (0111) + 4 random bits (rand_a high)
//   byte  7     rand_a low
//   byte  8     variant bits (10) + 6 random bits
//   bytes 9-15  rand_b
//
// The 12 bits of rand_a are used as a per-millisecond counter (RFC 9562 §6.2,
// "fixed-length dedicated counter"). Without it, a bulk generation of 1000 ids
// all lands in the same millisecond and comes out in random order — which
// throws away the one property v7 exists to provide. The counter is seeded
// from the low half of its range so there is always headroom to count up, and
// on overflow it borrows the next millisecond rather than repeating a value.
let v7LastMs = 0;
let v7Counter = 0;

function uuidV7() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  let ms = Date.now();
  if (ms > v7LastMs) {
    v7LastMs = ms;
    v7Counter = ((bytes[6] << 8) | bytes[7]) & 0x07ff;
  } else {
    // Same millisecond, or the wall clock stepped backwards: keep the sequence
    // moving forwards regardless, so sort order never breaks.
    ms = v7LastMs;
    v7Counter += 1;
    if (v7Counter > 0x0fff) {
      v7LastMs += 1;
      ms = v7LastMs;
      v7Counter = ((bytes[6] << 8) | bytes[7]) & 0x07ff;
    }
  }

  const t = BigInt(ms);
  for (let i = 0; i < 6; i++) {
    // Byte 0 is the most significant, so shift the furthest for the lowest index.
    bytes[i] = Number((t >> BigInt(8 * (5 - i))) & 0xffn);
  }

  bytes[6] = 0x70 | ((v7Counter >> 8) & 0x0f); // version 7 + counter high nibble
  bytes[7] = v7Counter & 0xff;                 // counter low byte
  bytes[8] = (bytes[8] & 0x3f) | 0x80;         // variant 10xx
  return bytesToUuid(bytes);
}

const UUID_GENERATORS = { v4: uuidV4, v7: uuidV7, v1: uuidV1Like };

function generateUuids(count, version) {
  const n = Math.max(1, Math.min(1000, Math.floor(Number(count) || 1)));
  const make = UUID_GENERATORS[version] || uuidV4;
  const out = [];
  for (let i = 0; i < n; i++) out.push(make());
  return out;
}

/* ============================= Hash generator tool ============================= */

function utf8Bytes(str) {
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

// Self-contained MD5 (RFC 1321). SubtleCrypto has no MD5, so this is the one
// algorithm implemented by hand here; the SHA family uses crypto.subtle below.
function md5(message) {
  return md5Bytes(utf8Bytes(message === undefined || message === null ? "" : String(message)));
}

// The digest over raw bytes. A dropped file must be hashed as bytes: decoding
// it as UTF-8 first would corrupt every non-text file, and the whole point of
// "md5 of this download" is that it matches what the publisher computed.
function md5Bytes(input) {
  function rotl(x, n) { return (x << n) | (x >>> (32 - n)); }

  const K = new Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;

  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  const bytes = Array.from(input || []);
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

const SHA_ALGORITHMS = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Requires a secure context (crypto.subtle) — https:// or localhost.
async function subtleDigestHex(algorithm, text) {
  const bytes = new TextEncoder().encode(text === undefined || text === null ? "" : String(text));
  return toHex(await crypto.subtle.digest(algorithm, bytes));
}

async function subtleDigestBytesHex(algorithm, bytes) {
  return toHex(await crypto.subtle.digest(algorithm, bytes));
}

async function hashText(text) {
  const [sha1, sha256, sha384, sha512] = await Promise.all(
    SHA_ALGORITHMS.map((a) => subtleDigestHex(a, text))
  );
  return { md5: md5(text), sha1, sha256, sha384, sha512 };
}

/**
 * Every digest over raw bytes — used for a dropped or picked file, where the
 * content must not be run through a text decoder first.
 */
async function hashBytes(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const [sha1, sha256, sha384, sha512] = await Promise.all(
    SHA_ALGORITHMS.map((a) => subtleDigestBytesHex(a, view))
  );
  return { md5: md5Bytes(view), sha1, sha256, sha384, sha512 };
}

/**
 * HMAC over text with a text key. Note this is the one place MD5 is absent:
 * crypto.subtle has no HMAC-MD5 and hand-rolling one here would be a worse
 * trade than saying so in the UI.
 */
async function hmacHex(algorithm, key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key === undefined || key === null ? "" : String(key)),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message == null ? "" : String(message)));
  return toHex(sig);
}

/**
 * Compare two hex digests the way a human pasting them wants: whitespace and
 * case are noise, and a length mismatch usually means two different algorithms
 * rather than a corrupted file, which is worth saying out loud.
 */
function compareHashes(a, b) {
  const norm = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, "");
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return { ok: false, status: "empty", message: "Paste two hashes to compare." };
  const nonHex = /[^0-9a-f]/.test(x) || /[^0-9a-f]/.test(y);
  if (x === y) {
    return { ok: true, status: "match", message: "The two hashes match." };
  }
  if (x.length !== y.length) {
    return {
      ok: false,
      status: "length",
      message:
        "No match — and the lengths differ (" + x.length + " vs " + y.length +
        " characters), so these are probably digests from two different algorithms.",
    };
  }
  return {
    ok: false,
    status: nonHex ? "invalid" : "differ",
    message: nonHex
      ? "No match — and at least one value contains characters that are not hexadecimal."
      : "No match — the two hashes are different.",
  };
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

/* ============================= Cron expression tool ============================= */

const CRON_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const CRON_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const CRON_MONTH_ALIASES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const CRON_DAY_ALIASES = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// The @-shorthands every cron implementation accepts, expanded to their
// equivalent five-field form so there is only one code path below.
const CRON_MACROS = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const CRON_FIELDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "dom", min: 1, max: 31, label: "day of month" },
  { name: "month", min: 1, max: 12, label: "month", aliases: CRON_MONTH_ALIASES },
  { name: "dow", min: 0, max: 7, label: "day of week", aliases: CRON_DAY_ALIASES },
];

/**
 * Expand one cron field into the sorted list of values it matches.
 * Handles `*`, `a`, `a-b`, `a-b/n`, `*` + `/n`, comma-separated lists of any of
 * those, and the three-letter month/day names.
 * @returns {{ok: true, values: number[]}|{ok: false, message: string}}
 */
function parseCronField(spec, field) {
  const raw = String(spec == null ? "" : spec).trim();
  // Quartz writes "?" for "no specific value"; treat it as the wildcard it is.
  if (raw === "") return { ok: false, message: "The " + (field.label || field.name) + " field is empty." };

  const values = new Set();
  const alias = (token) => {
    const key = token.toLowerCase();
    if (field.aliases && Object.prototype.hasOwnProperty.call(field.aliases, key)) return field.aliases[key];
    if (!/^\d+$/.test(token)) return NaN;
    return Number(token);
  };

  for (const part of raw.split(",")) {
    const chunk = part.trim();
    if (!chunk) return { ok: false, message: 'Empty entry in the ' + (field.label || field.name) + ' field ("' + raw + '").' };

    const slash = chunk.split("/");
    if (slash.length > 2) {
      return { ok: false, message: 'Too many "/" in "' + chunk + '".' };
    }
    let step = 1;
    if (slash.length === 2) {
      if (!/^\d+$/.test(slash[1]) || Number(slash[1]) === 0) {
        return { ok: false, message: 'Step must be a positive whole number in "' + chunk + '".' };
      }
      step = Number(slash[1]);
    }

    const base = slash[0].trim();
    let lo;
    let hi;
    if (base === "*" || base === "?") {
      lo = field.min;
      hi = field.max;
    } else if (base.includes("-")) {
      const [a, b] = base.split("-");
      lo = alias(a.trim());
      hi = alias(b.trim());
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
        return { ok: false, message: 'Could not read the range "' + base + '" in the ' + (field.label || field.name) + " field." };
      }
    } else {
      lo = alias(base);
      if (!Number.isFinite(lo)) {
        return { ok: false, message: '"' + base + '" is not a valid ' + (field.label || field.name) + " value." };
      }
      // A bare value with a step means "from here to the end of the range",
      // which is the Vixie cron reading of "5/10".
      hi = slash.length === 2 ? field.max : lo;
    }

    if (lo < field.min || hi > field.max || lo > hi) {
      return {
        ok: false,
        message:
          "The " + (field.label || field.name) + " field accepts " + field.min + "–" + field.max +
          ', but got "' + chunk + '".',
      };
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }

  return { ok: true, values: Array.from(values).sort((a, b) => a - b) };
}

/**
 * Parse a standard five-field cron expression (or an @macro).
 * @returns {{ok: true, ...}|{ok: false, message: string}}
 */
function parseCron(expression) {
  let expr = String(expression == null ? "" : expression).trim();
  if (!expr) return { ok: false, message: "Enter a cron expression." };

  const macro = CRON_MACROS[expr.toLowerCase()];
  if (expr.toLowerCase() === "@reboot") {
    return { ok: false, message: "@reboot runs once when the machine starts, so it has no schedule to predict." };
  }
  if (macro) expr = macro;

  const parts = expr.split(/\s+/);
  if (parts.length === 6 || parts.length === 7) {
    return {
      ok: false,
      message:
        "This looks like a " + parts.length + "-field expression (Quartz or a seconds field). " +
        "This tool reads the standard five-field crontab format: minute hour day-of-month month day-of-week.",
    };
  }
  if (parts.length !== 5) {
    return {
      ok: false,
      message: "A cron expression has 5 fields (minute hour day-of-month month day-of-week); found " + parts.length + ".",
    };
  }

  const raw = {};
  const values = {};
  for (let i = 0; i < CRON_FIELDS.length; i++) {
    const field = CRON_FIELDS[i];
    const result = parseCronField(parts[i], field);
    if (!result.ok) return result;
    raw[field.name] = parts[i];
    values[field.name] = result.values;
  }

  // Both 0 and 7 mean Sunday; normalise so day matching is a simple lookup.
  values.dow = Array.from(new Set(values.dow.map((d) => (d === 7 ? 0 : d)))).sort((a, b) => a - b);

  return { ok: true, expression: expr, raw, values };
}

const isWildcard = (spec) => spec === "*" || spec === "?";

function cronFormatList(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return String(items[0]);
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

const pad2 = (n) => String(n).padStart(2, "0");

// The step of a wildcard-with-step field such as "*<slash>5", or null when the
// field is not a plain step. (Written without the literal slash sequence so it
// cannot terminate a comment.)
function cronStep(spec) {
  const m = /^(\*|\?)\/(\d+)$/.exec(String(spec).trim());
  return m ? Number(m[2]) : null;
}

/**
 * Render a parsed expression as a plain-English sentence.
 */
function describeCron(parsed) {
  if (!parsed || !parsed.ok) return "";
  const { raw, values } = parsed;
  const minuteAll = isWildcard(raw.minute);
  const hourAll = isWildcard(raw.hour);
  const minuteStep = cronStep(raw.minute);
  const hourStep = cronStep(raw.hour);

  let time;
  if (minuteAll && hourAll) {
    time = "Every minute";
  } else if (hourAll) {
    if (minuteStep) time = "Every " + minuteStep + " minutes";
    else if (values.minute.length === 1) time = "Every hour at minute " + values.minute[0];
    else time = "Every hour at minutes " + cronFormatList(values.minute);
  } else if (minuteAll) {
    if (hourStep) time = "Every minute, every " + hourStep + " hours";
    else time = "Every minute during " + cronFormatList(values.hour.map((h) => pad2(h) + ":00")) ;
  } else if (minuteStep) {
    time = "Every " + minuteStep + " minutes during " + cronFormatList(values.hour.map((h) => pad2(h) + ":00"));
  } else {
    // Enumerate the actual HH:MM times, unless there are too many to read.
    const times = [];
    for (const h of values.hour) for (const m of values.minute) times.push(pad2(h) + ":" + pad2(m));
    time = times.length <= 8
      ? "At " + cronFormatList(times)
      : "At minutes " + cronFormatList(values.minute) + " past hours " + cronFormatList(values.hour);
  }

  const clauses = [time];

  const domAll = isWildcard(raw.dom);
  const dowAll = isWildcard(raw.dow);

  if (!domAll && !dowAll) {
    // Vixie cron ORs the two day fields when both are restricted. This trips
    // people up constantly, so the sentence says it rather than implying "and".
    clauses.push(
      "on day-of-month " + cronFormatList(values.dom) +
      " or on " + cronFormatList(values.dow.map((d) => CRON_DAY_NAMES[d])) +
      " (cron matches either when both day fields are set)"
    );
  } else if (!domAll) {
    clauses.push("on day-of-month " + cronFormatList(values.dom));
  } else if (!dowAll) {
    clauses.push("only on " + cronFormatList(values.dow.map((d) => CRON_DAY_NAMES[d])));
  }

  if (!isWildcard(raw.month)) {
    clauses.push("in " + cronFormatList(values.month.map((m) => CRON_MONTH_NAMES[m - 1])));
  }

  return clauses.join(", ") + ".";
}

/**
 * Does this calendar day satisfy the month + day-of-month/day-of-week rules?
 *
 * Read in UTC, because that is the clock the schedule is interpreted against
 * (see `nextCronRuns`). Pass a Date built with `Date.UTC`.
 */
function cronDayMatches(date, parsed) {
  const { raw, values } = parsed;
  if (!values.month.includes(date.getUTCMonth() + 1)) return false;

  const domRestricted = !isWildcard(raw.dom);
  const dowRestricted = !isWildcard(raw.dow);
  const domOk = values.dom.includes(date.getUTCDate());
  const dowOk = values.dow.includes(date.getUTCDay());

  if (domRestricted && dowRestricted) return domOk || dowOk;
  if (domRestricted) return domOk;
  if (dowRestricted) return dowOk;
  return true;
}

/**
 * The next `count` times this expression fires, at or after `from`.
 *
 * The fields are read as **UTC** wall-clock values, because a crontab is
 * overwhelmingly a server's crontab and servers are overwhelmingly on UTC.
 * Reading them against the visitor's own clock instead would silently answer a
 * different question: someone in Denver asking about `0 3 * * *` would be told
 * 03:00 their time when the job actually fires at 20:00 the previous day for
 * them. The returned values are absolute instants; `formatCronRun` renders one
 * into whichever zone the reader wants to see it in.
 *
 * Walks day by day and only then over the matching hours and minutes, rather
 * than testing every minute — otherwise a rare schedule such as "1st of
 * February" would mean millions of iterations to find one run.
 */
function nextCronRuns(parsed, from, count) {
  if (!parsed || !parsed.ok) return [];
  const wanted = Math.max(1, Math.min(50, Math.floor(count || 5)));
  const at = from instanceof Date ? from.getTime() : Date.now();
  // Cron has minute resolution; begin at the start of the next minute.
  const start = new Date(Math.floor(at / 60000) * 60000 + 60000);

  const out = [];
  const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  // Twenty years is enough to return five runs even for the rarest realistic
  // schedule (29 February, which fires once every four years), while still
  // terminating on an expression that can never match at all, such as
  // "30 February". It is only ~7300 day-tests, so the bound costs nothing.
  const limit = new Date(day.getTime());
  limit.setUTCFullYear(limit.getUTCFullYear() + 20);

  while (day <= limit && out.length < wanted) {
    if (cronDayMatches(day, parsed)) {
      for (const h of parsed.values.hour) {
        if (out.length >= wanted) break;
        for (const m of parsed.values.minute) {
          const when = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m, 0, 0));
          if (when < start) continue;
          out.push(when);
          if (out.length >= wanted) break;
        }
      }
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out;
}

/* ---- rendering a run instant into a zone ---- */

/** The IANA zone the browser (or Node) thinks it is in, e.g. "America/Denver". */
function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (e) {
    return "UTC";
  }
}

/**
 * The full IANA zone list, straight from the platform, so no data file has to
 * be shipped or kept up to date. Older engines without `supportedValuesOf`
 * fall back to just the two zones the tool cares about most.
 */
function cronTimeZoneList() {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      const zones = Intl.supportedValuesOf("timeZone");
      if (Array.isArray(zones) && zones.length) return zones;
    }
  } catch (e) { /* fall through */ }
  const local = localTimeZone();
  return local === "UTC" ? ["UTC"] : ["UTC", local];
}

/** The `timeZoneName: "short"` string a given locale gives this zone. */
function zoneNameIn(locale, date, zone) {
  const part = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part ? part.value : "";
}

/**
 * The short zone name to print beside a run — "MDT", "BST", or a bare offset.
 *
 * No single locale knows every abbreviation: en-US has the American ones and
 * calls Paris "GMT+2", en-GB has the European ones and calls Denver "GMT-6".
 * Ask both and take whichever produced letters, because "MDT" tells a reader
 * which side of a DST change they are on and "GMT-6" does not. Zones with no
 * abbreviation in either (most of Asia and Oceania) keep the offset, which is
 * unambiguous anyway.
 */
function cronZoneAbbr(date, zone) {
  const us = zoneNameIn("en-US", date, zone);
  if (us && !/^(GMT|UTC)/.test(us)) return us;
  const gb = zoneNameIn("en-GB", date, zone);
  if (gb && !/^(GMT|UTC)/.test(gb)) return gb;
  return us || gb || zone;
}

/**
 * Render one run instant for display in `timeZone`.
 *
 * Returns the pieces separately rather than one string so the caller can lay
 * the date, the time and the zone abbreviation out however it likes, and so it
 * can tell whether two zones land on different calendar days.
 */
function formatCronRun(date, timeZone) {
  const zone = timeZone || "UTC";
  const parts = {};
  let abbr = zone;
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      weekday: "short", year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    fmt.formatToParts(date).forEach((p) => { parts[p.type] = p.value; });
    abbr = cronZoneAbbr(date, zone);
  } catch (e) {
    // An unknown zone name would otherwise throw and blank the whole list.
    return formatCronRun(date, "UTC");
  }
  // en-GB renders midnight as "24:00" on some engines; cron never means that.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    zone: zone,
    // "GMT" is what en-GB calls UTC; the tool says UTC everywhere else, and
    // switching names mid-page is exactly the ambiguity this issue is about.
    abbr: zone === "UTC" ? "UTC" : abbr,
    day: parts.weekday + ", " + parts.day + " " + parts.month + " " + parts.year,
    time: hour + ":" + parts.minute,
    // Used only to compare whether two zones land on the same calendar day.
    dateKey: parts.year + "-" + parts.month + "-" + parts.day,
  };
}

/* ============================= Colour tools ============================= *
   Shared by /color-converter and /contrast-checker. Pure arithmetic, no DOM,
   no dependencies. Conversions follow CSS Color Level 4; the contrast maths
   follows WCAG 2.1 (Understanding SC 1.4.3), quoted in the comments below so
   the thresholds are auditable without leaving the file. */

/* The 148 CSS named colours (CSS Color Level 4, §6.1 "Named Colors"), including
   the grey/gray spelling pairs and rebeccapurple. Inlined rather than fetched —
   this site makes zero external requests. */
const CSS_NAMED_COLORS = {
  aliceblue: "#f0f8ff", antiquewhite: "#faebd7", aqua: "#00ffff",
  aquamarine: "#7fffd4", azure: "#f0ffff", beige: "#f5f5dc", bisque: "#ffe4c4",
  black: "#000000", blanchedalmond: "#ffebcd", blue: "#0000ff",
  blueviolet: "#8a2be2", brown: "#a52a2a", burlywood: "#deb887",
  cadetblue: "#5f9ea0", chartreuse: "#7fff00", chocolate: "#d2691e",
  coral: "#ff7f50", cornflowerblue: "#6495ed", cornsilk: "#fff8dc",
  crimson: "#dc143c", cyan: "#00ffff", darkblue: "#00008b", darkcyan: "#008b8b",
  darkgoldenrod: "#b8860b", darkgray: "#a9a9a9", darkgreen: "#006400",
  darkgrey: "#a9a9a9", darkkhaki: "#bdb76b", darkmagenta: "#8b008b",
  darkolivegreen: "#556b2f", darkorange: "#ff8c00", darkorchid: "#9932cc",
  darkred: "#8b0000", darksalmon: "#e9967a", darkseagreen: "#8fbc8f",
  darkslateblue: "#483d8b", darkslategray: "#2f4f4f", darkslategrey: "#2f4f4f",
  darkturquoise: "#00ced1", darkviolet: "#9400d3", deeppink: "#ff1493",
  deepskyblue: "#00bfff", dimgray: "#696969", dimgrey: "#696969",
  dodgerblue: "#1e90ff", firebrick: "#b22222", floralwhite: "#fffaf0",
  forestgreen: "#228b22", fuchsia: "#ff00ff", gainsboro: "#dcdcdc",
  ghostwhite: "#f8f8ff", gold: "#ffd700", goldenrod: "#daa520", gray: "#808080",
  green: "#008000", greenyellow: "#adff2f", grey: "#808080",
  honeydew: "#f0fff0", hotpink: "#ff69b4", indianred: "#cd5c5c",
  indigo: "#4b0082", ivory: "#fffff0", khaki: "#f0e68c", lavender: "#e6e6fa",
  lavenderblush: "#fff0f5", lawngreen: "#7cfc00", lemonchiffon: "#fffacd",
  lightblue: "#add8e6", lightcoral: "#f08080", lightcyan: "#e0ffff",
  lightgoldenrodyellow: "#fafad2", lightgray: "#d3d3d3", lightgreen: "#90ee90",
  lightgrey: "#d3d3d3", lightpink: "#ffb6c1", lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa", lightskyblue: "#87cefa", lightslategray: "#778899",
  lightslategrey: "#778899", lightsteelblue: "#b0c4de", lightyellow: "#ffffe0",
  lime: "#00ff00", limegreen: "#32cd32", linen: "#faf0e6", magenta: "#ff00ff",
  maroon: "#800000", mediumaquamarine: "#66cdaa", mediumblue: "#0000cd",
  mediumorchid: "#ba55d3", mediumpurple: "#9370db", mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee", mediumspringgreen: "#00fa9a",
  mediumturquoise: "#48d1cc", mediumvioletred: "#c71585",
  midnightblue: "#191970", mintcream: "#f5fffa", mistyrose: "#ffe4e1",
  moccasin: "#ffe4b5", navajowhite: "#ffdead", navy: "#000080",
  oldlace: "#fdf5e6", olive: "#808000", olivedrab: "#6b8e23", orange: "#ffa500",
  orangered: "#ff4500", orchid: "#da70d6", palegoldenrod: "#eee8aa",
  palegreen: "#98fb98", paleturquoise: "#afeeee", palevioletred: "#db7093",
  papayawhip: "#ffefd5", peachpuff: "#ffdab9", peru: "#cd853f", pink: "#ffc0cb",
  plum: "#dda0dd", powderblue: "#b0e0e6", purple: "#800080",
  rebeccapurple: "#663399", red: "#ff0000", rosybrown: "#bc8f8f",
  royalblue: "#4169e1", saddlebrown: "#8b4513", salmon: "#fa8072",
  sandybrown: "#f4a460", seagreen: "#2e8b57", seashell: "#fff5ee",
  sienna: "#a0522d", silver: "#c0c0c0", skyblue: "#87ceeb",
  slateblue: "#6a5acd", slategray: "#708090", slategrey: "#708090",
  snow: "#fffafa", springgreen: "#00ff7f", steelblue: "#4682b4",
  tan: "#d2b48c", teal: "#008080", thistle: "#d8bfd8", tomato: "#ff6347",
  turquoise: "#40e0d0", violet: "#ee82ee", wheat: "#f5deb3", white: "#ffffff",
  whitesmoke: "#f5f5f5", yellow: "#ffff00", yellowgreen: "#9acd32",
};

// Reverse table, built once. Where two names share a hex (gray/grey, aqua/cyan)
// the first spelling in the table above wins, so the answer is stable.
const CSS_HEX_TO_NAME = (() => {
  const out = {};
  Object.keys(CSS_NAMED_COLORS).forEach((name) => {
    const hex = CSS_NAMED_COLORS[name];
    if (!(hex in out)) out[hex] = name;
  });
  return out;
})();

function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}
function clamp255(n) {
  return clamp(Math.round(n), 0, 255);
}

// Trims a float for display: 33.333 -> "33.33", 50 -> "50", 49.9999 -> "50".
function trimNum(n, places) {
  const p = places === undefined ? 2 : places;
  return String(parseFloat(n.toFixed(p)));
}

/* ---------- hex ---------- */

// #RGB, #RGBA, #RRGGBB and #RRGGBBAA, with or without the leading '#'.
// Returns {r,g,b,a} with a in 0..1, or null.
function parseHexColor(input) {
  const s = String(input).trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(s)) return null;
  let hex = s;
  if (s.length === 3 || s.length === 4) {
    hex = s.split("").map((c) => c + c).join("");
  } else if (s.length !== 6 && s.length !== 8) {
    return null;
  }
  const num = (i) => parseInt(hex.slice(i, i + 2), 16);
  return {
    r: num(0),
    g: num(2),
    b: num(4),
    a: hex.length === 8 ? num(6) / 255 : 1,
  };
}

// Alpha is only emitted when it is not fully opaque, so the common case stays
// the six-digit hex everyone pastes into a stylesheet.
function rgbToHex(rgb) {
  const two = (n) => clamp255(n).toString(16).padStart(2, "0");
  let out = "#" + two(rgb.r) + two(rgb.g) + two(rgb.b);
  const a = rgb.a === undefined ? 1 : rgb.a;
  if (a < 1) out += clamp(Math.round(a * 255), 0, 255).toString(16).padStart(2, "0");
  return out;
}

/* ---------- HSL / HSV ---------- */

// h in 0..360, s and l in 0..100.
function rgbToHsl(rgb) {
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(hsl) {
  const h = ((hsl.h % 360) + 360) % 360;
  const s = clamp(hsl.s, 0, 100) / 100;
  const l = clamp(hsl.l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return {
    r: clamp255((rgb[0] + m) * 255),
    g: clamp255((rgb[1] + m) * 255),
    b: clamp255((rgb[2] + m) * 255),
  };
}

// h in 0..360, s and v in 0..100. HSV is not a CSS colour space; it is here
// because it is what every colour picker's square-and-slider actually is.
function rgbToHsv(rgb) {
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: (max === 0 ? 0 : d / max) * 100, v: max * 100 };
}

function hsvToRgb(hsv) {
  const h = ((hsv.h % 360) + 360) % 360;
  const s = clamp(hsv.s, 0, 100) / 100;
  const v = clamp(hsv.v, 0, 100) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return {
    r: clamp255((rgb[0] + m) * 255),
    g: clamp255((rgb[1] + m) * 255),
    b: clamp255((rgb[2] + m) * 255),
  };
}

/* ---------- named colours, both directions ---------- */

function namedColorToRgb(name) {
  const hex = CSS_NAMED_COLORS[String(name).trim().toLowerCase()];
  return hex ? parseHexColor(hex) : null;
}

// Exact matches only — "close to tomato" is not a fact worth printing.
function rgbToNamedColor(rgb) {
  const a = rgb.a === undefined ? 1 : rgb.a;
  if (a < 1) return null;
  return CSS_HEX_TO_NAME[rgbToHex({ r: rgb.r, g: rgb.g, b: rgb.b })] || null;
}

/* ---------- the one entry point ---------- */

// Number or percentage, scaled to `full` (255 for rgb channels, 1 for alpha).
function colorComponent(token, full) {
  const t = token.trim();
  if (t === "") return null;
  const pct = t.endsWith("%");
  const n = parseFloat(pct ? t.slice(0, -1) : t);
  if (!isFinite(n)) return null;
  return pct ? (n / 100) * full : n;
}

// Splits "10 20 30 / .5" or "10, 20, 30, .5" into up to four raw tokens.
function splitColorArgs(body) {
  const slash = body.split("/");
  const head = slash[0].trim().replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (slash.length > 1) head.push(slash[1].trim());
  return head;
}

/* Accepts every notation the two pages offer, in any of the forms a developer
   is likely to paste: hex (3/4/6/8 digits, '#' optional), rgb()/rgba(),
   hsl()/hsla(), hsv()/hsb() and a CSS colour name. Legacy comma syntax and
   Level 4 space syntax both parse. Returns {ok, r, g, b, a, format} or
   {ok:false, error}. */
function parseColor(input) {
  const raw = String(input == null ? "" : input).trim();
  if (!raw) return { ok: false, error: "Enter a color value." };

  const named = namedColorToRgb(raw);
  if (named) return { ok: true, r: named.r, g: named.g, b: named.b, a: 1, format: "name" };

  const fn = /^([a-zA-Z]+)\s*\(([^)]*)\)$/.exec(raw);
  if (fn) {
    const name = fn[1].toLowerCase();
    const args = splitColorArgs(fn[2]);
    if (args.length < 3) return { ok: false, error: name + "() needs three values." };
    const alpha = args.length > 3 ? colorComponent(args[3], 1) : 1;
    if (alpha === null) return { ok: false, error: "Alpha is not a number." };
    const a = clamp(alpha, 0, 1);

    if (name === "rgb" || name === "rgba") {
      const c = args.slice(0, 3).map((t) => colorComponent(t, 255));
      if (c.some((v) => v === null)) return { ok: false, error: "rgb() needs three numbers." };
      return { ok: true, r: clamp255(c[0]), g: clamp255(c[1]), b: clamp255(c[2]), a, format: "rgb" };
    }
    if (name === "hsl" || name === "hsla" || name === "hsv" || name === "hsb" ||
        name === "hsva" || name === "hsba") {
      const h = parseFloat(args[0].replace(/deg$/i, ""));
      const s = colorComponent(args[1], 100);
      const third = colorComponent(args[2], 100);
      if (!isFinite(h) || s === null || third === null) {
        return { ok: false, error: name + "() needs a hue and two percentages." };
      }
      const rgb = name.startsWith("hsl")
        ? hslToRgb({ h, s, l: third })
        : hsvToRgb({ h, s, v: third });
      return { ok: true, r: rgb.r, g: rgb.g, b: rgb.b, a, format: name.slice(0, 3) };
    }
    return { ok: false, error: "Unknown color function " + name + "()." };
  }

  const hex = parseHexColor(raw);
  if (hex) return { ok: true, r: hex.r, g: hex.g, b: hex.b, a: hex.a, format: "hex" };

  return { ok: false, error: "Not a color: try #3ce688, rgb(60 230 136), hsl(147 77% 57%) or a CSS name." };
}

/* ---------- formatting ---------- */

function formatHex(c) {
  return rgbToHex(c);
}
function formatRgb(c) {
  const a = c.a === undefined ? 1 : c.a;
  const body = [clamp255(c.r), clamp255(c.g), clamp255(c.b)].join(", ");
  return a < 1 ? "rgba(" + body + ", " + trimNum(a, 3) + ")" : "rgb(" + body + ")";
}
function formatHsl(c) {
  const hsl = rgbToHsl(c);
  const a = c.a === undefined ? 1 : c.a;
  const body = trimNum(hsl.h, 0) + ", " + trimNum(hsl.s, 1) + "%, " + trimNum(hsl.l, 1) + "%";
  return a < 1 ? "hsla(" + body + ", " + trimNum(a, 3) + ")" : "hsl(" + body + ")";
}
function formatHsv(c) {
  const hsv = rgbToHsv(c);
  const a = c.a === undefined ? 1 : c.a;
  const body = trimNum(hsv.h, 0) + ", " + trimNum(hsv.s, 1) + "%, " + trimNum(hsv.v, 1) + "%";
  return a < 1 ? "hsva(" + body + ", " + trimNum(a, 3) + ")" : "hsv(" + body + ")";
}

/* ---------- WCAG contrast ---------- */

/* WCAG 2.1, "relative luminance":
     if C <= 0.03928 then C/12.92 else ((C + 0.055) / 1.055) ^ 2.4
     L = 0.2126 R + 0.7152 G + 0.0722 B
   (WCAG 2.2 restates the threshold as 0.04045, matching IEC 61966-2-1. Both
   land on the same branch for every 8-bit channel value, so the two spellings
   cannot disagree here.) */
function channelLuminance(value) {
  const c = clamp(value, 0, 255) / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb) {
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

/* WCAG 2.1, "contrast ratio": (L1 + 0.05) / (L2 + 0.05), lighter over darker,
   so the result is always >= 1 and order of arguments does not matter. */
function contrastRatio(rgbA, rgbB) {
  const l1 = relativeLuminance(rgbA);
  const l2 = relativeLuminance(rgbB);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/* Composites a translucent colour over an opaque backdrop. A ratio is only
   defined for what the eye actually receives, so an alpha-carrying foreground
   has to be flattened before it is measured. */
function flattenOver(fg, bg) {
  const a = fg.a === undefined ? 1 : clamp(fg.a, 0, 1);
  return {
    r: clamp255(fg.r * a + bg.r * (1 - a)),
    g: clamp255(fg.g * a + bg.g * (1 - a)),
    b: clamp255(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

/* The thresholds, from WCAG 2.1 SC 1.4.3 (Contrast (Minimum), AA), 1.4.6
   (Contrast (Enhanced), AAA) and 1.4.11 (Non-text Contrast, AA). "Large" is
   at least 18pt, or 14pt bold — roughly 24px and 18.66px bold on the web.
   There is no AAA requirement for non-text contrast, hence the null. */
const WCAG_THRESHOLDS = [
  { key: "normalAA",  label: "Normal text",    level: "AA",  min: 4.5 },
  { key: "normalAAA", label: "Normal text",    level: "AAA", min: 7 },
  { key: "largeAA",   label: "Large text",     level: "AA",  min: 3 },
  { key: "largeAAA",  label: "Large text",     level: "AAA", min: 4.5 },
  { key: "uiAA",      label: "UI components",  level: "AA",  min: 3 },
];

// Ratios are reported to two decimals, and the pass test uses that rounded
// figure: 4.4996 renders as "4.50", and a badge that reads 4.50 next to a FAIL
// is a bug report waiting to happen.
function roundRatio(ratio) {
  return Math.round(ratio * 100) / 100;
}

function wcagResults(ratio) {
  const r = roundRatio(ratio);
  return WCAG_THRESHOLDS.map((t) => ({
    key: t.key,
    label: t.label,
    level: t.level,
    min: t.min,
    pass: r >= t.min,
  }));
}

/* ---------- OKLCH, used only to walk lightness ---------- */

/* Oklab, from Björn Ottosson's derivation (the matrices CSS Color Level 4 §9.2
   adopts verbatim). It is here for one reason: nudging a colour's lightness in
   sRGB or HSL visibly shifts its hue, and Oklab's L axis is perceptually
   uniform, so the nudged colour still reads as the same colour. There is no
   OKLCH input row on either page — this is machinery, not a feature. */
function srgbToLinear(c) {
  const v = clamp(c, 0, 255) / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v) {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return c * 255;
}

function rgbToOklch(rgb) {
  const r = srgbToLinear(rgb.r), g = srgbToLinear(rgb.g), b = srgbToLinear(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c: Math.sqrt(A * A + B * B), h };
}

// Out-of-gamut results are clamped per channel, which is why every caller
// re-measures the colour it gets back instead of trusting the requested L.
function oklchToRgb(oklch) {
  const A = oklch.c * Math.cos((oklch.h * Math.PI) / 180);
  const B = oklch.c * Math.sin((oklch.h * Math.PI) / 180);
  const l = Math.pow(oklch.l + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(oklch.l - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(oklch.l - 0.0894841775 * A - 1.2914855480 * B, 3);
  return {
    r: clamp255(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp255(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp255(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)),
  };
}

/* Walks the foreground's OKLCH lightness — chroma and hue held — until the pair
   clears `target`, and returns whichever direction moved least. Both colours
   must already be opaque; the caller flattens alpha first. Every candidate is
   round-tripped back through sRGB and re-measured, so the ratio reported is the
   ratio of the hex reported, gamut clamping included. Returns {ok:false, best}
   when the target is unreachable in either direction, which is the honest
   answer for e.g. 7:1 against a mid-grey background. */
function nudgeLightnessToPass(fg, bg, target) {
  const flatBg = { r: bg.r, g: bg.g, b: bg.b };
  const start = rgbToOklch(fg);
  const STEP = 0.002;
  let bestRatio = roundRatio(contrastRatio(fg, flatBg));

  function walk(sign) {
    for (let i = 1; i <= 500; i++) {
      const l = start.l + sign * i * STEP;
      if (l < 0 || l > 1) break;
      const rgb = oklchToRgb({ l, c: start.c, h: start.h });
      const ratio = roundRatio(contrastRatio(rgb, flatBg));
      if (ratio > bestRatio) bestRatio = ratio;
      if (ratio >= target) return { rgb, ratio, delta: i * STEP, l };
    }
    return null;
  }

  const up = walk(1);
  const down = walk(-1);
  const pick = !up ? down : !down ? up : up.delta <= down.delta ? up : down;
  if (!pick) {
    return {
      ok: false,
      error: "No lightness of this color reaches " + target + ":1 on that background.",
      best: bestRatio,
    };
  }
  return {
    ok: true,
    rgb: pick.rgb,
    hex: rgbToHex(pick.rgb),
    ratio: pick.ratio,
    lightness: pick.l,
    direction: pick === up ? "lighter" : "darker",
  };
}

/* ============================= Number base converter =============================
   Everything here is BigInt end to end, on purpose. A base converter built on
   Number silently stops being correct somewhere above 2^53: parseInt("9007199254740993")
   and 0xFFFFFFFFFFFFFFFF both come back wrong, and the sites that own these
   queries mostly do come back wrong. Exactness past Number.MAX_SAFE_INTEGER and
   correct two's complement at a fixed width are the two things worth being
   right about here, so both are implemented rather than approximated.

   Radix conversion is hand-rolled (repeated division / Horner) rather than
   leaning on BigInt.prototype.toString(radix). It costs ten lines, it makes the
   digit alphabet explicit in both directions, and it is what the tests pin. */

const BASE_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

// Prefixes are only honoured when they agree with the base being read, so
// "0b11" in base 16 is a plain hex number (0xB11) and not a silent base switch.
const BASE_PREFIXES = { "0x": 16, "0b": 2, "0o": 8 };

function baseIsValid(base) {
  return Number.isInteger(base) && base >= 2 && base <= 36;
}

function digitValue(ch) {
  const i = BASE_DIGITS.indexOf(ch.toLowerCase());
  return i === -1 ? -1 : i;
}

/* Reads `str` as an integer in `base` and returns an exact BigInt.

   Accepts a leading sign, an agreeing 0x/0b/0o prefix, and _ , or spaces as
   digit separators (people paste 1_000_000 and 1010 1010). Everything else is
   an error with the offending character named, because "invalid input" on a
   40-digit paste is useless. */
function parseInBase(str, base) {
  if (!baseIsValid(base)) return { ok: false, error: "Base must be a whole number from 2 to 36." };
  const raw = str === undefined || str === null ? "" : String(str);
  let s = raw.trim();
  if (!s) return { ok: false, error: "" };

  let negative = false;
  if (s[0] === "+" || s[0] === "-") {
    negative = s[0] === "-";
    s = s.slice(1).trim();
  }

  const prefix = s.slice(0, 2).toLowerCase();
  if (BASE_PREFIXES[prefix] === base) s = s.slice(2);

  s = s.replace(/[_,\s]/g, "");
  if (!s) return { ok: false, error: "No digits to read." };

  const big = BigInt(base);
  let value = 0n;
  for (const ch of s) {
    const d = digitValue(ch);
    if (d === -1 || d >= base) {
      return {
        ok: false,
        error: '"' + ch + '" is not a base-' + base + " digit (valid: " +
          baseDigitRange(base) + ").",
      };
    }
    value = value * big + BigInt(d);
  }
  return { ok: true, value: negative ? -value : value };
}

function baseDigitRange(base) {
  if (base <= 10) return "0–" + (base - 1);
  return "0–9 and a–" + BASE_DIGITS[base - 1];
}

/* The exact inverse. Repeated division by the base, least significant digit
   first, so the only arithmetic involved is BigInt division and remainder —
   both exact at any magnitude. */
function formatInBase(value, base) {
  if (!baseIsValid(base)) return "";
  let v = typeof value === "bigint" ? value : BigInt(value);
  const negative = v < 0n;
  if (negative) v = -v;
  if (v === 0n) return "0";
  const big = BigInt(base);
  let out = "";
  while (v > 0n) {
    out = BASE_DIGITS[Number(v % big)] + out;
    v /= big;
  }
  return negative ? "-" + out : out;
}

const BIT_WIDTHS = [8, 16, 32, 64];

function widthIsValid(bits) {
  return BIT_WIDTHS.indexOf(Number(bits)) !== -1;
}

function bitMask(bits) {
  return (1n << BigInt(bits)) - 1n;
}

/* The unsigned bit pattern a `bits`-wide register would hold for `value`.

   BigInt's & operates on the infinite two's-complement representation, so
   (-1n & 0xFFFFFFFFn) is 0xFFFFFFFFn with no special-casing for the sign —
   which is exactly the semantics a hardware register has. */
function toTwosComplement(value, bits) {
  const v = typeof value === "bigint" ? value : BigInt(value);
  return v & bitMask(bits);
}

/* And back: read a `bits`-wide pattern as a signed value. This is the case the
   incumbents fumble — 0xFFFFFFFF is 4294967295 unsigned and -1 signed, and a
   converter that only ever answers one of those is wrong half the time. */
function fromTwosComplement(pattern, bits) {
  const p = toTwosComplement(pattern, bits);
  const signBit = 1n << BigInt(bits - 1);
  return p >= signBit ? p - (1n << BigInt(bits)) : p;
}

function signedRange(bits) {
  const half = 1n << BigInt(bits - 1);
  return { min: -half, max: half - 1n };
}

function unsignedRange(bits) {
  return { min: 0n, max: bitMask(bits) };
}

/* Does `value` survive being written into a `bits`-wide field of this signedness
   without changing? Used to label rather than to refuse: the wrapped answer is
   still shown, it is just told about. */
function fitsInWidth(value, bits, signed) {
  const v = typeof value === "bigint" ? value : BigInt(value);
  const r = signed ? signedRange(bits) : unsignedRange(bits);
  return v >= r.min && v <= r.max;
}

/* Groups a digit string for reading: nibbles in binary, pairs in hex, threes
   everywhere else. Grouping runs from the least significant digit, which is the
   only direction that keeps the columns aligned to real place values. */
function groupDigits(digits, base) {
  const size = base === 2 ? 4 : base === 16 ? 2 : 3;
  const negative = digits.startsWith("-");
  const body = negative ? digits.slice(1) : digits;
  if (body.length <= size) return digits;
  const parts = [];
  for (let end = body.length; end > 0; end -= size) {
    parts.unshift(body.slice(Math.max(0, end - size), end));
  }
  return (negative ? "-" : "") + parts.join(" ");
}

/* Zero-pads a fixed-width pattern out to its full digit count, so an 8-bit 5
   reads 00000101 rather than 101. Only meaningful for bases that divide the
   width evenly — binary, octal-ish and hex — so anything else is left alone. */
function padToWidth(digits, base, bits) {
  if (!widthIsValid(bits)) return digits;
  let perDigit = 0;
  if (base === 2) perDigit = 1;
  else if (base === 4) perDigit = 2;
  else if (base === 8) perDigit = 3;
  else if (base === 16) perDigit = 4;
  else if (base === 32) perDigit = 5;
  else return digits;
  const want = Math.ceil(bits / perDigit);
  return digits.length >= want ? digits : "0".repeat(want - digits.length) + digits;
}

/* The whole answer for one input, in every base at once.

   `bits` is null for arbitrary-precision mode, in which case a negative input
   simply keeps its minus sign and nothing is masked. With a width set, the
   register semantics take over: `pattern` is what the hardware holds, `signed`
   is that pattern read as two's complement, `unsigned` is the same pattern read
   without a sign, and `wrapped` says whether the input had to lose information
   to get there. */
function convertNumberBases(input, fromBase, options) {
  const opts = options || {};
  const bits = widthIsValid(opts.bits) ? Number(opts.bits) : null;
  const signed = !!opts.signed;

  const parsed = parseInBase(input, fromBase);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const value = parsed.value;
  let pattern = null;
  let signedValue = value;
  let unsignedValue = value;
  let wrapped = false;

  let reinterpreted = false;
  if (bits) {
    pattern = toTwosComplement(value, bits);
    signedValue = fromTwosComplement(pattern, bits);
    unsignedValue = pattern;
    // Information is only genuinely lost outside [signed min, unsigned max]:
    // anything inside that span is representable in `bits` under one reading or
    // the other. 0xFFFFFFFF at 32-bit signed is a reinterpretation, not an
    // overflow, and flagging it as an overflow would be the wrong answer dressed
    // as a warning.
    const lo = signedRange(bits).min;
    const hi = unsignedRange(bits).max;
    wrapped = value < lo || value > hi;
    reinterpreted = !wrapped && !fitsInWidth(value, bits, signed);
  }

  // With a width set, every non-decimal base shows the register's bit pattern —
  // that is the thing you would actually see in a debugger — while decimal
  // carries the sign. Without a width, everything is the plain value.
  const shown = bits ? pattern : value;

  const out = {
    ok: true,
    value,
    bits,
    signed,
    pattern,
    signedValue,
    unsignedValue,
    wrapped,
    reinterpreted,
    decimal: formatInBase(bits ? (signed ? signedValue : unsignedValue) : value, 10),
    signedDecimal: bits ? formatInBase(signedValue, 10) : formatInBase(value, 10),
    unsignedDecimal: bits ? formatInBase(unsignedValue, 10) : null,
    binary: bits ? padToWidth(formatInBase(shown, 2), 2, bits) : formatInBase(shown, 2),
    octal: formatInBase(shown, 8),
    hex: bits ? padToWidth(formatInBase(shown, 16), 16, bits) : formatInBase(shown, 16),
  };
  if (baseIsValid(Number(opts.customBase))) {
    const cb = Number(opts.customBase);
    out.customBase = cb;
    out.custom = bits ? padToWidth(formatInBase(shown, cb), cb, bits) : formatInBase(shown, cb);
  }
  return out;
}

/* ---------------------------- text <-> bytes ---------------------------- */

/* textToBytes is utf8Bytes under a name that says what it is for here. The hash
   tool already owns the encoder, and two UTF-8 encoders in one file is one too
   many — a "text to binary" page that disagreed with the hash page about what
   an emoji is would be worse than not shipping it. */
function textToBytes(str) {
  return utf8Bytes(str === undefined || str === null ? "" : String(str));
}

/* The decoder, hand-rolled so malformed input has a defined answer rather than
   whatever the platform decides. Over-long encodings, lone continuation bytes,
   surrogate code points and truncated sequences all become U+FFFD, one per bad
   byte, which is what the WHATWG encoding standard specifies. */
function bytesToText(bytes) {
  const b = Array.from(bytes || [], (x) => Number(x) & 0xff);
  let out = "";
  let i = 0;
  while (i < b.length) {
    const lead = b[i];
    let need = 0;
    let code = 0;
    let lo = 0;
    if (lead < 0x80) { out += String.fromCodePoint(lead); i++; continue; }
    else if (lead >= 0xc2 && lead <= 0xdf) { need = 1; code = lead & 0x1f; lo = 0x80; }
    else if (lead >= 0xe0 && lead <= 0xef) { need = 2; code = lead & 0x0f; lo = 0x800; }
    else if (lead >= 0xf0 && lead <= 0xf4) { need = 3; code = lead & 0x07; lo = 0x10000; }
    else { out += "�"; i++; continue; }

    // Indices i+1 .. i+need have to exist, or the sequence is truncated.
    if (i + need >= b.length) { out += "�"; i++; continue; }
    let ok = true;
    let cp = code;
    for (let k = 1; k <= need; k++) {
      const cont = b[i + k];
      if (cont === undefined || (cont & 0xc0) !== 0x80) { ok = false; break; }
      cp = (cp << 6) | (cont & 0x3f);
    }
    if (!ok || cp < lo || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      out += "�";
      i++;
      continue;
    }
    out += String.fromCodePoint(cp);
    i += need + 1;
  }
  return out;
}

// Reads a run of byte tokens in `base` — "01001000 01100101" or "48 65" or an
// unseparated "4865" — into a byte array. `perByte` is how many digits one byte
// takes in that base, which is what makes the unseparated form parseable.
function bytesFromDigits(str, base, perByte) {
  const raw = String(str === undefined || str === null ? "" : str).trim();
  if (!raw) return { ok: false, error: "" };
  const cleaned = raw.replace(/^0[xb]/i, "").replace(/[\s,_]+/g, " ").trim();
  const tokens = cleaned.includes(" ") ? cleaned.split(" ") : chunkFromRight(cleaned, perByte);
  const bytes = [];
  for (const token of tokens) {
    if (!token) continue;
    const parsed = parseInBase(token, base);
    if (!parsed.ok) return { ok: false, error: parsed.error || "Unreadable input." };
    if (parsed.value < 0n || parsed.value > 255n) {
      return { ok: false, error: '"' + token + '" is not a single byte (0–255).' };
    }
    bytes.push(Number(parsed.value));
  }
  if (!bytes.length) return { ok: false, error: "No bytes to read." };
  return { ok: true, bytes };
}

// Chunks from the right, so an odd-length unseparated hex string keeps its low
// bytes intact and only the leading nibble is short.
function chunkFromRight(str, size) {
  const out = [];
  for (let end = str.length; end > 0; end -= size) {
    out.unshift(str.slice(Math.max(0, end - size), end));
  }
  return out;
}

function textToBinary(str, options) {
  const sep = options && options.separator !== undefined ? options.separator : " ";
  return textToBytes(str).map((b) => formatInBase(BigInt(b), 2).padStart(8, "0")).join(sep);
}

function binaryToText(str) {
  const r = bytesFromDigits(str, 2, 8);
  return r.ok ? { ok: true, value: bytesToText(r.bytes) } : r;
}

function textToHex(str, options) {
  const opts = options || {};
  const sep = opts.separator !== undefined ? opts.separator : " ";
  const out = textToBytes(str).map((b) => formatInBase(BigInt(b), 16).padStart(2, "0"));
  return (opts.uppercase ? out.map((h) => h.toUpperCase()) : out).join(sep);
}

function hexToText(str) {
  const r = bytesFromDigits(str, 16, 2);
  return r.ok ? { ok: true, value: bytesToText(r.bytes) } : r;
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
    uuidV7,
    generateUuids,
    utf8Bytes,
    md5,
    md5Bytes,
    toHex,
    subtleDigestHex,
    subtleDigestBytesHex,
    hashText,
    hashBytes,
    hmacHex,
    compareHashes,
    SHA_ALGORITHMS,
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
    parseCronField,
    parseCron,
    describeCron,
    cronDayMatches,
    nextCronRuns,
    cronFormatList,
    formatCronRun,
    cronTimeZoneList,
    localTimeZone,
    CSS_NAMED_COLORS,
    parseHexColor,
    rgbToHex,
    rgbToHsl,
    hslToRgb,
    rgbToHsv,
    hsvToRgb,
    namedColorToRgb,
    rgbToNamedColor,
    parseColor,
    formatHex,
    formatRgb,
    formatHsl,
    formatHsv,
    relativeLuminance,
    contrastRatio,
    flattenOver,
    roundRatio,
    wcagResults,
    WCAG_THRESHOLDS,
    rgbToOklch,
    oklchToRgb,
    nudgeLightnessToPass,
    BASE_DIGITS,
    BIT_WIDTHS,
    baseIsValid,
    baseDigitRange,
    parseInBase,
    formatInBase,
    bitMask,
    toTwosComplement,
    fromTwosComplement,
    signedRange,
    unsignedRange,
    fitsInWidth,
    groupDigits,
    padToWidth,
    convertNumberBases,
    textToBytes,
    bytesToText,
    bytesFromDigits,
    chunkFromRight,
    textToBinary,
    binaryToText,
    textToHex,
    hexToText,
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

    // Keeps live-as-you-type tools from rehashing or reparsing on every
    // keystroke, which matters most for the hash tool's four digests.
    function debounce(fn, ms) {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
      };
    }

    /* ---- URL state ----
       A tool that reads its input from the URL can be sent as a link. Short
       state goes in the query string. State over URL_QUERY_LIMIT bytes goes
       in the hash as one lz-string blob, and a secret (a JWT) goes in the
       hash uncompressed, because the hash never reaches a server log. */
    const URL_QUERY_LIMIT = 2048;

    function readUrlState() {
      const state = {};
      new URLSearchParams(location.search).forEach((v, k) => { state[k] = v; });
      const hash = location.hash.replace(/^#/, "");
      if (!hash) return state;
      const hashParams = new URLSearchParams(hash);
      const lz = hashParams.get("lz");
      if (lz && typeof LZString !== "undefined") {
        try {
          const packed = JSON.parse(LZString.decompressFromEncodedURIComponent(lz) || "{}");
          Object.keys(packed).forEach((k) => { state[k] = String(packed[k]); });
        } catch { /* a damaged hash reads as no state */ }
        return state;
      }
      hashParams.forEach((v, k) => { state[k] = v; });
      return state;
    }

    // Write the state with replaceState so the back button is never
    // flooded. `hashOnly` keeps every key out of the query string.
    function writeUrlState(state, opts) {
      const options = opts || {};
      const params = new URLSearchParams();
      Object.keys(state).forEach((k) => {
        if (state[k] !== "" && state[k] !== null && state[k] !== undefined) params.set(k, state[k]);
      });
      const serialized = params.toString();
      let url = location.pathname;
      if (!serialized) {
        // nothing to keep
      } else if (options.hashOnly) {
        url += "#" + serialized;
      } else if (serialized.length <= URL_QUERY_LIMIT || typeof LZString === "undefined") {
        url += "?" + serialized;
      } else {
        url += "#lz=" + LZString.compressToEncodedURIComponent(JSON.stringify(state));
      }
      try { history.replaceState(history.state, "", url); } catch { /* file: URLs refuse */ }
    }

    // "Copy link" refreshes the URL first, so the copied link always holds
    // the current input even when the last keystroke is still debounced.
    function wireCopyLink(buttonId, flashId, refresh) {
      const btn = document.getElementById(buttonId);
      if (!btn) return;
      btn.addEventListener("click", () => {
        refresh();
        copyText(location.href, document.getElementById(flashId));
      });
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

    /* ================================================================== *
     * toolbar v1 — the portfolio navigation pattern.                      *
     * Spec: github.com/ngineer420/ngineer420.github.io/issues/13          *
     *                                                                     *
     * Copy this block verbatim into any site in the portfolio. It is pure *
     * enhancement: with JS off, <details>/<summary> still discloses the   *
     * sheet, the rail is still a native scroll container of real links,   *
     * the edge fades are still CSS and the scrim is still CSS. Only the   *
     * active-chip centring, Escape and click-outside are lost.            *
     * ================================================================== */
    (function toolbar() {
      const bar = document.querySelector(".toolbar");
      if (!bar) return;
      const rail = bar.querySelector(".tb-rail");
      const menu = bar.querySelector("details.tb-menu");

      if (rail) {
        // js-on hands the right-hand fade over to measurement. Until then the
        // CSS keeps it on, so a JS-disabled visitor never gets a chip clipped
        // mid-word with nothing to say there is more of the row.
        rail.classList.add("js-on");
        const fades = () => {
          const max = rail.scrollWidth - rail.clientWidth;
          rail.classList.toggle("can-l", rail.scrollLeft > 1);
          rail.classList.toggle("can-r", rail.scrollLeft < max - 1);
        };
        // Assigning scrollLeft, never scrollIntoView: that also scrolls every
        // ancestor and the document, which on a phone drops the visitor below
        // the header on arrival.
        const current = rail.querySelector("[aria-current]");
        if (current) {
          rail.scrollLeft = Math.max(
            0,
            current.offsetLeft - (rail.clientWidth - current.offsetWidth) / 2
          );
        }
        rail.addEventListener("scroll", fades, { passive: true });
        window.addEventListener("resize", fades);
        fades();
      }

      if (menu) {
        // A disclosure, not a modal: focus is deliberately not trapped, Tab
        // walks the links and straight out the other side.
        window.addEventListener("keydown", (e) => {
          if (e.key !== "Escape" || !menu.open) return;
          menu.open = false;
          const summary = menu.querySelector("summary");
          if (summary) summary.focus();
        });
        document.addEventListener("click", (e) => {
          if (menu.open && !menu.contains(e.target)) menu.open = false;
        });
      }
    })();

    /* ---- homepage instant tool switch ----
       The toolbar's links are real navigation on every page. The homepage is
       the one page that mounts all fifteen panels, so there a plain left-click
       swaps the panel in place and pushes the tool's clean URL instead. Both
       the rail and the sheet are wired, so the two routes to a tool behave
       identically. This is no longer a tablist: the roving tabindex that came
       with that pattern was shipping eleven of the twelve links with
       tabindex="-1", i.e. out of tab order entirely. */
    (function initToolPanels() {
      const bar = document.querySelector(".toolbar");
      if (!bar) return;

      const PANEL_FOR = {
        "/json-formatter": "panel-json",
        "/base64-encode-decode": "panel-base64",
        "/url-encoder-decoder": "panel-url",
        "/unix-timestamp-converter": "panel-timestamp",
        "/regex-tester": "panel-regex",
        "/uuid-generator": "panel-uuid",
        "/hash-generator": "panel-hash",
        "/jwt-decoder": "panel-jwt",
        "/password-generator": "panel-password",
        "/json-csv-converter": "panel-csv",
        "/html-entity-encoder": "panel-entity",
        "/cron-expression-parser": "panel-cron",
        "/color-converter": "panel-color",
        "/contrast-checker": "panel-contrast",
        "/number-base-converter": "panel-bases",
      };
      const DEFAULT_HREF = "/json-formatter";

      const panels = {};
      let complete = true;
      Object.keys(PANEL_FOR).forEach((href) => {
        const el = document.getElementById(PANEL_FOR[href]);
        panels[PANEL_FOR[href]] = el;
        if (!el) complete = false;
      });
      // A standalone tool page mounts one panel — its links are plain
      // navigation and there is nothing here to do.
      if (!complete) return;

      function cleanPath(pathname) {
        const p = pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "").replace(/\/+$/, "");
        return p || "/";
      }
      function hrefForPath(pathname) {
        const clean = cleanPath(pathname);
        return PANEL_FOR[clean] ? clean : DEFAULT_HREF;
      }

      const links = [...bar.querySelectorAll("a[href]")].filter(
        (a) => PANEL_FOR[cleanPath(a.getAttribute("href"))]
      );

      function activate(href, opts) {
        const options = opts || {};
        const wanted = PANEL_FOR[href];
        Object.keys(panels).forEach((id) => {
          const on = id === wanted;
          panels[id].hidden = !on;
          panels[id].classList.toggle("active", on);
        });
        links.forEach((a) => {
          const on = cleanPath(a.getAttribute("href")) === href;
          if (on) a.setAttribute("aria-current", "page");
          else a.removeAttribute("aria-current");
        });
        if (options.push) history.pushState({ href }, "", href);
      }

      links.forEach((a) => {
        a.addEventListener("click", (e) => {
          // Real anchors: middle-click / modified click still open the
          // standalone page. Only plain left-clicks switch in place.
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          const menu = bar.querySelector("details.tb-menu");
          if (menu) menu.open = false;
          activate(cleanPath(a.getAttribute("href")), { push: true });
        });
      });

      window.addEventListener("popstate", (e) => {
        activate((e.state && e.state.href) || hrefForPath(location.pathname), { push: false });
      });

      activate(hrefForPath(location.pathname), { push: false });
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

      function syncUrl() { writeUrlState({ input: input.value }); }
      input.addEventListener("input", debounce(syncUrl, 150));
      wireCopyLink("json-copy-link", "json-link-flash", syncUrl);

      const shared = readUrlState();
      if (shared.input) input.value = shared.input;
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

      // The link carries the epoch field as typed, and the unit only when
      // the reader picked one, so `?ts=1700000000` stays short.
      function syncUrl() {
        writeUrlState({ ts: epochInput.value.trim(), unit: unitSelect.value === "auto" ? "" : unitSelect.value });
      }
      epochInput.addEventListener("input", debounce(syncUrl, 150));
      unitSelect.addEventListener("change", syncUrl);
      document.getElementById("ts-now").addEventListener("click", syncUrl);
      document.getElementById("ts-to-epoch").addEventListener("click", () => {
        if (outSeconds.textContent && outSeconds.textContent !== "\u2014") {
          epochInput.value = outSeconds.textContent;
          unitSelect.value = "seconds";
          syncUrl();
        }
      });
      wireCopyLink("ts-copy-link", "ts-link-flash", syncUrl);

      const shared = readUrlState();
      if (shared.ts) {
        epochInput.value = shared.ts;
        if (shared.unit === "seconds" || shared.unit === "milliseconds") unitSelect.value = shared.unit;
        document.getElementById("ts-to-date").click();
      }
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

      function syncUrl() {
        writeUrlState({ pattern: patternInput.value, flags: currentFlags(), test: testInput.value });
      }

      document.getElementById("regex-run").addEventListener("click", () => { run(); syncUrl(); });
      document.getElementById("regex-clear").addEventListener("click", () => {
        patternInput.value = "";
        testInput.value = "";
        highlightEl.innerHTML = "";
        hideError(errorEl);
        renderMatches([]);
        patternInput.focus();
        syncUrl();
      });
      const syncSoon = debounce(syncUrl, 150);
      patternInput.addEventListener("input", syncSoon);
      testInput.addEventListener("input", syncSoon);
      Object.keys(flagIds).forEach((k) => document.getElementById(flagIds[k]).addEventListener("change", syncUrl));
      wireCopyLink("regex-copy-link", "regex-link-flash", syncUrl);

      const shared = readUrlState();
      if (shared.pattern !== undefined) patternInput.value = shared.pattern;
      if (shared.flags !== undefined) {
        Object.keys(flagIds).forEach((k) => { document.getElementById(flagIds[k]).checked = shared.flags.includes(k); });
      }
      if (shared.test !== undefined) testInput.value = shared.test;

      run();
    })();

    /* ---- UUID tool ---- */
    (function uuidTool() {
      const countInput = document.getElementById("uuid-count");
      const output = document.getElementById("uuid-output");
      const copyFlash = document.getElementById("uuid-copy-flash");
      const versionBtns = {
        v4: document.getElementById("uuid-version-v4"),
        v7: document.getElementById("uuid-version-v7"),
        v1: document.getElementById("uuid-version-v1"),
      };
      const note = document.getElementById("uuid-note");
      if (!countInput || !output || !versionBtns.v4) return;

      const NOTES = {
        v4: "122 random bits from crypto.getRandomValues. No ordering — use v7 if these become database keys.",
        v7: "A 48-bit millisecond timestamp followed by random bits, so sorting these strings sorts them by creation time.",
        v1: "Time-ordered, but not a spec-faithful v1: the node ID is random rather than a MAC address.",
      };

      let version = "v4";
      function setVersion(v) {
        version = v;
        Object.keys(versionBtns).forEach((k) => {
          if (versionBtns[k]) versionBtns[k].setAttribute("aria-pressed", String(k === v));
        });
        if (note) note.textContent = NOTES[v] || "";
      }
      Object.keys(versionBtns).forEach((k) => {
        if (versionBtns[k]) versionBtns[k].addEventListener("click", () => { setVersion(k); render(); });
      });
      setVersion("v4");

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
        sha384: document.getElementById("hash-out-sha384"),
        sha512: document.getElementById("hash-out-sha512"),
      };
      if (!input || !outputs.md5) return;

      const sourceLabel = document.getElementById("hash-source");
      const dropZone = document.getElementById("hash-drop");
      const fileInput = document.getElementById("hash-file");
      const hmacKey = document.getElementById("hash-hmac-key");
      const hmacAlgo = document.getElementById("hash-hmac-algo");
      const hmacOut = document.getElementById("hash-out-hmac");
      const hmacRow = document.getElementById("hash-hmac-row");

      // Holds the bytes of a dropped file. Null means "hash the textarea".
      let fileBytes = null;
      let fileName = "";

      function setOutputs(result) {
        Object.keys(outputs).forEach((k) => {
          if (outputs[k]) outputs[k].textContent = result ? result[k] : "—";
        });
      }

      async function runHmac() {
        if (!hmacOut) return;
        // HMAC is keyed, so it only makes sense over the text input, and only
        // once a key exists. crypto.subtle has no HMAC-MD5, hence the SHA list.
        if (!hmacKey || !hmacKey.value) {
          hmacOut.textContent = "—";
          if (hmacRow) hmacRow.classList.toggle("is-idle", true);
          return;
        }
        if (hmacRow) hmacRow.classList.toggle("is-idle", false);
        try {
          hmacOut.textContent = await hmacHex(hmacAlgo.value, hmacKey.value, input.value);
        } catch (e) {
          hmacOut.textContent = "—";
          showError(errorEl, "Could not compute HMAC: " + e.message);
        }
      }

      async function run() {
        if (!window.crypto || !crypto.subtle) {
          showError(errorEl, "SHA hashing needs a secure context (HTTPS or localhost). MD5 alone can't cover this.");
          return;
        }
        try {
          const result = fileBytes ? await hashBytes(fileBytes) : await hashText(input.value);
          hideError(errorEl);
          setOutputs(result);
          await runHmac();
        } catch (e) {
          showError(errorEl, "Could not compute hashes: " + e.message);
        }
      }

      function useText() {
        fileBytes = null;
        fileName = "";
        if (sourceLabel) sourceLabel.textContent = "Hashing the text above.";
        input.disabled = false;
        run();
      }

      async function useFile(file) {
        if (!file) return;
        try {
          // Read as bytes, never as text — decoding a binary file as UTF-8
          // would change the content and therefore the digest.
          fileBytes = new Uint8Array(await file.arrayBuffer());
          fileName = file.name;
          if (sourceLabel) {
            sourceLabel.textContent =
              'Hashing the file "' + fileName + '" (' + fileBytes.length.toLocaleString() + " bytes). " +
              "Clear to go back to text.";
          }
          await run();
        } catch (e) {
          showError(errorEl, "Could not read that file: " + e.message);
        }
      }

      if (dropZone) {
        ["dragenter", "dragover"].forEach((ev) =>
          dropZone.addEventListener(ev, (e) => {
            e.preventDefault();
            dropZone.classList.add("is-over");
          })
        );
        ["dragleave", "drop"].forEach((ev) =>
          dropZone.addEventListener(ev, (e) => {
            e.preventDefault();
            dropZone.classList.remove("is-over");
          })
        );
        dropZone.addEventListener("drop", (e) => {
          const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (file) useFile(file);
        });
      }
      if (fileInput) {
        fileInput.addEventListener("change", () => {
          if (fileInput.files && fileInput.files[0]) useFile(fileInput.files[0]);
        });
      }

      document.getElementById("hash-run").addEventListener("click", run);
      document.getElementById("hash-clear").addEventListener("click", () => {
        input.value = "";
        if (fileInput) fileInput.value = "";
        setOutputs(null);
        if (hmacOut) hmacOut.textContent = "—";
        hideError(errorEl);
        useText();
        input.focus();
      });
      input.addEventListener("input", debounce(() => { if (!fileBytes) run(); }, 250));
      [hmacKey, hmacAlgo].forEach((el) => {
        if (el) el.addEventListener("input", debounce(runHmac, 200));
        if (el) el.addEventListener("change", runHmac);
      });
      document.querySelectorAll(".hash-copy-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = document.getElementById(btn.dataset.target);
          copyText(target && target.textContent !== "—" ? target.textContent : "", copyFlash);
        });
      });

      run();
    })();

    /* ---- hash compare tool ---- */

    (function hashCompareTool() {
      const a = document.getElementById("hash-cmp-a");
      const b = document.getElementById("hash-cmp-b");
      const result = document.getElementById("hash-cmp-result");
      if (!a || !b || !result) return;

      function render() {
        const r = compareHashes(a.value, b.value);
        result.textContent = r.message;
        result.classList.toggle("is-match", r.status === "match");
        result.classList.toggle("is-mismatch", r.status !== "match" && r.status !== "empty");
      }

      [a, b].forEach((el) => el.addEventListener("input", debounce(render, 120)));
      render();
    })();

    /* ---- cron expression tool ---- */

    (function cronTool() {
      const input = document.getElementById("cron-input");
      if (!input) return;
      const description = document.getElementById("cron-description");
      const runsList = document.getElementById("cron-runs");
      const errorEl = document.getElementById("cron-error");
      const fieldsEl = document.getElementById("cron-fields");
      const tzEl = document.getElementById("cron-timezone");
      const tzSelect = document.getElementById("cron-timezone-select");
      const examples = Array.from(document.querySelectorAll("[data-cron-example]"));

      const FIELD_LABELS = [
        ["minute", "Minute"],
        ["hour", "Hour"],
        ["dom", "Day of month"],
        ["month", "Month"],
        ["dow", "Day of week"],
      ];

      const localZone = localTimeZone();

      // The zone the reader wants the runs *shown* in. The schedule itself is
      // always read as UTC — see nextCronRuns — so this only changes rendering.
      let displayZone = "UTC";

      if (tzSelect) {
        const utcOpt = document.createElement("option");
        utcOpt.value = "UTC";
        utcOpt.textContent = "UTC (what most servers use)";
        tzSelect.appendChild(utcOpt);

        if (localZone && localZone !== "UTC") {
          const localOpt = document.createElement("option");
          localOpt.value = localZone;
          // Naming the resolved zone means "your local time" is never a guess.
          localOpt.textContent = "Your local time — " + localZone;
          tzSelect.appendChild(localOpt);
        }

        const group = document.createElement("optgroup");
        group.label = "All time zones";
        cronTimeZoneList().forEach((zone) => {
          const opt = document.createElement("option");
          opt.value = zone;
          opt.textContent = zone;
          group.appendChild(opt);
        });
        tzSelect.appendChild(group);
        tzSelect.value = "UTC";

        tzSelect.addEventListener("change", () => {
          displayZone = tzSelect.value || "UTC";
          render();
        });
      }

      if (tzEl) {
        tzEl.textContent =
          "Cron fields are read as UTC, because that is the clock the server almost certainly keeps. " +
          (localZone && localZone !== "UTC"
            ? "Your own zone (" + localZone + ") is shown beside each run so the two can never be confused."
            : "Your own clock is already on UTC.");
      }

      /** One run, rendered as "<date> <time> <abbr>" for a given zone. */
      function runLine(when, zone, className) {
        const f = formatCronRun(when, zone);
        const span = document.createElement("span");
        span.className = className;
        // The literal spaces between the spans are load-bearing: flex drops
        // them from the layout (the gap does that job) but keeps them in the
        // text, so copying a row out still gives "17 Aug 2026 00:00 UTC"
        // rather than one run-together string. The same goes for a screen
        // reader reading the line.
        span.innerHTML =
          '<span class="run-date">' + escapeHtml(f.day) + "</span> " +
          '<span class="run-time">' + escapeHtml(f.time) + "</span> " +
          '<span class="run-zone">' + escapeHtml(f.abbr) + "</span>";
        return { el: span, parts: f };
      }

      function render() {
        const parsed = parseCron(input.value);
        runsList.innerHTML = "";
        fieldsEl.innerHTML = "";

        if (!parsed.ok) {
          showError(errorEl, parsed.message);
          description.textContent = "—";
          return;
        }
        hideError(errorEl);
        description.textContent = describeCron(parsed);

        FIELD_LABELS.forEach(([key, label]) => {
          const row = document.createElement("div");
          row.className = "result-item";
          const values = parsed.values[key];
          // Listing 60 minutes helps nobody; summarise the wide ones.
          const summary =
            values.length > 12 ? values.length + " values (" + values[0] + "–" + values[values.length - 1] + ")" : values.join(", ");
          row.innerHTML =
            '<div class="result-label">' + label + " <code>" + escapeHtml(parsed.raw[key]) + "</code></div>" +
            '<div class="result-value">' + escapeHtml(summary) + "</div>";
          fieldsEl.appendChild(row);
        });

        const runs = nextCronRuns(parsed, new Date(), 5);
        if (!runs.length) {
          const li = document.createElement("li");
          li.textContent = "This expression never matches a real date.";
          runsList.appendChild(li);
          return;
        }
        // Every run carries a second zone beside it. A dropdown alone would
        // only move the seven-hour mistake somewhere else; showing both at
        // once is what actually removes it. The companion is the reader's own
        // clock, unless they are already looking at their own clock, in which
        // case it is UTC — so the pair is never two copies of one answer.
        const companionZone = displayZone === localZone ? "UTC" : localZone;
        // "UTC UTC" would be the abbreviation saying it twice; the note only
        // earns its place when it adds the thing the abbreviation cannot.
        const companionLabel = companionZone === localZone ? "your time" : "";

        runs.forEach((when) => {
          const li = document.createElement("li");
          const primary = runLine(when, displayZone, "run-primary");
          li.appendChild(primary.el);

          const companion = formatCronRun(when, companionZone);
          if (companion.time !== primary.parts.time || companion.dateKey !== primary.parts.dateKey) {
            const alt = document.createElement("span");
            alt.className = "run-secondary";
            // The date only earns its space when the two zones disagree on it,
            // which is exactly the case people get wrong.
            const sameDay = companion.dateKey === primary.parts.dateKey;
            alt.innerHTML =
              '<span class="run-sep" aria-hidden="true">·</span> ' +
              (sameDay ? "" : '<span class="run-date">' + escapeHtml(companion.day) + "</span> ") +
              '<span class="run-time">' + escapeHtml(companion.time) + "</span> " +
              '<span class="run-zone">' + escapeHtml(companion.abbr) + "</span>" +
              (companionLabel ? ' <span class="run-note">' + escapeHtml(companionLabel) + "</span>" : "");
            li.appendChild(alt);
          }
          runsList.appendChild(li);
        });
      }

      function syncUrl() {
        writeUrlState({ expr: input.value.trim(), tz: displayZone === "UTC" ? "" : displayZone });
      }

      examples.forEach((btn) =>
        btn.addEventListener("click", () => {
          input.value = btn.dataset.cronExample;
          render();
          syncUrl();
        })
      );
      input.addEventListener("input", debounce(() => { render(); syncUrl(); }, 150));
      if (tzSelect) tzSelect.addEventListener("change", syncUrl);
      wireCopyLink("cron-copy-link", "cron-link-flash", syncUrl);

      const shared = readUrlState();
      if (shared.expr) input.value = shared.expr;
      if (shared.tz && tzSelect && [...tzSelect.options].some((o) => o.value === shared.tz)) {
        tzSelect.value = shared.tz;
        displayZone = shared.tz;
      }
      render();
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

      // The token stays in the hash only. A hash never leaves the browser,
      // so a shared link does not put the token in a server log.
      function syncUrl() { writeUrlState({ token: input.value.trim() }, { hashOnly: true }); }
      input.addEventListener("input", debounce(syncUrl, 150));
      document.getElementById("jwt-clear").addEventListener("click", syncUrl);
      wireCopyLink("jwt-copy-link", "jwt-link-flash", syncUrl);

      const shared = readUrlState();
      if (shared.token) input.value = shared.token;
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

    /* ---- colour converter tool ---- */
    (function colorConverterTool() {
      const any = document.getElementById("color-any");
      if (!any) return;
      const picker = document.getElementById("color-picker");
      const alpha = document.getElementById("color-alpha");
      const alphaOut = document.getElementById("color-alpha-value");
      const swatch = document.getElementById("color-swatch");
      const nameOut = document.getElementById("color-name");
      const errorEl = document.getElementById("color-error");
      const copyFlash = document.getElementById("color-copy-flash");

      const FIELDS = {
        hex: { el: document.getElementById("color-hex"), format: formatHex },
        rgb: { el: document.getElementById("color-rgb"), format: formatRgb },
        hsl: { el: document.getElementById("color-hsl"), format: formatHsl },
        hsv: { el: document.getElementById("color-hsv"), format: formatHsv },
      };

      let current = { r: 60, g: 230, b: 136, a: 1 };

      // `except` is the field the visitor is typing in: rewriting it under the
      // cursor would fight the caret and normalise half-typed values away.
      function render(except) {
        Object.keys(FIELDS).forEach((key) => {
          const f = FIELDS[key];
          if (!f.el || key === except) return;
          f.el.value = f.format(current);
        });
        const opaque = { r: current.r, g: current.g, b: current.b };
        // The swatch is painted with the alpha so the checkerboard behind it
        // shows through; the picker cannot express alpha, so it gets the
        // opaque colour.
        swatch.style.backgroundColor = formatRgb(current);
        if (picker) picker.value = rgbToHex(opaque);
        if (alpha && except !== "alpha") alpha.value = String(Math.round(current.a * 100));
        if (alphaOut) alphaOut.textContent = Math.round(current.a * 100) + "%";
        if (nameOut) {
          const name = rgbToNamedColor(current);
          nameOut.innerHTML = name
            ? "CSS name: <b>" + escapeHtml(name) + "</b>"
            : "No exact CSS color name";
        }
      }

      function apply(text, except) {
        const parsed = parseColor(text);
        if (!parsed.ok) {
          showError(errorEl, parsed.error);
          return false;
        }
        hideError(errorEl);
        current = { r: parsed.r, g: parsed.g, b: parsed.b, a: parsed.a };
        render(except);
        return true;
      }

      Object.keys(FIELDS).forEach((key) => {
        const el = FIELDS[key].el;
        if (!el) return;
        el.addEventListener("input", () => {
          if (apply(el.value, key) && any !== el) any.value = el.value;
        });
        // Leaving the field is the moment to normalise it: "f00" becomes
        // "#ff0000" only once the visitor has stopped typing it.
        el.addEventListener("blur", () => render());
      });

      any.addEventListener("input", () => apply(any.value, "any"));
      any.addEventListener("blur", () => {
        if (parseColor(any.value).ok) any.value = formatHex(current);
      });

      if (picker) {
        picker.addEventListener("input", () => {
          const rgb = parseHexColor(picker.value);
          if (!rgb) return;
          current = { r: rgb.r, g: rgb.g, b: rgb.b, a: current.a };
          hideError(errorEl);
          any.value = formatHex(current);
          render();
        });
      }
      if (alpha) {
        alpha.addEventListener("input", () => {
          current.a = clamp(parseInt(alpha.value, 10) / 100, 0, 1);
          any.value = formatHex(current);
          render("alpha");
        });
      }

      document.querySelectorAll("[data-color-copy]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = document.getElementById(btn.getAttribute("data-color-copy"));
          if (target) copyText(target.value || "", copyFlash);
        });
      });

      apply(any.value || "#3ce688", "any");
    })();

    /* ---- WCAG contrast checker tool ---- */
    (function contrastCheckerTool() {
      const fgField = document.getElementById("cc-fg");
      if (!fgField) return;
      const bgField = document.getElementById("cc-bg");
      const fgPicker = document.getElementById("cc-fg-picker");
      const bgPicker = document.getElementById("cc-bg-picker");
      const swapBtn = document.getElementById("cc-swap");
      const nudgeBtn = document.getElementById("cc-nudge");
      const targetSel = document.getElementById("cc-target");
      const preview = document.getElementById("cc-preview");
      const ratioEl = document.getElementById("cc-ratio");
      const noteEl = document.getElementById("cc-note");
      const listEl = document.getElementById("cc-list");
      const errorEl = document.getElementById("cc-error");
      const okEl = document.getElementById("cc-nudged");

      // A background that is itself translucent has no defined ground, so the
      // page picks one and says so rather than quietly measuring nonsense.
      const PAGE_WHITE = { r: 255, g: 255, b: 255 };

      function pair() {
        const fg = parseColor(fgField.value);
        const bg = parseColor(bgField.value);
        if (!fg.ok) return { ok: false, error: "Text colour: " + fg.error };
        if (!bg.ok) return { ok: false, error: "Background colour: " + bg.error };
        const flatBg = flattenOver(bg, PAGE_WHITE);
        return { ok: true, fg: flattenOver(fg, flatBg), bg: flatBg, fgAlpha: fg.a, bgAlpha: bg.a };
      }

      function render() {
        const p = pair();
        if (!p.ok) {
          showError(errorEl, p.error);
          return;
        }
        hideError(errorEl);
        const ratio = roundRatio(contrastRatio(p.fg, p.bg));
        ratioEl.textContent = ratio.toFixed(2);
        preview.style.backgroundColor = rgbToHex(p.bg);
        preview.style.color = rgbToHex(p.fg);
        if (fgPicker) fgPicker.value = rgbToHex({ r: p.fg.r, g: p.fg.g, b: p.fg.b });
        if (bgPicker) bgPicker.value = rgbToHex(p.bg);

        const notes = [];
        if (p.fgAlpha < 1) notes.push("the text colour was composited onto the background at " + Math.round(p.fgAlpha * 100) + "% opacity first");
        if (p.bgAlpha < 1) notes.push("the translucent background was composited onto white first");
        noteEl.textContent = notes.length
          ? "Measured as " + rgbToHex(p.fg) + " on " + rgbToHex(p.bg) + " — " + notes.join(", ") + "."
          : "WCAG 2.1 relative luminance, (L1 + 0.05) / (L2 + 0.05).";

        listEl.innerHTML = "";
        wcagResults(ratio).forEach((r) => {
          const li = document.createElement("li");
          li.className = "wcag-item";
          const what = document.createElement("span");
          what.className = "wcag-what";
          const title = document.createElement("span");
          title.textContent = r.label + " · " + r.level;
          const min = document.createElement("span");
          min.className = "wcag-min";
          min.textContent = "needs " + r.min + ":1";
          what.appendChild(title);
          what.appendChild(min);
          const verdict = document.createElement("span");
          verdict.className = "verdict " + (r.pass ? "pass" : "fail");
          verdict.textContent = r.pass ? "PASS" : "FAIL";
          li.appendChild(what);
          li.appendChild(verdict);
          listEl.appendChild(li);
        });
      }

      function syncFromPicker(picker, field) {
        if (!picker) return;
        picker.addEventListener("input", () => {
          field.value = picker.value;
          okEl.classList.remove("show");
          render();
        });
      }

      [fgField, bgField].forEach((f) => {
        f.addEventListener("input", () => {
          okEl.classList.remove("show");
          render();
        });
      });
      syncFromPicker(fgPicker, fgField);
      syncFromPicker(bgPicker, bgField);

      if (swapBtn) {
        swapBtn.addEventListener("click", () => {
          const t = fgField.value;
          fgField.value = bgField.value;
          bgField.value = t;
          okEl.classList.remove("show");
          render();
        });
      }

      if (nudgeBtn) {
        nudgeBtn.addEventListener("click", () => {
          const p = pair();
          if (!p.ok) return;
          const target = parseFloat(targetSel ? targetSel.value : "4.5");
          const moved = nudgeLightnessToPass(p.fg, p.bg, target);
          if (!moved.ok) {
            okEl.classList.remove("show");
            showError(errorEl, moved.error + " The best it reaches is " + moved.best.toFixed(2) + ":1 — change the background instead.");
            return;
          }
          fgField.value = moved.hex;
          render();
          okEl.textContent =
            "Walked the text color " + moved.direction + " in OKLCH — same hue, same chroma — to " +
            moved.hex + ", which measures " + moved.ratio.toFixed(2) + ":1.";
          okEl.classList.add("show");
        });
      }

      render();
    })();

    /* ---- number base converter hub ---- */
    (function baseConverterTool() {
      const input = document.getElementById("base-input");
      if (!input) return;
      const fromSel = document.getElementById("base-from");
      const bitsSel = document.getElementById("base-bits");
      const signedBox = document.getElementById("base-signed");
      const customSel = document.getElementById("base-custom");
      const errorEl = document.getElementById("base-error");
      const noteEl = document.getElementById("base-note");
      const copyFlash = document.getElementById("base-copy-flash");

      const OUT = {
        binary: document.getElementById("base-out-binary"),
        octal: document.getElementById("base-out-octal"),
        decimal: document.getElementById("base-out-decimal"),
        hex: document.getElementById("base-out-hex"),
        custom: document.getElementById("base-out-custom"),
        unsigned: document.getElementById("base-out-unsigned"),
      };
      const customLabel = document.getElementById("base-custom-label");

      function paint(el, text) {
        if (el) el.value = text;
      }

      function render() {
        const fromBase = Number(fromSel.value);
        const bits = bitsSel.value === "any" ? null : Number(bitsSel.value);
        const signed = !!(signedBox && signedBox.checked);
        // Two's complement is a property of a fixed-width field. With no width
        // there is nothing to complement, so the toggle goes away rather than
        // sitting there doing nothing.
        if (signedBox) signedBox.disabled = !bits;
        const customBase = Number(customSel.value);
        // Three characters, to match BIN/OCT/DEC/HEX/UNS in a 46px label column.
        if (customLabel) customLabel.textContent = "B" + customBase;

        const r = convertNumberBases(input.value, fromBase, {
          bits: bits,
          signed: signed,
          customBase: customBase,
        });

        if (!r.ok) {
          Object.keys(OUT).forEach((k) => paint(OUT[k], ""));
          if (noteEl) noteEl.textContent = "";
          if (r.error) showError(errorEl, r.error);
          else hideError(errorEl);
          return;
        }
        hideError(errorEl);

        paint(OUT.binary, groupDigits(r.binary, 2));
        paint(OUT.octal, r.octal);
        paint(OUT.decimal, r.decimal);
        paint(OUT.hex, r.hex);
        paint(OUT.custom, r.custom || "");
        paint(OUT.unsigned, r.unsignedDecimal === null ? r.decimal : r.unsignedDecimal);

        if (!noteEl) return;
        const parts = [];
        if (r.bits) {
          parts.push(
            "Read as a " + r.bits + "-bit " + (r.signed ? "signed" : "unsigned") +
            " field, so binary, octal, hex and base " + (r.customBase || "n") +
            " show the bit pattern a register would hold."
          );
        } else {
          parts.push("Arbitrary precision — no width, no masking, exact at any size.");
        }
        if (r.reinterpreted) {
          parts.push(
            "The same bit pattern is " + r.signedDecimal + " signed and " + r.unsignedDecimal +
            " unsigned; nothing was lost."
          );
        }
        if (r.wrapped) {
          parts.push(
            "⚠ " + formatInBase(r.value, 10) + " does not fit in " + r.bits +
            " bits — the value above is what survives the truncation."
          );
        }
        noteEl.textContent = parts.join(" ");
      }

      [input, fromSel, bitsSel, customSel].forEach((el) => {
        if (!el) return;
        el.addEventListener("input", render);
        el.addEventListener("change", render);
      });
      if (signedBox) signedBox.addEventListener("change", render);

      document.querySelectorAll("[data-base-copy]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = document.getElementById(btn.getAttribute("data-base-copy"));
          copyText(target ? target.value : "", copyFlash);
        });
      });

      render();
    })();

    /* ---- the directed conversion pages ----
       One wiring for all ten. The page states its direction in data-from /
       data-to on the panel; "text" means the UTF-8 side, a number means a
       radix. Numeric pairs also carry the width and signedness controls,
       because that is the part these pages exist to get right. */
    (function basePairTool() {
      const panels = document.querySelectorAll("[data-base-pair]");
      if (!panels.length) return;

      panels.forEach((panel) => {
        const from = panel.getAttribute("data-from");
        const to = panel.getAttribute("data-to");
        const input = panel.querySelector("[data-pair-input]");
        const output = panel.querySelector("[data-pair-output]");
        const errorEl = panel.querySelector("[data-pair-error]");
        const noteEl = panel.querySelector("[data-pair-note]");
        const bitsSel = panel.querySelector("[data-pair-bits]");
        const signedBox = panel.querySelector("[data-pair-signed]");
        const upperBox = panel.querySelector("[data-pair-upper]");
        const copyBtn = panel.querySelector("[data-pair-copy]");
        const copyFlash = panel.querySelector("[data-pair-flash]");
        const swapBtn = panel.querySelector("[data-pair-swap]");
        if (!input || !output) return;

        function render() {
          const bits = bitsSel && bitsSel.value !== "any" ? Number(bitsSel.value) : null;
          const signed = !!(signedBox && signedBox.checked);
          const upper = !!(upperBox && upperBox.checked);
          if (signedBox) signedBox.disabled = !bits;
          if (noteEl) noteEl.textContent = "";

          if (!input.value.trim()) {
            output.value = "";
            hideError(errorEl);
            return;
          }

          if (from === "text") {
            output.value = to === "2"
              ? textToBinary(input.value)
              : textToHex(input.value, { uppercase: upper });
            hideError(errorEl);
            const n = textToBytes(input.value).length;
            if (noteEl) {
              noteEl.textContent = input.value.length === n
                ? n + " bytes, one per character."
                : n + " bytes from " + [...input.value].length +
                  " characters — UTF-8 spends more than one byte on anything outside ASCII.";
            }
            return;
          }

          if (to === "text") {
            const r = from === "2" ? binaryToText(input.value) : hexToText(input.value);
            if (!r.ok) {
              output.value = "";
              if (r.error) showError(errorEl, r.error);
              else hideError(errorEl);
              return;
            }
            hideError(errorEl);
            output.value = r.value;
            if (noteEl && r.value.indexOf("�") !== -1) {
              noteEl.textContent =
                "The � marks a byte that is not valid UTF-8 — the run is either " +
                "truncated or is not text in this encoding.";
            }
            return;
          }

          const fromBase = Number(from);
          const toBase = Number(to);
          const r = convertNumberBases(input.value, fromBase, {
            bits: bits,
            signed: signed,
            customBase: toBase,
          });
          if (!r.ok) {
            output.value = "";
            if (r.error) showError(errorEl, r.error);
            else hideError(errorEl);
            return;
          }
          hideError(errorEl);
          let text = toBase === 10
            ? r.decimal
            : (r.custom === undefined ? formatInBase(r.value, toBase) : r.custom);
          if (upper) text = text.toUpperCase();
          output.value = toBase === 2 || toBase === 16 ? groupDigits(text, toBase) : text;

          if (!noteEl) return;
          const parts = [];
          if (bits && r.reinterpreted) {
            parts.push(
              "That pattern is " + r.signedDecimal + " as a signed " + bits +
              "-bit value and " + r.unsignedDecimal + " unsigned."
            );
          }
          if (bits && r.wrapped) {
            parts.push(
              "⚠ " + formatInBase(r.value, 10) + " does not fit in " + bits +
              " bits — what you see is what survives."
            );
          }
          if (!bits && r.value > 9007199254740991n) {
            parts.push("Past 2^53, where a converter built on floating point starts rounding. This one does not.");
          }
          noteEl.textContent = parts.join(" ");
        }

        [input, bitsSel, upperBox].forEach((el) => {
          if (!el) return;
          el.addEventListener("input", render);
          el.addEventListener("change", render);
        });
        if (signedBox) signedBox.addEventListener("change", render);
        if (copyBtn) {
          copyBtn.addEventListener("click", () => copyText(output.value || "", copyFlash));
        }
        if (swapBtn) {
          swapBtn.addEventListener("click", () => {
            window.location.href = swapBtn.getAttribute("data-pair-swap");
          });
        }
        render();
      });
    })();
  })();
}
