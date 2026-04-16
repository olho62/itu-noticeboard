/* ═══════════════════════════════════════════════════════════
   ITU Notice Board — itu-board.js
   Backend: Cloudflare Worker + D1
   API base: https://black-grass-8e25.olly-1e1.workers.dev
═══════════════════════════════════════════════════════════ */

const API = 'https://black-grass-8e25.olly-1e1.workers.dev';
const ADMIN_PASSWORD = '4dminP4ss26!';
const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

let isAdmin     = false;
let showArchive = false;
let pendingDelId    = null;
let pendingStickyId = null;
let pendingEditId   = null;
let savedName       = localStorage.getItem('itu_board_name') || '';

/* ── API HELPERS ─────────────────────────────────────────── */

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}`);
  return res.json();
}

function bool(val) { return val === 1 || val === true; }

/* ── LOAD NOTES ──────────────────────────────────────────── */

async function loadNotes() {
  const board = document.getElementById('board');
  try {
    if (showArchive) {
      const archived = await api('GET', '/notes/archived');
      renderArchive(archived);
    } else {
      const { sticky, regular } = await api('GET', '/notes');
      // Fetch comment counts for all notes
      const allIds = [...sticky, ...regular].map(n => n.id);
      let counts = {};
      if (allIds.length) {
        counts = await api('GET', `/comments/counts?note_ids=${allIds.join(',')}`);
      }
      renderNotes(sticky, regular, counts);
    }
  } catch (err) {
    board.innerHTML = `<div class="board-message"><p class="error">Could not connect to server. <button class="btn btn-secondary" data-action="retry">Retry</button></p></div>`;
    console.error(err);
  }
}

/* ── RENDER ──────────────────────────────────────────────── */

function renderNotes(sticky, regular, counts) {
  const board = document.getElementById('board');
  let html = '';

  if (sticky.length) {
    html += '<div class="sticky-section">';
    sticky.forEach(n => { html += renderNote(n, counts); });
    html += '</div>';
  }

  if (regular.length) {
    html += '<div class="notes-grid">';
    regular.forEach(n => { html += renderNote(n, counts); });
    html += '</div>';
  }

  if (!sticky.length && !regular.length) {
    html = '<div class="board-message"><p>No notes yet. Be the first to add one!</p></div>';
  }

  board.innerHTML = html;
}

function renderArchive(notes) {
  const board = document.getElementById('board');
  if (!notes.length) {
    board.innerHTML = '<div class="board-message"><p>Archive is empty.</p></div>';
    return;
  }
  let html = '<div class="notes-grid">';
  notes.forEach(n => { html += renderNote(n, {}, true); });
  html += '</div>';
  board.innerHTML = html;
}

function urgencyClass(note) {
  if (bool(note.sticky)) return 'note-sticky';
  const now = Date.now();
  const exp = new Date(note.expires_at).getTime();
  const diff = exp - now;
  if (diff < 0) return 'note-expired';
  if (diff < 24 * 60 * 60 * 1000) return 'note-urgent';
  if (diff < 2 * 24 * 60 * 60 * 1000) return 'note-warning';
  return 'note-ok';
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function renderNote(note, counts = {}, archived = false) {
  const cls     = urgencyClass(note);
  const isSticky  = bool(note.sticky);
  const stickyReq = bool(note.sticky_requested);
  const delReq    = bool(note.deletion_requested);
  const edited    = bool(note.edited);

  const created  = fmtDateTime(note.created_at);
  const expires  = bool(note.sticky) ? 'Permanent' : `Expires ${fmtDate(note.expires_at)}`;

  const withinEdit = (Date.now() - new Date(note.created_at).getTime()) < EDIT_WINDOW_MS;

  const cnt   = counts[note.id];
  const cbText = cnt
    ? `💬 ${cnt.count} comment${cnt.count !== 1 ? 's' : ''} · Last: ${fmtDateTime(cnt.last)}`
    : '💬 Add comment';

  const adminBtns = isAdmin ? `
    <div class="admin-bar">
      ${isSticky
        ? `<button class="btn btn-admin-act" data-action="unsticky" data-id="${note.id}">★ Remove permanent</button>`
        : `<button class="btn btn-admin-act" data-action="make-sticky" data-id="${note.id}">★ Make permanent</button>`}
      <button class="btn btn-admin-del" data-action="admin-delete" data-id="${note.id}">🗑 Delete</button>
      ${delReq ? `<span class="del-reason" title="${escHtml(note.deletion_reason || '')}">⚠ Deletion requested</span>` : ''}
      ${stickyReq ? `<span class="sticky-reason" title="${escHtml(note.sticky_reason || '')}">📌 Sticky requested</span>` : ''}
    </div>` : '';

  const userBtns = !archived && !isAdmin ? `
    <div class="note-actions">
      ${withinEdit
        ? `<button class="btn btn-edit" data-action="open-edit" data-id="${note.id}" data-subject="${escHtml(note.subject)}" data-body="${escHtml(note.body)}">✏ Edit</button>`
        : ''}
      ${!delReq
        ? `<button class="btn btn-del" data-action="open-del" data-id="${note.id}">✕ Request deletion</button>`
        : '<span class="del-pending">Deletion requested</span>'}
      ${!isSticky && !stickyReq
        ? `<button class="btn btn-sticky" data-action="open-sticky" data-id="${note.id}">📌 Request permanent</button>`
        : ''}
    </div>` : '';

  return `
  <div class="note ${cls}" id="note-${note.id}">
    <div class="note-header">
      ${isSticky ? '<span class="sticky-badge">★ PERMANENT</span>' : ''}
      ${delReq && !isAdmin ? '<span class="del-badge">⏳ Deletion pending</span>' : ''}
    </div>
    <div class="note-subject">${escHtml(note.subject)}</div>
    <div class="note-author">Posted by <strong>${escHtml(note.name)}</strong> · ${created}${edited ? ' · <em>edited</em>' : ''}</div>
    <div class="note-body">${escHtml(note.body)}</div>
    <div class="note-expiry">${expires} · ${note.retention_days}d retention</div>
    ${adminBtns}
    ${userBtns}
    ${!archived ? `<button class="btn btn-comments" data-action="toggle-comments" data-id="${note.id}">${cbText}</button>` : ''}
    <button class="btn btn-print" data-action="print" data-id="${note.id}">🖨 Print</button>
    <div class="comments-panel" id="comments-${note.id}">
      <div class="comments-list" id="clist-${note.id}"><p class="loading">Loading comments…</p></div>
      <div class="comment-form">
        <input class="comment-name-input" type="text" placeholder="Your name" value="${escHtml(savedName)}" data-note-id="${note.id}" maxlength="60">
        <textarea class="comment-body-input" placeholder="Write a comment…" data-note-id="${note.id}" maxlength="500" rows="3"></textarea>
        <div class="comment-footer">
          <span class="char-count" id="cc-${note.id}">0/500</span>
          <button class="btn btn-primary" data-action="submit-comment" data-id="${note.id}">Post comment</button>
        </div>
      </div>
    </div>
  </div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── ADD NOTE ────────────────────────────────────────────── */

