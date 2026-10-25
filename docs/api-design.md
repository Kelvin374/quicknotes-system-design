# QuickNotes REST API Design

**Version:** 1.0
**Status:** Draft for backend implementation
**Base URL:** `https://api.quicknotes.example/v1`

This document describes the API the backend team should build for QuickNotes. It is
the production replacement for the JSONPlaceholder practice API used by the browser
client in `index.html` / `api.js`. Where JSONPlaceholder fakes writes, this API
persists them.

---

## 1. Purpose and scope

The API lets an authenticated user create, read, update and delete private notes,
organise notes with tags, and search their own notes. Every note belongs to exactly
one user. Users can never read or modify another user's data.

Out of scope for v1: sharing notes publicly, real-time collaboration, file
attachments, and team workspaces. These can be added later without breaking the
existing resource shapes.

---

## 2. Conventions

| Topic | Rule |
| --- | --- |
| Format | JSON only. Requests use `Content-Type: application/json`; responses use `application/json; charset=utf-8`. |
| Field names | `snake_case` (for example `created_at`). |
| IDs | Positive 64-bit integers. |
| Timestamps | ISO 8601 / RFC 3339 in UTC, for example `2026-10-25T14:03:00Z`. |
| Authentication | `Authorization: Bearer <access_token>` on every endpoint except register, login and health. |
| Versioning | Major version in the URL path (`/v1`). Additive changes stay in v1. |
| Pagination | `limit` (default 10, maximum 100) and `offset` (default 0). List responses include a `pagination` object. |
| Sorting | `sort` query parameter; for notes the default and only v1 value is `created_at:desc`. |
| Idempotency | `GET`, `PATCH` and `DELETE` are idempotent. `POST /notes` accepts an optional `Idempotency-Key` header so a retried request cannot create duplicates. |
| Request tracing | Every response includes `X-Request-Id`; clients should quote it in bug reports. |
| CORS | Allowed origins are configured per environment; production allows only `https://quicknotes.example`. |

### Authentication flow

1. `POST /auth/register` creates the account and returns an access token.
2. `POST /auth/login` exchanges email and password for an access token.
3. The client sends `Authorization: Bearer <token>` on each request.
4. A missing or expired token returns **401**. A valid token that targets another
   user's resource returns **403** (or **404** if the API chooses not to reveal that
   the resource exists; this design uses 403 for authenticated users).

Passwords are hashed with Argon2id. Tokens are short-lived (15 minutes) and signed
by the auth service; refresh-token rotation is handled outside this document.

---

## 3. Endpoint summary

| # | Method | Path | Description | Success status |
| --- | --- | --- | --- | --- |
| 1 | `POST` | `/auth/register` | Create an account and return the new user plus an access token. | `201 Created` |
| 2 | `POST` | `/auth/login` | Exchange email and password for an access token. | `200 OK` |
| 3 | `GET` | `/notes` | List the authenticated user's notes, newest first, with pagination. | `200 OK` |
| 4 | `POST` | `/notes` | Create a note owned by the authenticated user. | `201 Created` |
| 5 | `GET` | `/notes/{id}` | Fetch one note by id. | `200 OK` |
| 6 | `PATCH` | `/notes/{id}` | Partially update a note's title and/or body. | `200 OK` |
| 7 | `DELETE` | `/notes/{id}` | Permanently delete a note and its tag links. | `204 No Content` |
| 8 | `GET` | `/tags` | List the authenticated user's tags. | `200 OK` |
| 9 | `POST` | `/tags` | Create a tag for the authenticated user. | `201 Created` |
| 10 | `POST` | `/notes/{id}/tags` | Attach one existing tag to a note. | `200 OK` |
| 11 | `DELETE` | `/notes/{id}/tags/{tag_id}` | Remove a tag from a note (the tag itself is kept). | `204 No Content` |
| 12 | `GET` | `/health` | Liveness/readiness probe for the load balancer. | `200 OK` |

