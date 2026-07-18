# devboxkit.com

A free, ad-supported developer toolkit with eleven tools in one page:

- **JSON Formatter/Validator**: beautify or minify JSON, with syntax-error messages that include the line/column (or character position) of the problem, plus lightweight syntax highlighting of the output.
- **Base64 Encode/Decode**: two-way text ↔ Base64 conversion, with graceful error handling for invalid Base64 input.
- **URL Encode/Decode**: two-way text/URL ↔ percent-encoding conversion (`encodeURIComponent`/`decodeURIComponent` semantics), with graceful error handling for malformed input.
- **Timestamp Converter**: two-way Unix epoch (seconds or milliseconds, auto-detected or chosen explicitly) ↔ human-readable date, showing both local and UTC time, with a "Now" button.
- **Regex Tester**: pattern + flags (g/i/m/s/u/y) + test string, with all matches highlighted inline and listed below with their capture groups.
- **UUID Generator**: cryptographically random v4 UUIDs, or time-ordered v1-style UUIDs, single or in bulk (up to 1000), with copy.
- **Hash Generator**: MD5 (hand-rolled, since SubtleCrypto has no MD5), SHA-1, SHA-256, and SHA-512 digests of any text, computed side by side.
- **JWT Decoder**: base64url-decodes and pretty-prints a JWT's header and payload, with `iat`/`exp`/`nbf` shown as human-readable dates. Decoding only — no signature verification.
- **Password Generator**: length slider, character-set toggles, an exclude-ambiguous-characters option, and an entropy-based strength meter, built on `crypto.getRandomValues`.
- **JSON ⇄ CSV Converter**: JSON array of objects → CSV and CSV (with a header row) → JSON, both directions, with quoted-field handling, copy, and download.
- **HTML Entity Encoder/Decoder**: encode text to named/numeric HTML entities and decode entities back to plain text.

Everything runs client-side — no backend, no build step, nothing is ever uploaded. Deployed as static files on GitHub Pages.

There's also an `articles/` directory with four original written guides (JSON formatting, Base64/URL encoding, Unix timestamps, regex) linked from the homepage's "Learn more" section and from `sitemap.xml` — content-depth pages for AdSense review, not part of the tool functionality itself.

## Local development

No build tooling required. Serve the folder with any static file server, e.g.:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Structure

```
index.html            Main app (all eleven tools, tabbed)
uuid-generator.html, hash-generator.html, jwt-decoder.html,
password-generator.html, json-csv-converter.html,
html-entity-encoder.html
                        Per-tool SEO landing pages for the newer tools (same
                        pattern as json-formatter.html etc.)
articles/              Written guides for content depth (JSON, Base64/URL, timestamps, regex)
privacy.html           Privacy policy (required for ad networks)
terms.html             Terms of use
404.html               Custom 404 page
assets/favicon.svg     Favicon (original "{ }" mark)
assets/css/styles.css  Design system
assets/js/app.js       All app logic — pure conversion/parsing functions at the
                        top (exported via `module.exports` for Node, guarded by
                        `typeof module !== "undefined"`), DOM wiring below
                        (guarded by `typeof document !== "undefined"`)
CNAME                   GitHub Pages custom domain (devboxkit.com)
robots.txt / sitemap.xml
```

## Enabling ads (Google AdSense)

1. Deploy the site and get it live at devboxkit.com.
2. Apply at https://adsense.google.com with the live URL. Approval requires a working privacy policy (already included) and some real content/traffic — it isn't instant.
3. Once approved, uncomment the AdSense `<script>` tag in `index.html`'s `<head>` and replace `ca-pub-XXXXXXXXXXXXXXXX` with your publisher ID. Auto ads then places ad units automatically — no manual placement needed.

## Custom domain (devboxkit.com)

**Note: `devboxkit.com` has not been registered yet.** The `CNAME` file and the steps below describe the intended setup for once the domain is purchased — until then, the site is only reachable at its default `github.io` Pages URL.

The `CNAME` file tells GitHub Pages to serve this repo at `devboxkit.com`. Once the domain is registered, you'll need to point DNS at GitHub Pages yourself:

- Apex domain (`devboxkit.com`): four `A` records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
- `www` subdomain (optional): `CNAME` record to `<username>.github.io`.

Then enable Pages in the repo's Settings → Pages, and enter `devboxkit.com` as the custom domain (GitHub will offer to enforce HTTPS once DNS propagates).

## Sanity-checking the core logic

The pure functions in `assets/js/app.js` (JSON parsing/formatting/error-position extraction, Base64/URL/HTML-entity encode/decode, timestamp conversion, regex match extraction, UUID generation, MD5/SHA hashing, JWT decoding, password generation, JSON↔CSV conversion) can be exercised directly from Node since they're exported via `module.exports`:

```js
const app = require("./assets/js/app.js");
app.formatJson('{"a":1}');
app.base64Decode("not-valid-base64!!!");
```