function openAddNote() {
  document.getElementById('fName').value    = savedName;
  document.getElementById('fSubject').value = '';
  document.getElementById('fBody').value    = '';
  document.getElementById('fRetention').value = '7';
  document.getElementById('addOverlay').classList.add('open');
  setTimeout(() => document.getElementById('fName').focus(), 50);
}

async function submitNote() {
  const name      = document.getElementById('fName').value.trim();
  const subject   = document.getElementById('fSubject').value.trim();
  const body      = document.getElementById('fBody').value.trim();
  const retention = parseInt(document.getElementById('fRetention').value, 10);

  if (!name)    { toast('Please enter your name', 'err'); return; }
  if (!subject) { toast('Please enter a subject', 'err'); return; }
  if (!body)    { toast('Please enter a message', 'err'); return; }

  const expires_at = new Date(Date.now() + retention * 86400000).toISOString();

  try {
    await api('POST', '/notes', { name, subject, body, retention_days: retention, expires_at });
    savedName = name;
    localStorage.setItem('itu_board_name', name);
    closeOverlay('addOverlay');
    toast('Note added ✔', 'ok');
    loadNotes();
  } catch (err) {
    toast('Error posting note', 'err');
  }
}

/* ── EDIT NOTE ───────────────────────────────────────────── */

function openEditNote(id, subject, body) {
  pendingEditId = id;
  document.getElementById('fEditSubject').value = subject;
  document.getElementById('fEditBody').value    = body;
  document.getElementById('editOverlay').classList.add('open');
  setTimeout(() => document.getElementById('fEditSubject').focus(), 50);
}

async function submitEditNote() {
  const subject = document.getElementById('fEditSubject').value.trim();
  const body    = document.getElementById('fEditBody').value.trim();
  if (!subject) { toast('Subject cannot be empty', 'err'); return; }
  if (!body)    { toast('Body cannot be empty', 'err'); return; }
  try {
    await api('PATCH', `/notes/${pendingEditId}`, {
      subject, body, edited: true, edited_at: new Date().toISOString()
    });
    closeOverlay('editOverlay');
    toast('Note updated ✔', 'ok');
    loadNotes();
  } catch (err) {
    toast('Error updating note', 'err');
  }
}

