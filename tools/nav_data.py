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
    # `crumb` is the full name, for the breadcrumb trail. The chip
    # label has to fit a chip; a breadcrumb has the room to say it.
    "items": [
        {"href": "/hex-to-decimal", "label": "Hex → Dec", "crumb": "Hex to Decimal"},
        {"href": "/decimal-to-hex", "label": "Dec → Hex", "crumb": "Decimal to Hex"},
        {"href": "/binary-to-decimal", "label": "Bin → Dec", "crumb": "Binary to Decimal"},
        {"href": "/decimal-to-binary", "label": "Dec → Bin", "crumb": "Decimal to Binary"},
        {"href": "/hex-to-binary", "label": "Hex → Bin", "crumb": "Hex to Binary"},
        {"href": "/binary-to-hex", "label": "Bin → Hex", "crumb": "Binary to Hex"},
        {"href": "/text-to-binary", "label": "Text → Bin", "crumb": "Text to Binary"},
        {"href": "/binary-to-text", "label": "Bin → Text", "crumb": "Binary to Text"},
        {"href": "/text-to-hex", "label": "Text → Hex", "crumb": "Text to Hex"},
        {"href": "/hex-to-text", "label": "Hex → Text", "crumb": "Hex to Text"},
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

# The one polite live region per tool page. Every tool writes one short
# sentence into it after it produces a result, so a screen reader hears the
# answer without the visitor hunting for the output box.
#
# One region, not one per tool. Two live regions on a page interrupt each
# other, and the homepage carries all fifteen tools at once. The region is in
# the served HTML rather than built by script, so it is already registered
# before the first result lands in it.
#
# `class` is the site's own visually-hidden utility. `sync_nav.py` reads both
# keys, so a site with a different utility class only edits this file.
STATUS = {
    "id": "tool-status",
    "class": "visually-hidden",
}

# The footer carries Home/Privacy/Terms and never carried a tool list. The rail
# plus the sheet carry all fifteen destinations on every page, so adding one now
# would be boilerplate without a new crawl surface.
FOOTER = []

# The site origin. Every absolute URL the generators emit starts here.
SITE = "https://devboxkit.com"

# Breadcrumb trail data for the `jsonld` region.
#
# The trail is computed, not listed: Home, then the parent tool if the page is
# one of the ten directed conversions, then the page itself. `extra` names the
# pages that are not tools and gives the exact path their canonical uses, which
# is what keeps the BreadcrumbList item and the canonical link in agreement.
#
# 404.html is absent on purpose. A "page not found" is not a place in the site,
# and structured data on it would invite indexing of a page that must not rank.
BREADCRUMBS = {
    "home": "DevBox Kit",
    "extra": {
        "/privacy": {"name": "Privacy Policy", "path": "/privacy.html"},
        "/terms": {"name": "Terms of Use", "path": "/terms.html"},
        "/articles/json-formatting-guide": {
            "name": "JSON Formatting Guide",
            "path": "/articles/json-formatting-guide.html"},
        "/articles/base64-and-url-encoding-explained": {
            "name": "Base64 and URL Encoding Explained",
            "path": "/articles/base64-and-url-encoding-explained.html"},
        "/articles/unix-timestamp-guide": {
            "name": "Unix Timestamp Guide",
            "path": "/articles/unix-timestamp-guide.html"},
        "/articles/regex-cheat-sheet": {
            "name": "Regex Cheat Sheet",
            "path": "/articles/regex-cheat-sheet.html"},
    },
}

# The four written guides. The `jsonld` region emits an Article block for each.
#
# The dates come from git: `published` is the commit that added the file and
# `modified` is the commit that last changed it. Nothing in the markup or the
# prose of these pages carries a date, so git is the only honest source.
# Refresh `modified` when you rewrite an article.
ARTICLES = {
    "/articles/json-formatting-guide": {
        "headline": "JSON Formatting Guide: Syntax Rules, Common Errors and When to Minify",
        "published": "2026-07-16",
        "modified": "2026-08-26",
    },
    "/articles/base64-and-url-encoding-explained": {
        "headline": "Base64 and URL Encoding Explained: What They Actually Do",
        "published": "2026-07-16",
        "modified": "2026-08-26",
    },
    "/articles/unix-timestamp-guide": {
        "headline": "Unix Timestamp Guide: Epoch Time, Y2038, and Seconds vs. Milliseconds",
        "published": "2026-07-16",
        "modified": "2026-08-26",
    },
    "/articles/regex-cheat-sheet": {
        "headline": "Practical Regex Cheat Sheet: Patterns, Flags and Common Gotchas",
        "published": "2026-07-16",
        "modified": "2026-08-26",
    },
}

# The publisher, named once for every Article and WebApplication block.
PUBLISHER = {"name": "DevBox Kit", "url": SITE + "/"}

# Sitemap weights, matched longest-prefix-first by tools/sync_sitemap.py.
# `lastmod` is never written here: the generator reads it from git.
SITEMAP = {
    "default": {"changefreq": "monthly", "priority": "0.8"},
    "rules": [
        ("/", {"changefreq": "weekly", "priority": "1.0"}),
        ("/privacy.html", {"changefreq": "yearly", "priority": "0.2"}),
        ("/terms.html", {"changefreq": "yearly", "priority": "0.2"}),
        ("/articles/", {"changefreq": "monthly", "priority": "0.6"}),
    ],
    # The ten directed conversions rank a notch under their parent tool.
    "variants": {"changefreq": "monthly", "priority": "0.7"},
}

# Sibling sites in the portfolio, rendered by the `peers` region into the
# footer of every page. Three, not nineteen: a footer that lists the whole
# portfolio reads as a link farm and helps nobody. These are the sites a
# visitor holding a blob of text or a string of bytes would actually want.
PEERS = [
    ("https://textkitpro.com", "textkitpro.com", "Text cleaning and case conversion"),
    ("https://inascii.com", "inascii.com", "ASCII art from text and images"),
    ("https://qrmint.net", "qrmint.net", "QR codes in the browser"),
]

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
    # The live region belongs on the pages that actually run a tool, and
    # loading app.js is exactly what those pages do. Privacy, Terms and the
    # four articles never load it, so they never get an empty live region.
    {"op": "insert_before", "region": "status",
     "pattern": r'<script src="/assets/js/app\.js"></script>', "indent": ""},
    # JSON-LD goes last in the head, after the hand-written WebApplication
    # block each page already carries. That block stays hand-written; this
    # region only adds what no page had.
    {"op": "insert_before", "region": "jsonld", "pattern": r"</head>", "indent": ""},
    # The sibling-site band sits above the copyright row, inside the footer.
    {"op": "insert_after", "region": "peers",
     "pattern": r'<footer class="site-footer">', "indent": "  "},
]
