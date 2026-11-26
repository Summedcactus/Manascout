#!/usr/bin/env python3
"""Audit and stage ManaScout's static pages with content-versioned local CSS and JS."""

import argparse
from collections import defaultdict
from hashlib import sha256
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIRECTORIES = ("assets", "card", "contact", "deck", "privacy", "terms")
PUBLIC_ROOT_FILES = ("CNAME", "ads.txt", "robots.txt", "sitemap.xml")
MANIFEST = "asset-versions.json"
HASH_LENGTH = 16
ATTRIBUTE = re.compile(r'''([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?''')
# Match an entire entity so its internal '#' is never mistaken for a URL fragment.
URL_TOKEN = re.compile(r"&(?:#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[a-zA-Z][0-9a-zA-Z]*;)|[?#]")


def publishable_files(source):
    if not (source / "index.html").is_file():
        raise ValueError(f"Missing homepage in source directory: {source}")
    paths = list(source.glob("*.html"))
    paths.extend(source / name for name in PUBLIC_ROOT_FILES if (source / name).exists())
    for name in PUBLIC_DIRECTORIES:
        directory = source / name
        if directory.is_symlink():
            raise ValueError(f"Symbolic link in publishable source: {directory}")
        paths.extend(directory.rglob("*"))
    files = {}
    for path in sorted(paths):
        if path.is_symlink():
            raise ValueError(f"Symbolic link in publishable source: {path}")
        if path.is_file():
            files[path.relative_to(source).as_posix()] = path.read_bytes()
    return files


class AssetReferences(HTMLParser):
    """Find asset attribute value spans without serialising the document."""

    def __init__(self, html):
        super().__init__()
        self.line_offsets = [0, *(match.end() for match in re.finditer("\n", html))]
        self.references = []
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "base" and "href" in attributes:
            raise ValueError("A base URL changes asset resolution")
        if tag == "script":
            key, extensions = "src", (".js",)
        elif tag == "link":
            rel = (attributes.get("rel") or "").lower().split()
            if "stylesheet" in rel:
                key, extensions = "href", (".css",)
            elif "preload" in rel and attributes.get("as") in ("script", "style"):
                key, extensions = "href", (".js", ".css")
            elif "modulepreload" in rel:
                key, extensions = "href", (".js",)
            else:
                return
        else:
            return
        if not attributes.get(key):
            return
        tag_text = self.get_starttag_text()
        line, column = self.getpos()
        offset = self.line_offsets[line - 1] + column
        for match in ATTRIBUTE.finditer(tag_text, len(tag) + 1):
            if match[1].lower() != key:
                continue
            for group in (2, 3, 4):
                if match[group] is not None:
                    start, end = match.span(group)
                    self.references.append((offset + start, offset + end, extensions))
                    break
            break


def local_asset(raw, extensions, page, source, files):
    value = unescape(raw).strip()
    url = urlsplit(value)
    if url.scheme or url.netloc or value.startswith("//"):
        return None
    path = unquote(url.path, errors="strict")
    if not path.lower().endswith(extensions):
        return None
    if re.search(r"[\\\x00-\x1f\x7f]", path):
        raise ValueError(f"Unsafe asset path: {raw}")
    base = source if path.startswith("/") else source / Path(page).parent
    resolved = (base / path.lstrip("/")).resolve()
    if not resolved.is_relative_to(source):
        raise ValueError(f"Asset path escapes source: {raw}")
    asset = resolved.relative_to(source).as_posix()
    if asset not in files:
        raise ValueError(f"Missing publishable asset: {raw} ({asset})")
    return asset, url.query


def version_url(raw, version):
    leading_size = len(raw) - len(raw.lstrip())
    trailing_start = len(raw.rstrip())
    query_start = None
    fragment_start = trailing_start
    for match in URL_TOKEN.finditer(raw, leading_size, trailing_start):
        token = unescape(match[0])
        if token == "#":
            fragment_start = match.start()
            break
        if token == "?" and query_start is None:
            query_start = match.start()
    path_end = query_start if query_start is not None else fragment_start
    return f"{raw[:path_end]}?v={version}{raw[fragment_start:]}"


def json_bytes(data):
    return (json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8")


def prepare(source):
    files = publishable_files(source)
    rendered = files.copy()
    hashes = {}
    variants = defaultdict(lambda: defaultdict(set))
    for page, contents in files.items():
        if not page.endswith(".html"):
            continue
        html = contents.decode("utf-8")
        edits = []
        try:
            for start, end, extensions in AssetReferences(html).references:
                raw = html[start:end]
                reference = local_asset(raw, extensions, page, source, files)
                if reference is None:
                    continue
                asset, query = reference
                if asset not in hashes:
                    digest = sha256(files[asset]).hexdigest()
                    hashes[asset] = {"sha256": digest, "version": digest[:HASH_LENGTH]}
                variants[asset][query].add(page)
                edits.append((start, end, version_url(raw, hashes[asset]["version"])))
        except (ValueError, OSError) as error:
            raise ValueError(f"{page}: {error}") from error
        for start, end, replacement in reversed(edits):
            html = html[:start] + replacement + html[end:]
        rendered[page] = html.encode("utf-8")
    rendered[MANIFEST] = json_bytes(hashes)
    report = {
        asset: {
            **hashes[asset],
            "page_count": len(set().union(*queries.values())),
            "variants": {
                query: {"page_count": len(pages), "pages": sorted(pages)}
                for query, pages in queries.items()
            }
        } for asset, queries in variants.items()
    }
    return rendered, report


def separate_output(source, path):
    if path.is_symlink():
        raise ValueError(f"Output cannot be a symbolic link: {path}")
    output = path.resolve()
    if output.is_relative_to(source) or source.is_relative_to(output):
        raise ValueError("Output must be separate from the source directory")
    return output


def build(output, files):
    if output.exists():
        raise ValueError(f"Build output already exists: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".manascout-stage-", dir=output.parent) as temporary:
        stage = Path(temporary) / "site"
        for path, content in files.items():
            target = stage / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        stage.rename(output)


def check(output, files):
    if not output.is_dir():
        raise ValueError(f"Missing staged site: {output}")
    actual = set()
    for path in output.rglob("*"):
        if path.is_symlink():
            raise ValueError(f"Symbolic link in staged site: {path}")
        if path.is_file():
            actual.add(path.relative_to(output).as_posix())
    if actual != files.keys():
        raise ValueError(f"Staged file set differs: missing {sorted(files.keys() - actual)}, "
                         f"unexpected {sorted(actual - files.keys())}")
    for path, expected in files.items():
        if (output / path).read_bytes() != expected:
            raise ValueError(f"Staged content differs: {path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("audit", "build", "check"))
    parser.add_argument("--source", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, help="A path outside the source tree")
    args = parser.parse_args()
    if args.command != "audit" and not args.output:
        parser.error("--output is required for build and check")
    try:
        source = args.source.resolve()
        output = separate_output(source, args.output) if args.output else None
        files, report = prepare(source)
        if args.command == "audit":
            if output:
                with output.open("xb") as file:
                    file.write(json_bytes(report))
            else:
                print(json_bytes(report).decode("utf-8"), end="")
        else:
            action = build if args.command == "build" else check
            action(output, files)
            print(f"{args.command}: {len(files)} staged files, {len(report)} versioned assets")
    except (ValueError, OSError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
