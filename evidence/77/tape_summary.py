#!/usr/bin/env python3
"""Summarise a DreamFly ec_recorder tape: rows by type, and how many book samples carry the window's
open, the oracle-lead (lead_bps / z) and the model probability prob_up that the ec_late arm needs."""
import json, sys, collections
for path in sys.argv[1:]:
    rows = [json.loads(l) for l in open(path)]
    books = [r for r in rows if r.get("type") == "ec_book"]
    print(path.split("/")[-1])
    print("  rows by type:", dict(collections.Counter(r.get("type", "error") for r in rows)))
    print("  windows opened:", sorted({(r["symbol"], r["interval"]) for r in rows if r.get("type") == "ec_open"}))
    for k in ("oracle", "open", "lead_bps", "z", "prob_up"):
        print(f"  book samples with {k:8s}: {sum(1 for r in books if r.get(k) is not None)} of {len(books)}")
    print("  ec_openprice rows (open learned):", sum(1 for r in rows if r.get("type") == "ec_openprice"))
    print("  resolutions:", [(r["symbol"], r.get("truth"), r.get("open"), r.get("close")) for r in rows if r.get("type") == "ec_resolution"])
