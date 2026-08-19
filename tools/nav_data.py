"""devboxkit.com navigation data — the single source of truth for the toolbar.

This is the ONLY file that differs between sites. `sync_nav.py` is generic and
copies verbatim. Nothing here is computed at runtime by the browser: sync_nav
renders it into the static HTML of every page.

Tier rule (portfolio spec, ngineer420.github.io#13): a page is tier 1 only if it
answers a *different question*. All fourteen of these do — there is no preset
family on this site, so no tier 2, no hub row and no in-panel sibling chips.
Colour conversion and WCAG contrast are two of those different questions, not
one: a single page straddling both would rank for neither.

hrefs are the extensionless clean paths the canonicals already use.
"""

# Noun used in the menu trigger: "All 14 tools".
NOUN = "tools"

# Tier-1 tools. The first eight are the rail, in the order the old tab strip
# already used; the rest are sheet-only.
#   label -> rail chip text, <= 18 chars
#   long  -> anchor text in the sheet
#   group -> sheet grouping key
TOOLS = [
    # --- the rail (first eight) ---
    {"href": "/json-formatter",           "label": "JSON",      "long": "JSON Formatter",            "group": "format", "tier": 1},
    {"href": "/base64-encode-decode",     "label": "Base64",    "long": "Base64 Encode/Decode",      "group": "encode", "tier": 1},
    {"href": "/url-encoder-decoder",      "label": "URL",       "long": "URL Encode/Decode",         "group": "encode", "tier": 1},
    {"href": "/unix-timestamp-converter", "label": "Timestamp", "long": "Timestamp Converter",       "group": "inspect", "tier": 1},
    {"href": "/regex-tester",             "label": "Regex",     "long": "Regex Tester",              "group": "format", "tier": 1},
    {"href": "/uuid-generator",           "label": "UUID",      "long": "UUID Generator",            "group": "generate", "tier": 1},
    {"href": "/hash-generator",           "label": "Hash",      "long": "Hash Generator",            "group": "generate", "tier": 1},
    {"href": "/jwt-decoder",              "label": "JWT",       "long": "JWT Decoder",               "group": "inspect", "tier": 1},
    # --- sheet only ---
    {"href": "/password-generator",       "label": "Password",  "long": "Password Generator",        "group": "generate", "tier": 1},
    {"href": "/json-csv-converter",       "label": "JSON ⇄ CSV", "long": "JSON ⇄ CSV Converter", "group": "format", "tier": 1},
    {"href": "/html-entity-encoder",      "label": "Entities",  "long": "HTML Entity Encoder",       "group": "encode", "tier": 1},
    {"href": "/cron-expression-parser",   "label": "Cron",      "long": "Cron Expression Explainer", "group": "inspect", "tier": 1},
    {"href": "/color-converter",          "label": "Color",     "long": "Color Converter",           "group": "color", "tier": 1},
    {"href": "/contrast-checker",         "label": "Contrast",  "long": "WCAG Contrast Checker",     "group": "color", "tier": 1},
]

# Sheet groups, in order. Named from the visitor's vocabulary, not the
# implementation's. No category hub pages on this site, so the labels are plain
# text (a third element would make them links).
GROUPS = [
    ("format",   "Format & validate"),
    ("encode",   "Encode & decode"),
    ("generate", "Generate"),
    ("inspect",  "Inspect"),
    ("color",    "Color"),
]

# No preset family on this site: every tool answers a different question.
HUBS = []

# The footer carries Home/Privacy/Terms and never carried a tool list. The rail
# plus the sheet carry all fourteen destinations on every page, so adding one now
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
]
