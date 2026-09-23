"""devboxkit.com navigation data — the single source of truth for the toolbar.

This is the ONLY file that differs between sites. `sync_nav.py` is generic and
copies verbatim. Nothing here is computed at runtime by the browser: sync_nav
renders it into the static HTML of every page.

Tier rule (portfolio spec, ngineer420.github.io#13): a page is tier 1 only if it
answers a *different question*. All fifteen of these do. Colour conversion and
WCAG contrast are two of those different questions, not one: a single page
straddling both would rank for neither.

There is now exactly one tier-2 family: the ten directed conversion pages under
the number base converter. "hex to decimal" is not a different question from
"decimal to hex" in the way that hashing is different from formatting JSON — it
is the same instrument with the direction fixed — so those pages live in
VARIANTS as sibling chips inside the tool rather than taking ten rail slots.

hrefs are the extensionless clean paths the canonicals already use.
"""

# Noun used in the menu trigger: "All 15 tools".
NOUN = "tools"

# Tier-1 tools. The first eight are the rail, in the order the old tab strip
# already used; the rest are sheet-only.
#   label -> rail chip text, <= 18 chars
#   long  -> anchor text in the sheet
#   body  -> anchor text in the in-page "More developer tools" list, which has
#            room for the disambiguating parenthetical the rail does not
#   group -> sheet grouping key
TOOLS = [
    # --- the rail (first eight) ---
    {"href": "/json-formatter",           "label": "JSON",      "long": "JSON Formatter",            "group": "format", "body": "JSON Formatter", "tier": 1},
    {"href": "/base64-encode-decode",     "label": "Base64",    "long": "Base64 Encode/Decode",      "group": "encode", "body": "Base64 Encode / Decode", "tier": 1},
    {"href": "/url-encoder-decoder",      "label": "URL",       "long": "URL Encode/Decode",         "group": "encode", "body": "URL Encoder / Decoder", "tier": 1},
    {"href": "/unix-timestamp-converter", "label": "Timestamp", "long": "Timestamp Converter",       "group": "inspect", "body": "Unix Timestamp Converter", "tier": 1},
    {"href": "/regex-tester",             "label": "Regex",     "long": "Regex Tester",              "group": "format", "body": "Regex Tester", "tier": 1},
    {"href": "/uuid-generator",           "label": "UUID",      "long": "UUID Generator",            "group": "generate", "body": "UUID Generator (v4 / v7)", "tier": 1},
    {"href": "/hash-generator",           "label": "Hash",      "long": "Hash Generator",            "group": "generate", "body": "Hash Generator (MD5 / SHA / HMAC)", "tier": 1},
    {"href": "/jwt-decoder",              "label": "JWT",       "long": "JWT Decoder",               "group": "inspect", "body": "JWT Decoder", "tier": 1},
    # --- sheet only ---
    {"href": "/password-generator",       "label": "Password",  "long": "Password Generator",        "group": "generate", "body": "Password Generator", "tier": 1},
    {"href": "/json-csv-converter",       "label": "JSON ⇄ CSV", "long": "JSON ⇄ CSV Converter", "group": "format", "body": "JSON ⇄ CSV Converter", "tier": 1},
    {"href": "/html-entity-encoder",      "label": "Entities",  "long": "HTML Entity Encoder",       "group": "encode", "body": "HTML Entity Encoder / Decoder", "tier": 1},
    {"href": "/cron-expression-parser",   "label": "Cron",      "long": "Cron Expression Explainer", "group": "inspect", "body": "Cron Expression Explainer", "tier": 1},
    {"href": "/color-converter",          "label": "Color",     "long": "Color Converter",           "group": "color", "body": "Color Converter (HEX / RGB / HSL / HSV)", "tier": 1},
    {"href": "/contrast-checker",         "label": "Contrast",  "long": "WCAG Contrast Checker",     "group": "color", "body": "WCAG Contrast Checker", "tier": 1},
    {"href": "/number-base-converter",    "label": "Bases",     "long": "Number Base Converter",     "group": "convert", "body": "Number Base Converter (any base 2–36)", "tier": 1},
]

