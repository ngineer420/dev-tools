#!/usr/bin/env python3
"""Render the number-base conversion family: the hub plus ten directed pages.

Stdlib only, same shape as `sync_nav.py` — no build step at request time, no
dependency to install, and the output is the same static HTML the repo already
ships by hand everywhere else.

    python3 tools/build_bases.py            # write every page
    python3 tools/build_bases.py --check    # exit 1 if any page is stale

Two things about this generator are deliberate.

**Every static table is computed at build time by the shipped module.** The
tables below are not typed out — `node` is invoked on `assets/js/app.js` and the
numbers come back from the same `formatInBase`, `textToBytes` and `textToHex`
the visitor's browser will run. A hand-typed 0-255 table drifts from the tool
the first time either changes, and a conversion page whose table disagrees with
its own converter is worse than a page with no table. (Same argument the site
already makes about its contrast figures.)

**No page shares its prose or its table with another.** "hex to decimal" and
"decimal to hex" are different questions asked by different people, and a
template with the labels swapped is the pattern Google demotes. So each entry in
PAGES carries its own intro, its own body sections and its own table kind, and
`--check` will not save you from thin copy: that part is a writing job, not a
tooling one.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sync_nav  # noqa: E402  — the toolbar and the sibling chips come from here

ROOT = Path(__file__).resolve().parent.parent
APP_JS = ROOT / "assets" / "js" / "app.js"
SITE = "https://devboxkit.com"
HUB = "/number-base-converter"


# --------------------------------------------------------------------------
# Table data, computed by the module the pages actually load
# --------------------------------------------------------------------------

NODE_SCRIPT = r"""
const m = require(__APP_PATH__);
const {
  formatInBase, parseInBase, textToBytes, textToBinary, textToHex,
  convertNumberBases, toTwosComplement, fromTwosComplement, groupDigits,
} = m;

const hex = (n, pad) => formatInBase(BigInt(n), 16).padStart(pad || 0, "0");
const bin = (n, pad) => formatInBase(BigInt(n), 2).padStart(pad || 0, "0");
const dec = (n) => formatInBase(BigInt(n), 10);

const out = {};

/* --- /hex-to-decimal: the whole first byte, as a 16x16 grid ------------- */
out.hexGrid = {
  cols: Array.from({ length: 16 }, (_, i) => formatInBase(BigInt(i), 16).toUpperCase()),
  rows: Array.from({ length: 16 }, (_, hi) => ({
    label: formatInBase(BigInt(hi), 16).toUpperCase(),
    cells: Array.from({ length: 16 }, (_, lo) => dec(hi * 16 + lo)),
  })),
};

/* --- /decimal-to-hex: the numbers people are actually holding ----------- */
const LANDMARKS = [
  [10, "the first decimal number that needs a letter"],
  [15, "the largest single hex digit"],
  [16, "one carry — hex's 10"],
  [100, "no rounder in hex than it is in binary"],
  [127, "the top of a signed byte"],
  [128, "the sign bit of a byte, on its own"],
  [255, "a full byte, and every channel of #ffffff"],
  [256, "one byte over — needs two hex digits plus a carry"],
  [1000, "a round decimal number that is not round anywhere else"],
  [1024, "a kibibyte"],
  [4096, "a page of memory on most systems"],
  [32767, "the top of a signed 16-bit value"],
  [65535, "a full 16-bit word, and the highest TCP port"],
  [16777215, "24-bit colour, all channels full"],
  [2147483647, "the top of a signed 32-bit int"],
  [4294967295, "a full 32-bit word"],
];
out.landmarks = LANDMARKS.map(([n, why]) => ({
  dec: dec(n), hex: hex(n).toUpperCase(), why,
}));
out.hexDigits = Array.from({ length: 16 }, (_, i) => ({
  dec: dec(i), hex: formatInBase(BigInt(i), 16).toUpperCase(),
}));

/* --- /binary-to-decimal: what each column is worth ---------------------- */
out.bitWeights = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 16, 20, 24, 31, 32, 47, 52, 53, 62, 63]
  .map((b) => ({ bit: String(b), weight: dec(2n ** BigInt(b)) }));

/* --- /decimal-to-binary: masks and permission bits ---------------------- */
const MASKS = [
  [1, "chmod: execute"],
  [2, "chmod: write"],
  [4, "chmod: read"],
  [6, "chmod: read + write (rw-)"],
  [7, "chmod: read + write + execute (rwx)"],
  [64, "chmod: owner execute, in the octal 0100 sense"],
  [128, "the high bit of a byte"],
  [192, "subnet mask octet for /26"],
  [224, "subnet mask octet for /27"],
  [240, "subnet mask octet for /28"],
  [248, "subnet mask octet for /29"],
  [252, "subnet mask octet for /30"],
  [254, "subnet mask octet for /31"],
  [255, "every bit set"],
];
out.masks = MASKS.map(([n, why]) => ({
  dec: dec(n), bin: groupDigits(bin(n, 8), 2), why,
}));

/* --- /hex-to-binary: the substitution table, and it is the whole trick -- */
out.nibbles = Array.from({ length: 16 }, (_, i) => ({
  hex: formatInBase(BigInt(i), 16).toUpperCase(),
  bin: bin(i, 4),
  dec: dec(i),
}));

/* --- /binary-to-hex: grouping, including the awkward lengths ------------ */
const GROUPS = ["1", "101", "11010", "110100111", "1111000011110000", "10000000000000000000000000000000"];
out.grouping = GROUPS.map((b) => {
  const v = parseInBase(b, 2).value;
  const padded = "0".repeat((4 - (b.length % 4)) % 4) + b;
  return {
    raw: b,
    padded: groupDigits(padded, 2),
    hex: formatInBase(v, 16).toUpperCase(),
    dec: dec(v),
  };
});

/* --- /text-to-binary: printable ASCII, one byte each -------------------- */
out.asciiBinary = [];
for (let c = 32; c <= 126; c++) {
  const ch = String.fromCharCode(c);
  out.asciiBinary.push({ ch, dec: dec(c), bin: textToBinary(ch) });
}

/* --- /binary-to-text: the bytes that are not letters -------------------- */
const CONTROLS = [
  [0, "NUL", "end of a C string"],
  [7, "BEL", "the terminal bell"],
  [8, "BS", "backspace"],
  [9, "TAB", "horizontal tab"],
  [10, "LF", "newline on Unix"],
  [13, "CR", "the other half of a Windows newline"],
  [27, "ESC", "opens an ANSI escape sequence"],
  [32, "SP", "a space is a character like any other"],
  [127, "DEL", "delete, and the last 7-bit code"],
];
out.controls = CONTROLS.map(([n, name, why]) => ({
  dec: dec(n), name, bin: bin(n, 8), why,
}));
const MULTI = [
  ["é", "e with acute, U+00E9"],
  ["€", "euro sign, U+20AC"],
  ["日", "CJK for sun/day, U+65E5"],
  ["🐇", "rabbit, U+1F407"],
];
out.multibyte = MULTI.map(([ch, name]) => ({
  ch, name,
  bytes: String(textToBytes(ch).length),
  bin: textToBinary(ch),
  hex: textToHex(ch).toUpperCase(),
}));

/* --- /text-to-hex: an actual hex dump, laid out like xxd ---------------- */
const DUMP_TEXT = "Hex is just bytes.\n";
const dumpBytes = textToBytes(DUMP_TEXT);
out.hexdump = [];
for (let off = 0; off < dumpBytes.length; off += 8) {
  const slice = dumpBytes.slice(off, off + 8);
  out.hexdump.push({
    offset: hex(off, 8).toUpperCase(),
    hex: slice.map((b) => hex(b, 2).toUpperCase()).join(" "),
    ascii: slice.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join(""),
  });
}
out.escapes = [
  ["C, Python, JavaScript string", "\\x48\\x69"],
  ["a numeric literal", "0x4869"],
  ["percent-encoding in a URL", "%48%69"],
  ["an HTML numeric entity", "&#x48;&#x69;"],
  ["a Unicode code point", "U+0048 U+0069"],
].map(([form, example]) => ({ form, example }));

