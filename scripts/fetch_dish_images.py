#!/usr/bin/env python3
"""Cao anh that cho cac mon an tu Wikimedia Commons (mien phi, khong can key).

2 cach dung:
  1) Nhanh, khong can key Supabase: tim anh + sinh file SQL de paste vao SQL Editor
       python scripts/fetch_dish_images.py --emit-sql
     -> tao supabase/images_hotlink.sql (hotlink truc tiep URL Commons)

  2) Chuan: tai anh ve + upload len bucket dish-images + update image_url
       $env:SUPABASE_URL="https://xxx.supabase.co"
       $env:SUPABASE_SERVICE_KEY="<service_role key>"
       python scripts/fetch_dish_images.py
     (service_role de vuot RLS khi UPDATE; anon key KHONG update duoc)

Tuy chon:
  --dry-run        chi in anh tim duoc cho tung mon, khong lam gi ca
  --force          ghi de ca mon da co image_url (mac dinh thi skip)
  --only slug1,slug2  chi xu ly cac slug chi dinh
  --pick N         chon ket qua thu N (0-based) thay vi tu dong chon

Chi dung thu vien chuan Python (urllib), khong can pip install.
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
OPENVERSE_API = "https://api.openverse.org/v1/images/"
# Windows console mac dinh cp1252 -> ep in UTF-8 de khong vo tieng Viet/Thai
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001 - python cu khong co reconfigure
    pass
# License cho phep dung thuong mai (uu tien truoc, fallback moi lay NC/ND)
COMMERCIAL_LICENSES = ("by", "by-sa")
UA = {"User-Agent": "team13-restaurant-fetch-images/1.0 (school project)"}
BUCKET = "dish-images"

# slug mon an -> (tu khoa tim tren Commons, tu uu tien trong ten file)
SEARCH_TERMS = {
    "goi-cuon-tom-thit": ("Goi cuon Vietnamese spring rolls", "spring"),
    "sup-bi-do": ("Pumpkin soup", "pumpkin"),
    "pho-bo-dac-biet": ("Pho beef noodle soup", "beef"),
    "com-tam-suon-bi-cha": ("Com tam broken rice", "com"),
    "bo-bit-tet-sot-tieu-den": ("Grilled beef steak plate", "steak"),
    "mi-y-sot-bo-bam": ("Spaghetti Bolognese", "spaghetti"),
    "sushi-tong-hop": ("Sushi", "sushi"),
    "pad-thai-tom": ("Pad thai shrimp", "pad thai"),
    "banh-tiramisu": ("Tiramisu", "tiramisu"),
    "banh-flan-caramel": ("Creme caramel flan", "caramel"),
    "ca-phe-sua-da": ("Vietnamese iced coffee", "coffee"),
    "tra-dao-cam-sa": ("Peach iced tea", "peach"),
}


def http_get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def commons_search(query, limit=8):
    """Tra ve list dict: title/pageid/thumburl/url/width/height/mime."""
    params = urllib.parse.urlencode({
        "action": "query", "format": "json",
        "generator": "search", "gsrsearch": query,
        "gsrnamespace": 6, "gsrlimit": limit,
        "prop": "imageinfo", "iiprop": "url|size|mime", "iiurlwidth": 800,
    })
    data = http_get_json(COMMONS_API + "?" + params)
    pages = (data.get("query") or {}).get("pages") or {}
    out = []
    for p in pages.values():
        info = (p.get("imageinfo") or [{}])[0]
        out.append({
            "title": p.get("title", ""),
            "pageid": p.get("pageid"),
            "url": info.get("url", ""),
            "thumburl": info.get("thumburl") or info.get("url", ""),
            "width": info.get("width") or 0,
            "height": info.get("height") or 0,
            "mime": info.get("mime", ""),
        })
    return out


def pick(cands, prefer="", index=None):
    """Loc anh jpeg/png >=600px; uu tien ten file chua tu khoa prefer."""
    BAD = ("mushroom", "fistulina", "fungus", "diagram", "logo", "map")
    ok = [c for c in cands
          if c["mime"] in ("image/jpeg", "image/png") and c["width"] >= 600
          and c["thumburl"]
          and not any(b in c["title"].lower() for b in BAD)]
    if not ok:
        return None
    if index is not None:
        return ok[index] if 0 <= index < len(ok) else None
    if prefer:
        for c in ok:
            if prefer.lower() in c["title"].lower():
                return c
    return ok[0]


def download(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read(), res.headers.get_content_type()


def openverse_search(query, limit=10):
    """Tra ve list dict: title/url/width/height/license/creator/page."""
    params = urllib.parse.urlencode({
        "q": query, "page_size": limit, "filter_dead": "true",
    })
    data = http_get_json(OPENVERSE_API + "?" + params)
    out = []
    for r in data.get("results") or []:
        out.append({
            "title": r.get("title") or "",
            "url": r.get("url") or "",
            "thumburl": r.get("url") or "",
            "width": r.get("width") or 0,
            "height": r.get("height") or 0,
            "mime": "image/jpeg",
            "license": r.get("license") or "?",
            "creator": r.get("creator") or "?",
            "page": r.get("foreign_landing_url") or "",
        })
    return out


def pick_openverse(cands, prefer="", index=None):
    """Chon anh ngang >=800px, uu tien license thuong mai + dung mon."""
    ok = [c for c in cands
          if c["width"] >= 800 and c["thumburl"]
          and not c.get("mature", False)]

    def score(c):
        s = 0
        if c["license"] in COMMERCIAL_LICENSES:
            s += 2
        if c["width"] >= c["height"]:  # anh ngang hop card 4:3
            s += 1
        if prefer and prefer.lower() in c["title"].lower():
            s += 2
        return s

    ok.sort(key=score, reverse=True)
    if not ok:
        return None
    if index is not None:
        return ok[index] if 0 <= index < len(ok) else None
    return ok[0]


class Supa:
    def __init__(self, base, key):
        self.base = base.rstrip("/")
        self.key = key

    def _req(self, method, path, data=None, content_type="application/json",
             extra_headers=None):
        req = urllib.request.Request(
            self.base + path, data=data, method=method,
            headers={"apikey": self.key, "Authorization": "Bearer " + self.key,
                     "Content-Type": content_type, **(extra_headers or {})})
        with urllib.request.urlopen(req, timeout=60) as res:
            body = res.read()
            return res.status, body

    def get_dishes(self):
        status, body = self._req(
            "GET", "/rest/v1/dishes?select=slug,name,image_url&order=slug")
        if status != 200:
            raise RuntimeError("GET dishes failed: " + body.decode()[:200])
        return json.loads(body)

    def upload(self, slug, data, content_type):
        status, body = self._req(
            "POST", "/storage/v1/object/%s/%s.jpg" % (BUCKET, slug),
            data=data, content_type=content_type,
            extra_headers={"x-upsert": "true"})
        if status not in (200, 201):
            raise RuntimeError("upload %s failed: %s" % (slug, body.decode()[:200]))
        return "%s/storage/v1/object/public/%s/%s.jpg" % (self.base, BUCKET, slug)

    def set_image(self, slug, image_url):
        status, body = self._req(
            "PATCH", "/rest/v1/dishes?slug=eq." + urllib.parse.quote(slug),
            data=json.dumps({"image_url": image_url}).encode(),
            extra_headers={"Prefer": "return=minimal"})
        if status not in (200, 204):
            raise RuntimeError("PATCH %s failed: %s" % (slug, body.decode()[:200]))


def main():
    ap = argparse.ArgumentParser(description="Fetch dish images from Commons")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--pick", type=int, default=None)
    ap.add_argument("--emit-sql", action="store_true",
                    help="sinh file supabase/images_hotlink.sql thay vi upload")
    ap.add_argument("--source", default="openverse",
                    choices=("openverse", "commons"),
                    help="nguon anh (mac dinh openverse/Flickr dep hon)")
    args = ap.parse_args()

    only = {s.strip() for s in args.only.split(",") if s.strip()}
    slugs = [s for s in SEARCH_TERMS if not only or s in only]

    supa = None
    dishes = None
    if not args.dry_run and not args.emit_sql:
        base = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY", "")
        if not base or not key:
            sys.exit("Thieu SUPABASE_URL / SUPABASE_SERVICE_KEY. "
                     "Dung --dry-run hoac --emit-sql neu chua co key.")
        supa = Supa(base, key)
        dishes = {d["slug"]: d for d in supa.get_dishes()}

    sql_lines = ["-- Hotlink anh Commons cho dishes (sinh tu dong, chay 1 lan)"]
    done, skipped, failed = 0, 0, 0
    for slug in slugs:
        query, prefer = SEARCH_TERMS[slug]
        try:
            if args.source == "openverse":
                cands = openverse_search(query)
                img = pick_openverse(cands, prefer, args.pick)
            else:
                cands = commons_search(query)
                img = pick(cands, prefer, args.pick)
        except Exception as e:  # noqa: BLE001 - bao loi mang/API cho tung mon
            print("[FAIL] %-24s loi tim kiem: %s" % (slug, e))
            failed += 1
            continue
        if not img:
            print("[FAIL] %-24s khong tim duoc anh hop le cho '%s'" % (slug, query))
            failed += 1
            continue

        current = (dishes or {}).get(slug, {}).get("image_url")
        if current and not args.force and not args.dry_run and not args.emit_sql:
            print("[SKIP] %-24s da co image_url" % slug)
            skipped += 1
            continue

        if args.dry_run:
            extra = ""
            if args.source == "openverse":
                extra = " [%s %dx%d %s]" % (
                    img.get("license"), img.get("width"),
                    img.get("height"), img.get("creator"))
            print("[OK]   %-24s %s%s | %s" % (slug, img["title"], extra, img["thumburl"]))
            done += 1
        elif args.emit_sql:
            safe = img["thumburl"].replace("'", "''")
            sql_lines.append(
                "UPDATE dishes SET image_url = '%s' WHERE slug = '%s';"
                % (safe, slug))
            print("[OK]   %-24s -> SQL" % slug)
            done += 1
        else:
            try:
                data, ctype = download(img["thumburl"])
                public_url = supa.upload(slug, data, ctype)
                supa.set_image(slug, public_url)
                print("[OK]   %-24s %s (%d KB)" % (slug, public_url, len(data) // 1024))
                done += 1
            except Exception as e:  # noqa: BLE001
                print("[FAIL] %-24s %s" % (slug, e))
                failed += 1

    if args.emit_sql:
        out = os.path.join("supabase", "images_hotlink.sql")
        with open(out, "w", encoding="utf-8") as f:
            f.write("\n".join(sql_lines) + "\n")
        print("Da ghi %s (%d mon). Paste vao SQL Editor > Run." % (out, done))

    print("Xong: ok=%d skip=%d fail=%d" % (done, skipped, failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