All endpoints except `/health`, `/auth/register` and `/auth/login` require a bearer
token.

---

## 4. Notes endpoints in detail

### 4.1 List notes

```http
GET /v1/notes?limit=10&offset=0&q=meeting&tag=work HTTP/1.1
Host: api.quicknotes.example
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Accept: application/json
```

Query parameters:

| Parameter | Type | Default | Meaning |
| --- | --- | --- | --- |
| `limit` | integer 1–100 | `10` | Page size. |
| `offset` | integer ≥ 0 | `0` | Number of notes to skip. |
| `q` | string ≤ 200 | – | Case-insensitive search across title and body. |
| `tag` | string | – | Only notes carrying this tag. |

**Response — `200 OK`**

```json
{
  "data": [
    {
      "id": 42,
      "user_id": 7,
      "title": "Sprint planning",
      "body": "Discuss the read-replica migration and the new cache keys.",
      "tags": ["work", "planning"],
      "created_at": "2026-10-25T14:03:00Z",
      "updated_at": "2026-10-25T14:03:00Z"
    },
    {
      "id": 41,
      "user_id": 7,
      "title": "Groceries",
      "body": "Oat milk, coffee, oranges.",
      "tags": [],
      "created_at": "2026-10-24T18:20:00Z",
      "updated_at": "2026-10-24T18:20:00Z"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 2,
    "has_more": false
  }
}
```

Notes are always scoped to the token's user; there is no `user_id` query parameter.

### 4.2 Create a note

```http
POST /v1/notes HTTP/1.1
Host: api.quicknotes.example
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
Idempotency-Key: 9b334f4e-1d8e-4f6d-9f3a-6a1a9b28e0c1

{
  "title": "Sprint planning",
  "body": "Discuss the read-replica migration and the new cache keys.",
  "tags": ["work", "planning"]
}
```

Validation:

* `title` is required after trimming, 1–100 characters.
* `body` is optional, maximum 10,000 characters. Omitted or `null` means no body.
* `tags` is optional, maximum 10 names, each 1–50 characters. Tags are created if
  they do not already belong to the user.

**Response — `201 Created`**

```json
{
  "id": 42,
  "user_id": 7,
  "title": "Sprint planning",
  "body": "Discuss the read-replica migration and the new cache keys.",
  "tags": ["work", "planning"],
  "created_at": "2026-10-25T14:03:00Z",
  "updated_at": "2026-10-25T14:03:00Z"
}
```

Response headers:

```http
Location: /v1/notes/42
X-Request-Id: 4f1c2b7e-8a1f-4a1e-8a2e-3b6f0f6a9d10
```

### 4.3 Get one note

```http
GET /v1/notes/42 HTTP/1.1
Authorization: Bearer <token>
```

Returns the same note object as above with **`200 OK`**, or **`404 Not Found`** if the
note does not exist for this user.

### 4.4 Update a note

```http
PATCH /v1/notes/42 HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Sprint planning (updated)"
}
```

Only supplied fields change. Returns the full updated note with **`200 OK`**. An
empty body or an unknown field returns **`400 Bad Request`**.

### 4.5 Delete a note

```http
DELETE /v1/notes/42 HTTP/1.1
Authorization: Bearer <token>
```

**Response — `204 No Content`** with an empty body. Deleting an already-deleted note
returns **`404 Not Found`** unless the client sends `Idempotency-Key`, in which case a
repeated delete of that key returns `204`. Deleting a note also deletes its rows in
`note_tags`; the tags themselves remain.

---

## 5. Tag endpoints

* `GET /tags` → `200 OK`, returns `{ "data": [{ "id": 3, "name": "work", "note_count": 12 }] }`.
* `POST /tags` with `{ "name": "work" }` → `201 Created`. A duplicate name for the same
  user returns `409 Conflict`.
* `POST /notes/{id}/tags` with `{ "tag_id": 3 }` → `200 OK` with the updated note. The
  operation is idempotent: attaching the same tag twice is not an error.