/* --- /hex-to-text: the lead byte tells you how long the run is ---------- */
out.leadBytes = [
  ["00–7F", "1", "plain ASCII — the byte is the character"],
  ["80–BF", "—", "a continuation byte; never valid on its own"],
  ["C2–DF", "2", "Latin-1 supplement, Greek, Cyrillic, Hebrew, Arabic"],
  ["E0–EF", "3", "most of the rest of the Basic Multilingual Plane, CJK included"],
  ["F0–F4", "4", "emoji, historic scripts, everything above U+FFFF"],
  ["C0, C1, F5–FF", "—", "never valid anywhere in UTF-8"],
].map(([range, len, meaning]) => ({ range, len, meaning }));
out.hexText = ["48", "69", "21", "0A", "C3A9", "E282AC", "F09F9087"].map((h) => {
  const r = m.hexToText(h);
  return { hex: h, text: r.ok ? r.value : "?", bytes: String(h.length / 2) };
});

/* --- the hub's own worked example -------------------------------------- */
out.widthDemo = [8, 16, 32, 64].map((bits) => ({
  bits: String(bits),
  allOnesHex: formatInBase(toTwosComplement(-1n, bits), 16).toUpperCase(),
  signed: dec(fromTwosComplement(toTwosComplement(-1n, bits), bits)),
  unsigned: dec(toTwosComplement(-1n, bits)),
  signedMin: dec(-(2n ** BigInt(bits - 1))),
  signedMax: dec(2n ** BigInt(bits - 1) - 1n),
  unsignedMax: dec(2n ** BigInt(bits) - 1n),
}));
out.bigDemo = (() => {
  const r = convertNumberBases("9007199254740993", 10, {});
  return { dec: r.decimal, hex: r.hex.toUpperCase(), bin: r.binary };
})();

process.stdout.write(JSON.stringify(out));
"""


def table_data():
    """Run the shipped module and take the tables from it, not from memory."""
    script = NODE_SCRIPT.replace("__APP_PATH__", json.dumps(str(APP_JS)))
    try:
        proc = subprocess.run(
            ["node", "-e", script], capture_output=True, text=True, check=False
        )
    except FileNotFoundError:
        raise SystemExit(
            "build_bases.py needs `node` on PATH: every table on these pages is "
            "computed by assets/js/app.js so the tables and the tool cannot disagree."
        )
    if proc.returncode != 0:
        raise SystemExit("node failed while computing the tables:\n" + proc.stderr)
    return json.loads(proc.stdout)


# --------------------------------------------------------------------------
# Markup helpers
# --------------------------------------------------------------------------

def esc(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def table(caption, headers, rows, cls="data-table"):
    """One table. `rows` is a list of lists of already-escaped-or-plain cells."""
    out = ['<div class="%s">' % cls, "  <table>"]
    if caption:
        out.append("    <caption>%s</caption>" % caption)
    out.append("    <thead><tr>%s</tr></thead>"
               % "".join('<th scope="col">%s</th>' % h for h in headers))
    out.append("    <tbody>")
    for row in rows:
        cells = ['<th scope="row">%s</th>' % row[0]] + ["<td>%s</td>" % c for c in row[1:]]
        out.append("      <tr>%s</tr>" % "".join(cells))
    out += ["    </tbody>", "  </table>", "</div>"]
    return "\n".join(out)


def code(text):
    return "<code>%s</code>" % esc(text)


# --------------------------------------------------------------------------
# The tool widgets
# --------------------------------------------------------------------------

BASE_OPTIONS = "\n".join(
    '            <option value="%d"%s>Base %d%s</option>'
    % (b, ' selected' if b == 16 else "", b,
       {2: " — binary", 8: " — octal", 10: " — decimal", 16: " — hexadecimal"}.get(b, ""))
    for b in range(2, 37)
)

WIDTH_OPTIONS = """            <option value="any" selected>Arbitrary precision</option>
            <option value="8">8-bit</option>
            <option value="16">16-bit</option>
            <option value="32">32-bit</option>
            <option value="64">64-bit</option>"""


def hub_widget():
    custom_options = "\n".join(
        '              <option value="%d"%s>Base %d</option>'
        % (b, " selected" if b == 36 else "", b)
        for b in range(2, 37)
    )
    return """  <section aria-label="Number base converter tool">
    <div class="tool-grid split">
      <div class="controls-col">
        <div class="panel">
          <h2>Input</h2>
          <div class="field">
            <label for="base-input">Number to convert</label>
            <input type="text" id="base-input" class="code-area" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off" placeholder="FFFFFFFF" value="FFFFFFFF">
          </div>
          <div class="field">
            <label for="base-from">Read it as</label>
            <select id="base-from">
%s
            </select>
          </div>
          <div class="field">
            <label for="base-bits">Width</label>
            <select id="base-bits">
