#!/usr/bin/env python3
"""Write openapi.v1.json and openapi.v2.json for the Lumen Books demo API.

v2 is v1 plus the kind of change an upstream team makes without telling you:
a new endpoint, a deprecated one, a removed one, a new field, a new enum value.
That difference is what the GraphOS "API changed" (reconcile) demo shows.

  python3 demo/graphos/build_specs.py
"""
import copy
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

ERR = {"description": "Error", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Error"}}}}


def ref(name):
    return {"$ref": "#/components/schemas/" + name}


def ok(schema, desc="OK"):
    return {"description": desc, "content": {"application/json": {"schema": schema}}}


def param(name, where, schema, desc, required=False):
    return {"name": name, "in": where, "required": required or where == "path", "description": desc, "schema": schema}


STR = {"type": "string"}
INT = {"type": "integer"}

V1 = {
    "openapi": "3.0.3",
    "info": {
        "title": "Lumen Books API",
        "version": "1.0.0",
        "description": "A small bookshop REST API used to demo Forgeline's GraphOS mode.",
    },
    "servers": [{"url": "http://127.0.0.1:4010"}],
    "security": [{"bearerAuth": []}],
    "tags": [{"name": "Catalog"}, {"name": "Customers"}, {"name": "Orders"}, {"name": "Integrations"}],
    "paths": {
        "/books": {
            "get": {
                "operationId": "listBooks",
                "tags": ["Catalog"],
                "summary": "List books",
                "description": "Page-number pagination. `ids` fetches several books in one call.",
                "parameters": [
                    param("page", "query", {"type": "integer", "minimum": 1, "default": 1}, "Page number, from 1."),
                    param("limit", "query", {"type": "integer", "minimum": 1, "maximum": 50, "default": 10}, "Page size."),
                    param("genre", "query", STR, "Only books in this genre."),
                    param("ids", "query", STR, "Comma-separated book ids. If not passed, all books are listed."),
                ],
                "responses": {"200": ok(ref("BookPage")), "401": ERR},
            }
        },
        "/books/{bookId}": {
            "get": {
                "operationId": "getBook",
                "tags": ["Catalog"],
                "summary": "Get one book",
                "parameters": [param("bookId", "path", STR, "Book id.")],
                "responses": {"200": ok(ref("Book")), "404": ERR},
            }
        },
        "/books/search": {
            "post": {
                "operationId": "searchBooks",
                "tags": ["Catalog"],
                "summary": "Search books",
                "description": "A POST that only reads. The GraphOS select step asks whether it is a query.",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": ref("BookSearch")}},
                },
                "responses": {"200": ok(ref("BookPage")), "422": ERR},
            }
        },
        "/authors/{authorId}": {
            "get": {
                "operationId": "getAuthor",
                "tags": ["Catalog"],
                "summary": "Get one author",
                "parameters": [param("authorId", "path", STR, "Author id.")],
                "responses": {"200": ok(ref("Author")), "404": ERR},
            }
        },
        "/customers/{customerId}": {
            "get": {
                "operationId": "getCustomer",
                "tags": ["Customers"],
                "summary": "Get one customer",
                "description": "Returns personal data (email, phone). Whether to expose it is a design decision.",
                "parameters": [param("customerId", "path", STR, "Customer id.")],
                "responses": {"200": ok(ref("Customer")), "404": ERR},
            }
        },
        "/orders": {
            "get": {
                "operationId": "listOrders",
                "tags": ["Orders"],
                "summary": "List orders",
                "description": "Cursor pagination: pass `after` from the previous `nextCursor`.",
                "parameters": [
                    param("customerId", "query", STR, "Only this customer's orders."),
                    param("status", "query", ref("OrderStatus"), "Only orders in this status."),
                    param("after", "query", STR, "Cursor from the previous page."),
                    param("limit", "query", {"type": "integer", "minimum": 1, "maximum": 50, "default": 10}, "Page size."),
                ],
                "responses": {"200": ok(ref("OrderPage")), "401": ERR},
            },
            "post": {
                "operationId": "createOrder",
                "tags": ["Orders"],
                "summary": "Place an order",
                "requestBody": {"required": True, "content": {"application/json": {"schema": ref("NewOrder")}}},
                "responses": {"201": ok(ref("Order"), "Created"), "422": ERR},
            },
        },
        "/orders/{orderId}": {
            "get": {
                "operationId": "getOrder",
                "tags": ["Orders"],
                "summary": "Get one order",
                "parameters": [param("orderId", "path", STR, "Order id.")],
                "responses": {"200": ok(ref("Order")), "404": ERR},
            },
            "patch": {
                "operationId": "updateOrder",
                "tags": ["Orders"],
                "summary": "Change an order's status",
                "parameters": [param("orderId", "path", STR, "Order id.")],
                "requestBody": {"required": True, "content": {"application/json": {"schema": ref("OrderUpdate")}}},
                "responses": {"200": ok(ref("Order")), "404": ERR, "422": ERR},
            },
            "delete": {
                "operationId": "cancelOrder",
                "tags": ["Orders"],
                "summary": "Cancel an order",
                "parameters": [param("orderId", "path", STR, "Order id.")],
                "responses": {"204": {"description": "Cancelled, no body"}, "404": ERR},
            },
        },
        "/integrations/{integrationId}": {
            "get": {
                "operationId": "getIntegration",
                "tags": ["Integrations"],
                "summary": "Get one integration",
                "description": "Includes `apiKey`, a credential-shaped field the select step must decide on.",
                "parameters": [param("integrationId", "path", STR, "Integration id.")],
                "responses": {"200": ok(ref("Integration")), "404": ERR},
            }
        },
    },
    "components": {
        "securitySchemes": {"bearerAuth": {"type": "http", "scheme": "bearer"}},
        "schemas": {
            "Error": {
                "type": "object",
                "required": ["code", "message"],
                "properties": {"code": STR, "message": STR},
            },
            "PageMeta": {
                "type": "object",
                "required": ["page", "limit", "total"],
                "properties": {"page": INT, "limit": INT, "total": INT},
            },
            "Author": {
                "type": "object",
                "required": ["id", "name"],
                "properties": {"id": STR, "name": STR, "bio": STR, "born": INT},
            },
            "Book": {
                "type": "object",
                "required": ["id", "title", "authorId", "priceCents", "currency"],
                "properties": {
                    "id": STR,
                    "title": STR,
                    "authorId": {"type": "string", "description": "Id of the author; fetch it with GET /authors/{authorId}."},
                    "isbn": STR,
                    "priceCents": INT,
                    "currency": {"type": "string", "enum": ["USD", "EUR", "GBP"]},
                    "genres": {"type": "array", "items": STR},
                    "publishedAt": {"type": "string", "format": "date"},
                    "stock": INT,
                    "metadata": {"type": "object", "additionalProperties": True, "description": "Free-form publisher data."},
                },
            },
            "BookPage": {
                "type": "object",
                "required": ["data", "meta"],
                "properties": {"data": {"type": "array", "items": ref("Book")}, "meta": ref("PageMeta")},
            },
            "BookSearch": {
                "type": "object",
                "properties": {"query": STR, "genre": STR, "maxPriceCents": INT},
            },
            "Customer": {
                "type": "object",
                "required": ["id", "name", "email"],
                "properties": {
                    "id": STR,
                    "name": STR,
                    "email": {"type": "string", "format": "email", "description": "Personal data."},
                    "phone": {"type": "string", "description": "Personal data."},
                    "tier": {"type": "string", "enum": ["standard", "gold"]},
                    "createdAt": {"type": "string", "format": "date-time"},
                },
            },
            "OrderStatus": {"type": "string", "enum": ["pending", "paid", "shipped", "cancelled"]},
            "OrderItem": {
                "type": "object",
                "required": ["bookId", "quantity"],
                "properties": {"bookId": STR, "quantity": INT, "unitPriceCents": INT},
            },
            "CardPayment": {
                "type": "object",
                "required": ["type", "last4"],
                "properties": {"type": {"type": "string", "enum": ["card"]}, "last4": STR, "brand": STR},
            },
            "BankPayment": {
                "type": "object",
                "required": ["type", "iban"],
                "properties": {"type": {"type": "string", "enum": ["bank"]}, "iban": STR},
            },
            "Payment": {
                "oneOf": [ref("CardPayment"), ref("BankPayment")],
                "discriminator": {
                    "propertyName": "type",
                    "mapping": {"card": "#/components/schemas/CardPayment", "bank": "#/components/schemas/BankPayment"},
                },
            },
            "Order": {
                "type": "object",
                "required": ["id", "customerId", "status", "items", "totalCents"],
                "properties": {
                    "id": STR,
                    "customerId": {"type": "string", "description": "Id of the customer; fetch it with GET /customers/{customerId}."},
                    "status": ref("OrderStatus"),
                    "items": {"type": "array", "items": ref("OrderItem")},
                    "totalCents": INT,
                    "payment": ref("Payment"),
                    "createdAt": {"type": "string", "format": "date-time"},
                },
            },
            "OrderPage": {
                "type": "object",
                "required": ["data"],
                "properties": {
                    "data": {"type": "array", "items": ref("Order")},
                    "nextCursor": {"type": "string", "nullable": True},
                },
            },
            "NewOrder": {
                "type": "object",
                "required": ["customerId", "items"],
                "properties": {
                    "customerId": STR,
                    "items": {"type": "array", "items": ref("OrderItem")},
                    "payment": ref("Payment"),
                },
            },
            "OrderUpdate": {
                "type": "object",
                "required": ["status"],
                "properties": {"status": ref("OrderStatus"), "note": STR},
            },
            "Integration": {
                "type": "object",
                "required": ["id", "name"],
                "properties": {"id": STR, "name": STR, "webhookUrl": STR, "apiKey": {"type": "string", "description": "Secret."}},
            },
        },
    },
}