* `DELETE /notes/{id}/tags/{tag_id}` → `204 No Content`. Removing a tag that is not
  attached returns `404 Not Found`.

---

## 6. Status codes

### Success codes

| Code | Used for |
| --- | --- |
| `200 OK` | Successful reads, updates, login and tag operations. |
| `201 Created` | A new user, note or tag was created. |
| `204 No Content` | A delete succeeded; the response has no body. |

### Error codes

| Code | Meaning | When QuickNotes returns it |
| --- | --- | --- |
| `400 Bad Request` | Malformed syntax or invalid input. | Invalid JSON, missing `title`, title over 100 characters, unknown field, bad `limit`. |
| `401 Unauthorized` | Authentication missing or invalid. | No token, malformed token, expired token, wrong password on login. |
| `403 Forbidden` | Authenticated but not allowed. | Trying to read, update or delete another user's note. |
| `404 Not Found` | Resource or route does not exist. | Unknown note id, unknown tag id, unknown route. |
| `409 Conflict` | Request conflicts with current state. | Duplicate tag name for a user, duplicate email on register. |
| `422 Unprocessable Entity` | Syntax is valid but semantics are not. | Referencing a tag id that does not exist, or a tag that belongs to another user. |
| `429 Too Many Requests` | Rate limit exceeded. | More than 100 requests per minute per token from one IP. |
| `500 Internal Server Error` | Unexpected server failure. | Unhandled exception, database unavailable after failover attempts. |
| `503 Service Unavailable` | Temporary overload or maintenance. | Circuit breaker open, deploy draining connections. |

Every error uses the same envelope, so the client can branch on a stable machine
code instead of parsing prose:

```json
{
  "error": {
    "code": "validation_error",
    "message": "The title must be between 1 and 100 characters.",
    "details": [
      {
        "field": "title",
        "issue": "length"
      }
    ],
    "request_id": "4f1c2b7e-8a1f-4a1e-8a2e-3b6f0f6a9d10"
  }
}
```

Recommended `error.code` values: `validation_error`, `unauthorized`,
`forbidden`, `not_found`, `conflict`, `unprocessable_entity`, `rate_limited`,
`internal_error`, `service_unavailable`.

**`400` example**

```json
{
  "error": {
    "code": "validation_error",
    "message": "The title is required.",
    "details": [{ "field": "title", "issue": "required" }],
    "request_id": "0b5a8c9e-72b5-4e52-bb0c-5c8f3d1a2e77"
  }
}
```

**`401` example**

```json
{
  "error": {
    "code": "unauthorized",
    "message": "The access token is missing or has expired.",
    "details": [],
    "request_id": "0b5a8c9e-72b5-4e52-bb0c-5c8f3d1a2e77"
  }
}
```

**`500` example**

```json
{
  "error": {
    "code": "internal_error",
    "message": "Something went wrong on our side. Please try again.",
    "details": [],
    "request_id": "0b5a8c9e-72b5-4e52-bb0c-5c8f3d1a2e77"
  }
}
```

Internal exception details are logged with the `request_id` and never returned to
the client.

---

## 7. Rate limiting

Limits are applied per access token and per IP. Responses include:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 37
X-RateLimit-Reset: 1792933380
Retry-After: 30
```

`Retry-After` is only present on `429` and `503`.

---

## 8. Client mapping

| QuickNotes UI action | API call |
| --- | --- |
| Click **Load notes** | `GET /v1/notes?limit=10` |
| Submit **New note** | `POST /v1/notes` |
| Click **Delete** | `DELETE /v1/notes/{id}` |
| Show loading / success / error / empty | `#status` messages and the `#notes-list` empty item |

The practice client in `api.js` uses JSONPlaceholder because the real API does not
exist yet. When the backend ships, only `API_URL` and the response field names need
to change; the request wrapper, validation and UI states are reusable.