/* ── DELETION REQUEST ────────────────────────────────────── */

function openDelRequest(id) {
  pendingDelId = id;
  document.getElementById('fReason').value = '';
  document.getElementById('delOverlay').classList.add('open');
  setTimeout(() => document.getElementById('fReason').focus(), 50);
}

async function submitDelRequest() {
  const reason = document.getElementById('fReason').value.trim();
  if (!reason) { toast('Please give a reason', 'err'); return; }
  try {
    await api('PATCH', `/notes/${pendingDelId}`, { deletion_requested: true, deletion_reason: reason });
    closeOverlay('delOverlay');
    toast('Deletion request sent to admin', 'ok');
    loadNotes();
  } catch (err) {
    toast('Error sending request', 'err');
  }
}

/* ── STICKY REQUEST ──────────────────────────────────────── */

function openStickyRequest(id) {
  pendingStickyId = id;
  document.getElementById('fStickyReason').value = '';
  document.getElementById('stickyOverlay').classList.add('open');
  setTimeout(() => document.getElementById('fStickyReason').focus(), 50);
}

async function submitStickyRequest() {
  const reason = document.getElementById('fStickyReason').value.trim();
  if (!reason) { toast('Please give a reason', 'err'); return; }
  try {
    await api('PATCH', `/notes/${pendingStickyId}`, { sticky_requested: true, sticky_reason: reason });
    closeOverlay('stickyOverlay');
    toast('Permanent status requested 📌', 'ok');
    loadNotes();
  } catch (err) {
    toast('Error sending request', 'err');
  }
}

/* ── ADMIN ACTIONS ───────────────────────────────────────── */

function toggleAdmin() {
  if (isAdmin) {
    isAdmin = false;
    document.getElementById('adminChip').classList.add('hidden');
    toast('Admin mode off', 'ok');
    loadNotes();
    return;
  }
  const pwd = prompt('Enter admin password:');
  if (pwd === null) return;
  if (pwd === ADMIN_PASSWORD) {
    isAdmin = true;
    document.getElementById('adminChip').classList.remove('hidden');
    toast('Admin mode enabled ✔', 'ok');
    loadNotes();
  } else {
    toast('Incorrect password', 'err');
  }
}

async function adminDelete(id) {
  if (!confirm('Permanently delete this note and all its comments?')) return;
  try {
    await api('DELETE', `/notes/${id}`);
    toast('Note deleted', 'ok');
    loadNotes();
  } catch (err) {
    toast('Error deleting note', 'err');
  }
}

async function adminMakeSticky(id) {
  try {
    await api('PATCH', `/notes/${id}`, { sticky: true, sticky_requested: false });
    toast('Note is now permanent ★', 'ok');
    loadNotes();
  } catch (err) {
    toast('Error updating note', 'err');
  }
}

async function adminUnsticky(id) {
  if (!confirm('Remove permanent status? The note will expire normally.')) return;
  try {
    await api('PATCH', `/notes/${id}`, { sticky: false });
    toast('Permanent status removed', 'ok');
    loadNotes();
  } catch (err) {
    toast('Error updating note', 'err');
  }
}

/* ── COMMENTS ────────────────────────────────────────────── */

async function toggleComments(noteId) {
  const panel = document.getElementById(`comments-${noteId}`);
  const isOpen = panel.classList.contains('open');
  // Close all panels first
  document.querySelectorAll('.comments-panel.open').forEach(p => p.classList.remove('open'));
  if (isOpen) return;
  panel.classList.add('open');
  await loadComments(noteId);
}

async function loadComments(noteId) {
  const list = document.getElementById(`clist-${noteId}`);
  try {
    const comments = await api('GET', `/comments?note_id=${noteId}`);
    if (!comments.length) {
      list.innerHTML = '<p class="no-comments">No comments yet.</p>';
      return;
    }
    list.innerHTML = comments.map(c => renderComment(c)).join('');
  } catch (err) {
    list.innerHTML = '<p class="error">Could not load comments.</p>';
  }
}