def make_v2():
    v2 = copy.deepcopy(V1)
    v2["info"]["version"] = "2.0.0"
    paths = v2["paths"]
    schemas = v2["components"]["schemas"]
    # new endpoint
    paths["/books/{bookId}/reviews"] = {
        "get": {
            "operationId": "listBookReviews",
            "tags": ["Catalog"],
            "summary": "List a book's reviews",
            "parameters": [param("bookId", "path", STR, "Book id.")],
            "responses": {"200": ok({"type": "array", "items": ref("Review")}), "404": ERR},
        }
    }
    schemas["Review"] = {
        "type": "object",
        "required": ["id", "bookId", "rating"],
        "properties": {"id": STR, "bookId": STR, "rating": INT, "text": STR, "reviewer": STR},
    }
    # deprecated endpoint, with a replacement query parameter
    paths["/books/search"]["post"]["deprecated"] = True
    paths["/books/search"]["post"]["description"] = "Deprecated: use GET /books?q= instead."
    paths["/books"]["get"]["parameters"].append(param("q", "query", STR, "Free-text search over title and genre."))
    # removed endpoint (PATCH) replaced by a new one
    del paths["/orders/{orderId}"]["patch"]
    paths["/orders/{orderId}/refund"] = {
        "post": {
            "operationId": "refundOrder",
            "tags": ["Orders"],
            "summary": "Refund an order",
            "parameters": [param("orderId", "path", STR, "Order id.")],
            "requestBody": {
                "required": False,
                "content": {"application/json": {"schema": {"type": "object", "properties": {"reason": STR}}}},
            },
            "responses": {"200": ok(ref("Order")), "404": ERR, "409": ERR},
        }
    }
    # new field, deprecated field, new enum value
    schemas["Book"]["properties"]["isbn13"] = STR
    # a new dict: STR is shared by every string field, so mutating it would deprecate them all
    schemas["Book"]["properties"]["isbn"] = {"type": "string", "deprecated": True}
    schemas["OrderStatus"]["enum"].append("refunded")
    return v2


def main():
    for name, spec in (("openapi.v1.json", V1), ("openapi.v2.json", make_v2())):
        with open(os.path.join(HERE, name), "w", encoding="utf-8") as fh:
            json.dump(spec, fh, indent=2)
            fh.write("\n")
        print("wrote", name)


if __name__ == "__main__":
    main()
