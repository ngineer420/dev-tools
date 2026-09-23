#!/usr/bin/env python3
"""Write sitemap.xml from the pages that are actually on disk.

    python3 tools/sync_sitemap.py           # rewrite sitemap.xml
    python3 tools/sync_sitemap.py --check   # exit 1 if it is stale

Stdlib only, like the other two generators, and driven by the same
`nav_data.py`.

The URL of a page is taken from the page's own `<link rel="canonical">`. That
is deliberate: a sitemap that disagrees with a canonical is a sitemap that
asks a crawler to index a URL the page itself disowns. Reading the canonical
makes the two agree by construction, and means adding a page needs no second
list anywhere.

`<lastmod>` comes from git, not from the file's mtime. In a fresh clone every
file is written at checkout time, so mtime would stamp the whole sitemap with
the date of the deploy and every date would be a lie. `git log -1` gives the
commit that last touched the file, which is the date the page really changed.
Where git cannot answer — a file that is not committed yet, or no git at all —
the mtime is the fallback.

`robots.txt` points at this file, so a stale sitemap is a stale instruction to
every crawler. Run `--check` before deploy.
"""

import argparse
import re
import subprocess
import sys
from datetime import date, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nav_data as D  # noqa: E402
import sync_nav  # noqa: E402

ROOT = sync_nav.ROOT

# A 404 must never be crawled as a destination, whatever it returns.
EXCLUDE = {"404.html"}

CANONICAL_RE = re.compile(r'<link rel="canonical" href="([^"]+)"')


def canonical_of(path):
    """The absolute URL the page claims for itself, or None."""
    m = CANONICAL_RE.search(path.read_text(encoding="utf-8"))
    return m.group(1) if m else None


def last_modified(path):
    """ISO date of the commit that last touched this file.

    Falls back to the file's mtime, which is right for a file that is edited
    but not committed yet and wrong for a fresh clone. Git first, for that
    reason.
    """
    try:
        out = subprocess.run(
            ["git", "-C", str(ROOT), "log", "-1", "--format=%cs", "--", str(path)],
            capture_output=True, text=True, timeout=10)
        stamp = out.stdout.strip()
        if out.returncode == 0 and stamp:
            return stamp
    except (OSError, subprocess.SubprocessError):
        pass
    return date.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()


def weights(url_path):
    """changefreq and priority for one repo-relative path, e.g. `/privacy.html`."""
    cfg = getattr(D, "SITEMAP", None)
    if not cfg:
        return {"changefreq": "monthly", "priority": "0.5"}

    variants = getattr(D, "VARIANTS", None)
    if variants and "variants" in cfg:
        canon = sync_nav.canon(url_path)
        if any(sync_nav.canon(i["href"]) == canon for i in variants["items"]):
            return cfg["variants"]

    # A rule ending in "/" covers a directory; any other rule is one exact URL.
    # "/" is the home page, never a prefix of everything — that is the whole
    # site, which is what `default` is for. Longest match wins, so a rule for
    # "/articles/" beats a rule for "/".
    best = None
    for prefix, rule in cfg.get("rules", []):
        exact = url_path == prefix
        under = len(prefix) > 1 and prefix.endswith("/") and url_path.startswith(prefix)
        if (exact or under) and (best is None or len(prefix) > len(best[0])):
            best = (prefix, rule)
    return best[1] if best else cfg["default"]


def build():
    site = getattr(D, "SITE", "").rstrip("/")
    rows = []
    for path in sync_nav.html_files():
        rel = path.relative_to(ROOT).as_posix()
        if rel in EXCLUDE:
            continue
        loc = canonical_of(path)
        if not loc:
            print("no canonical, skipped: " + rel, file=sys.stderr)
            continue
        url_path = loc[len(site):] if loc.startswith(site) else loc
        rows.append((loc, url_path, last_modified(path)))

    # Home first, then the rest by priority and then by URL, so the file reads
    # the way the site is shaped rather than the way the disk is sorted.
    def sort_key(row):
        w = weights(row[1])
        return (row[1] != "/", -float(w["priority"]), row[1])

    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, url_path, lastmod in sorted(rows, key=sort_key):
        w = weights(url_path)
        out += ["  <url>",
                "    <loc>%s</loc>" % loc,
                "    <lastmod>%s</lastmod>" % lastmod,
                "    <changefreq>%s</changefreq>" % w["changefreq"],
                "    <priority>%s</priority>" % w["priority"],
                "  </url>"]
    out.append("</urlset>")
    return "\n".join(out) + "\n"


def main(argv=None):
    """Returns a process exit code: 0 current or written, 1 stale under --check."""
    ap = argparse.ArgumentParser(description="Write sitemap.xml from the pages on disk.")
    ap.add_argument("--check", action="store_true",
                    help="exit 1 if sitemap.xml is stale")
    args = ap.parse_args(argv)

    path = ROOT / "sitemap.xml"
    fresh = build()
    current = path.read_text(encoding="utf-8") if path.exists() else None

    if fresh == current:
        print("sitemap.xml is current")
        return 0
    if args.check:
        print("sitemap.xml is stale")
        return 1
    path.write_text(fresh, encoding="utf-8")
    print("wrote sitemap.xml (%d urls)" % fresh.count("<loc>"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
