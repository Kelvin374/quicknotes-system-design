# QuickNotes

QuickNotes is a small note-taking web app and the system design for turning it into a
real online service. The browser client loads, creates and deletes notes through a
REST API (JSONPlaceholder for practice), while the documents in `docs/` describe the
production API, the relational data model and an architecture that can serve
1,000,000 users.

The project has two goals:

1. **Prove the front end can talk to an API** — real `fetch` requests, real HTTP status
   codes, validation, and visible loading, success, error and empty states.
2. **Give the backend team a buildable design** — endpoints, tables, indexes, capacity
   estimates, request flows and failure handling.

---

## Contents

| File | What it contains |
| --- | --- |
| [`index.html`](index.html) | HTML5 page with the note form and notes list. |
| [`style.css`](style.css) | Readable responsive styling, including distinct success and error status styles. |
| [`api.js`](api.js) | API client: reusable `request()`, GET, POST, DELETE, validation and UI states. |
| [`docs/api-design.md`](docs/api-design.md) | REST API design for the real QuickNotes backend. |
| [`docs/data-model.md`](docs/data-model.md) | Users, notes, tags and note_tags: schema, relationships, SQL, indexes and SQL-vs-NoSQL. |
| [`docs/architecture.md`](docs/architecture.md) | Requirements, load estimates, architecture diagram, request flows, trade-offs and single-point-of-failure handling. |

---

## Run the API client

There is no build step and no dependency to install. The page needs an internet
connection because it calls `https://jsonplaceholder.typicode.com/posts`.

### Option A — open the file directly

Double-click `index.html` or open it in a browser. Loading a local file is enough for
the GET, POST and DELETE requests used here.

### Option B — serve it locally (recommended)

From the project folder:

```bash
# Python 3
python -m http.server 8000
```

or, with Node.js:

```bash
npx serve .
```

Then visit **http://localhost:8000**.

### Try it

1. Click **Load notes**. The status shows *"Loading notes..."* and the button is
   disabled until ten notes appear. On success it shows
   *"Loaded 10 notes from the server."*
2. Submit a note with a title but no body. The note is added at the top and the status
   shows the response code and new id, for example
   *"Note created (status 201, id 101)."* The form clears afterwards.
3. Submit with an empty title or a title over 100 characters to see validation.
4. Click **Delete** on a note. It is removed and a success message is shown. Server
   notes use `DELETE /posts/{id}`.
5. Turn off the network (or block the request in DevTools), then click **Load notes** to
   see the friendly error state.

### About JSONPlaceholder

JSONPlaceholder is a practice API, not a database:

* `POST /posts` returns a simulated note (usually id `101`) but does not store it.
* `DELETE /posts/{id}` returns success without deleting anything on the server.
* `GET /posts?_limit=10` always returns the same sample notes.

The client therefore keeps notes created in the current tab in memory and marks their
ids, so they can be shown at the top and removed sensibly. This is explained in the
comment block at the top of [`api.js`](api.js). A page reload discards them, which is
the honest behaviour for this fake API. The real API in
[`docs/api-design.md`](docs/api-design.md) persists notes.

---

## Design documents

* **[API design](docs/api-design.md)** — 12 endpoints with methods, paths, success
  statuses, create/list JSON examples, validation rules and the full error-code
  envelope (400, 401, 403, 404, 409, 422, 429, 500, 503).
* **[Data model](docs/data-model.md)** — entity/column tables with primary and foreign
  keys, one-to-many and many-to-many relationships, `CREATE TABLE` statements for all
  four tables, five example queries (including JOINs), indexes with reasons, and a
  justification for choosing PostgreSQL.
* **[Architecture](docs/architecture.md)** — functional and non-functional
  requirements, a 1M-user load estimate (23 reads/s average, 2.3 writes/s average,
  ~220 GB/year provisioned), Mermaid architecture diagram, one sentence per component,
  step-by-step `GET /notes` and `POST /notes` flows, trade-offs and SPOF mitigations.

---

## Project structure

```
quicknotes-system-design/
├── index.html
├── style.css
├── api.js
├── README.md
└── docs/
    ├── api-design.md
    ├── data-model.md
    └── architecture.md
```

---

## What I learned

1. **`fetch` does not reject on HTTP errors.** A 404 or 500 still resolves the promise,
   so the reusable `request()` wrapper must check `response.ok` and throw an error that
   carries the status code. That status is what lets the UI show a useful message and
   what lets the delete flow treat an expected 404 differently from a real failure.
2. **`try` / `catch` / `finally` is what makes the UI trustworthy.** Every request
   disables the relevant buttons, shows a loading message, and re-enables the buttons
   in `finally`. Without that, a double-click can submit twice or a failed request can
   leave the page permanently stuck in a loading state.
3. **User text must be inserted with `textContent`.** Building note cards with
   `innerHTML` would let a title such as `<img onerror=...>` run as code. Creating
   elements and assigning `textContent` keeps the note content inert, and the form
   still has maxlength plus JavaScript validation because client-side checks improve
   the experience even though the server must validate again.
4. **HTTP methods and status codes are part of the interface.** GET is safe, POST
   returns 201 with the created resource, DELETE returns 204 with no body, and errors
   use specific codes such as 400, 401, 403, 404 and 500 instead of generic failures.
   Designing the endpoint table first made the data model and the client code easier to
   reason about.
5. **Indexes follow queries, not tables.** The notes list always filters by `user_id`
   and orders by `created_at DESC`, so a composite index on
   `(user_id, created_at DESC, id DESC)` serves it directly. The many-to-many join table
   needs a separate index on `tag_id` because its primary key starts with `note_id`.
6. **Scaling is about removing bottlenecks in order.** At ~23 reads/s average, a single
   primary database is not the problem; a cache and read replica handle read growth, and
   a queue keeps slow side effects out of the user's request. The architecture stops
   being simple only when measurements say it must.

---

## Author

Kelvin Githae — QuickNotes system design assignment.
