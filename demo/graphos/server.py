#!/usr/bin/env python3
"""Lumen Books: a small REST API for demoing Forgeline's GraphOS mode.

  python3 demo/graphos/server.py [--port 4010] [--api-version 1|2]

Standard library only. Data is in memory and the same on every start. Every route
except /health, /docs and /openapi.json needs `Authorization: Bearer lumen-demo-token`.

--api-version 1 (default) serves openapi.v1.json. --api-version 2 serves the changed
API (new reviews endpoint, refund instead of PATCH, isbn13, a `q` search parameter),
so the "API changed" refresh can be shown against the same running service.
"""
import argparse
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN = "lumen-demo-token"

AUTHORS = [
    {"id": "a1", "name": "Ursula Hale", "bio": "Writes slow, careful science fiction.", "born": 1951},
    {"id": "a2", "name": "Tomas Brandt", "bio": "Former chef turned crime novelist.", "born": 1978},
    {"id": "a3", "name": "Mei Okafor", "bio": "Essays on cities and the people in them.", "born": 1986},
    {"id": "a4", "name": "Jonas Pike", "born": 1964},
]

_B = [
    ("b1", "The Salt Archive", "a1", "9780000000011", 1899, "USD", ["scifi"], "2019-03-04", 14),
    ("b2", "Low Orbit Letters", "a1", "9780000000028", 1599, "USD", ["scifi", "essays"], "2021-09-12", 3),
    ("b3", "Knife Work", "a2", "9780000000035", 1450, "EUR", ["crime"], "2018-06-21", 22),
    ("b4", "A Quiet Stove", "a2", "9780000000042", 1250, "EUR", ["crime", "food"], "2020-01-30", 0),
    ("b5", "Concrete and Weather", "a3", "9780000000059", 2100, "GBP", ["essays"], "2022-11-02", 9),
    ("b6", "Streets Without Names", "a3", "9780000000066", 1750, "GBP", ["essays", "travel"], "2023-04-18", 17),
    ("b7", "The Long Pier", "a4", "9780000000073", 999, "USD", ["fiction"], "2015-08-09", 40),
    ("b8", "Harbour Lights", "a4", "9780000000080", 1100, "USD", ["fiction", "travel"], "2017-12-01", 5),
    ("b9", "Orbital Debt", "a1", "9780000000097", 1999, "USD", ["scifi"], "2024-02-14", 12),
    ("b10", "Salt and Smoke", "a2", "9780000000103", 1350, "EUR", ["food", "crime"], "2024-07-07", 8),
]
BOOKS = [
    {
        "id": i, "title": t, "authorId": a, "isbn": isbn, "priceCents": p, "currency": c, "genres": g,
        "publishedAt": d, "stock": s, "metadata": {"publisher": "Lumen Press", "edition": 1, "tags": g},
    }
    for (i, t, a, isbn, p, c, g, d, s) in _B
]

CUSTOMERS = [
    {"id": "c1", "name": "Priya Raman", "email": "priya.raman@example.com", "phone": "+44 20 7946 0101", "tier": "gold", "createdAt": "2023-01-05T09:00:00Z"},
    {"id": "c2", "name": "Liam Ortega", "email": "liam.ortega@example.com", "phone": "+1 415 555 0132", "tier": "standard", "createdAt": "2023-06-18T14:30:00Z"},
    {"id": "c3", "name": "Sofia Lindqvist", "email": "sofia.l@example.com", "phone": None, "tier": "standard", "createdAt": "2024-02-02T08:15:00Z"},
]

INTEGRATIONS = [
    {"id": "i1", "name": "Warehouse sync", "webhookUrl": "https://warehouse.example.com/hooks/lumen", "apiKey": "sk_live_demo_do_not_use_1"},
    {"id": "i2", "name": "Email receipts", "webhookUrl": "https://mail.example.com/hooks/lumen", "apiKey": "sk_live_demo_do_not_use_2"},
]

REVIEWS = {
    "b1": [{"id": "r1", "bookId": "b1", "rating": 5, "text": "Dense and lovely.", "reviewer": "m.k."}],
    "b3": [
        {"id": "r2", "bookId": "b3", "rating": 4, "text": "Fast.", "reviewer": "d.v."},
        {"id": "r3", "bookId": "b3", "rating": 3, "text": "Good middle, weak end.", "reviewer": "s.t."},
    ],
}

_state = {}
_lock = threading.Lock()


