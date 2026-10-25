// QuickNotes API client
// This file proves that the QuickNotes front end can talk to a real HTTP API.
// It uses the JSONPlaceholder practice API; the production API the backend
// team should build is described in docs/api-design.md.
//
// JSONPlaceholder is a fake API: POST /posts returns a simulated note with a
// new id but does not persist it, and DELETE only pretends to delete. Notes
// created in this browser session are kept in the list and their ids are
// tracked in `sessionNoteIds`. A DELETE is still sent for every note; if the
// server answers 404 for a note that only ever existed in this tab, we remove
// it locally and say so, because there is nothing on the server to delete.

const API_URL = 'https://jsonplaceholder.typicode.com/posts';

const loadBtn = document.getElementById('load-btn');
const statusEl = document.getElementById('status');
const notesList = document.getElementById('notes-list');
const noteForm = document.getElementById('note-form');
const titleInput = document.getElementById('title-input');
const bodyInput = document.getElementById('body-input');
const submitBtn = document.getElementById('submit-btn');

let notes = [];
const sessionNoteIds = new Set();
let requestsInFlight = 0;

/**
 * Show a message in the #status paragraph.
 * @param {string} message
 * @param {'info'|'loading'|'success'|'error'|'empty'} type
 */
function setStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

/** Disable all action buttons while at least one request is running. */
function trackRequest(delta) {
  requestsInFlight = Math.max(0, requestsInFlight + delta);
  const busy = requestsInFlight > 0;
  loadBtn.disabled = busy;
  submitBtn.disabled = busy;
  notesList.querySelectorAll('button').forEach((button) => {
    button.disabled = busy;
  });
}

/**
 * Reusable fetch wrapper. It performs the request, rejects on HTTP errors and
 * returns both the parsed body and the status code.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<{ data: any, status: number }>}
 */
async function request(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  // DELETE responses carry no useful body, so tolerate an empty payload.
  const data = response.status === 204
    ? null
    : await response.json().catch(() => null);

  return { data, status: response.status };
}

/** Build one list item. User text is inserted with textContent only. */
function createNoteElement(note) {
  const item = document.createElement('li');
  item.className = 'note';

  const title = document.createElement('h3');
  title.className = 'note-title';
  title.textContent = note.title;

  const body = document.createElement('p');
  body.className = 'note-body';
  body.textContent = note.body || 'No body.';

  const actions = document.createElement('div');
  actions.className = 'note-actions';

  const meta = document.createElement('span');
  meta.className = 'note-meta';
  meta.textContent = `Note #${note.id}`;

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'danger';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => deleteNote(note.id, deleteBtn));

  actions.append(meta, deleteBtn);
  item.append(title, body, actions);
  return item;
}

/** Render the note list, including the empty state. */
function renderNotes(list) {
  notesList.replaceChildren();

  if (list.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No notes yet. Press "Load notes" to fetch the latest ten.';
    notesList.append(empty);
    return;
  }

  list.forEach((note) => notesList.append(createNoteElement(note)));

  // A render can happen while a request is still finishing (for example after
  // a delete), so keep any freshly created buttons in the disabled state.
  if (requestsInFlight > 0) {
    notesList.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });
  }
}

/** Validate a note title. Returns an error message, or an empty string. */
function validateTitle(title) {
  if (title.length === 0) {
    return 'A title is required.';
  }
  if (title.length > 100) {
    return 'The title must be 100 characters or fewer.';
  }
  return '';
}

/** POST a new note (Task 2). */
async function createNote() {
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  const problem = validateTitle(title);

  if (problem) {
    titleInput.setAttribute('aria-invalid', 'true');
    setStatus(problem, 'error');
    titleInput.focus();
    return;
  }

  titleInput.removeAttribute('aria-invalid');
  trackRequest(1);
  setStatus('Saving note...', 'loading');

  try {
    const { data: created, status } = await request(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, userId: 1 }),
    });

    const saved = {
      id: created?.id ?? Date.now(),
      title,
      body,
      userId: created?.userId ?? 1,
    };

    notes.unshift(saved);
    sessionNoteIds.add(String(saved.id));
    renderNotes(notes);
    noteForm.reset();
    setStatus(`Note created (status ${status}, id ${saved.id}).`, 'success');
  } catch (error) {
    setStatus(`Sorry, the note could not be saved. ${error.message}`, 'error');
  } finally {
    trackRequest(-1);
  }
}

/** DELETE a note (Task 3). */
async function deleteNote(id, button) {
  trackRequest(1);
  button.disabled = true;
  setStatus('Deleting note...', 'loading');

  try {
    const { status } = await request(`${API_URL}/${id}`, { method: 'DELETE' });
    removeNote(id);
    setStatus(`Note deleted (status ${status}).`, 'success');
  } catch (error) {
    if (error.status === 404 && sessionNoteIds.has(String(id))) {
      // The note was only ever rendered in this tab, so a 404 is expected.
      removeNote(id);
      setStatus(
        'Removed the note from this page. JSONPlaceholder never stored it (status 404), so there is nothing left on the server.',
        'success'
      );
    } else {
      setStatus(`Sorry, the note could not be deleted. ${error.message}`, 'error');
    }
  } finally {
    trackRequest(-1);
  }
}

/** Remove a note from local state and re-render the list. */
function removeNote(id) {
  notes = notes.filter((note) => String(note.id) !== String(id));
  sessionNoteIds.delete(String(id));
  renderNotes(notes);
}

/** GET the ten most recent notes (Task 1). */
async function loadNotes() {
  trackRequest(1);
  setStatus('Loading notes...', 'loading');

  try {
    const { data } = await request(`${API_URL}?_limit=10`);
    notes = Array.isArray(data) ? data : [];
    sessionNoteIds.clear();
    renderNotes(notes);

    if (notes.length === 0) {
      setStatus('The server returned no notes.', 'empty');
    } else {
      setStatus(`Loaded ${notes.length} notes from the server.`, 'success');
    }
  } catch (error) {
    setStatus(`Sorry, we could not load your notes. ${error.message}`, 'error');
  } finally {
    trackRequest(-1);
  }
}

loadBtn.addEventListener('click', loadNotes);

noteForm.addEventListener('submit', (event) => {
  event.preventDefault();
  createNote();
});

// Clear the invalid state as soon as the user starts correcting the title.
titleInput.addEventListener('input', () => {
  titleInput.removeAttribute('aria-invalid');
});

// Start with the empty state so the page is never just a blank box.
renderNotes(notes);
