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

    /* ---- tabs ---- */
    (function initTabs() {
      const tabIds = ["tab-json", "tab-base64", "tab-url", "tab-timestamp", "tab-regex"];
      const tabs = tabIds.map((id) => document.getElementById(id)).filter(Boolean);
      // Single-tool pages have no tabbar; nothing to wire up.
      if (!tabs.length) return;
      const panels = {};
      tabs.forEach((t) => { panels[t.id] = document.getElementById(t.getAttribute("aria-controls")); });

      function select(tab) {
        tabs.forEach((t) => {
          const active = t === tab;
          t.setAttribute("aria-selected", String(active));
          t.tabIndex = active ? 0 : -1;
          panels[t.id].hidden = !active;
          panels[t.id].classList.toggle("active", active);
        });
        tab.focus();
      }

      tabs.forEach((tab, i) => {
        tab.addEventListener("click", () => select(tab));
        tab.addEventListener("keydown", (e) => {
          if (e.key === "ArrowRight") select(tabs[(i + 1) % tabs.length]);
          if (e.key === "ArrowLeft") select(tabs[(i - 1 + tabs.length) % tabs.length]);
          if (e.key === "Home") select(tabs[0]);
          if (e.key === "End") select(tabs[tabs.length - 1]);
        });
      });
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
  })();
}