def reset():
    _state["orders"] = [
        {"id": "o1", "customerId": "c1", "status": "shipped", "items": [{"bookId": "b1", "quantity": 1, "unitPriceCents": 1899}],
         "totalCents": 1899, "payment": {"type": "card", "last4": "4242", "brand": "visa"}, "createdAt": "2024-09-01T10:00:00Z"},
        {"id": "o2", "customerId": "c1", "status": "paid", "items": [{"bookId": "b5", "quantity": 2, "unitPriceCents": 2100}],
         "totalCents": 4200, "payment": {"type": "card", "last4": "4242", "brand": "visa"}, "createdAt": "2024-09-14T16:20:00Z"},
        {"id": "o3", "customerId": "c2", "status": "pending", "items": [{"bookId": "b3", "quantity": 1, "unitPriceCents": 1450}],
         "totalCents": 1450, "payment": {"type": "bank", "iban": "DE89370400440532013000"}, "createdAt": "2024-10-02T11:45:00Z"},
        {"id": "o4", "customerId": "c3", "status": "cancelled", "items": [{"bookId": "b7", "quantity": 3, "unitPriceCents": 999}],
         "totalCents": 2997, "payment": None, "createdAt": "2024-10-05T09:10:00Z"},
    ]
    _state["next_order"] = 5


reset()


def book_view(book, version):
    out = dict(book)
    if version == 2:
        out["isbn13"] = book["isbn"]
    return out


def paginate(items, qs, default_limit=10):
    page = max(int((qs.get("page") or ["1"])[0]), 1)
    limit = min(max(int((qs.get("limit") or [str(default_limit)])[0]), 1), 50)
    start = (page - 1) * limit
    return items[start:start + limit], {"page": page, "limit": limit, "total": len(items)}