# The one tier-2 family on this site. Ten directed pages — the same converter
# with the direction fixed — rendered as sibling chips inside the tool's own
# panel by the `sizechips` region, and cross-linked from every member. The
# parent keeps aria-current="true" in the rail while any of them is the current
# page, so the rail never looks unselected on a variant.
VARIANTS = {
    "parent": "/number-base-converter",
    "aria": "Directed conversions",
    "label": "One direction",
    "items": [
        {"href": "/hex-to-decimal",   "label": "Hex → Dec"},
        {"href": "/decimal-to-hex",   "label": "Dec → Hex"},
        {"href": "/binary-to-decimal", "label": "Bin → Dec"},
        {"href": "/decimal-to-binary", "label": "Dec → Bin"},
        {"href": "/hex-to-binary",    "label": "Hex → Bin"},
        {"href": "/binary-to-hex",    "label": "Bin → Hex"},
        {"href": "/text-to-binary",   "label": "Text → Bin"},
        {"href": "/binary-to-text",   "label": "Bin → Text"},
        {"href": "/text-to-hex",      "label": "Text → Hex"},
        {"href": "/hex-to-text",      "label": "Hex → Text"},
    ],
}

# Sheet groups, in order. Named from the visitor's vocabulary, not the
# implementation's. No category hub pages on this site, so the labels are plain
# text (a third element would make them links).
GROUPS = [
    ("format",   "Format & validate"),
    ("encode",   "Encode & decode"),
    ("generate", "Generate"),
    ("inspect",  "Inspect"),
    ("color",    "Color"),
    ("convert",  "Convert"),
]

# No preset family on this site: every tool answers a different question.
HUBS = []

# The in-page tool list near the foot of <main>. The toolbar is chrome and
# search engines discount it; this list is body copy and is the crawl surface
# that actually distributes link equity between the tools. It was hand-copied
# into 25 files and drifted: /number-base-converter was missing from every one
# of them (issue #24). The `tools` region now renders it from TOOLS above.
#
# `heading` is emitted inside the region so the markers wrap one whole block.
# `home` is the last item, and the renderer drops it on the home page itself.
TOOLS_LIST = {
    "heading": "More developer tools",
    "home": ("/", "All tools on one page (home)"),
}

# The footer carries Home/Privacy/Terms and never carried a tool list. The rail
# plus the sheet carry all fifteen destinations on every page, so adding one now
# would be boilerplate without a new crawl surface.
FOOTER = []

# One-time --migrate: what the legacy markup looked like and where the marker
# pair goes. Per-site, because the legacy markup is per-site. Ops run in order.
MIGRATE = [
    # The tab strip on the twelve standalone tool pages. It sat *inside* <main>
    # below the hero — at y=360 on a tool page and y=457 on the homepage, i.e.
    # off the first screen at 390px, which is why 10 of 12 tools were invisible.
    {"op": "strip", "pattern": r'\n\n  <nav class="tabbar".*?\n  </nav>'},
    # The homepage's copy, which was also a role="tablist" carrying
    # tabindex="-1" on eleven of its twelve links — i.e. out of tab order.
    {"op": "strip", "pattern": r'\n\n  <div role="tablist" class="tabbar".*?\n  </div>'},
    # The toolbar is a direct child of <body>, immediately after </header>.
    {"op": "insert_after", "region": "nav", "pattern": r"</header>", "indent": ""},
    # The hand-written "More developer tools" list in the body of every tool
    # page. The heading is inside the match, so the region owns the whole block
    # and the renderer can change the heading later without a second migration.
    # The leading indent is left in the file for region_re to pick up.
    {"op": "replace", "region": "tools",
     "pattern": r"<h2>More developer tools</h2>\s*<ul>.*?</ul>"},
]
