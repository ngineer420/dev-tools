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
       the one page that mounts all twelve panels, so there a plain left-click
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

      examples.forEach((btn) =>
        btn.addEventListener("click", () => {
          input.value = btn.dataset.cronExample;
          render();
        })
      );
      input.addEventListener("input", debounce(render, 150));
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
