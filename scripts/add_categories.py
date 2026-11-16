#!/usr/bin/env python3
"""Adds the missing shop categories through the admin API (no deploy, no database access).

Safe to run again: a category that already exists (same name under the same main category, any letter case) is
skipped, so nothing is added twice. Nothing is ever renamed, moved or deleted.

Usage (laptop or server, Python 3, nothing to install):
  python3 scripts/add_categories.py --dry-run          # show what would be added, change nothing
  python3 scripts/add_categories.py                    # add them on https://sodogebeya.blinkethio.com
  python3 scripts/add_categories.py --url http://localhost:5290 --email you@example.com

The admin password is asked for (not shown), or read from ADMIN_PASSWORD. With staff two-step sign-in on, the
script also asks for the emailed code.
"""
import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.request

# Main category -> sub-categories. A main category that already exists only gets the missing subs.
CATEGORIES = {
    # new main categories
    "Property": ["Houses for rent", "Houses for sale", "Land & plots", "Shops & offices for rent"],
    "Agriculture & Farming": ["Seeds & seedlings", "Fertilizer", "Farm tools", "Livestock feed"],
    "Animals & Livestock": ["Cattle", "Sheep & goats", "Chickens", "Pets"],
    "Building & Construction": ["Cement", "Iron & steel", "Roofing (korkoro)", "Paint", "Plumbing & electrical"],
    "Tools & Equipment": ["Power tools", "Hand tools", "Generators", "Sewing machines", "Shop equipment"],
    "Solar & Power": ["Solar panels", "Batteries", "Inverters", "Stabilizers"],
    "Traditional & Cultural": ["Habesha clothes", "Netela & gabi", "Jebena & coffee sets", "Handcrafts"],
    "Music & Instruments": ["Instruments", "Speakers & sound systems"],
    "Gifts & Events": ["Wedding items", "Decorations", "Gift sets"],
    # more sub-categories in the main categories the shop already has
    "Electronics": ["Cameras", "Audio & headphones", "Gaming", "Printers", "Smart watches", "Computer accessories"],
    "Fashion": ["Bags", "Watches", "Jewelry", "Kids' clothes"],
    "Home & Living": ["Fridges & freezers", "Washing machines", "Stoves & ovens", "Water heaters", "Fans & air coolers"],
    "Vehicles": ["Cars", "Motorcycles", "Bajaj (three-wheelers)", "Bicycles", "Spare parts", "Trucks"],
    "Beauty & Health": ["Hair care", "Makeup", "Perfume", "Medical supplies"],
    "Baby & Kids": ["Toys", "Baby care", "School supplies"],
    "Pantry": ["Grains & teff", "Spices (berbere, mitmita)", "Oil & butter", "Honey"],
}


def call(base, method, path, body=None, token=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, method=method, headers={"Content-Type": "application/json"})
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            problem = json.loads(e.read())
        except ValueError:
            problem = {}
        sys.exit(f"{method} {path}: HTTP {e.code} {problem.get('code', '')} {problem.get('detail', '')}".rstrip())
    except urllib.error.URLError as e:
        sys.exit(f"Can't reach {base}: {e.reason}")


def sign_in(base, email, password):
    answer = call(base, "POST", "/api/admin/auth/login", {"email": email, "password": password})
    if answer.get("token"):
        return answer["token"]
    if answer.get("twoStep"):
        code = input(f"Sign-in code sent to {answer.get('sentTo', 'your email')}: ").strip()
        answer = call(base, "POST", "/api/admin/auth/verify",
                      {"challengeId": answer["challengeId"], "code": code, "trustDevice": False})
        if answer.get("token"):
            return answer["token"]
    sys.exit("Sign-in failed (no session returned).")


def main():
    p = argparse.ArgumentParser(description="Add the missing Sodo Gebeya categories.")
    p.add_argument("--url", default="https://sodogebeya.blinkethio.com", help="the shop (default: %(default)s)")
    p.add_argument("--email", help="an ADMIN account's email (asked for when left out)")
    p.add_argument("--dry-run", action="store_true", help="only show what would be added")
    a = p.parse_args()
    base = a.url.rstrip("/")

    email = a.email or input("Admin email: ").strip()
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Admin password (not shown): ")
    token = sign_in(base, email, password)

    rows = call(base, "GET", "/api/admin/categories", token=token)
    key = lambda name: " ".join(name.lower().split())
    mains = {key(r["name"]): r for r in rows if r.get("parentId") is None}
    subs = {(r["parentId"], key(r["name"])) for r in rows if r.get("parentId") is not None}

    added = skipped = 0
    for main, children in CATEGORIES.items():
        parent = mains.get(key(main))
        if parent is None:
            print(f"+ {main}")
            added += 1
            if not a.dry_run:
                rows = call(base, "POST", "/api/admin/categories", {"name": main}, token)
                parent = next(r for r in rows if r.get("parentId") is None and key(r["name"]) == key(main))
                mains[key(main)] = parent
        else:
            skipped += 1
        for child in children:
            if parent is not None and (parent["id"], key(child)) in subs:
                skipped += 1
                continue
            print(f"    + {main} → {child}")
            added += 1
            if not a.dry_run:
                call(base, "POST", "/api/admin/categories", {"name": child, "parentId": parent["id"]}, token)
                subs.add((parent["id"], key(child)))

    verb = "Would add" if a.dry_run else "Added"
    print(f"\n{verb} {added} categories; {skipped} were already there.")
    if a.dry_run and added:
        print("Run again without --dry-run to add them.")


if __name__ == "__main__":
    main()