class Handler(BaseHTTPRequestHandler):
    server_version = "LumenBooks/1"
    api_version = 1

    def log_message(self, fmt, *args):  # quiet unless asked
        if os.environ.get("LUMEN_LOG"):
            super().log_message(fmt, *args)

    # -- helpers
    def send(self, status, body=None, ctype="application/json"):
        data = b"" if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
        self.send_response(status)
        if status != 204:
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if status != 204:
            self.wfile.write(data)

    def error(self, status, code, message):
        self.send(status, {"code": code, "message": message})

    def read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode())
        except ValueError:
            return None

    def authed(self):
        if self.headers.get("Authorization") == "Bearer " + TOKEN:
            return True
        self.error(401, "unauthorized", "Missing or wrong bearer token.")
        return False

    # -- routing
    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PATCH(self):
        self.route("PATCH")

    def do_DELETE(self):
        self.route("DELETE")

    def route(self, method):
        url = urlparse(self.path)
        path, qs = url.path.rstrip("/") or "/", parse_qs(url.query)
        v = self.api_version
        if method == "GET" and path == "/health":
            return self.send(200, {"ok": True, "apiVersion": v})
        if method == "GET" and path == "/openapi.json":
            with open(os.path.join(HERE, "openapi.v%d.json" % v), "rb") as fh:
                return self.send(200, fh.read())
        if method == "GET" and path == "/docs":
            with open(os.path.join(HERE, "docs.html"), "rb") as fh:
                return self.send(200, fh.read(), "text/html; charset=utf-8")
        if method == "POST" and path == "/_reset":  # demo helper, not in the spec
            with _lock:
                reset()
            return self.send(200, {"ok": True})
        if not self.authed():
            return
        with _lock:
            self.dispatch(method, path, qs, v)

    def dispatch(self, method, path, qs, v):
        orders = _state["orders"]
        m = re.fullmatch(r"/books/([^/]+)", path)
        if method == "GET" and path == "/books":
            items = BOOKS
            if qs.get("genre"):
                items = [b for b in items if qs["genre"][0] in b["genres"]]
            if qs.get("ids"):
                want = qs["ids"][0].split(",")
                items = [b for b in items if b["id"] in want]
            if v == 2 and qs.get("q"):
                needle = qs["q"][0].lower()
                items = [b for b in items if needle in b["title"].lower() or needle in " ".join(b["genres"])]
            page, meta = paginate(items, qs)
            return self.send(200, {"data": [book_view(b, v) for b in page], "meta": meta})
        if method == "POST" and path == "/books/search":
            body = self.read_json()
            if body is None or not isinstance(body, dict):
                return self.error(422, "invalid_body", "Body must be a JSON object.")
            items = BOOKS
            if body.get("query"):
                n = body["query"].lower()
                items = [b for b in items if n in b["title"].lower()]
            if body.get("genre"):
                items = [b for b in items if body["genre"] in b["genres"]]
            if body.get("maxPriceCents") is not None:
                items = [b for b in items if b["priceCents"] <= body["maxPriceCents"]]
            page, meta = paginate(items, qs)
            return self.send(200, {"data": [book_view(b, v) for b in page], "meta": meta})
        if method == "GET" and v == 2 and (r := re.fullmatch(r"/books/([^/]+)/reviews", path)):
            if not any(b["id"] == r.group(1) for b in BOOKS):
                return self.error(404, "not_found", "No such book.")
            return self.send(200, REVIEWS.get(r.group(1), []))
        if method == "GET" and m:
            b = next((b for b in BOOKS if b["id"] == m.group(1)), None)
            return self.send(200, book_view(b, v)) if b else self.error(404, "not_found", "No such book.")
        m = re.fullmatch(r"/authors/([^/]+)", path)
        if method == "GET" and m:
            a = next((a for a in AUTHORS if a["id"] == m.group(1)), None)
            return self.send(200, a) if a else self.error(404, "not_found", "No such author.")
        m = re.fullmatch(r"/customers/([^/]+)", path)
        if method == "GET" and m:
            c = next((c for c in CUSTOMERS if c["id"] == m.group(1)), None)
            return self.send(200, c) if c else self.error(404, "not_found", "No such customer.")
        m = re.fullmatch(r"/integrations/([^/]+)", path)
        if method == "GET" and m:
            i = next((i for i in INTEGRATIONS if i["id"] == m.group(1)), None)
            return self.send(200, i) if i else self.error(404, "not_found", "No such integration.")
        if method == "GET" and path == "/orders":
            items = orders
            if qs.get("customerId"):
                items = [o for o in items if o["customerId"] == qs["customerId"][0]]
            if qs.get("status"):
                items = [o for o in items if o["status"] == qs["status"][0]]
            limit = min(max(int((qs.get("limit") or ["10"])[0]), 1), 50)
            start = 0
            if qs.get("after"):
                ids = [o["id"] for o in items]
                start = ids.index(qs["after"][0]) + 1 if qs["after"][0] in ids else len(ids)
            chunk = items[start:start + limit]
            more = start + limit < len(items)
            return self.send(200, {"data": chunk, "nextCursor": chunk[-1]["id"] if (more and chunk) else None})
        if method == "POST" and path == "/orders":
            body = self.read_json()
            if not isinstance(body, dict) or not body.get("customerId") or not body.get("items"):
                return self.error(422, "invalid_body", "customerId and a non-empty items list are required.")
            if not any(c["id"] == body["customerId"] for c in CUSTOMERS):
                return self.error(422, "unknown_customer", "No such customer.")
            total, items = 0, []
            for it in body["items"]:
                b = next((b for b in BOOKS if b["id"] == it.get("bookId")), None)
                if not b or int(it.get("quantity") or 0) < 1:
                    return self.error(422, "invalid_item", "Unknown book or quantity below 1.")
                items.append({"bookId": b["id"], "quantity": it["quantity"], "unitPriceCents": b["priceCents"]})
                total += b["priceCents"] * it["quantity"]
            order = {
                "id": "o%d" % _state["next_order"], "customerId": body["customerId"], "status": "pending",
                "items": items, "totalCents": total, "payment": body.get("payment"),
                "createdAt": "2024-10-20T12:00:00Z",
            }
            _state["next_order"] += 1
            orders.append(order)
            return self.send(201, order)
        m = re.fullmatch(r"/orders/([^/]+)", path)
        if m:
            o = next((o for o in orders if o["id"] == m.group(1)), None)
            if not o:
                return self.error(404, "not_found", "No such order.")
            if method == "GET":
                return self.send(200, o)
            if method == "PATCH" and v == 1:
                body = self.read_json()
                allowed = ("pending", "paid", "shipped", "cancelled")
                if not isinstance(body, dict) or body.get("status") not in allowed:
                    return self.error(422, "invalid_status", "status must be one of " + ", ".join(allowed))
                o["status"] = body["status"]
                return self.send(200, o)
            if method == "DELETE":
                o["status"] = "cancelled"
                return self.send(204)
        m = re.fullmatch(r"/orders/([^/]+)/refund", path)
        if method == "POST" and v == 2 and m:
            o = next((o for o in orders if o["id"] == m.group(1)), None)
            if not o:
                return self.error(404, "not_found", "No such order.")
            if o["status"] not in ("paid", "shipped"):
                return self.error(409, "not_refundable", "Only paid or shipped orders can be refunded.")
            o["status"] = "refunded"
            return self.send(200, o)
        self.error(404, "not_found", "No such route.")


def make_server(port=4010, api_version=1, host="127.0.0.1"):
    handler = type("H", (Handler,), {"api_version": api_version})
    return ThreadingHTTPServer((host, port), handler)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--port", type=int, default=4010)
    ap.add_argument("--api-version", type=int, choices=(1, 2), default=1)
    args = ap.parse_args()
    srv = make_server(args.port, args.api_version)
    print("Lumen Books API v%d on http://127.0.0.1:%d  (token: %s)" % (args.api_version, args.port, TOKEN), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