function renderComment(c) {
  const edited = bool(c.edited) ? ` · <em>edited</em>` : '';
  const withinEdit = (Date.now() - new Date(c.created_at).getTime()) < EDIT_WINDOW_MS;
  return `
  <div class="comment" id="comment-${c.id}">
    <div class="comment-meta"><strong>${escHtml(c.name)}</strong> · ${fmtDateTime(c.created_at)}${edited}</div>
    <div class="comment-body" id="cbody-${c.id}">${escHtml(c.body)}</div>
    ${withinEdit
      ? `<button class="btn btn-edit-sm" data-action="edit-comment" data-id="${c.id}" data-note-id="${c.note_id}" data-body="${escHtml(c.body)}">✏ Edit</button>`
      : ''}
  </div>`;
}

async function submitComment(noteId) {
  const nameEl = document.querySelector(`.comment-name-input[data-note-id="${noteId}"]`);
  const bodyEl = document.querySelector(`.comment-body-input[data-note-id="${noteId}"]`);
  const name = nameEl.value.trim();
  const body = bodyEl.value.trim();
  if (!name) { toast('Please enter your name', 'err'); return; }
  if (!body) { toast('Comment cannot be empty', 'err'); return; }
  try {
    await api('POST', '/comments', { note_id: noteId, name, body });
    savedName = name;
    localStorage.setItem('itu_board_name', name);
    bodyEl.value = '';
    updateCharCount(noteId);
    await loadComments(noteId);
    toast('Comment posted ✔', 'ok');
  } catch (err) {
    toast('Error posting comment', 'err');
  }
}

function openEditComment(id, noteId, body) {
  const commentEl = document.getElementById(`comment-${id}`);
  const bodyEl    = document.getElementById(`cbody-${id}`);
  bodyEl.innerHTML = `
    <textarea class="comment-edit-area" id="cedit-${id}" rows="3" maxlength="500">${escHtml(body)}</textarea>
    <div class="comment-edit-btns">
      <button class="btn btn-primary" data-action="save-comment" data-id="${id}" data-note-id="${noteId}">Save</button>
      <button class="btn btn-secondary" data-action="cancel-edit-comment" data-id="${id}" data-body="${escHtml(body)}">Cancel</button>
    </div>`;
}

async function saveEditComment(id, noteId) {
  const body = document.getElementById(`cedit-${id}`).value.trim();
  if (!body) { toast('Comment cannot be empty', 'err'); return; }
  try {
    await api('PATCH', `/comments/${id}`, { body });
    await loadComments(noteId);
    toast('Comment updated ✔', 'ok');
  } catch (err) {
    toast('Error updating comment', 'err');
  }
}

function cancelEditComment(id, body) {
  const bodyEl = document.getElementById(`cbody-${id}`);
  bodyEl.innerHTML = escHtml(body);
}

function updateCharCount(noteId) {
  const area  = document.querySelector(`.comment-body-input[data-note-id="${noteId}"]`);
  const count = document.getElementById(`cc-${noteId}`);
  if (area && count) count.textContent = `${area.value.length}/500`;
}

/* ── PRINT ───────────────────────────────────────────────── */

function printNote(noteId) {
  const noteEl  = document.getElementById(`note-${noteId}`);
  if (!noteEl) return;
  const subject = noteEl.querySelector('.note-subject')?.textContent || '';
  const author  = noteEl.querySelector('.note-author')?.textContent  || '';
  const body    = noteEl.querySelector('.note-body')?.textContent    || '';
  const expiry  = noteEl.querySelector('.note-expiry')?.textContent  || '';
  const w = window.open('', '_blank', 'width=640,height=560');
  w.document.write(`<!DOCTYPE html><html><head><title>Note — ITU Board</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    body{font-family:'IBM Plex Sans',sans-serif;padding:40px 50px;background:#fff;color:#1a1a1a;}
    h1{font-size:20px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;}
    .meta{font-size:12px;color:#999;margin-bottom:18px;}
    .body{font-size:14px;line-height:1.7;white-space:pre-wrap;}
    .foot{margin-top:28px;padding-top:12px;border-top:1px solid #ddd;font-size:11px;color:#bbb;}
    @media print{@page{margin:20mm;}}
  </style></head><body>
  <h1>${escHtml(subject)}</h1>
  <div class="meta">${escHtml(author)}</div>
  <div class="body">${escHtml(body)}</div>
  <div class="foot">${escHtml(expiry)} · ITU Notice Board — QEQM Margate · tinyurl.com/QNB-01</div>
  </body></html>`);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

/* ── ARCHIVE ─────────────────────────────────────────────── */

function toggleArchive() {
  showArchive = !showArchive;
  document.getElementById('archiveBanner').classList.toggle('hidden', !showArchive);
  document.getElementById('archiveBtn').classList.toggle('active', showArchive);
  document.getElementById('board').innerHTML = '<div class="board-message"><div class="spinner"></div><p>Loading…</p></div>';
  loadNotes();
}

/* ── OVERLAY HELPERS ─────────────────────────────────────── */

function closeOverlay(id) {
  document.getElementById(id).classList.remove('open');
  pendingDelId    = null;
  pendingStickyId = null;
  pendingEditId   = null;
}

/* ── TOAST ───────────────────────────────────────────────── */

let toastTimer;
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  el.textContent  = msg;
  el.className    = `toast ${type} show`;
  toastTimer      = setTimeout(() => { el.className = `toast ${type}`; }, 3200);
}

