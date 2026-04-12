/* ── CONFIGURATION ── */
const SUPABASE_URL      = 'https://oyvfhuielzejcyqyxtld.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__H3OrPNgHWsgoU2KLSc2Cg_jTRe947E';
const ADMIN_PASSWORD    = 'QEQM_ITU_2024';
const MAX_COMMENT       = 180;
const EDIT_WINDOW_MS    = 15 * 60 * 1000;

if (SUPABASE_URL.includes('YOUR_')) document.getElementById('setupWarn').style.display = 'block';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let isAdmin         = false;
let showArchive     = false;
let pendingDelId    = null;
let pendingStickyId = null;
let pendingEditId   = null;
let savedName       = localStorage.getItem('itu_commenter_name') || '';

/* ── HELPERS ── */
const escHtml     = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtDate     = d => new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
const fmtTime     = d => new Date(d).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const fmtDateTime = d => `${fmtDate(d)} ${fmtTime(d)}`;
const daysLeft    = exp => Math.ceil((new Date(exp) - new Date()) / 86400000);
const retentionClass = {2:'note-2day',4:'note-4day',7:'note-1week',14:'note-2week',30:'note-1month'};

function linkify(text) {
  return text.replace(/(https?:\/\/[^\s<>"]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="linkify-link">$1</a>');
}

/* ── BUILD NOTE CARD HTML ── */
function buildNoteCard(n, countMap, lastMap) {
  const cls    = retentionClass[n.retention_days] || 'note-1week';
  const days   = daysLeft(n.expires_at);
  const soon   = !showArchive && !n.sticky && days <= 2;
  const cCount = countMap[n.id] || 0;
  const hasC   = cCount > 0;

  const expiryText = n.sticky
    ? 'Permanent note'
    : showArchive
    ? `Archived · was due ${fmtDate(n.expires_at)}`
    : days <= 0  ? '⚠️ Expires today!'
    : days === 1 ? '⚠️ Expires tomorrow'
    : `Expires ${fmtDate(n.expires_at)}`;

  const stickyStripe   = n.sticky ? `<div class="sticky-stripe"></div>` : '';
  const stickyBadge    = n.sticky ? `<div class="sticky-badge">★ Permanent</div>` : '';
  const stickyReqBadge = n.sticky_requested && !n.sticky ? `<div class="sticky-req-badge">★ Sticky requested</div>` : '';
  const delBadge       = n.deletion_requested ? `<div class="del-badge">🗑 Deletion requested</div>` : '';
  const editedBadge    = n.edited ? `<div class="edited-badge">✎ Edited</div>` : '';

  const ageMs    = Date.now() - new Date(n.created_at).getTime();
  const minsLeft = Math.ceil((EDIT_WINDOW_MS - ageMs) / 60000);

  // All buttons use data-action and data-id — no onclick
  const editBtn = (ageMs < EDIT_WINDOW_MS)
    ? `<button class="note-btn edit-btn" id="editbtn-${n.id}" data-action="edit-note" data-id="${n.id}" data-created="${n.created_at}" title="Edit this note">✎ ${minsLeft}m</button>` : '';

  const stickyReqBtn = (!n.sticky && !n.sticky_requested && !isAdmin)
    ? `<button class="note-btn sticky-req" data-action="req-sticky" data-id="${n.id}" title="Request permanent note">★</button>` : '';
  const delBtn = (!n.deletion_requested && !isAdmin)
    ? `<button class="note-btn del-req" data-action="req-del" data-id="${n.id}" title="Request deletion">✕</button>` : '';

  const adminStickyBtn   = isAdmin && !n.sticky
    ? `<button class="note-btn sticky-req" data-action="admin-sticky" data-id="${n.id}" title="Make permanent">★</button>` : '';
  const adminUnStickyBtn = isAdmin && n.sticky
    ? `<button class="note-btn sticky-req" data-action="admin-unsticky" data-id="${n.id}" title="Remove permanent status">☆</button>` : '';
  const adminDelBtn = isAdmin
    ? `<button class="note-btn del-req" data-action="admin-del" data-id="${n.id}" title="Delete note">🗑️</button>` : '';

  const badgeLabel = hasC ? `💬 ${cCount} comment${cCount>1?'s':''}` : `💬 Comment`;
  const badgeLast  = hasC ? `<span class="cb-last">Last: ${fmtDateTime(lastMap[n.id])}</span>` : '';

  const noteAction = n.sticky ? 'toggle-sticky' : 'toggle-comments';
  const chevronClass = n.sticky ? 'sticky-chevron' : 'sticky-chevron sticky-chevron-hidden';

  return `
    <div class="note-wrap${n.sticky?' is-sticky':''}" id="wrap-${n.id}">
      <div class="note ${cls}${n.sticky?' sticky-collapsed':''}" id="note-${n.id}" data-action="${noteAction}" data-id="${n.id}">
        ${stickyStripe}
        <div class="note-top">
          <div class="note-subject">${escHtml(n.subject)}<span class="${chevronClass}">▾</span></div>
          <div class="note-author">${escHtml(n.name)} · ${fmtDate(n.created_at)}</div>
        </div>
        <div class="note-body">${linkify(escHtml(n.body).replace(/\n/g,'<br>'))}</div>
        <div class="note-footer">
          <div>
            <div class="note-expiry${soon?' warn':''}">${expiryText}</div>
            ${stickyBadge}${stickyReqBadge}${delBadge}${editedBadge}
          </div>
          <div class="note-actions">
            <span class="comment-badge ${hasC?'has-comments':''}" id="cbadge-${n.id}"
              data-action="${n.sticky?'expand-comment':'toggle-comments'}" data-id="${n.id}">
              ${badgeLabel}${badgeLast}
            </span>
            <button class="note-btn" data-action="print-note" data-id="${n.id}" title="Print this note">🖨️</button>
            ${editBtn}
            ${stickyReqBtn}${delBtn}
            ${adminStickyBtn}${adminUnStickyBtn}${adminDelBtn}
          </div>
        </div>
      </div>
      <div class="comments-panel" id="cpanel-${n.id}">
        <div class="comments-list" id="clist-${n.id}">
          <div class="comments-loading">Loading…</div>
        </div>
        <div class="comment-form">
          <input type="text" id="cname-${n.id}" placeholder="Your name *" maxlength="80"
            value="${escHtml(savedName)}" data-note-id="${n.id}" class="comment-name-input">
          <textarea id="cbody-${n.id}" placeholder="Add a comment… (max 180 characters)"
            maxlength="${MAX_COMMENT}" data-note-id="${n.id}" class="comment-body-input"></textarea>
          <div class="char-count" id="ccount-${n.id}">0 / ${MAX_COMMENT}</div>
          <div class="comment-form-footer">
            <button class="btn-cancel-comment" data-action="close-comments" data-id="${n.id}">Cancel</button>
            <button class="btn-comment" data-action="post-comment" data-id="${n.id}">Post Comment</button>
          </div>
        </div>
      </div>
    </div>`;
}

/* ── LOAD NOTES ── */
async function loadNotes() {
  await sb.from('notes').update({archived:true}).eq('archived',false).eq('sticky',false).lt('expires_at',new Date().toISOString());

  const board = document.getElementById('board');

  if (showArchive) {
    const {data:notes, error} = await sb.from('notes').select('*').eq('archived',true).order('created_at',{ascending:false});
    if (error) { board.innerHTML=`<div class="board-message"><div class="icon">⚠️</div><p>Could not load notes.</p></div>`; return; }
    if (!notes||!notes.length) { board.innerHTML=`<div class="board-message"><div class="icon">📦</div><p>No archived notes yet.</p></div>`; return; }
    const {countMap,lastMap} = await getCommentMaps(notes.map(n=>n.id));
    board.innerHTML = notes.map(n => buildNoteCard(n,countMap,lastMap)).join('');
    return;
  }

  const [{data:stickyNotes},{data:regularNotes}] = await Promise.all([
    sb.from('notes').select('*').eq('sticky',true).order('created_at',{ascending:false}),
    sb.from('notes').select('*').eq('archived',false).eq('sticky',false).order('created_at',{ascending:false})
  ]);

  const allNotes = [...(stickyNotes||[]), ...(regularNotes||[])];

  if (!allNotes.length) {
    board.innerHTML=`<div class="board-message"><div class="icon">📋</div><p>No notes added yet — be the first!</p></div>`;
    return;
  }

  const {countMap,lastMap} = await getCommentMaps(allNotes.map(n=>n.id));

  let html = '';
  if (stickyNotes && stickyNotes.length) {
    html += `<div class="sticky-divider">★ Permanent Notes</div>`;
    html += stickyNotes.map(n => buildNoteCard(n,countMap,lastMap)).join('');
  }
  if (regularNotes && regularNotes.length) {
    if (stickyNotes && stickyNotes.length) html += `<div class="regular-divider">Board Notes</div>`;
    html += regularNotes.map(n => buildNoteCard(n,countMap,lastMap)).join('');
  }
  board.innerHTML = html;
}

/* ── COMMENT MAPS ── */
async function getCommentMaps(noteIds) {
  if (!noteIds.length) return {countMap:{},lastMap:{}};
  const {data:rows} = await sb.from('comments').select('note_id,created_at').in('note_id',noteIds).order('created_at',{ascending:true});
  const countMap={}, lastMap={};
  (rows||[]).forEach(r => { countMap[r.note_id]=(countMap[r.note_id]||0)+1; lastMap[r.note_id]=r.created_at; });
  return {countMap,lastMap};
}

/* ── TOGGLE STICKY EXPAND ── */
function toggleStickyExpand(noteId) {
  const noteEl = document.getElementById(`note-${noteId}`);
  const panel  = document.getElementById(`cpanel-${noteId}`);
  if (noteEl.classList.contains('sticky-collapsed')) {
    noteEl.classList.remove('sticky-collapsed');
  } else {
    noteEl.classList.add('sticky-collapsed');
    panel.classList.remove('open');
  }
}

async function expandAndComment(noteId) {
  document.getElementById(`note-${noteId}`).classList.remove('sticky-collapsed');
  await toggleComments(noteId);
}

/* ── TOGGLE COMMENTS ── */
async function toggleComments(noteId) {
  const panel  = document.getElementById(`cpanel-${noteId}`);
  const isOpen = panel.classList.contains('open');
  document.querySelectorAll('.comments-panel.open').forEach(p=>p.classList.remove('open'));
  if (!isOpen) {
    panel.classList.add('open');
    await loadComments(noteId);
    const nameEl = document.getElementById(`cname-${noteId}`);
    const bodyEl = document.getElementById(`cbody-${noteId}`);
    setTimeout(()=>(nameEl.value?bodyEl:nameEl).focus(),50);
  }
}

/* ── LOAD COMMENTS ── */
async function loadComments(noteId) {
  const list = document.getElementById(`clist-${noteId}`);
  if (!list) return;
  const {data,error} = await sb.from('comments').select('*').eq('note_id',noteId).order('created_at',{ascending:true});
  if (error||!data||!data.length) {
    list.innerHTML=`<div class="comments-empty">No comments yet — be the first to reply.</div>`;
    return;
  }
  list.innerHTML = data.map(c => {
    const cAgeMs    = Date.now() - new Date(c.created_at).getTime();
    const cMinsLeft = Math.ceil((EDIT_WINDOW_MS - cAgeMs) / 60000);
    const cEditBtn  = (cAgeMs < EDIT_WINDOW_MS)
      ? `<button class="note-btn edit-btn edit-btn-comment" id="ceditbtn-${c.id}"
           data-action="edit-comment" data-comment-id="${c.id}" data-note-id="${noteId}"
           data-created="${c.created_at}">✎ ${cMinsLeft}m</button>` : '';
    const cEdited = c.edited ? `<span class="edited-marker">✎ edited</span>` : '';
    return `
      <div class="comment-item" id="citem-${c.id}">
        <div class="comment-meta">
          <span>${escHtml(c.name)}${cEdited}</span>
          <div class="comment-meta-right">
            ${cEditBtn}
            <span class="ctime">${fmtDateTime(c.created_at)}</span>
          </div>
        </div>
        <div class="comment-text" id="ctext-${c.id}">${linkify(escHtml(c.body).replace(/\n/g,'<br>'))}</div>
      </div>`;
  }).join('');
  list.scrollTop = list.scrollHeight;
}

/* ── CHAR COUNT ── */
function updateCharCount(noteId) {
  const body    = document.getElementById(`cbody-${noteId}`);
  const counter = document.getElementById(`ccount-${noteId}`);
  if (!body||!counter) return;
  const len = body.value.length;
  counter.textContent = `${len} / ${MAX_COMMENT}`;
  counter.className   = `char-count${len>MAX_COMMENT-20?' warn':''}`;
}

/* ── SUBMIT COMMENT ── */
async function submitComment(noteId) {
  const name = document.getElementById(`cname-${noteId}`).value.trim();
  const body = document.getElementById(`cbody-${noteId}`).value.trim();
  if (!name){toast('Please enter your name','err');return;}
  if (!body){toast('Please write a comment','err');return;}
  if (body.length>MAX_COMMENT){toast(`Max ${MAX_COMMENT} characters`,'err');return;}
  const {error}=await sb.from('comments').insert([{note_id:noteId,name,body}]);
  if (error){toast('Error: '+error.message,'err');return;}
  document.getElementById(`cbody-${noteId}`).value='';
  updateCharCount(noteId);
  toast('Comment posted','ok');
  await loadComments(noteId);
  const {data}=await sb.from('comments').select('created_at').eq('note_id',noteId).order('created_at',{ascending:true});
  const badge=document.getElementById(`cbadge-${noteId}`);
  if (badge&&data){
    const c=data.length; const last=data[c-1]?.created_at;
    badge.className='comment-badge has-comments';
    badge.innerHTML=`💬 ${c} comment${c!==1?'s':''}<span class="cb-last">Last: ${fmtDateTime(last)}</span>`;
  }
}

/* ── PRINT ── */
function printNote(noteId) {
  const wrap    = document.getElementById(`wrap-${noteId}`);
  const subject = wrap.querySelector('.note-subject').childNodes[0].nodeValue.trim();
  const author  = wrap.querySelector('.note-author').innerHTML;
  const body    = wrap.querySelector('.note-body').innerHTML;
  const expiry  = wrap.querySelector('.note-expiry').textContent;
  const w = window.open('','_blank','width=620,height=560');
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
  <h1>${subject}</h1><div class="meta">${author}</div>
  <div class="body">${body}</div>
  <div class="foot">${expiry} · ITU Notice Board — QEQM Margate · tinyurl.com/qitu-nobo</div>
  </body></html>`);
  w.document.close();
  w.onload=()=>{w.focus();w.print();};
}

/* ── ARCHIVE ── */
function toggleArchive() {
  showArchive=!showArchive;
  document.getElementById('archiveBanner').style.display=showArchive?'flex':'none';
  document.getElementById('archiveBtn').classList.toggle('active',showArchive);
  document.getElementById('board').innerHTML='<div class="board-message"><div class="spinner"></div><p>Loading…</p></div>';
  loadNotes();
}

/* ── ADMIN ── */
function toggleAdmin() {
  if (isAdmin){
    isAdmin=false; document.getElementById('adminChip').style.display='none';
    toast('Admin mode off','ok'); loadNotes(); return;
  }
  const pwd=prompt('Enter admin password:');
  if (pwd===null) return;
  if (pwd===ADMIN_PASSWORD){
    isAdmin=true; document.getElementById('adminChip').style.display='inline-block';
    toast('Admin mode enabled ✔','ok'); loadNotes();
  } else { toast('Incorrect password','err'); }
}

async function adminDelete(id) {
  if (!confirm('Permanently delete this note and all its comments?')) return;
  await sb.from('comments').delete().eq('note_id',id);
  const {error}=await sb.from('notes').delete().eq('id',id);
  if (error){toast('Error: '+error.message,'err');return;}
  toast('Note deleted','ok'); loadNotes();
}

async function adminMakeSticky(id) {
  const {error}=await sb.from('notes').update({sticky:true,sticky_requested:false}).eq('id',id);
  if (error){toast('Error: '+error.message,'err');return;}
  toast('Note is now permanent ★','ok'); loadNotes();
}

async function adminUnsticky(id) {
  if (!confirm('Remove permanent status from this note? It will expire normally.')) return;
  const {error}=await sb.from('notes').update({sticky:false}).eq('id',id);
  if (error){toast('Error: '+error.message,'err');return;}
  toast('Permanent status removed','ok'); loadNotes();
}

/* ── ADD NOTE ── */
function openAdd() {
  document.getElementById('addOverlay').classList.add('open');
  setTimeout(()=>document.getElementById('fName').focus(),50);
}

async function submitNote() {
  const name      = document.getElementById('fName').value.trim();
  const subject   = document.getElementById('fSubject').value.trim();
  const body      = document.getElementById('fBody').value.trim();
  const retention = parseInt(document.getElementById('fRetention').value);
  if (!name||!subject||!body){toast('Please complete all required fields','err');return;}
  const expires=new Date();
  expires.setDate(expires.getDate()+retention);
  const {error}=await sb.from('notes').insert([{
    name,subject,body,retention_days:retention,
    expires_at:expires.toISOString(),
    archived:false,sticky:false,sticky_requested:false,sticky_reason:null,
    deletion_requested:false,deletion_reason:null
  }]);
  if (error){toast('Error: '+error.message,'err');return;}
  ['fName','fSubject','fBody'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('fRetention').value='7';
  closeOverlay('addOverlay'); toast('Note added','ok'); loadNotes();
}

/* ── DELETION REQUEST ── */
function openDelRequest(id) {
  pendingDelId=id;
  document.getElementById('fReason').value='';
  document.getElementById('delOverlay').classList.add('open');
  setTimeout(()=>document.getElementById('fReason').focus(),50);
}

async function submitDelRequest() {
  const reason=document.getElementById('fReason').value.trim();
  if (!reason){toast('Please give a reason','err');return;}
  const {error}=await sb.from('notes').update({deletion_requested:true,deletion_reason:reason}).eq('id',pendingDelId);
  if (error){toast('Error: '+error.message,'err');return;}
  closeOverlay('delOverlay'); toast('Deletion request sent to admin','ok'); loadNotes();
}

/* ── STICKY REQUEST ── */
function openStickyRequest(id) {
  pendingStickyId=id;
  document.getElementById('fStickyReason').value='';
  document.getElementById('stickyOverlay').classList.add('open');
  setTimeout(()=>document.getElementById('fStickyReason').focus(),50);
}

async function submitStickyRequest() {
  const reason=document.getElementById('fStickyReason').value.trim();
  if (!reason){toast('Please give a reason','err');return;}
  const {error}=await sb.from('notes').update({sticky_requested:true,sticky_reason:reason}).eq('id',pendingStickyId);
  if (error){toast('Error: '+error.message,'err');return;}
  closeOverlay('stickyOverlay'); toast('Sticky request sent to admin','ok'); loadNotes();
}

/* ── EDIT NOTE ── */
function openEditNote(id) {
  pendingEditId=id;
  const wrap    = document.getElementById(`wrap-${id}`);
  const subject = wrap.querySelector('.note-subject').childNodes[0].nodeValue.trim();
  const bodyEl  = wrap.querySelector('.note-body');
  const bodyText= bodyEl.innerText||bodyEl.textContent;
  document.getElementById('eSubject').value=subject;
  document.getElementById('eBody').value=bodyText;
  document.getElementById('editOverlay').classList.add('open');
  setTimeout(()=>document.getElementById('eSubject').focus(),50);
}

async function submitEditNote() {
  const subject=document.getElementById('eSubject').value.trim();
  const body   =document.getElementById('eBody').value.trim();
  if (!subject||!body){toast('Please complete all fields','err');return;}
  const {error}=await sb.from('notes').update({subject,body,edited:true,edited_at:new Date().toISOString()}).eq('id',pendingEditId);
  if (error){toast('Error: '+error.message,'err');return;}
  closeOverlay('editOverlay'); toast('Note updated','ok'); loadNotes();
}

/* ── EDIT COMMENT ── */
function openEditComment(commentId, noteId) {
  const textEl=document.getElementById(`ctext-${commentId}`);
  if (!textEl) return;
  const currentText=textEl.innerText||textEl.textContent;
  textEl.innerHTML=`
    <textarea class="comment-edit-area" id="cedit-${commentId}" maxlength="${MAX_COMMENT}">${escHtml(currentText)}</textarea>
    <div class="comment-edit-actions">
      <button class="btn-cancel-comment" data-action="cancel-edit-comment" data-comment-id="${commentId}" data-note-id="${noteId}">Cancel</button>
      <button class="btn-save-comment" data-action="save-edit-comment" data-comment-id="${commentId}" data-note-id="${noteId}">Save</button>
    </div>`;
  const ta=document.getElementById(`cedit-${commentId}`);
  ta.focus(); ta.selectionStart=ta.value.length;
}

async function submitEditComment(commentId, noteId) {
  const ta  =document.getElementById(`cedit-${commentId}`);
  const body=ta?ta.value.trim():'';
  if (!body){toast('Comment cannot be empty','err');return;}
  if (body.length>MAX_COMMENT){toast(`Max ${MAX_COMMENT} characters`,'err');return;}
  const {error}=await sb.from('comments').update({body,edited:true,edited_at:new Date().toISOString()}).eq('id',commentId);
  if (error){toast('Error: '+error.message,'err');return;}
  toast('Comment updated','ok'); loadComments(noteId);
}

/* ── COUNTDOWN TICKER ── */
setInterval(() => {
  document.querySelectorAll('[id^="editbtn-"], [id^="ceditbtn-"]').forEach(btn => {
    if (!btn.dataset.created) return;
    const ageMs=Date.now()-new Date(btn.dataset.created).getTime();
    const mins =Math.ceil((EDIT_WINDOW_MS-ageMs)/60000);
    if (mins<=0){btn.remove();}else{btn.textContent=`✎ ${mins}m`;}
  });
}, 30000);

/* ── OVERLAY HELPERS ── */
function closeOverlay(id){
  document.getElementById(id).classList.remove('open');
  pendingDelId=null; pendingStickyId=null; pendingEditId=null;
}

/* ── TOAST ── */
let toastTimer;
function toast(msg,type='ok'){
  const el=document.getElementById('toast');
  clearTimeout(toastTimer);
  el.textContent=msg; el.className=`toast ${type} show`;
  toastTimer=setTimeout(()=>el.className=`toast ${type}`,3200);
}

/* ── EVENT DELEGATION — single listener on document handles all dynamic clicks ── */
document.addEventListener('click', async e => {
  // Walk up to find the element with a data-action
  const el = e.target.closest('[data-action]');
  if (!el) return;

  const action = el.dataset.action;
  const id     = el.dataset.id;

  // Stop note expand/collapse from firing when clicking buttons inside a note
  if (action !== 'toggle-comments' && action !== 'toggle-sticky' && action !== 'expand-comment') {
    e.stopPropagation();
  }

  switch (action) {
    case 'toggle-comments':   await toggleComments(id);      break;
    case 'toggle-sticky':     toggleStickyExpand(id);        break;
    case 'expand-comment':    await expandAndComment(id);    break;
    case 'print-note':        printNote(id);                 break;
    case 'edit-note':         openEditNote(id);              break;
    case 'req-del':           openDelRequest(id);            break;
    case 'req-sticky':        openStickyRequest(id);         break;
    case 'admin-sticky':      await adminMakeSticky(id);     break;
    case 'admin-unsticky':    await adminUnsticky(id);       break;
    case 'admin-del':         await adminDelete(id);         break;
    case 'post-comment':      await submitComment(id);       break;
    case 'edit-comment':
      openEditComment(el.dataset.commentId, el.dataset.noteId);
      break;
    case 'save-edit-comment':
      await submitEditComment(el.dataset.commentId, el.dataset.noteId);
      break;
    case 'close-comments':
      document.querySelectorAll('.comments-panel.open').forEach(p=>p.classList.remove('open'));
      break;
    case 'cancel-edit-comment':
      await loadComments(el.dataset.noteId);
      break;
  }
});

/* ── STATIC EVENT LISTENERS ── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('archiveBtn').addEventListener('click', toggleArchive);
  document.getElementById('adminBtn').addEventListener('click', toggleAdmin);
  document.getElementById('addBtn').addEventListener('click', openAdd);
  document.getElementById('archiveBackBtn').addEventListener('click', toggleArchive);
  document.getElementById('addCancelBtn').addEventListener('click', () => closeOverlay('addOverlay'));
  document.getElementById('addSubmitBtn').addEventListener('click', submitNote);
  document.getElementById('delCancelBtn').addEventListener('click', () => closeOverlay('delOverlay'));
  document.getElementById('delSubmitBtn').addEventListener('click', submitDelRequest);
  document.getElementById('stickyCancelBtn').addEventListener('click', () => closeOverlay('stickyOverlay'));
  document.getElementById('stickySubmitBtn').addEventListener('click', submitStickyRequest);
  document.getElementById('editCancelBtn').addEventListener('click', () => closeOverlay('editOverlay'));
  document.getElementById('editSubmitBtn').addEventListener('click', submitEditNote);

  // Close overlays on backdrop click
  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target===o) o.classList.remove('open'); });
  });
});

/* ── INPUT DELEGATION ── */
document.addEventListener('input', e => {
  if (e.target.classList.contains('comment-name-input')) {
    savedName = e.target.value;
    localStorage.setItem('itu_commenter_name', e.target.value);
  }
  if (e.target.classList.contains('comment-body-input')) {
    updateCharCount(e.target.dataset.noteId);
  }
});

/* ── BOOT ── */
loadNotes();
setInterval(() => {
  const anyOverlayOpen    = document.querySelector('.overlay.open');
  const anyCommentOpen    = document.querySelector('.comments-panel.open');
  const anyEditInProgress = document.querySelector('.comment-edit-area');
  if (anyOverlayOpen||anyCommentOpen||anyEditInProgress) return;
  loadNotes();
}, 60000);
