// QuickNotes API client
// This file proves that the QuickNotes front end can talk to a real HTTP API.
// It uses the JSONPlaceholder practice API; the production API the backend
// team should build is described in docs/api-design.md.

const API_URL = 'https://jsonplaceholder.typicode.com/posts';

const loadBtn = document.getElementById('load-btn');
const statusEl = document.getElementById('status');
const notesList = document.getElementById('notes-list');

let notes = [];
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

  item.append(title, body);
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

/** GET the ten most recent notes (Task 1). */
async function loadNotes() {
  trackRequest(1);
  setStatus('Loading notes...', 'loading');

  try {
    const { data } = await request(`${API_URL}?_limit=10`);
    notes = Array.isArray(data) ? data : [];
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

// Start with the empty state so the page is never just a blank box.
renderNotes(notes);