%s
            </select>
          </div>
          <div class="checkbox-row">
            <label for="base-signed"><input type="checkbox" id="base-signed" disabled> Signed (two's complement)</label>
          </div>
          <div class="field" style="margin-top:14px;">
            <label for="base-custom">Extra base to show</label>
            <select id="base-custom">
%s
            </select>
          </div>
          <div class="error-banner" id="base-error" role="alert"></div>
          <p class="source-note">Digit separators are fine — <code>1_000_000</code>, <code>1111 0000</code> and <code>0xFF</code> all read correctly. A leading <code>-</code> is a negative value, not a digit.</p>
        </div>
      </div>

      <div class="output-col">
        <div class="panel">
          <h2>Every base at once</h2>
          <div class="format-list">
            <div class="format-row">
              <label for="base-out-binary">BIN</label>
              <input type="text" id="base-out-binary" class="code-area" readonly spellcheck="false">
              <button type="button" class="icon-btn" data-base-copy="base-out-binary">Copy</button>
            </div>
            <div class="format-row">
              <label for="base-out-octal">OCT</label>
              <input type="text" id="base-out-octal" class="code-area" readonly spellcheck="false">
              <button type="button" class="icon-btn" data-base-copy="base-out-octal">Copy</button>
            </div>
            <div class="format-row">
              <label for="base-out-decimal">DEC</label>
              <input type="text" id="base-out-decimal" class="code-area" readonly spellcheck="false">
              <button type="button" class="icon-btn" data-base-copy="base-out-decimal">Copy</button>
            </div>
            <div class="format-row">
              <label for="base-out-hex">HEX</label>
              <input type="text" id="base-out-hex" class="code-area" readonly spellcheck="false">
              <button type="button" class="icon-btn" data-base-copy="base-out-hex">Copy</button>
            </div>
            <div class="format-row">
              <label for="base-out-unsigned">UNS</label>
              <input type="text" id="base-out-unsigned" class="code-area" readonly spellcheck="false">
              <button type="button" class="icon-btn" data-base-copy="base-out-unsigned">Copy</button>
            </div>
            <div class="format-row">
              <label for="base-out-custom" id="base-custom-label">B36</label>
              <input type="text" id="base-out-custom" class="code-area" readonly spellcheck="false">
              <button type="button" class="icon-btn" data-base-copy="base-out-custom">Copy</button>
            </div>
            <span class="copy-flash" id="base-copy-flash">Copied!</span>
          </div>
          <p class="source-note" id="base-note"></p>
        </div>
        <!-- sizechips:start --><!-- sizechips:end -->
      </div>
    </div>
  </section>"""  % (BASE_OPTIONS, WIDTH_OPTIONS, custom_options)


def pair_widget(page):
    """The directed widget. Numeric pairs carry width and signedness; the text
    pairs carry neither, because a byte is a byte and there is nothing to sign."""
    numeric = page["from"] != "text" and page["to"] != "text"
    controls = []
    if numeric:
        controls.append("""          <div class="field">
            <label for="pair-bits">Width</label>
            <select id="pair-bits" data-pair-bits>
%s
            </select>
          </div>
          <div class="checkbox-row">
            <label for="pair-signed"><input type="checkbox" id="pair-signed" data-pair-signed disabled> Signed (two's complement)</label>
          </div>""" % WIDTH_OPTIONS)
    if page.get("uppercase"):
        controls.append("""          <div class="checkbox-row">
            <label for="pair-upper"><input type="checkbox" id="pair-upper" data-pair-upper> Uppercase output</label>
          </div>""")
    controls_html = ("\n" + "\n".join(controls)) if controls else ""

    return """  <section aria-label="%(aria)s">
    <div class="tool-grid split" data-base-pair data-from="%(from)s" data-to="%(to)s">
      <div class="controls-col">
        <div class="panel">
          <h2>%(in_label)s</h2>
          <div class="field">
            <label for="pair-input">%(in_hint)s</label>
            <textarea id="pair-input" class="code-area" rows="6" spellcheck="false" autocapitalize="off" autocorrect="off" data-pair-input>%(sample)s</textarea>
          </div>%(controls)s
          <div class="error-banner" data-pair-error role="alert"></div>
        </div>
      </div>
      <div class="output-col">
        <div class="panel">
          <h2>%(out_label)s</h2>
          <div class="field">
            <label for="pair-output" class="visually-hidden">%(out_label)s</label>
            <textarea id="pair-output" class="code-area" rows="6" readonly spellcheck="false" data-pair-output></textarea>
          </div>
          <div class="btn-row">
            <button type="button" class="icon-btn" data-pair-copy>Copy</button>
            <button type="button" class="icon-btn" data-pair-swap="%(swap)s">%(swap_label)s</button>
            <span class="copy-flash" data-pair-flash>Copied!</span>
          </div>
          <p class="source-note" data-pair-note></p>
        </div>
        <!-- sizechips:start --><!-- sizechips:end -->
      </div>
    </div>
  </section>""" % {
        "aria": esc(page["h1"] + " tool"),
        "from": page["from"],
        "to": page["to"],
        "in_label": esc(page["in_label"]),
        "in_hint": esc(page["in_hint"]),
        "out_label": esc(page["out_label"]),
        "sample": esc(page["sample"]),
        "controls": controls_html,
        "swap": page["swap"],
        "swap_label": esc(page["swap_label"]),
    }


# --------------------------------------------------------------------------
# Page shell
# --------------------------------------------------------------------------

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(title)s</title>
<meta name="description" content="%(description)s">
<link rel="canonical" href="%(canonical)s">
<meta name="theme-color" content="#090c11">

<meta property="og:type" content="website">
<meta property="og:title" content="%(og_title)s">
<meta property="og:description" content="%(og_description)s">
<meta property="og:url" content="%(canonical)s">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="%(og_title)s">
<meta name="twitter:description" content="%(og_description)s">

<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/styles.css">

<script type="application/ld+json">
%(jsonld)s
</script>

<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7560786263587509" crossorigin="anonymous"></script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>

<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="/" aria-label="devboxkit.com home">
      <span class="brand-mark"><span class="bracket">{</span>devbox<span class="bracket">/</span>kit<span class="bracket">}</span></span>
      <span class="brand-tag">JSON, hashes, JWTs, passwords &amp; more — one page</span>
    </a>
    <div class="header-actions">
      <button id="theme-toggle" class="icon-btn" type="button" aria-label="Toggle dark/light theme" title="Toggle theme">◐</button>
    </div>
  </div>
</header>

<!-- nav:start --><!-- nav:end -->

<main id="main">
  <div class="hero">
    <h1>%(h1)s</h1>
    <p>%(lede)s</p>
    <p class="trust-line">Runs 100%% in your browser<span class="dot">•</span>Nothing is uploaded to a server<span class="dot">•</span>Free forever</p>
  </div>

"""

TAIL = """</main>

<footer class="site-footer">
  <div class="footer-inner">
    <div>© <span id="year"></span> devboxkit.com</div>
    <div class="footer-links">
      <a href="/">Home</a>
      <a href="/privacy.html">Privacy</a>
      <a href="/terms.html">Terms</a>
    </div>
  </div>
</footer>

<script src="/assets/js/app.js"></script>
<a href="https://erabb.it" class="erabbit-mark" aria-label="erabb.it"><img src="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🐇</text></svg>" width="10" height="10" alt=""></a>
</body>
</html>
"""

OTHER_TOOLS = """
    <h2>More developer tools</h2>
    <ul>
      <li><a href="/json-formatter">JSON Formatter</a></li>
      <li><a href="/base64-encode-decode">Base64 Encode / Decode</a></li>
      <li><a href="/url-encoder-decoder">URL Encoder / Decoder</a></li>
      <li><a href="/unix-timestamp-converter">Unix Timestamp Converter</a></li>
      <li><a href="/regex-tester">Regex Tester</a></li>
      <li><a href="/uuid-generator">UUID Generator (v4 / v7)</a></li>
      <li><a href="/hash-generator">Hash Generator (MD5 / SHA / HMAC)</a></li>
      <li><a href="/jwt-decoder">JWT Decoder</a></li>
      <li><a href="/password-generator">Password Generator</a></li>
      <li><a href="/json-csv-converter">JSON ⇄ CSV Converter</a></li>
      <li><a href="/html-entity-encoder">HTML Entity Encoder / Decoder</a></li>
      <li><a href="/cron-expression-parser">Cron Expression Explainer</a></li>
      <li><a href="/color-converter">Color Converter</a></li>
      <li><a href="/contrast-checker">WCAG Contrast Checker</a></li>
      <li><a href="/">All tools on one page (home)</a></li>
    </ul>
"""


def json_ld(name, url, description):
    return json.dumps({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": name + " — DevBox Kit",
        "url": url,
        "applicationCategory": "DeveloperApplication",
        "operatingSystem": "Any",
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
        "description": description,
    }, indent=2, ensure_ascii=False)


def render(page, widget_html, body_html):
    canonical = SITE + page["slug"]
    head = HEAD % {
        "title": esc(page["title"]),
        "description": esc(page["description"]),
        "canonical": canonical,
        "og_title": esc(page["og_title"]),
        "og_description": esc(page["og_description"]),
        "jsonld": json_ld(page["h1"], canonical, page["description"]),
        "h1": esc(page["h1"]),
        "lede": page["lede"],
    }
    body = ['<section class="container-narrow" style="padding-top:40px;">',
            body_html.rstrip(),
            OTHER_TOOLS.rstrip(),
            "  </section>",
            ""]
    return head + widget_html + "\n\n" + "\n".join(body) + "\n" + TAIL


# --------------------------------------------------------------------------
# The pages. Every intro, every body and every table below is written for its
# own query. Nothing here is a template with the labels swapped.
# --------------------------------------------------------------------------

CORRECTNESS_NOTE = """    <h2>Why this one is worth trusting</h2>
    <p>Almost every converter on the web is built on JavaScript's <code>Number</code>, which is a 64-bit float. That is exact up to 9,007,199,254,740,991 and quietly wrong above it: ask one of those tools for the decimal value of <code>0x20000000000001</code> and you will usually get 9007199254740992, one short, with nothing to warn you. This page does the arithmetic in <code>BigInt</code> from end to end, so a 64-bit register value, a 128-bit UUID chunk or a 300-digit number all come back exact.</p>
    <p>The second thing these tools get wrong is width. A number on its own has no width and no sign; a number in a register has both, and they change the answer. <code>FFFFFFFF</code> is 4,294,967,295 in a <code>uint32_t</code> and −1 in an <code>int32_t</code>, and both are correct — the bits are identical. Set a width here and you are told both readings, with the bit pattern shown as the register would hold it.</p>
"""


def hub_body(D):
    widths = table(
        "All-ones at each width, read both ways",
        ["Width", "Bit pattern (hex)", "Signed", "Unsigned", "Signed range"],
        [[w["bits"] + "-bit", code(w["allOnesHex"]), w["signed"], w["unsigned"],
          "%s to %s" % (w["signedMin"], w["signedMax"])] for w in D["widthDemo"]],
    )
    return """    <h2>About this number base converter</h2>
    <p>Type a number, say what base it is already in, and every other base comes back at once — binary, octal, decimal, hexadecimal, and any base from 2 to 36 you pick as a sixth row. Digit separators are accepted on the way in, so a value pasted out of source code as <code>1_000_000</code>, out of a register dump as <code>1111 0000</code>, or out of a config file as <code>0xFF</code> all read correctly without editing.</p>
%(correctness)s
    <h2>Set a width and the answer changes — on purpose</h2>
    <p>Leave the width on <strong>arbitrary precision</strong> and the converter behaves like mathematics: numbers are as big as you like, negatives keep their minus sign, nothing is masked. Choose 8, 16, 32 or 64 bits and it behaves like hardware instead. The value is written into a field that size, the binary, octal, hex and custom-base rows show the resulting bit pattern zero-padded to the full width, decimal shows the two's-complement reading if the signed box is ticked, and a separate unsigned row shows the same bits read the other way.</p>
%(widths)s
    <p>Two's complement is what makes that table work. Negating a number in two's complement is "flip every bit, then add one", which is why −1 is all ones at every width, why the negative range reaches one further from zero than the positive range, and why adding 1 to the largest positive value lands you on the most negative one instead of overflowing into an error. The converter tells you which of those happened: a pattern that fills the width, like <code>FFFFFFFF</code> in a signed 32-bit field, is a <em>reinterpretation</em> and nothing is lost, while a value that genuinely will not fit is called out as truncated.</p>
    <h2>Exactness past 2<sup>53</sup></h2>
    <p>Paste <code>%(bigdec)s</code> — one more than the largest integer a double can represent — and you get <code>%(bighex)s</code> back, not the even number one below it. That is the whole reason for the BigInt engine. Sixty-four-bit IDs, nanosecond timestamps, hashes and flag words all live above the float boundary, and they are exactly the values people paste into a base converter.</p>
    <h2>Going one direction only?</h2>
    <p>Each direction has its own page with its own reference table, because "hex to decimal" and "decimal to hex" are different jobs done by different people: <a href="/hex-to-decimal">hex to decimal</a>, <a href="/decimal-to-hex">decimal to hex</a>, <a href="/binary-to-decimal">binary to decimal</a>, <a href="/decimal-to-binary">decimal to binary</a>, <a href="/hex-to-binary">hex to binary</a>, <a href="/binary-to-hex">binary to hex</a>, <a href="/text-to-binary">text to binary</a>, <a href="/binary-to-text">binary to text</a>, <a href="/text-to-hex">text to hex</a> and <a href="/hex-to-text">hex to text</a>.</p>
""" % {
        "correctness": CORRECTNESS_NOTE,
        "widths": widths,
        "bigdec": D["bigDemo"]["dec"],
        "bighex": D["bigDemo"]["hex"],
    }


def body_hex_to_decimal(D):
    grid = ['<div class="data-table data-table--grid">', "  <table>",
            "    <caption>Every byte, 00 to FF, in decimal</caption>",
            '    <thead><tr><th scope="col">&nbsp;</th>%s</tr></thead>'
            % "".join('<th scope="col">%s</th>' % c for c in D["hexGrid"]["cols"])]
    grid.append("    <tbody>")
    for row in D["hexGrid"]["rows"]:
        grid.append('      <tr><th scope="row">%s_</th>%s</tr>'
                    % (row["label"], "".join("<td>%s</td>" % c for c in row["cells"])))
    grid += ["    </tbody>", "  </table>", "</div>"]
    return """    <h2>How hex becomes decimal</h2>
    <p>Hexadecimal is base 16, so each column is worth sixteen times the one to its right: 1, 16, 256, 4096, and so on. The digits run 0–9 then A–F, where A is ten and F is fifteen. To convert by hand you multiply each digit by its column value and add: <code>2F</code> is (2 × 16) + 15 = 47, and <code>1A2B</code> is (1 × 4096) + (10 × 256) + (2 × 16) + 11 = 6699. The converter above does the same arithmetic in BigInt, so it keeps working at lengths where doing it by hand stops being reasonable.</p>
    <p>Most hex you meet in a day is a byte or a small run of them. A colour like <code>#3CE688</code> is three bytes — red 60, green 230, blue 136. A permissions value, a status register, an opcode and a memory offset are all the same idea at different widths. The table below is the whole first byte, which covers the majority of hand conversions in one glance.</p>
%(grid)s
    <h2>The case that trips people up</h2>
    <p>A hex value with the top bit set has two correct decimal answers, and which one you want depends on the type it came out of. <code>FFFFFFFF</code> is 4,294,967,295 read as unsigned and −1 read as a signed 32-bit integer. If the number came from a C <code>int</code>, a Java <code>int</code>, a Go <code>int32</code> or a register dump, the signed reading is almost certainly the one you want. Set the width above and tick <em>signed</em> and you get both, side by side, rather than having to guess which convention the tool picked for you.</p>
    <p>The same is true of a value like <code>80000000</code>: unsigned it is 2,147,483,648, signed it is −2,147,483,648, and a converter that only ever prints one of them is wrong for half the people who paste it in.</p>
    <h2>Where you keep meeting hex</h2>
    <p>Memory addresses and pointer values in a debugger or a crash log; CSS and design-token colours; the error codes Windows prints as <code>0x80070005</code>; file magic numbers such as the <code>89 50 4E 47</code> that starts every PNG; MAC addresses; and every hash digest you will ever compare. In every one of those cases the hex is the canonical form and the decimal is what you want for a moment, to check a range or a size.</p>
    <p>Going the other way, or want a bit pattern instead of a decimal? Try <a href="/decimal-to-hex">decimal to hex</a>, <a href="/hex-to-binary">hex to binary</a>, or the <a href="%(hub)s">full base converter</a> with all bases at once.</p>
""" % {"grid": "\n".join(grid), "hub": HUB}


def body_decimal_to_hex(D):
    digits = table(
        "The sixteen hex digits",
        ["Decimal", "Hex"],
        [[d["dec"], code(d["hex"])] for d in D["hexDigits"]],
        cls="data-table data-table--short",
    )
    marks = table(
        "Numbers you are likely to be converting, and why",
        ["Decimal", "Hex", "What it usually is"],
        [[m["dec"], code(m["hex"]), esc(m["why"])] for m in D["landmarks"]],
    )
    return """    <h2>Converting decimal to hex by hand</h2>
    <p>Divide by 16, write down the remainder, repeat with the quotient, then read the remainders bottom to top. 47 ÷ 16 is 2 remainder 15, and 2 ÷ 16 is 0 remainder 2, so the digits are 2 and F: <code>2F</code>. It is the same algorithm the converter above runs, except that it uses BigInt division so the loop stays exact for a number of any length rather than falling apart above 2<sup>53</sup>.</p>
    <p>The only thing to memorise is the top six digits, since decimal has no symbols for ten through fifteen:</p>
%(digits)s
    <h2>Padding, and why it matters more than it looks</h2>
    <p>Hex is almost always written to a fixed width, because the width is information. A byte is two hex digits, so 5 is written <code>05</code>; a 16-bit word is four; a 32-bit word is eight. Writing <code>5</code> where the reader expects a byte loses the fact that the high nibble is zero, and in a colour, a register dump or a protocol field that is a real error rather than a cosmetic one. Set a width above and the output is padded for you.</p>
    <p>The <code>#RRGGBB</code> in a stylesheet is the everyday case: an RGB triple of 60, 230, 136 has to become <code>3CE688</code>, with each channel exactly two digits, or the colour is not the colour you asked for.</p>
    <h2>Landmark values</h2>
    <p>A handful of decimal numbers come up constantly, and knowing their hex on sight saves a conversion:</p>
%(marks)s
    <h2>Negative numbers do not have a natural hex form</h2>
    <p>You can write <code>-2F</code> and everybody will understand it, but no machine stores a number that way. In a register, a negative number is a two's-complement bit pattern, and that pattern depends on how wide the field is: −1 is <code>FF</code> in eight bits, <code>FFFF</code> in sixteen and <code>FFFFFFFF</code> in thirty-two. Choose a width above and type a negative decimal, and you get the pattern the machine would actually hold rather than a minus sign glued to a positive number.</p>
    <p>Related: <a href="/hex-to-decimal">hex to decimal</a> for the return trip, <a href="/decimal-to-binary">decimal to binary</a> when you need the bits rather than the digits, and the <a href="%(hub)s">full converter</a> for every base at once.</p>
""" % {"digits": digits, "marks": marks, "hub": HUB}


def body_binary_to_decimal(D):
    weights = table(
        "What each bit position is worth",
        ["Bit", "Value if set"],
        [[w["bit"], w["weight"]] for w in D["bitWeights"]],
    )
    return """    <h2>Reading binary as a decimal number</h2>
    <p>Binary is base 2, so every column is worth twice the one to its right, counting from zero on the far right. Add up the columns that hold a 1 and you have the decimal value: <code>1101</code> is 8 + 4 + 1 = 13. That is the whole algorithm, and it is the same one whether the number is four bits or sixty-four.</p>
    <p>Bit positions are numbered from the right starting at zero, so "bit 7" is the eighth column and worth 128. That numbering is what documentation means when it says a flag lives "in bit 12", and getting it off by one is the classic way to read a status register wrong.</p>
%(weights)s
    <h2>A leading 1 does not mean negative</h2>
    <p>This is the single most common mistake made with binary. Whether the top bit means "negative" depends entirely on the type the value came from, and a bit string on its own carries no type. <code>11111111</code> is 255 if it came out of a <code>uint8_t</code> and −1 if it came out of an <code>int8_t</code>. The bits are identical; only the declared type differs.</p>
    <p>So the honest answer needs two pieces of information the bits do not carry: how wide the field is, and whether it is signed. Set both above and this page gives you the signed and the unsigned reading together instead of quietly choosing one. Leave the width off and the value is read as a plain positive number of any length, which is what you want when the binary is a mask, a bitmap or a bignum rather than an integer variable.</p>
    <h2>Long binary strings stay exact</h2>
    <p>Sixty-four ones is 18,446,744,073,709,551,615, which is well past the point where a converter built on floating point starts rounding. Paste any length you like here; the arithmetic runs in BigInt, so a 64-bit register value, a 128-bit flag word or a 512-bit key fragment all come back digit-for-digit correct.</p>
    <p>Whitespace and underscores between groups are ignored, so binary copied out of a datasheet as <code>1111 0000 1010 0101</code> converts without editing.</p>
    <p>Next: <a href="/decimal-to-binary">decimal to binary</a> for the return trip, <a href="/binary-to-hex">binary to hex</a> when the string is long enough that hex is easier to read, or the <a href="%(hub)s">full converter</a>.</p>
""" % {"weights": weights, "hub": HUB}


def body_decimal_to_binary(D):
    masks = table(
        "Values you are probably converting, and their bits",
        ["Decimal", "Binary (8-bit)", "What it usually is"],
        [[m["dec"], code(m["bin"]), esc(m["why"])] for m in D["masks"]],
    )
    return """    <h2>Turning a decimal number into bits</h2>
    <p>Two methods, same answer. Divide repeatedly by 2 and read the remainders bottom to top, or find the largest power of two that fits, subtract it, and repeat. For 13: 8 fits, leaving 5; 4 fits, leaving 1; 2 does not; 1 fits, leaving 0 — so bits 3, 2 and 0 are set and the answer is <code>1101</code>. The converter above runs the division form in BigInt, which is why it stays exact for numbers far past what a calculator will hold.</p>
    <h2>Choose a width or the answer is incomplete</h2>
    <p>Left to itself, 5 in binary is <code>101</code>. As a byte it is <code>00000101</code>. The leading zeros are not decoration — they say how wide the field is, and a bit pattern written without them cannot be lined up against another one. Set a width above and the output is padded to 8, 16, 32 or 64 bits, which is the form you want any time the number is going into a mask, a register or a protocol field.</p>
    <h2>The numbers that are really bit patterns</h2>
    <p>A lot of "decimal" numbers in configuration files are bit patterns wearing a decimal disguise, and they only make sense once you see the bits:</p>
%(masks)s
    <p>Unix permissions are the clearest example: <code>chmod 755</code> is three octal digits, each of which is three bits — read, write, execute — so 7 is <code>111</code> and 5 is <code>101</code>. A subnet mask octet is the same idea at eight bits: every mask octet is a run of ones followed by a run of zeros, which is why 192, 224, 240 and 248 are the values you see and 200 is not one of them.</p>
    <h2>Negative decimals become two's complement</h2>
    <p>There is no minus sign in a register. Set a width, tick <em>signed</em>, and type −5: you get the two's-complement pattern for that width — <code>11111011</code> at eight bits — which is what the hardware would actually hold. Without a width the converter has no field size to complement against, so it keeps the sign and treats the value as plain mathematics instead.</p>
    <p>Related: <a href="/binary-to-decimal">binary to decimal</a>, <a href="/decimal-to-hex">decimal to hex</a> when the string gets long, and the <a href="%(hub)s">full converter</a> for every base at once.</p>
""" % {"masks": masks, "hub": HUB}


def body_hex_to_binary(D):
    nibbles = table(
        "One hex digit is exactly four bits",
        ["Hex", "Binary", "Decimal"],
        [[code(n["hex"]), code(n["bin"]), n["dec"]] for n in D["nibbles"]],
    )
    return """    <h2>There is no arithmetic in this one</h2>
    <p>Hex to binary is the one conversion on this site that needs no division, no multiplication and no carrying. Sixteen is two to the fourth, so one hex digit maps onto exactly four bits and always the same four bits, regardless of what is on either side of it. Replace each digit with its nibble, concatenate, and you are finished: <code>2F</code> becomes <code>0010</code> and <code>1111</code>, which is <code>00101111</code>.</p>
%(nibbles)s
    <p>That table is the entire conversion. It is worth learning by heart, because it also runs backwards for <a href="/binary-to-hex">binary to hex</a>, and because it is the reason hex exists at all: it is a shorthand for binary that a person can read aloud, where every digit still lines up with a fixed group of bits. Base 10 has no such property — there is no fixed number of bits per decimal digit — which is why a decimal number tells you nothing about its own bit pattern at a glance.</p>
    <h2>Keep the leading zeros</h2>
    <p>Each hex digit expands to four bits including any leading zeros, so <code>5</code> is <code>0101</code>, not <code>101</code>. Dropping them is the usual way this goes wrong: <code>0x15</code> is <code>0001 0101</code>, and writing it as <code>1 0101</code> makes it look like a five-bit value. Set a width above and the output is padded to the full 8, 16, 32 or 64 bits so the columns line up against whatever you are comparing it with.</p>
    <h2>Why this is the conversion you want for flags</h2>
    <p>When documentation gives you a status word as <code>0x2C</code> and a table of what each bit means, the fast route is not through decimal. Expand straight to <code>0010 1100</code>, then read off bits 5, 3 and 2 as set. Going via decimal (44) throws away exactly the structure you were trying to read, and then you have to convert back.</p>
    <p>The same applies to masks. An RGB channel mask of <code>0x00FF0000</code> is obviously "the second byte" once expanded, and much less obviously 16,711,680 in decimal.</p>
    <p>Related: <a href="/binary-to-hex">binary to hex</a> for the return trip, <a href="/hex-to-decimal">hex to decimal</a> when you want a magnitude rather than a pattern, and the <a href="%(hub)s">full converter</a>.</p>
""" % {"nibbles": nibbles, "hub": HUB}


def body_binary_to_hex(D):
    groups = table(
        "Grouping from the right, with the padding made explicit",
        ["Binary as typed", "Padded and grouped", "Hex", "Decimal"],
        [[code(g["raw"]), code(g["padded"]), code(g["hex"]), g["dec"]] for g in D["grouping"]],
    )
    return """    <h2>Group in fours, from the right</h2>
    <p>Because sixteen is two to the fourth, every four bits become exactly one hex digit. The only thing to be careful about is the direction: you group <em>from the right</em>, because the rightmost bit is the ones column and place value is what has to stay aligned. Group from the left and every digit after the first is wrong.</p>
    <p>If the string does not divide by four, pad the left with zeros until it does. Padding on the left never changes the value; padding on the right multiplies it by two each time.</p>
%(groups)s
    <p>Look at the second row. <code>101</code> is five, and the padded form <code>0101</code> is still five. Had the pad gone on the other end, <code>1010</code>, you would have ten — the exact error this convention exists to prevent.</p>
    <h2>Hex is how you read long binary</h2>
    <p>A 32-bit value written in binary is thirty-two characters that all look the same, and counting to bit 19 in that string by eye is a mistake waiting to happen. The same value in hex is eight characters, each standing for a known group of four, so bit 19 is "the second bit of the fifth digit from the right" and you can find it without counting to nineteen.</p>
    <p>That is why hex, not decimal, is the notation used for register dumps, hash digests, memory addresses and packet captures: it compresses binary by a factor of four while keeping the bit boundaries visible.</p>
    <h2>Widths, and reading the sign</h2>
    <p>Set a width above and the hex is padded to the full field — two digits for a byte, four for a 16-bit word, eight for a 32-bit word, sixteen for 64. Tick <em>signed</em> as well and you also get told what that pattern means as a two's-complement number, which is the answer you want when the binary came out of a debugger showing an <code>int</code>.</p>
    <p>Spaces and underscores in the input are ignored, so binary pasted out of a datasheet in nibble groups converts as-is.</p>
    <p>Related: <a href="/hex-to-binary">hex to binary</a> for the return trip, <a href="/binary-to-decimal">binary to decimal</a> for a magnitude, and the <a href="%(hub)s">full converter</a> for every base at once.</p>
""" % {"groups": groups, "hub": HUB}


def body_text_to_binary(D):
    rows = [[code(a["ch"]) if a["ch"] != " " else "<code>space</code>", a["dec"], code(a["bin"])]
            for a in D["asciiBinary"]]
    ascii_table = table(
        "Every printable ASCII character as eight bits",
        ["Character", "Decimal", "Binary"],
        rows,
        cls="data-table data-table--tall",
    )
    return """    <h2>Text is not binary until you choose an encoding</h2>
    <p>A character is an idea; a byte is a number. Turning one into the other requires a rule, and the rule this page uses is UTF-8, which is what essentially every file, database and web page has used for years. Under UTF-8 the characters you can type on a US keyboard are one byte each and identical to ASCII, so <code>H</code> is 72 is <code>01001000</code>. Anything outside that set costs two, three or four bytes.</p>
    <p>Each byte is written as eight bits, most significant first, padded with leading zeros. That padding is not optional: <code>1001000</code> is only seven bits, and a decoder reading a stream eight bits at a time will fall out of step on the very next character.</p>
    <h2>Characters outside ASCII</h2>
    <p>Type an accented letter or an emoji above and watch the byte count go up. UTF-8 encodes a character's code point in one to four bytes, with the first byte declaring how many follow:</p>
%(multi)s
    <p>This is why "how many bits is a character?" has no single answer, and why a text field that allows 100 characters is not a database column of 100 bytes. It is also why binary produced from text on one machine and read on another matches only if both agree on the encoding — a string encoded as UTF-16 or Latin-1 will produce completely different bits for the same visible characters.</p>
    <h2>The ASCII table, in binary</h2>
    <p>For the one-byte range, the mapping is fixed and worth having in front of you. Note the structure: digits start at <code>0011 0000</code>, uppercase at <code>0100 0001</code>, lowercase exactly 32 higher at <code>0110 0001</code> — which is why flipping bit 5 changes a letter's case.</p>
%(ascii)s
    <p>Related: <a href="/binary-to-text">binary to text</a> for the return trip, <a href="/text-to-hex">text to hex</a> when the binary is too long to read, and the <a href="%(hub)s">number base converter</a> for plain numbers rather than text.</p>
""" % {
        "ascii": ascii_table,
        "multi": table(
            "One character, several bytes",
            ["Character", "What it is", "Bytes", "Binary"],
            [[code(m["ch"]), esc(m["name"]), m["bytes"], code(m["bin"])] for m in D["multibyte"]],
        ),
        "hub": HUB,
    }


def body_binary_to_text(D):
    controls = table(
        "Byte values that are not letters",
        ["Decimal", "Name", "Binary", "What it does"],
        [[c["dec"], code(c["name"]), code(c["bin"]), esc(c["why"])] for c in D["controls"]],
    )
    return """    <h2>Eight bits at a time</h2>
    <p>Decoding binary back into text means cutting the stream into bytes and looking each one up. The converter accepts the bits in whatever shape you have them — one long unbroken run, or groups separated by spaces, commas or underscores — and treats every eight bits as one byte. Where the input has no separators it chunks from the right, so a run whose length is not a multiple of eight keeps its low bytes intact and only the leading byte comes up short.</p>
    <p>Get the alignment wrong and the output is not slightly wrong, it is unrecognisable. A single stray or missing bit shifts every subsequent byte and turns readable text into a run of unrelated symbols. If your output looks like noise from the first character, the usual cause is a bit count that is not a multiple of eight.</p>
    <h2>Not every byte is a letter</h2>
    <p>Values below 32 are control codes, not characters, and they are why a decoded string sometimes has invisible content or line breaks you did not expect:</p>
%(controls)s
    <p>The pair to watch is 13 and 10. A Windows line ending is both — <code>00001101 00001010</code> — while a Unix one is just 10. Binary that decodes with a stray character at the end of every line is usually a CRLF file being read as if it were LF.</p>
    <h2>When the bytes are not text at all</h2>
    <p>Binary that came from an image, an archive or an encrypted blob is not going to decode into anything meaningful, and that is not a failure of the converter. This page decodes as UTF-8 and follows the standard's rule for invalid input: every byte that cannot start or continue a valid sequence becomes U+FFFD, the replacement character <code>�</code>. So a scattering of <code>�</code> means specific bytes were invalid, while a solid wall of them means the data was never UTF-8 text.</p>
    <p>Truncation shows up the same way. The euro sign is three bytes; feed in only the first two and you get a replacement character, because a partial sequence is not a character.</p>
    <p>Related: <a href="/text-to-binary">text to binary</a> for the return trip, <a href="/hex-to-text">hex to text</a> which is the same job in a more compact notation, and the <a href="%(hub)s">number base converter</a>.</p>
""" % {"controls": controls, "hub": HUB}


def body_text_to_hex(D):
    dump = table(
        "A hex dump of “Hex is just bytes.”, eight bytes to a row",
        ["Offset", "Bytes", "As text"],
        [[code(r["offset"]), code(r["hex"]), code(r["ascii"])] for r in D["hexdump"]],
    )
    escapes = table(
        "The same two bytes, written for different readers",
        ["Where you would write it", "Form"],
        [[esc(e["form"]), code(e["example"])] for e in D["escapes"]],
    )
    return """    <h2>Two hex digits per byte, always</h2>
    <p>Text becomes hex in two steps: encode the characters to bytes with UTF-8, then write each byte as exactly two hex digits. The "exactly two" is what makes the output parseable — <code>0A</code> and <code>A</code> are the same number, but only the padded form can be read back unambiguously from a stream where the bytes are not separated.</p>
    <p>Hex is the notation of choice here rather than binary because it is four times shorter and still maps cleanly onto byte boundaries. A sentence in binary is a wall; the same sentence in hex is something you can scan.</p>
    <h2>What a hex dump looks like</h2>
    <p>Tools like <code>xxd</code>, <code>hexdump</code> and every binary editor lay bytes out in fixed-width rows with an offset on the left and a printable rendering on the right. Non-printable bytes show as a dot, which is why the dump below has one at the end — the trailing newline:</p>
%(dump)s
    <p>The offset column is a byte count from the start of the data, in hex. That is the number a debugger, a parser error or a diff will quote at you, so being able to line it up against the row is most of what reading a dump is.</p>
    <h2>Where the hex is going</h2>
    <p>The same bytes get written several different ways depending on what will read them, and picking the wrong form is a common source of "the value looks right but does not work":</p>
%(escapes)s
    <p>Percent-encoding in particular is not the same job as hex: it only escapes the bytes a URL cannot carry literally, leaving the rest as characters. If that is what you need, use the <a href="/url-encoder-decoder">URL encoder</a> instead of pasting a full hex string into a query parameter.</p>
    <h2>Non-ASCII costs more than one byte</h2>
    <p>Every character above U+007F takes two to four bytes in UTF-8, so its hex is four, six or eight digits rather than two. That is why a string's character count and its hex length are not related by a constant, and why truncating a hex string at an arbitrary even offset can cut a character in half.</p>
    <p>Related: <a href="/hex-to-text">hex to text</a> for reading a dump back, <a href="/text-to-binary">text to binary</a> when you want the individual bits, and the <a href="/hash-generator">hash generator</a> if what you actually want is a digest of the bytes.</p>
""" % {"dump": dump, "escapes": escapes, "hub": HUB}


def body_hex_to_text(D):
    leads = table(
        "What a UTF-8 lead byte tells you",
        ["First byte", "Bytes in the character", "What lives there"],
        [[code(l["range"]), l["len"], esc(l["meaning"])] for l in D["leadBytes"]],
    )
    examples = table(
        "Hex in, characters out",
        ["Hex", "Bytes", "Decodes to"],
        [[code(h["hex"]), h["bytes"], code(h["text"])] for h in D["hexText"]],
    )
    return """    <h2>Reading a hex dump back into words</h2>
    <p>Every two hex digits are one byte, and the bytes are decoded as UTF-8. Paste with spaces, without them, with a <code>0x</code> in front, or straight out of a dump with its offsets stripped — the converter chunks unseparated input into byte-sized pairs from the right, so an odd number of digits leaves only the leading nibble short instead of shifting the whole run.</p>
    <p>This is the everyday way to find out what a blob in a log, a packet capture or a database column actually says, and it is usually faster than reaching for a script.</p>
    <h2>The first byte tells you how long the character is</h2>
    <p>UTF-8 is self-describing, which is what makes decoding possible without any extra information. The value of a byte says whether it starts a character and how many bytes that character occupies:</p>
%(leads)s
    <p>That structure is why UTF-8 can be resynchronised: land in the middle of a stream, skip forward until you see a byte outside <code>80–BF</code>, and you are at a character boundary again. It is also why a truncated run fails loudly rather than silently producing the wrong character.</p>
%(examples)s
    <h2>When it does not decode</h2>
    <p>A <code>�</code> in the output is the standard replacement character, emitted once for every byte that cannot begin or continue a valid sequence. A few of them usually means the run was cut mid-character or a byte was mistyped. A page of them means the data is not UTF-8 text — it may be an image, a compressed archive, an encrypted payload, or text in a legacy encoding such as Latin-1 or Shift-JIS, none of which this page can decode.</p>
    <p>Bytes above 127 that decode to unexpected accented characters are the classic sign of the opposite mistake: Latin-1 data being read as UTF-8, or the reverse.</p>
    <h2>Some hex is not text on purpose</h2>
    <p>Hash digests, keys, UUIDs and binary file headers are hex because they are numbers or raw bytes, not because they encode a string. Trying to decode a SHA-256 digest as text will always produce nonsense; if the hex is a hash, compare it as a hash with the <a href="/hash-generator">hash generator</a> instead. If it is a number, <a href="/hex-to-decimal">hex to decimal</a> is the page you want.</p>
    <p>Related: <a href="/text-to-hex">text to hex</a> for the return trip, <a href="/binary-to-text">binary to text</a> for the same job from bits, and the <a href="%(hub)s">number base converter</a>.</p>
""" % {"leads": leads, "examples": examples, "hub": HUB}


PAGES = [
    dict(
        slug=HUB,
        h1="Number Base Converter",
        title="Number Base Converter — Binary, Hex, Decimal, Any Base 2–36 — devboxkit.com",
        description="Free online base converter. Any base from 2 to 36, with 8/16/32/64-bit widths and a two's-complement toggle. BigInt throughout, so 64-bit values and negatives are exact. Runs entirely in your browser.",
        og_title="Number Base Converter — Any Base, Any Width",
        og_description="Convert between any bases from 2 to 36 with correct signed and unsigned readings at 8, 16, 32 and 64 bits. Exact past 2^53. Nothing is uploaded.",
        lede="Any base from 2 to 36, with real bit widths and a two&#8217;s-complement toggle &mdash; and exact past 2<sup>53</sup>, where converters built on floating point quietly stop being right.",
        widget=hub_widget,
        body=hub_body,
    ),
    dict(
        slug="/hex-to-decimal",
        h1="Hex to Decimal",
        title="Hex to Decimal Converter — Signed and Unsigned, Exact at 64 Bits — devboxkit.com",
        description="Convert hexadecimal to decimal in your browser. Handles 64-bit values exactly and shows both the signed (two's-complement) and unsigned reading at 8, 16, 32 and 64 bits.",
        og_title="Hex to Decimal Converter",
        og_description="Hex to decimal with correct signed and unsigned answers at any width, exact well past 2^53. Nothing is uploaded.",
        lede="Paste hex, get decimal &mdash; with the signed and unsigned readings shown separately, because <code>FFFFFFFF</code> is both 4,294,967,295 and &minus;1 depending on the width it came from.",
        **{"from": "16"}, to="10",
        in_label="Hexadecimal", in_hint="Hex value — 0x prefix and separators are fine",
        out_label="Decimal", sample="FFFFFFFF",
        swap="/decimal-to-hex", swap_label="Swap → decimal to hex",
        body=body_hex_to_decimal,
    ),
    dict(
        slug="/decimal-to-hex",
        h1="Decimal to Hex",
        title="Decimal to Hex Converter — Padded to Any Width — devboxkit.com",
        description="Convert decimal to hexadecimal in your browser, padded to 8, 16, 32 or 64 bits, with correct two's-complement output for negative numbers. Exact at any magnitude.",
        og_title="Decimal to Hex Converter",
        og_description="Decimal to hex, zero-padded to a real width, with two's-complement output for negatives. Exact past 2^53.",
        lede="Decimal in, hexadecimal out &mdash; padded to a real field width, and with the two&#8217;s-complement pattern rather than a minus sign when the number is negative.",
        **{"from": "10"}, to="16", uppercase=True,
        in_label="Decimal", in_hint="Decimal value — a leading minus and 1_000_000 separators are fine",
        out_label="Hexadecimal", sample="4294967295",
        swap="/hex-to-decimal", swap_label="Swap → hex to decimal",
        body=body_decimal_to_hex,
    ),
    dict(
        slug="/binary-to-decimal",
        h1="Binary to Decimal",
        title="Binary to Decimal Converter — Signed and Unsigned — devboxkit.com",
        description="Convert binary to decimal in your browser. Any length, exact past 2^53, with the signed two's-complement and unsigned readings shown separately at 8, 16, 32 and 64 bits.",
        og_title="Binary to Decimal Converter",
        og_description="Binary to decimal at any length, with correct signed and unsigned readings for a chosen bit width.",
        lede="Bits in, a decimal number out &mdash; at any length, and with an honest answer to the question a bit string cannot answer on its own: is that leading 1 a value or a sign?",
        **{"from": "2"}, to="10",
        in_label="Binary", in_hint="Binary digits — spaces and underscores between groups are ignored",
        out_label="Decimal", sample="1111 0000 1010 0101",
        swap="/decimal-to-binary", swap_label="Swap → decimal to binary",
        body=body_binary_to_decimal,
    ),
    dict(
        slug="/decimal-to-binary",
        h1="Decimal to Binary",
        title="Decimal to Binary Converter — Padded to 8, 16, 32 or 64 Bits — devboxkit.com",
        description="Convert decimal to binary in your browser, zero-padded to a real bit width, with two's-complement output for negative numbers. Exact at any magnitude.",
        og_title="Decimal to Binary Converter",
        og_description="Decimal to binary, padded to a real width, with two's-complement output for negatives.",
        lede="Decimal in, bits out &mdash; zero-padded to 8, 16, 32 or 64 so the columns line up against whatever you are comparing them with.",
        **{"from": "10"}, to="2",
        in_label="Decimal", in_hint="Decimal value — a leading minus is fine once a width is set",
        out_label="Binary", sample="240",
        swap="/binary-to-decimal", swap_label="Swap → binary to decimal",
        body=body_decimal_to_binary,
    ),
    dict(
        slug="/hex-to-binary",
        h1="Hex to Binary",
        title="Hex to Binary Converter — One Digit, Four Bits — devboxkit.com",
        description="Convert hexadecimal to binary in your browser. Each hex digit expands to exactly four bits, with leading zeros kept and optional padding to 8, 16, 32 or 64 bits.",
        og_title="Hex to Binary Converter",
        og_description="Hex to binary by direct substitution — one digit, four bits — with leading zeros kept and real width padding.",
        lede="One hex digit is exactly four bits, so this conversion is pure substitution &mdash; no arithmetic, no carrying, and the bit boundaries never move.",
        **{"from": "16"}, to="2",
        in_label="Hexadecimal", in_hint="Hex value — 0x prefix and separators are fine",
        out_label="Binary", sample="2C",
        swap="/binary-to-hex", swap_label="Swap → binary to hex",
        body=body_hex_to_binary,
    ),
    dict(
        slug="/binary-to-hex",
        h1="Binary to Hex",
        title="Binary to Hex Converter — Grouped From the Right — devboxkit.com",
        description="Convert binary to hexadecimal in your browser. Groups four bits at a time from the right, pads the left, and optionally shows the signed reading at 8, 16, 32 or 64 bits.",
        og_title="Binary to Hex Converter",
        og_description="Binary to hex with correct right-to-left grouping and left padding, plus the signed reading at a chosen width.",
        lede="Four bits become one hex digit &mdash; grouped from the right, padded on the left, which is the half of this conversion people get backwards.",
        **{"from": "2"}, to="16", uppercase=True,
        in_label="Binary", in_hint="Binary digits — spaces and underscores between groups are ignored",
        out_label="Hexadecimal", sample="110100111",
        swap="/hex-to-binary", swap_label="Swap → hex to binary",
        body=body_binary_to_hex,
    ),
    dict(
        slug="/text-to-binary",
        h1="Text to Binary",
        title="Text to Binary Converter — UTF-8, Eight Bits a Byte — devboxkit.com",
        description="Convert text to binary in your browser. UTF-8 encoded, eight bits per byte with leading zeros kept, and multi-byte characters handled correctly.",
        og_title="Text to Binary Converter",
        og_description="Text to binary via UTF-8, eight bits per byte, with accented characters and emoji handled correctly.",
        lede="Type anything and get its bits &mdash; UTF-8 encoded, eight bits to a byte, with the multi-byte characters that break most converters handled properly.",
        **{"from": "text"}, to="2",
        in_label="Text", in_hint="Anything — accented characters and emoji included",
        out_label="Binary", sample="Hello",
        swap="/binary-to-text", swap_label="Swap → binary to text",
        body=body_text_to_binary,
    ),
    dict(
        slug="/binary-to-text",
        h1="Binary to Text",
        title="Binary to Text Converter — UTF-8 Decoder — devboxkit.com",
        description="Convert binary back to text in your browser. Reads eight bits at a time, decodes as UTF-8, and marks invalid bytes rather than inventing characters.",
        og_title="Binary to Text Converter",
        og_description="Binary to text as UTF-8, with invalid bytes marked rather than silently mistranslated.",
        lede="Bits back into words &mdash; eight at a time, decoded as UTF-8, with invalid bytes marked instead of silently turned into the wrong character.",
        **{"from": "2"}, to="text",
        in_label="Binary", in_hint="Binary digits — separated into bytes or one long run",
        out_label="Text", sample="01001000 01100101 01101100 01101100 01101111",
        swap="/text-to-binary", swap_label="Swap → text to binary",
        body=body_binary_to_text,
    ),
    dict(
        slug="/text-to-hex",
        h1="Text to Hex",
        title="Text to Hex Converter — UTF-8 Bytes, Two Digits Each — devboxkit.com",
        description="Convert text to hexadecimal in your browser. UTF-8 encoded, two hex digits per byte, with an optional uppercase output and multi-byte characters handled correctly.",
        og_title="Text to Hex Converter",
        og_description="Text to hex via UTF-8, two digits per byte, ready to paste into a dump, an escape sequence or a literal.",
        lede="Text to hex bytes &mdash; UTF-8 encoded, two digits each, in the form you would paste into a dump, an escape sequence or a literal.",
        **{"from": "text"}, to="16", uppercase=True,
        in_label="Text", in_hint="Anything — accented characters and emoji included",
        out_label="Hexadecimal", sample="Hello",
        swap="/hex-to-text", swap_label="Swap → hex to text",
        body=body_text_to_hex,
    ),
    dict(
        slug="/hex-to-text",
        h1="Hex to Text",
        title="Hex to Text Converter — Read a Hex Dump Back — devboxkit.com",
        description="Convert hexadecimal back to text in your browser. Decodes UTF-8, accepts spaced or unspaced input, and marks bytes that are not valid text rather than guessing.",
        og_title="Hex to Text Converter",
        og_description="Hex to text as UTF-8, spaced or unspaced, with invalid bytes marked rather than guessed at.",
        lede="Turn a hex dump back into words &mdash; spaced or unspaced, decoded as UTF-8, with bytes that are not text marked rather than guessed at.",
        **{"from": "16"}, to="text",
        in_label="Hexadecimal", in_hint="Hex bytes — spaced, unspaced, or with a 0x prefix",
        out_label="Text", sample="48 65 6C 6C 6F",
        swap="/text-to-hex", swap_label="Swap → text to hex",
        body=body_hex_to_text,
    ),
]


# --------------------------------------------------------------------------
# Sitemap
# --------------------------------------------------------------------------

def sync_sitemap(check):
    path = ROOT / "sitemap.xml"
    text = path.read_text(encoding="utf-8")
    additions = []
    for page in PAGES:
        loc = SITE + page["slug"]
        if "<loc>%s</loc>" % loc in text:
            continue
        # The hub is a tool in its own right; the directed pages are the family
        # underneath it, so they rank a notch lower.
        priority = "0.8" if page["slug"] == HUB else "0.7"
        additions.append(
            "  <url>\n    <loc>%s</loc>\n    <changefreq>monthly</changefreq>\n"
            "    <priority>%s</priority>\n  </url>\n" % (loc, priority)
        )
    if not additions:
        return False
    if check:
        return True
    text = text.replace("</urlset>", "".join(additions) + "</urlset>")
    path.write_text(text, encoding="utf-8")
    return True


# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Build the base-conversion family.")
    ap.add_argument("--check", action="store_true",
                    help="exit 1 if any generated page or the sitemap is stale")
    args = ap.parse_args()

    data = table_data()
    stale, written = [], []

    for page in PAGES:
        widget = page["widget"]() if page.get("widget") else pair_widget(page)
        html = render(page, widget, page["body"](data))
        # Fill the nav and sibling-chip regions here rather than leaving empty
        # markers for a later sync_nav pass. Otherwise every page is reported
        # stale the moment sync_nav runs, and --check stops meaning anything.
        html = sync_nav.apply_regions(html, page["slug"])
        path = ROOT / (page["slug"].lstrip("/") + ".html")
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == html:
            continue
        if args.check:
            stale.append(path.name)
        else:
            path.write_text(html, encoding="utf-8")
            written.append(path.name)

    sitemap_changed = sync_sitemap(args.check)

    if args.check:
        if stale or sitemap_changed:
            print("stale: " + ", ".join(stale + (["sitemap.xml"] if sitemap_changed else [])))
            return 1
        print("every base page is current")
        return 0

    print("wrote %d page(s)%s" % (len(written), " + sitemap.xml" if sitemap_changed else ""))
    for name in written:
        print("  " + name)
    if written:
        print("\nrun `python3 tools/sync_nav.py` too if nav_data.py changed: "
              "these pages are already current, the other 17 are not.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