/* ── EVENT DELEGATION ────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

  // Patient warning dismiss
  const patientWarn = document.getElementById('patientWarn');
  if (sessionStorage.getItem('pw_dismissed')) patientWarn.classList.add('hidden');
  document.getElementById('patientWarnClose').addEventListener('click', () => {
    patientWarn.classList.add('hidden');
    sessionStorage.setItem('pw_dismissed', '1');
  });

  // Archive back button — explicitly reset to live view
  document.getElementById('archiveBackBtn').addEventListener('click', () => {
    showArchive = false;
    document.getElementById('archiveBanner').classList.add('hidden');
    document.getElementById('archiveBtn').classList.remove('active');
    document.getElementById('board').innerHTML = '<div class="board-message"><div class="spinner"></div><p>Loading…</p></div>';
    loadNotes();
  });

  // Enforce initial hidden state via JS regardless of CSS cache
  document.getElementById('archiveBanner').classList.add('hidden');
  document.getElementById('adminChip').classList.add('hidden');

  // Header buttons
  document.getElementById('addBtn').addEventListener('click', openAddNote);
  document.getElementById('archiveBtn').addEventListener('click', toggleArchive);
  document.getElementById('adminBtn').addEventListener('click', toggleAdmin);

  // Add note overlay
  document.getElementById('addCancelBtn').addEventListener('click', () => closeOverlay('addOverlay'));
  document.getElementById('addSubmitBtn').addEventListener('click', submitNote);

  // Deletion request overlay
  document.getElementById('delCancelBtn').addEventListener('click', () => closeOverlay('delOverlay'));
  document.getElementById('delSubmitBtn').addEventListener('click', submitDelRequest);

  // Sticky request overlay
  document.getElementById('stickyCancelBtn').addEventListener('click', () => closeOverlay('stickyOverlay'));
  document.getElementById('stickySubmitBtn').addEventListener('click', submitStickyRequest);

  // Edit note overlay
  document.getElementById('editCancelBtn').addEventListener('click', () => closeOverlay('editOverlay'));
  document.getElementById('editSubmitBtn').addEventListener('click', submitEditNote);

  // Close overlays on backdrop click
  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
  });

});

// Board click delegation
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id     = btn.dataset.id;

  switch (action) {
    case 'toggle-comments':  toggleComments(id); break;
    case 'submit-comment':   submitComment(id);  break;
    case 'open-del':         openDelRequest(id); break;
    case 'open-sticky':      openStickyRequest(id); break;
    case 'open-edit':        openEditNote(id, btn.dataset.subject, btn.dataset.body); break;
    case 'admin-delete':     adminDelete(id); break;
    case 'make-sticky':      adminMakeSticky(id); break;
    case 'unsticky':         adminUnsticky(id); break;
    case 'print':            printNote(id); break;
    case 'edit-comment':     openEditComment(id, btn.dataset.noteId, btn.dataset.body); break;
    case 'save-comment':     saveEditComment(id, btn.dataset.noteId); break;
    case 'cancel-edit-comment': cancelEditComment(id, btn.dataset.body); break;
    case 'retry':            loadNotes(); break;
  }
});

// Input delegation for comment char count and name saving
document.addEventListener('input', e => {
  if (e.target.classList.contains('comment-name-input')) {
    savedName = e.target.value;
    localStorage.setItem('itu_board_name', e.target.value);
  }
  if (e.target.classList.contains('comment-body-input')) {
    updateCharCount(e.target.dataset.noteId);
  }
});

// Enter to submit in overlays
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  }
});

/* ── BOOT ────────────────────────────────────────────────── */

loadNotes();
setInterval(() => {
  const anyOverlayOpen    = document.querySelector('.overlay.open');
  const anyCommentOpen    = document.querySelector('.comments-panel.open');
  const anyEditInProgress = document.querySelector('.comment-edit-area');
  if (anyOverlayOpen || anyCommentOpen || anyEditInProgress) return;
  loadNotes();
}, 60000);
