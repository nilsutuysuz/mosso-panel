/* Mosso Sigorta – Acente Paneli
 * Local-first single page app. Records live in localStorage, documents in IndexedDB.
 * Data model mirrors REQUIREMENTS.md §6 so it can move to a hosted DB unchanged. */
'use strict';

/* ============================== Constants ============================== */

const DB_KEY = 'mosso_panel_v1';

const BRANCHES = ['Trafik', 'Kasko', 'DASK', 'Konut', 'İşyeri', 'Tamamlayıcı Sağlık', 'Özel Sağlık',
  'Yabancı Sağlık', 'Ferdi Kaza', 'Seyahat Sağlık', 'Hayat', 'Nakliyat', 'Sorumluluk', 'Diğer'];

const DEFAULT_COMPANIES = ['Allianz', 'Anadolu Sigorta', 'AXA', 'Sompo', 'HDI', 'Mapfre', 'Türkiye Sigorta',
  'Ray Sigorta', 'Neova', 'Quick Sigorta', 'Doğa Sigorta', 'Ankara Sigorta', 'Unico', 'Bereket Sigorta',
  'Hepiyi', 'Corpus', 'Acıbadem Sigorta', 'Türk Nippon', 'Magdeburger', 'Zurich'];

const DEFAULT_RATES = { 'Trafik': 8, 'Kasko': 15, 'DASK': 20, 'Konut': 20, 'İşyeri': 20, 'Tamamlayıcı Sağlık': 15,
  'Özel Sağlık': 15, 'Yabancı Sağlık': 20, 'Ferdi Kaza': 20, 'Seyahat Sağlık': 25, 'Hayat': 10, 'Nakliyat': 15,
  'Sorumluluk': 15, 'Diğer': 10 };

const QUOTE_STAGES = [
  ['yeni', 'Yeni talep'], ['bilgi', 'Bilgi bekleniyor'], ['hazirlaniyor', 'Teklif hazırlanıyor'],
  ['gonderildi', 'Müşteriye gönderildi'], ['kazanildi', 'Kazanıldı'], ['kaybedildi', 'Kaybedildi']];
const STAGE_LABEL = Object.fromEntries(QUOTE_STAGES);
const OPEN_STAGES = ['yeni', 'bilgi', 'hazirlaniyor', 'gonderildi'];

const CLAIM_STAGES = [['bildirildi', 'Bildirildi'], ['eksper', 'Eksper incelemesi'], ['evrak', 'Evrak bekleniyor'],
  ['odeme', 'Ödeme aşamasında'], ['kapandi', 'Kapandı']];
const CLAIM_LABEL = Object.fromEntries(CLAIM_STAGES);

const SOURCES = ['WhatsApp', 'Telefon', 'Web sitesi', 'Referans', 'Yenileme', 'Yüz yüze', 'Instagram', 'Diğer'];
const LOST_REASONS = ['Fiyat yüksek', 'Başka acenteden yaptırdı', 'Cevap vermedi', 'Vazgeçti', 'Araç/mülk satıldı', 'Diğer'];

const POLICY_STATUS = {
  aktif: ['Aktif', 'green'], bitti: ['Süresi doldu', 'red'], yenilendi: ['Yenilendi', 'blue'],
  iptal: ['İptal', ''], kaybedildi: ['Kaybedildi', ''] };

const PAYMENT = { kart: 'Kredi kartı / şirkete (takip yok)', pesin: 'Peşin – acenteye', taksit: 'Taksitli – acenteye' };

const DEFAULT_TEMPLATES = [
  { id: 't_ren', kind: 'yenileme', name: 'Yenileme hatırlatma',
    text: 'Merhaba {ad},\n{sirket} {brans} poliçenizin{konu_parantez} süresi {bitis} tarihinde doluyor. Kesintisiz devam etmesi için güncel teklifleri hazırlayayım mı?\n\n{acente}' },
  { id: 't_doc', kind: 'evrak', name: 'Bilgi / evrak isteme',
    text: 'Merhaba {ad},\n{brans} teklifinizi hazırlayabilmem için şu bilgilere ihtiyacım var:\n• T.C. kimlik numarası\n• Ruhsat fotoğrafı (araç için)\n• Doğum tarihi\n\nTeşekkürler,\n{acente}' },
  { id: 't_quote', kind: 'teklif', name: 'Teklifleri gönder',
    text: 'Merhaba {ad},\n{brans} için hazırladığım teklifler:\n\n{teklifler}\n\nOnaylarsanız hemen poliçeleştirebilirim. Sorunuz olursa buradayım.\n\n{acente}' },
  { id: 't_issued', kind: 'police', name: 'Poliçe düzenlendi',
    text: 'Merhaba {ad},\n{sirket} {brans} poliçeniz düzenlendi ✅\nPoliçe no: {policeno}\nBitiş: {bitis}\nPrim: {prim}\n\nPoliçe belgesini ayrıca iletiyorum. Hayırlı olsun!\n{acente}' },
  { id: 't_claim', kind: 'hasar', name: 'Hasar durumu',
    text: 'Merhaba {ad},\n{dosya} numaralı hasar dosyanızın güncel durumu: {durum}.\nGelişmeleri size bildirmeye devam edeceğim.\n\n{acente}' },
  { id: 't_pay', kind: 'tahsilat', name: 'Taksit hatırlatma',
    text: 'Merhaba {ad},\n{brans} poliçenizin {vade} vadeli {tutar} tutarındaki taksitini hatırlatmak istedim.\n\nTeşekkürler,\n{acente}' },
  { id: 't_bday', kind: 'dogumgunu', name: 'Doğum günü',
    text: 'Merhaba {ad}, doğum gününüzü kutlar, sağlıklı ve mutlu bir yıl dilerim 🎉\n{acente}' },
  { id: 't_gen', kind: 'genel', name: 'Boş mesaj', text: 'Merhaba {ad},\n\n' },
];

const DEFAULT_SETTINGS = {
  agencyName: 'Mosso Sigorta', ownerName: '', phone: '', renewalWindow: 60, pinHash: '',
  companies: DEFAULT_COMPANIES, rates: DEFAULT_RATES, templates: DEFAULT_TEMPLATES, lastBackupAt: '',
};

/* ============================== Utilities ============================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toISO(new Date());
function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); }
function addMonths(s, n) {
  const d = parseISO(s), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toISO(d);
}
const daysUntil = s => s ? Math.round((parseISO(s) - parseISO(todayStr())) / 864e5) : null;
function fmtDate(s) { if (!s) return '—'; const [y, m, d] = s.slice(0, 10).split('-'); return `${d}.${m}.${y}`; }
function fmtDateTime(s) { if (!s) return ''; const d = new Date(s); return `${fmtDate(toISO(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const moneyFmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const money = n => moneyFmt.format(Number(n) || 0);
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };

function waNumber(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d[0] === '5') d = '90' + d;
  else if (d.length === 11 && d[0] === '0') d = '9' + d;
  return d.length >= 11 ? d : '';
}
function fmtPhone(p) {
  const d = waNumber(p);
  if (d.startsWith('90') && d.length === 12) return `0${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  return p || '';
}
function waLink(phone, text) { const n = waNumber(phone); return n ? `https://wa.me/${n}?text=${encodeURIComponent(text || '')}` : null; }

function daysBadge(days) {
  if (days === null) return '';
  if (days < 0) return `<span class="badge red">${-days} gün geçti</span>`;
  if (days === 0) return '<span class="badge red">Bugün</span>';
  if (days <= 7) return `<span class="badge red">${days} gün</span>`;
  if (days <= 30) return `<span class="badge amber">${days} gün</span>`;
  return `<span class="badge">${days} gün</span>`;
}
const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toLocaleUpperCase('tr-TR')).join('');

function download(name, content, type = 'text/csv;charset=utf-8') {
  const b = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ============================== Storage ============================== */

// Cloud mode (config.js filled in): state comes from the per-user cache + Supabase, see cloud.js.
// Local mode: state lives in this browser's localStorage only.
let state = Cloud.enabled ? migrate({}) : load();

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(DB_KEY)) || {}; } catch (e) { /* first run or blocked storage */ }
  return migrate(s);
}
function migrateSettings(s) {
  const out = { ...DEFAULT_SETTINGS, ...(s || {}) };
  out.rates = { ...DEFAULT_RATES, ...(out.rates || {}) };
  return out;
}
function migrate(s) {
  const out = { customers: [], policies: [], quotes: [], claims: [], tasks: [], notes: [], files: [], log: [], ...s };
  out.settings = migrateSettings(s.settings);
  return out;
}
function save() {
  if (Cloud.enabled) return Cloud.changed();
  try { localStorage.setItem(DB_KEY, JSON.stringify(state)); }
  catch (e) { toast('Kaydedilemedi – tarayıcı depolaması dolu olabilir. Yedek alın.', 'err'); }
}
const isOwner = () => !Cloud.enabled || Cloud.isOwner;
function commit(logText) {
  if (logText) { state.log.unshift({ at: new Date().toISOString(), text: logText }); state.log.length = Math.min(state.log.length, 300); }
  save(); render();
}
const byId = (coll, id) => id ? state[coll].find(x => x.id === id) : null;
function upsert(coll, obj) {
  const i = state[coll].findIndex(x => x.id === obj.id);
  if (i >= 0) state[coll][i] = { ...state[coll][i], ...obj, updatedAt: new Date().toISOString() };
  else state[coll].push({ ...obj, id: obj.id || uid(), createdAt: new Date().toISOString() });
  return i >= 0 ? state[coll][i] : state[coll][state[coll].length - 1];
}
const remove = (coll, id) => { state[coll] = state[coll].filter(x => x.id !== id); };

function addNote(o) { state.notes.unshift({ id: uid(), at: new Date().toISOString(), kind: 'note', ...o }); }

// Documents (PDF, photos) live in IndexedDB because localStorage is limited to ~5 MB.
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('mosso_files', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' }).createIndex('customerId', 'customerId');
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('files', mode);
      const req = fn(t.objectStore('files'));
      t.oncomplete = () => res(req.result);
      t.onerror = () => rej(t.error);
    });
  },
  put: f => idb.run('readwrite', s => s.put(f)),
  del: id => idb.run('readwrite', s => s.delete(id)),
  byCustomer: cid => idb.run('readonly', s => s.index('customerId').getAll(cid)),
  all: () => idb.run('readonly', s => s.getAll()),
  clear: () => idb.run('readwrite', s => s.clear()),
};

// Same interface as Cloud.docs (Supabase Storage), so the UI doesn't care where documents live.
const LocalDocs = {
  list: async ({ customerId, policyId, claimId }) => (await idb.byCustomer(customerId))
    .filter(f => (!policyId || f.policyId === policyId) && (!claimId || f.claimId === claimId)),
  add: (m, blob) => idb.put({ ...m, blob }),
  remove: f => idb.del(f.id),
  url: async f => URL.createObjectURL(f.blob),
  removeCustomer: async cid => { for (const f of await idb.byCustomer(cid)) await idb.del(f.id); },
  clear: () => idb.clear(),
};
const Docs = Cloud.enabled ? Cloud.docs : LocalDocs;

/* ============================== Domain helpers ============================== */

const custOf = o => o ? byId('customers', o.customerId) : null;
const custLabel = c => `${c.name}${c.phone ? ' · ' + fmtPhone(c.phone) : ''}`;
function findCustomer(label) {
  const v = String(label || '').trim();
  if (!v) return null;
  return state.customers.find(c => custLabel(c) === v) || state.customers.find(c => norm(c.name) === norm(v));
}
function findDuplicate(c) {
  const ph = waNumber(c.phone), tc = String(c.tc || '').trim();
  return state.customers.find(x => x.id !== c.id && ((ph && waNumber(x.phone) === ph) || (tc && String(x.tc || '').trim() === tc)));
}

function policyStatus(p) {
  if (['iptal', 'yenilendi', 'kaybedildi'].includes(p.status)) return p.status;
  return daysUntil(p.endDate) < 0 ? 'bitti' : 'aktif';
}
const statusBadge = p => { const [l, c] = POLICY_STATUS[policyStatus(p)]; return `<span class="badge ${c}">${l}</span>`; };

function subjectLabel(branch) {
  if (['Trafik', 'Kasko'].includes(branch)) return ['Plaka', '34 ABC 123'];
  if (['DASK', 'Konut', 'İşyeri'].includes(branch)) return ['Adres / UAVT no', 'Kadıköy, Moda Cd. No:5 / UAVT 1234567890'];
  if (/Sağlık|Kaza|Hayat/.test(branch)) return ['Sigortalı kişi(ler)', 'Kendisi, eşi, 2 çocuk'];
  return ['Sigorta konusu', ''];
}

function renewalList() {
  const win = Number(state.settings.renewalWindow) || 60;
  return state.policies
    .filter(p => !['iptal', 'yenilendi', 'kaybedildi'].includes(p.status) && p.endDate)
    .map(p => ({ p, c: custOf(p), days: daysUntil(p.endDate) }))
    .filter(r => r.days >= -30 && r.days <= win)
    .sort((a, b) => a.days - b.days);
}

function installmentList() {
  const out = [];
  state.policies.forEach(p => (p.installments || []).forEach((inst, i) => {
    if (p.status !== 'iptal') out.push({ p, c: custOf(p), inst, i, days: daysUntil(inst.due) });
  }));
  return out.sort((a, b) => a.inst.due.localeCompare(b.inst.due));
}

function buildInstallments(p, prev = []) {
  if (p.payment === 'kart') return [];
  const n = p.payment === 'pesin' ? 1 : Math.max(1, Math.min(12, parseInt(p.instCount) || 1));
  const total = num(p.premium), each = Math.floor((total / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => ({
    due: addMonths(p.startDate || todayStr(), i),
    amount: i === n - 1 ? Math.round((total - each * (n - 1)) * 100) / 100 : each,
    paid: prev[i]?.paid || false, paidAt: prev[i]?.paidAt || '',
  }));
}

function quoteName(q) { return custOf(q)?.name || q.contactName || 'İsimsiz talep'; }
function quotePhone(q) { return custOf(q)?.phone || q.phone || ''; }
function offersText(q) {
  const offers = (q?.offers || []).filter(o => o.company && num(o.premium));
  if (!offers.length) return '';
  return offers.sort((a, b) => num(a.premium) - num(b.premium))
    .map((o, i) => `${i + 1}) ${o.company}: ${money(o.premium)}${o.note ? ' – ' + o.note : ''}`).join('\n');
}

function upcomingBirthdays(days = 7) {
  const t = parseISO(todayStr());
  return state.customers.filter(c => c.birthDate).map(c => {
    const [, m, d] = c.birthDate.split('-').map(Number);
    let next = new Date(t.getFullYear(), m - 1, d);
    if (next < t) next = new Date(t.getFullYear() + 1, m - 1, d);
    return { c, days: Math.round((next - t) / 864e5) };
  }).filter(x => x.days <= days).sort((a, b) => a.days - b.days);
}

/* ============================== UI infra ============================== */

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.textContent = msg;
  $('#toastRoot').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function openModal({ title, body, foot = '', wide = false, onMount }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Kapat">✕</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  $('#modalRoot').appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  onMount?.(bg, close);
  const first = bg.querySelector('.modal-body input:not([type=hidden]):not([type=checkbox]), .modal-body textarea, .modal-body select');
  if (first && window.innerWidth > 860) first.focus();
  return { el: bg, close };
}
function confirmBox(text, okLabel = 'Evet', danger = true) {
  return new Promise(res => {
    openModal({ title: 'Onay', body: `<p>${esc(text)}</p>`,
      foot: `<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cOk">${esc(okLabel)}</button>`,
      onMount: (el, close) => { $('#cOk', el).onclick = () => { close(); res(true); }; el.addEventListener('click', e => { if (e.target.closest('[data-close]')) res(false); }); } });
  });
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { const m = $$('.modal-bg').pop(); if (m) m.remove(); }
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#globalSearch').focus(); }
});

const custDatalist = () => `<datalist id="custList">${state.customers.map(c => `<option value="${esc(custLabel(c))}">`).join('')}</datalist>`;
const opts = (list, sel) => list.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
const companyList = cur => { const l = [...state.settings.companies]; if (cur && !l.includes(cur)) l.unshift(cur); return l; };
const field = (label, input, cls = '') => `<label class="f ${cls}"><span>${label}</span>${input}</label>`;
const formData = form => Object.fromEntries(new FormData(form).entries());
const emptyState = (icon, text, extra = '') => `<div class="empty"><div class="big">${icon}</div>${text}${extra ? `<div class="mt">${extra}</div>` : ''}</div>`;
const waBtn = (attrs, label = 'WhatsApp', cls = 'sm') => `<button class="btn wa ${cls}" data-act="wa" ${attrs}>💬 ${label}</button>`;

/* ============================== Routing ============================== */

const ui = { // per-view filter state kept across re-renders
  policies: { q: '', branch: '', company: '', status: 'aktif', exp: '' },
  customers: { q: '', type: '' }, quotes: { q: '', branch: '' }, claims: { status: 'open' },
  renewals: { branch: '' }, custTab: 'policies', reports: { range: '12' }, collections: { show: 'open' },
};

const ROUTES = [
  { path: 'dashboard', label: 'Ana Sayfa', icon: '🏠', view: viewDashboard, mobile: true },
  { path: 'renewals', label: 'Yenilemeler', icon: '🔁', view: viewRenewals, mobile: true,
    badge: () => renewalList().filter(r => r.days <= 7).length },
  { path: 'quotes', label: 'Teklifler', icon: '📝', view: viewQuotes, mobile: true,
    badge: () => state.quotes.filter(q => OPEN_STAGES.includes(q.stage) && q.followUp && q.followUp <= todayStr()).length },
  { path: 'customers', label: 'Müşteriler', icon: '👥', view: viewCustomers, mobile: true },
  { path: 'policies', label: 'Poliçeler', icon: '📄', view: viewPolicies },
  { path: 'claims', label: 'Hasarlar', icon: '🛠️', view: viewClaims },
  { path: 'collections', label: 'Tahsilat', icon: '💳', view: viewCollections,
    badge: () => installmentList().filter(x => !x.inst.paid && x.days < 0).length },
  { path: 'tasks', label: 'Görevler', icon: '✅', view: viewTasks,
    badge: () => state.tasks.filter(t => !t.done && t.due && t.due <= todayStr()).length },
  { path: 'reports', label: 'Raporlar', icon: '📊', view: viewReports, ownerOnly: true },
  { path: 'settings', label: 'Ayarlar & Veri', icon: '⚙️', view: viewSettings },
];
const visibleRoutes = () => ROUTES.filter(r => !r.ownerOnly || isOwner());

function currentRoute() {
  const [path = 'dashboard', id] = location.hash.replace(/^#\/?/, '').split('/');
  return { route: visibleRoutes().find(r => r.path === path) || ROUTES[0], id: id && decodeURIComponent(id) };
}

function renderNav(active) {
  const badge = r => { const n = r.badge?.() || 0; return n ? `<span class="badge">${n}</span>` : ''; };
  $('#nav').innerHTML = visibleRoutes().map(r => `<a href="#/${r.path}" class="${r === active ? 'active' : ''}"><span>${r.icon}</span>${r.label}${badge(r)}</a>`).join('');
  const isMore = !active.mobile;
  $('#bottomNav').innerHTML = ROUTES.filter(r => r.mobile).map(r =>
    `<a href="#/${r.path}" class="${r === active ? 'active' : ''}"><span class="ic">${r.icon}</span>${r.label.split(' ')[0]}${badge(r)}</a>`).join('') +
    `<a href="#" data-act="moreMenu" class="${isMore ? 'active' : ''}"><span class="ic">☰</span>Menü</a>`;
  $('#brandName').textContent = state.settings.agencyName || 'Mosso Sigorta';
}

let booted = false;
function render() {
  if (!booted) return;
  const { route, id } = currentRoute();
  renderNav(route);
  const view = $('#view');
  const y = window.scrollY;
  route.view(view, id);
  if (render.lastPath === location.hash) window.scrollTo(0, y); else window.scrollTo(0, 0);
  render.lastPath = location.hash;
}
window.addEventListener('hashchange', render);

/* ============================== Global actions (event delegation) ============================== */

const ACTIONS = {
  wa: d => openComposer({ customerId: d.cust, policyId: d.pol, quoteId: d.quote, claimId: d.claim, inst: d.inst, kind: d.kind }),
  newCustomer: () => openCustomerForm(),
  editCustomer: d => openCustomerForm(d.id),
  openPolicy: d => openPolicyForm(d.id),
  newPolicy: d => openPolicyForm(null, d.cust ? { customerId: d.cust } : {}),
  openQuote: d => openQuoteForm(d.id),
  newQuote: d => openQuoteForm(null, d.cust ? { customerId: d.cust } : {}),
  openClaim: d => openClaimForm(d.id),
  newClaim: d => openClaimForm(null, { customerId: d.cust, policyId: d.pol }),
  newTask: d => openTaskForm(null, { customerId: d.cust }),
  openTask: d => openTaskForm(d.id),
  toggleTask: d => { const t = byId('tasks', d.id); t.done = !t.done; t.doneAt = t.done ? todayStr() : ''; commit(); },
  startRenewal: d => startRenewal(d.id),
  lostPolicy: d => markPolicyLost(d.id),
  renewedPolicy: async d => {
    if (!await confirmBox('Bu poliçe yenilendi olarak işaretlensin mi? (Yeni poliçeyi ayrıca eklemeyi unutmayın.)', 'Yenilendi', false)) return;
    byId('policies', d.id).status = 'yenilendi'; commit('Poliçe yenilendi olarak işaretlendi');
  },
  markPaid: d => {
    const p = byId('policies', d.pol), inst = p.installments[+d.inst];
    inst.paid = !inst.paid; inst.paidAt = inst.paid ? todayStr() : '';
    commit(inst.paid ? `Tahsilat alındı: ${custOf(p)?.name} ${money(inst.amount)}` : '');
    if (inst.paid) toast(`${money(inst.amount)} tahsil edildi`);
  },
  moreMenu: () => {
    const m = openModal({ title: 'Menü', body: `<div class="card">${visibleRoutes().map(r =>
      `<a class="list-item" href="#/${r.path}" style="color:inherit"><span>${r.icon}</span><div class="grow title">${r.label}</div>›</a>`).join('')}</div>` });
    m.el.addEventListener('click', e => { if (e.target.closest('a')) m.close(); });
  },
  loadDemo: async () => { if (!state.customers.length || await confirmBox('Demo verisi mevcut verilerin yanına eklenecek. Devam?', 'Ekle', false)) { seedDemo(); commit('Demo verisi yüklendi'); toast('Demo verisi yüklendi'); } },
  importCsv: () => pickFile('.csv,text/csv', importCSV),
  setTab: d => { ui.custTab = d.tab; render(); },
  backup: () => exportBackup(),
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.tagName === 'A') e.preventDefault();
  e.stopPropagation();
  ACTIONS[el.dataset.act]?.(el.dataset, el);
});
document.addEventListener('click', e => { // whole-row navigation for tables/lists
  if (e.target.closest('[data-act], a, button, input, select, label')) return;
  const row = e.target.closest('[data-href]');
  if (row) location.hash = row.dataset.href;
  const open = e.target.closest('[data-open]');
  if (open) { const [act, id] = open.dataset.open.split(':'); ACTIONS[act]({ id }); }
});

/* ============================== WhatsApp composer ============================== */

function buildCtx({ customer, policy, quote, claim, inst }) {
  const s = state.settings;
  const subject = policy?.subject || quote?.subject || '';
  return {
    ad: customer?.name || quote?.contactName || '',
    brans: policy?.branch || quote?.branch || '',
    sirket: policy?.company || '',
    policeno: policy?.policyNo || '',
    bitis: fmtDate(policy?.endDate),
    konu: subject, plaka: subject, konu_parantez: subject ? ` (${subject})` : '',
    prim: money(policy?.premium),
    teklifler: offersText(quote),
    dosya: claim?.fileNo || '',
    durum: CLAIM_LABEL[claim?.status] || '',
    tutar: money(inst?.amount), vade: fmtDate(inst?.due),
    acente: [s.ownerName, s.agencyName].filter(Boolean).join(' – '),
  };
}
const fillTemplate = (text, ctx) => text.replace(/\{(\w+)\}/g, (m, k) => (k in ctx ? ctx[k] : m)).replace(/ {2,}/g, ' ');

function openComposer(o) {
  const policy = byId('policies', o.policyId);
  const quote = byId('quotes', o.quoteId);
  const claim = byId('claims', o.claimId);
  const customer = byId('customers', o.customerId || policy?.customerId || quote?.customerId || claim?.customerId);
  const claimPolicy = policy || byId('policies', claim?.policyId);
  const inst = policy && o.inst != null ? policy.installments?.[+o.inst] : null;
  const ctx = buildCtx({ customer, policy: claimPolicy, quote, claim, inst });
  const tpls = state.settings.templates;
  const kind = o.kind || (quote ? (quote.offers?.some(x => num(x.premium)) ? 'teklif' : 'evrak') : claim ? 'hasar' : inst ? 'tahsilat' : 'genel');
  const tpl = tpls.find(t => t.kind === kind) || tpls[0];
  const phone = customer?.phone || quote?.phone || '';

  openModal({
    title: `WhatsApp mesajı – ${ctx.ad || 'Müşteri'}`,
    body: `<div class="form-grid">
      ${field('Şablon', `<select id="cTpl">${tpls.map(t => `<option value="${t.id}" ${t === tpl ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`)}
      ${field('Telefon', `<input id="cPhone" value="${esc(phone)}" inputmode="tel" placeholder="05xx xxx xx xx">`)}
      ${field('Mesaj', `<textarea id="cText" rows="10">${esc(fillTemplate(tpl.text, ctx))}</textarea>`, 'full')}
    </div><p class="muted small mt">Mesaj WhatsApp'ta hazır açılır, siz gönder tuşuna basarsınız. Gönderim müşterinin geçmişine kaydedilir.</p>`,
    foot: `<button class="btn" id="cCopy">📋 Kopyala</button><span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn wa" id="cSend">💬 WhatsApp'ta aç</button>`,
    onMount(el, close) {
      $('#cTpl', el).onchange = e => { $('#cText', el).value = fillTemplate(tpls.find(t => t.id === e.target.value).text, ctx); };
      const record = () => {
        const text = $('#cText', el).value;
        const tName = tpls.find(t => t.id === $('#cTpl', el).value)?.name;
        addNote({ customerId: customer?.id || '', quoteId: quote?.id || '', kind: 'whatsapp', text: `[${tName}]\n${text}` });
        if (policy && kind === 'yenileme') policy.lastContactAt = todayStr();
        if (quote && $('#cTpl', el).value === 't_quote' && ['yeni', 'bilgi', 'hazirlaniyor'].includes(quote.stage)) {
          quote.stage = 'gonderildi'; quote.followUp = addDays(todayStr(), 2);
        }
        if (quote && $('#cTpl', el).value === 't_doc' && quote.stage === 'yeni') quote.stage = 'bilgi';
        commit(`WhatsApp mesajı: ${ctx.ad}`);
      };
      $('#cSend', el).onclick = () => {
        const link = waLink($('#cPhone', el).value, $('#cText', el).value);
        if (!link) return toast('Geçerli bir telefon numarası girin', 'err');
        window.open(link, '_blank', 'noopener');
        if (customer && !customer.phone) customer.phone = $('#cPhone', el).value;
        record(); close();
      };
      $('#cCopy', el).onclick = async () => {
        try { await navigator.clipboard.writeText($('#cText', el).value); toast('Mesaj kopyalandı'); }
        catch (e) { $('#cText', el).select(); document.execCommand('copy'); toast('Mesaj kopyalandı'); }
      };
    },
  });
}

/* ============================== Dashboard ============================== */

function viewDashboard(view) {
  const today = todayStr(), month = today.slice(0, 7);
  const ren = renewalList();
  const ren30 = ren.filter(r => r.days <= 30);
  const openQ = state.quotes.filter(q => OPEN_STAGES.includes(q.stage));
  const followQ = openQ.filter(q => !q.followUp || q.followUp <= today).sort((a, b) => (a.followUp || '').localeCompare(b.followUp || ''));
  const openClaims = state.claims.filter(c => c.status !== 'kapandi');
  const inst = installmentList().filter(x => !x.inst.paid);
  const overdue = inst.filter(x => x.days < 0);
  const instSoon = inst.filter(x => x.days <= 7);
  const prod = state.policies.filter(p => (p.startDate || '').startsWith(month) && p.status !== 'iptal');
  const tasks = state.tasks.filter(t => !t.done && (!t.due || t.due <= addDays(today, 1))).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const bdays = upcomingBirthdays(7);
  const s = state.settings;
  const backupDays = s.lastBackupAt ? -daysUntil(s.lastBackupAt.slice(0, 10)) : null;
  const hello = new Date().getHours() < 12 ? 'Günaydın' : new Date().getHours() < 18 ? 'İyi günler' : 'İyi akşamlar';

  let banners = '';
  if (!state.customers.length) {
    banners += `<div class="banner info"><div><b>Hoş geldiniz!</b> Başlamak için mevcut Excel listenizi içe aktarın, ya da sistemi tanımak için demo verisi yükleyin.</div>
      <div class="actions"><button class="btn sm" data-act="loadDemo">Demo verisi yükle</button><button class="btn primary sm" data-act="importCsv">Excel/CSV içe aktar</button></div></div>`;
  } else if (!Cloud.enabled && (backupDays === null || backupDays > 7)) {
    banners += `<div class="banner warn"><div>⚠️ ${backupDays === null ? 'Henüz yedek almadınız.' : `Son yedek ${backupDays} gün önce alındı.`} Verileriniz yalnızca bu cihazda duruyor.</div>
      <div class="actions"><button class="btn sm" data-act="backup">Şimdi yedekle</button></div></div>`;
  }

  view.innerHTML = `
    <div class="page-head"><div><h1>${hello}${s.ownerName ? ', ' + esc(s.ownerName.split(' ')[0]) : ''} 👋</h1>
      <div class="muted">${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
      <div class="actions"><button class="btn primary" data-act="newQuote">＋ Teklif talebi</button><button class="btn" data-act="newPolicy">＋ Poliçe</button></div></div>
    ${banners}
    <div class="grid kpis">
      <a class="card kpi ${ren.some(r => r.days < 0) ? 'alert' : ''}" href="#/renewals"><div class="label">Yenileme (30 gün)</div><div class="value">${ren30.length}</div><div class="sub">${ren.filter(r => r.days < 0).length} tanesi süresi geçmiş</div></a>
      <a class="card kpi" href="#/quotes"><div class="label">Açık teklif</div><div class="value">${openQ.length}</div><div class="sub">${followQ.length} takip bekliyor</div></a>
      <a class="card kpi" href="#/claims"><div class="label">Açık hasar</div><div class="value">${openClaims.length}</div><div class="sub">dosya</div></a>
      <a class="card kpi ${overdue.length ? 'alert' : ''}" href="#/collections"><div class="label">Geciken tahsilat</div><div class="value">${overdue.length}</div><div class="sub">${money(overdue.reduce((a, x) => a + num(x.inst.amount), 0))}</div></a>
      <a class="card kpi" href="${isOwner() ? '#/reports' : '#/policies'}"><div class="label">Bu ay üretim</div><div class="value">${money(prod.reduce((a, p) => a + num(p.premium), 0))}</div><div class="sub">${prod.length} poliçe · ${money(prod.reduce((a, p) => a + num(p.commission), 0))} komisyon</div></a>
    </div>
    <div class="grid two">
      <div class="card">
        <div class="card-head"><h2>🔁 Yaklaşan yenilemeler</h2><div class="actions"><a class="btn sm ghost" href="#/renewals">Tümü ›</a></div></div>
        ${ren.filter(r => r.days <= 15).slice(0, 8).map(r => `
          <div class="list-item click" data-open="openPolicy:${r.p.id}">
            <div class="grow"><div class="title">${esc(r.c?.name || '—')}</div>
              <div class="meta">${esc(r.p.branch)} · ${esc(r.p.company || '')} ${r.p.subject ? '· ' + esc(r.p.subject) : ''}${r.p.lastContactAt ? ` · <span class="badge teal">${fmtDate(r.p.lastContactAt)} yazıldı</span>` : ''}</div></div>
            ${daysBadge(r.days)}
            ${waBtn(`data-pol="${r.p.id}" data-kind="yenileme"`, '', 'xs')}
          </div>`).join('') || emptyState('🎉', '15 gün içinde biten poliçe yok')}
      </div>
      <div class="card">
        <div class="card-head"><h2>📝 Takip edilecek teklifler</h2><div class="actions"><a class="btn sm ghost" href="#/quotes">Tümü ›</a></div></div>
        ${followQ.slice(0, 8).map(q => `
          <div class="list-item click" data-open="openQuote:${q.id}">
            <div class="grow"><div class="title">${esc(quoteName(q))}</div>
              <div class="meta">${esc(q.branch)} · ${STAGE_LABEL[q.stage]} · ${esc(q.source || '')}</div></div>
            ${q.followUp ? daysBadge(daysUntil(q.followUp)) : '<span class="badge amber">Yeni</span>'}
            ${waBtn(`data-quote="${q.id}"`, '', 'xs')}
          </div>`).join('') || emptyState('✨', 'Bugün takip edilecek teklif yok')}
      </div>
      <div class="card">
        <div class="card-head"><h2>✅ Bugünün görevleri</h2><div class="actions"><button class="btn sm" data-act="newTask">＋ Görev</button></div></div>
        ${tasks.slice(0, 8).map(taskRow).join('') || emptyState('☕', 'Bugün için görev yok')}
      </div>
      <div class="card">
        <div class="card-head"><h2>💳 Tahsilat (7 gün)</h2><div class="actions"><a class="btn sm ghost" href="#/collections">Tümü ›</a></div></div>
        ${instSoon.slice(0, 6).map(instRow).join('') || emptyState('👌', 'Yaklaşan ya da geciken taksit yok')}
        ${bdays.length ? `<div class="card-head" style="border-top:1px solid var(--line)"><h2>🎂 Doğum günleri</h2></div>
          ${bdays.map(b => `<div class="list-item"><div class="grow"><div class="title">${esc(b.c.name)}</div>
            <div class="meta">${b.days === 0 ? 'Bugün!' : b.days + ' gün sonra'} · ${fmtDate(b.c.birthDate).slice(0, 5)}</div></div>
            ${waBtn(`data-cust="${b.c.id}" data-kind="dogumgunu"`, 'Kutla', 'xs')}</div>`).join('')}` : ''}
      </div>
    </div>`;
}

function taskRow(t) {
  const c = custOf(t), d = daysUntil(t.due);
  return `<div class="list-item">
    <input type="checkbox" style="width:20px;min-height:20px" ${t.done ? 'checked' : ''} data-act="toggleTask" data-id="${t.id}" aria-label="Tamamlandı">
    <div class="grow click" data-open="openTask:${t.id}" style="cursor:pointer"><div class="title" style="${t.done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(t.title)}</div>
      <div class="meta">${c ? `<a href="#/customers/${c.id}">${esc(c.name)}</a> · ` : ''}${t.due ? fmtDate(t.due) : 'Tarihsiz'}</div></div>
    ${!t.done && t.due && d <= 0 ? daysBadge(d) : ''}
  </div>`;
}
function instRow(x) {
  return `<div class="list-item">
    <div class="grow"><div class="title">${x.c ? `<a href="#/customers/${x.c.id}" style="color:inherit">${esc(x.c.name)}</a>` : '—'} · ${money(x.inst.amount)}</div>
      <div class="meta">${esc(x.p.branch)} · ${esc(x.p.company || '')} · ${x.i + 1}/${x.p.installments.length}. taksit · vade ${fmtDate(x.inst.due)}</div></div>
    ${x.inst.paid ? `<span class="badge green">Ödendi ${fmtDate(x.inst.paidAt)}</span>` : daysBadge(x.days)}
    ${x.inst.paid ? '' : waBtn(`data-pol="${x.p.id}" data-inst="${x.i}" data-kind="tahsilat"`, '', 'xs')}
    <button class="btn xs" data-act="markPaid" data-pol="${x.p.id}" data-inst="${x.i}">${x.inst.paid ? 'Geri al' : '✓ Ödendi'}</button>
  </div>`;
}

/* ============================== Renewals ============================== */

function viewRenewals(view) {
  const f = ui.renewals;
  const all = renewalList().filter(r => !f.branch || r.p.branch === f.branch);
  const win = Number(state.settings.renewalWindow) || 60;
  const buckets = [
    ['Süresi geçmiş – yenilenmedi', r => r.days < 0], ['0–7 gün', r => r.days >= 0 && r.days <= 7],
    ['8–15 gün', r => r.days > 7 && r.days <= 15], ['16–30 gün', r => r.days > 15 && r.days <= 30],
    [`31–${win} gün`, r => r.days > 30]];
  const openRenewalQuote = id => state.quotes.find(q => q.renewalOfId === id && OPEN_STAGES.includes(q.stage));

  view.innerHTML = `
    <div class="page-head"><div><h1>Yenilemeler</h1><div class="muted">Önümüzdeki ${win} gün içinde biten ve son 30 günde süresi dolan poliçeler</div></div></div>
    <div class="filters"><select id="rBranch"><option value="">Tüm branşlar</option>${opts(BRANCHES, f.branch)}</select></div>
    ${all.length ? buckets.map(([title, fn]) => {
      const rows = all.filter(fn);
      if (!rows.length) return '';
      return `<div class="card mb"><div class="card-head"><h2>${title}</h2><span class="badge">${rows.length}</span></div><div class="table-wrap"><table class="stack">
        <thead><tr><th>Müşteri</th><th>Branş / Şirket</th><th class="hide-mobile">Konu</th><th>Bitiş</th><th class="hide-mobile num">Prim</th><th class="hide-mobile">Son temas</th><th></th></tr></thead>
        <tbody>${rows.map(r => { const oq = openRenewalQuote(r.p.id); return `<tr class="click" data-open="openPolicy:${r.p.id}">
          <td><b>${esc(r.c?.name || '—')}</b><div class="small muted">${esc(fmtPhone(r.c?.phone))}</div></td>
          <td>${esc(r.p.branch)}<div class="small muted">${esc(r.p.company || '')}</div></td>
          <td class="hide-mobile">${esc(r.p.subject || '')}</td>
          <td>${fmtDate(r.p.endDate)}<div>${daysBadge(r.days)}</div></td>
          <td class="num hide-mobile">${money(r.p.premium)}</td>
          <td class="hide-mobile">${r.p.lastContactAt ? `<span class="badge teal">${fmtDate(r.p.lastContactAt)}</span>` : '<span class="muted small">Yazılmadı</span>'}</td>
          <td><div class="row-actions">
            ${waBtn(`data-pol="${r.p.id}" data-kind="yenileme"`, 'Hatırlat', 'xs')}
            ${oq ? `<button class="btn xs" data-act="openQuote" data-id="${oq.id}">Teklif: ${STAGE_LABEL[oq.stage]}</button>`
                 : `<button class="btn xs primary" data-act="startRenewal" data-id="${r.p.id}">Teklif başlat</button>`}
            <button class="btn xs" data-act="renewedPolicy" data-id="${r.p.id}" title="Yenilendi olarak işaretle">✓</button>
            <button class="btn xs danger" data-act="lostPolicy" data-id="${r.p.id}" title="Kaybedildi">✕</button>
          </div></td></tr>`; }).join('')}</tbody></table></div></div>`;
    }).join('') : `<div class="card">${emptyState('🎉', 'Yaklaşan yenileme yok')}</div>`}`;
  $('#rBranch').onchange = e => { f.branch = e.target.value; render(); };
}

function startRenewal(policyId) {
  const p = byId('policies', policyId);
  const existing = state.quotes.find(q => q.renewalOfId === p.id && OPEN_STAGES.includes(q.stage));
  if (existing) return openQuoteForm(existing.id);
  const q = upsert('quotes', {
    customerId: p.customerId, branch: p.branch, subject: p.subject, source: 'Yenileme', stage: 'hazirlaniyor',
    renewalOfId: p.id, followUp: todayStr(),
    details: `Mevcut poliçe: ${p.company || ''} · No ${p.policyNo || '—'} · bitiş ${fmtDate(p.endDate)} · prim ${money(p.premium)}`,
    offers: [{ company: p.company || '', premium: '', note: 'Mevcut şirket' }],
  });
  commit(`Yenileme teklifi başlatıldı: ${custOf(p)?.name}`);
  openQuoteForm(q.id);
}

function markPolicyLost(id) {
  const p = byId('policies', id);
  openModal({
    title: 'Poliçe kaybedildi',
    body: `<p>${esc(custOf(p)?.name)} – ${esc(p.branch)} poliçesi yenilenmeyecek olarak işaretlenecek.</p>
      ${field('Neden?', `<select id="lr">${opts(LOST_REASONS)}</select>`)}`,
    foot: `<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn danger" id="lrOk">Kaybedildi</button>`,
    onMount(el, close) {
      $('#lrOk', el).onclick = () => { p.status = 'kaybedildi'; p.lostReason = $('#lr', el).value; close(); commit(`Poliçe kaybedildi: ${custOf(p)?.name} (${p.lostReason})`); };
    },
  });
}

/* ============================== Quotes (pipeline) ============================== */

function viewQuotes(view) {
  const f = ui.quotes;
  const cutoff = addDays(todayStr(), -30);
  const match = q => (!f.branch || q.branch === f.branch) &&
    (!f.q || norm(`${quoteName(q)} ${quotePhone(q)} ${q.subject || ''} ${q.details || ''}`).includes(norm(f.q)));
  const visible = state.quotes.filter(q => match(q) && (OPEN_STAGES.includes(q.stage) || (q.updatedAt || q.createdAt || '').slice(0, 10) >= cutoff));

  view.innerHTML = `
    <div class="page-head"><div><h1>Teklifler</h1><div class="muted">WhatsApp'tan gelen her talebi buraya kaydedin. Kartları sürükleyerek aşama değiştirin.</div></div>
      <div class="actions"><button class="btn primary" data-act="newQuote">＋ Teklif talebi</button></div></div>
    <div class="filters"><input type="search" id="qSearch" placeholder="İsim, telefon, plaka…" value="${esc(f.q)}">
      <select id="qBranch"><option value="">Tüm branşlar</option>${opts(BRANCHES, f.branch)}</select></div>
    <div class="kanban">${QUOTE_STAGES.map(([key, label]) => {
      const items = visible.filter(q => q.stage === key).sort((a, b) => (a.followUp || '9').localeCompare(b.followUp || '9'));
      return `<div class="kcol" data-stage="${key}"><h3><span>${label}</span><span class="badge">${items.length}</span></h3>
        ${items.map(q => {
          const best = (q.offers || []).filter(o => num(o.premium)).sort((a, b) => num(a.premium) - num(b.premium))[0];
          return `<div class="kcard" draggable="true" data-id="${q.id}" data-open="openQuote:${q.id}">
            <div class="t">${esc(quoteName(q))}</div>
            <div class="m"><span class="badge blue">${esc(q.branch)}</span>${q.subject ? esc(q.subject) : ''}</div>
            <div class="m">${esc(q.source || '')}${best ? ` · en iyi ${money(best.premium)}` : ''}${q.lostReason ? ' · ' + esc(q.lostReason) : ''}</div>
            ${OPEN_STAGES.includes(q.stage) && q.followUp ? `<div class="m">Takip: ${fmtDate(q.followUp)} ${daysUntil(q.followUp) <= 0 ? daysBadge(daysUntil(q.followUp)) : ''}</div>` : ''}
          </div>`;
        }).join('') || '<div class="muted small" style="padding:6px">—</div>'}
      </div>`;
    }).join('')}</div>
    <p class="muted small">Kazanılan ve kaybedilen teklifler 30 gün sonra panodan kalkar; raporlarda görünmeye devam eder.</p>`;

  const qs = $('#qSearch');
  qs.oninput = () => { f.q = qs.value; render(); const n = $('#qSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  $('#qBranch').onchange = e => { f.branch = e.target.value; render(); };
  $$('.kcard', view).forEach(c => c.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', c.dataset.id)));
  $$('.kcol', view).forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag'));
    col.addEventListener('drop', e => {
      e.preventDefault(); col.classList.remove('drag');
      const q = byId('quotes', e.dataTransfer.getData('text/plain'));
      if (!q || q.stage === col.dataset.stage) return;
      if (col.dataset.stage === 'kazanildi') return openQuoteForm(q.id, {}, true);
      if (col.dataset.stage === 'kaybedildi') { q.stage = 'kaybedildi'; q.lostReason = q.lostReason || 'Diğer'; commit(); return openQuoteForm(q.id); }
      q.stage = col.dataset.stage; q.updatedAt = new Date().toISOString(); commit();
    });
  });
}

function openQuoteForm(id, preset = {}, convertNow = false) {
  const q = id ? structuredClone(byId('quotes', id)) : { stage: 'yeni', source: 'WhatsApp', branch: 'Trafik', followUp: todayStr(), offers: [], ...preset };
  const c = custOf(q);
  const history = id ? state.notes.filter(n => n.quoteId === id) : [];
  const [subjL, subjPh] = subjectLabel(q.branch);

  const offerRow = (o = {}, i) => `<tr>
    <td><input type="radio" name="chosen" value="${i}" ${q.chosen == i ? 'checked' : ''} title="Seçilen teklif" style="min-height:0;width:auto"></td>
    <td><input list="compList" class="oc" value="${esc(o.company || '')}" placeholder="Şirket"></td>
    <td><input class="op" type="number" step="0.01" min="0" value="${esc(o.premium || '')}" placeholder="Prim ₺"></td>
    <td><input class="on" value="${esc(o.note || '')}" placeholder="Not (muafiyet, teminat…)"></td>
    <td><button type="button" class="icon-btn rm" aria-label="Sil">✕</button></td></tr>`;

  const m = openModal({
    title: id ? `Teklif – ${quoteName(q)}` : 'Yeni teklif talebi', wide: true,
    body: `<form id="qf" class="form-grid">
      ${custDatalist()}<datalist id="compList">${opts(state.settings.companies)}</datalist>
      ${field('Müşteri (kayıtlıysa seçin, değilse isim yazın)', `<input name="customer" list="custList" value="${esc(c ? custLabel(c) : q.contactName || '')}" required placeholder="Ad Soyad">`)}
      ${field('Telefon', `<input name="phone" inputmode="tel" value="${esc(c?.phone || q.phone || '')}" placeholder="05xx xxx xx xx">`)}
      ${field('Branş', `<select name="branch">${opts(BRANCHES, q.branch)}</select>`)}
      ${field(`<span id="qSubjL">${subjL}</span>`, `<input name="subject" value="${esc(q.subject || '')}" placeholder="${esc(subjPh)}">`)}
      ${field('Kaynak', `<select name="source">${opts(SOURCES, q.source)}</select>`)}
      ${field('Takip tarihi', `<input type="date" name="followUp" value="${esc(q.followUp || '')}">`)}
      ${field('Aşama', `<select name="stage">${opts(QUOTE_STAGES, q.stage)}</select>`)}
      ${field('Kayıp nedeni', `<select name="lostReason"><option value="">—</option>${opts(LOST_REASONS, q.lostReason)}</select>`, q.stage === 'kaybedildi' ? '' : 'lost-hide')}
      ${field('Talep detayı (WhatsApp mesajını buraya yapıştırabilirsiniz)', `<textarea name="details" rows="3" placeholder="Araç: 2019 Fiat Egea, ruhsat sahibi kendisi, hasarsızlık 4. kademe…">${esc(q.details || '')}</textarea>`, 'full')}
      <div class="full"><div class="hstack" style="justify-content:space-between"><b>Şirket teklifleri</b><button type="button" class="btn sm" id="addOffer">＋ Teklif satırı</button></div>
        <div class="table-wrap"><table class="offers-table"><thead><tr><th title="Seçilen">✓</th><th>Şirket</th><th>Prim</th><th>Not</th><th></th></tr></thead>
        <tbody id="offerRows">${(q.offers.length ? q.offers : [{}]).map(offerRow).join('')}</tbody></table></div>
        <p class="muted small">✓ işaretli teklif poliçeleştirilir. İşaret yoksa en ucuz teklif seçilir.</p></div>
      ${history.length ? `<div class="full"><b>Mesaj geçmişi</b><div class="timeline" style="padding:0">${history.map(noteItem).join('')}</div></div>` : ''}
    </form>`,
    foot: `${id ? '<button class="btn danger" id="qDel">Sil</button>' : ''}<span class="spacer"></span>
      <button class="btn wa" id="qWa">💬 WhatsApp</button>
      ${q.stage !== 'kazanildi' ? '<button class="btn" id="qConvert">📄 Poliçeleştir</button>' : (q.policyId ? `<button class="btn" data-act="openPolicy" data-id="${q.policyId}">Poliçeyi aç</button>` : '')}
      <button class="btn primary" id="qSave">Kaydet</button>`,
    onMount(el, close) {
      const form = $('#qf', el);
      const toggleLost = () => { form.lostReason.closest('label').hidden = form.stage.value !== 'kaybedildi'; };
      toggleLost();
      form.stage.onchange = toggleLost;
      form.branch.onchange = () => { const [l, ph] = subjectLabel(form.branch.value); $('#qSubjL', el).textContent = l; form.subject.placeholder = ph; };
      form.customer.onchange = () => { const cc = findCustomer(form.customer.value); if (cc && !form.phone.value) form.phone.value = cc.phone || ''; };
      $('#addOffer', el).onclick = () => { const n = $$('#offerRows tr', el).length; $('#offerRows', el).insertAdjacentHTML('beforeend', offerRow({}, n)); };
      $('#offerRows', el).onclick = e => { if (e.target.closest('.rm')) e.target.closest('tr').remove(); };

      const collect = () => {
        if (!form.reportValidity()) return null;
        const d = formData(form);
        const cc = findCustomer(d.customer);
        const offers = $$('#offerRows tr', el).map(tr => ({ company: $('.oc', tr).value.trim(), premium: $('.op', tr).value, note: $('.on', tr).value.trim() }))
          .filter(o => o.company || o.premium);
        const chosenIdx = $$('#offerRows tr', el).findIndex(tr => $('input[name=chosen]', tr).checked);
        const stageChanged = q.stage !== d.stage;
        return { ...q, id: q.id, customerId: cc?.id || '', contactName: cc ? '' : d.customer.trim(), phone: d.phone, branch: d.branch, subject: d.subject,
          source: d.source, followUp: d.followUp, stage: d.stage, lostReason: d.stage === 'kaybedildi' ? (d.lostReason || 'Diğer') : '',
          details: d.details, offers, chosen: chosenIdx >= 0 ? chosenIdx : '', stageChangedAt: stageChanged ? todayStr() : q.stageChangedAt };
      };
      const persist = () => {
        const data = collect(); if (!data) return null;
        if (data.customerId) { const cc = byId('customers', data.customerId); if (!cc.phone && data.phone) cc.phone = data.phone; }
        const saved = upsert('quotes', data); q.id = saved.id;
        return saved;
      };
      $('#qSave', el).onclick = () => { const s = persist(); if (s) { close(); commit(id ? '' : `Yeni teklif talebi: ${quoteName(s)}`); toast('Teklif kaydedildi'); } };
      $('#qWa', el).onclick = () => { const s = persist(); if (s) { close(); save(); render(); openComposer({ quoteId: s.id }); } };
      $('#qDel', el) && ($('#qDel', el).onclick = async () => { if (await confirmBox('Bu teklif silinsin mi?', 'Sil')) { remove('quotes', id); close(); commit('Teklif silindi'); } });
      const convert = () => { const s = persist(); if (s) { close(); save(); convertQuote(s.id); } };
      $('#qConvert', el) && ($('#qConvert', el).onclick = convert);
      if (convertNow) setTimeout(convert, 0);
    },
  });
  return m;
}

function convertQuote(quoteId) {
  const q = byId('quotes', quoteId);
  let c = custOf(q);
  if (!c) {
    const draft = { name: q.contactName, phone: q.phone, type: 'bireysel' };
    c = findDuplicate(draft) || upsert('customers', { ...draft, kvkk: false });
    q.customerId = c.id; q.contactName = '';
    state.notes.forEach(n => { if (n.quoteId === q.id) n.customerId = c.id; });
  }
  const valid = (q.offers || []).filter(o => o.company);
  const chosen = (q.chosen !== '' && q.chosen != null && q.offers[q.chosen]) || [...valid].sort((a, b) => (num(a.premium) || 1e12) - (num(b.premium) || 1e12))[0] || {};
  const old = byId('policies', q.renewalOfId);
  const start = old?.endDate && daysUntil(old.endDate) >= 0 ? old.endDate : todayStr();
  save();
  openPolicyForm(null, {
    customerId: c.id, branch: q.branch, subject: q.subject, company: chosen.company || '', premium: chosen.premium || '',
    startDate: start, endDate: addMonths(start, 12), notes: chosen.note || '',
  }, policy => {
    q.stage = 'kazanildi'; q.policyId = policy.id; q.stageChangedAt = todayStr();
    if (old) { old.status = 'yenilendi'; old.renewedToId = policy.id; }
  });
}

/* ============================== Customers ============================== */

function viewCustomers(view, id) {
  if (id) return viewCustomerDetail(view, id);
  const f = ui.customers;
  view.innerHTML = `
    <div class="page-head"><div><h1>Müşteriler</h1><div class="muted">${state.customers.length} kayıt</div></div>
      <div class="actions"><button class="btn" data-act="importCsv">⬆ İçe aktar</button><button class="btn primary" data-act="newCustomer">＋ Müşteri</button></div></div>
    <div class="filters"><input type="search" id="cSearch" placeholder="İsim, telefon, TC/VKN, e-posta, etiket…" value="${esc(f.q)}">
      <select id="cType"><option value="">Tümü</option>${opts([['bireysel', 'Bireysel'], ['kurumsal', 'Kurumsal']], f.type)}</select></div>
    <div class="card"><div class="table-wrap" id="cList"></div></div>`;
  const list = () => {
    const nq = norm(f.q);
    const rows = state.customers.filter(c => (!f.type || c.type === f.type) &&
      (!nq || norm(`${c.name} ${c.phone} ${waNumber(c.phone)} ${c.tc} ${c.email} ${c.tags} ${c.city}`).includes(nq)))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    const shown = rows.slice(0, 300);
    $('#cList').innerHTML = rows.length ? `<table class="stack"><thead><tr><th>Ad / Unvan</th><th>Telefon</th><th class="hide-mobile">Aktif poliçe</th><th class="hide-mobile">En yakın bitiş</th><th></th></tr></thead><tbody>
      ${shown.map(c => {
        const pols = state.policies.filter(p => p.customerId === c.id && policyStatus(p) === 'aktif');
        const next = pols.map(p => p.endDate).sort()[0];
        return `<tr class="click" data-href="#/customers/${c.id}">
          <td><b>${esc(c.name)}</b> ${c.type === 'kurumsal' ? '<span class="badge blue">Kurumsal</span>' : ''}<div class="small muted">${esc(c.tags || '')}</div></td>
          <td>${esc(fmtPhone(c.phone))}</td>
          <td class="hide-mobile">${pols.length ? pols.map(p => `<span class="badge">${esc(p.branch)}</span>`).join(' ') : '<span class="muted">—</span>'}</td>
          <td class="hide-mobile">${next ? fmtDate(next) + ' ' + (daysUntil(next) <= 30 ? daysBadge(daysUntil(next)) : '') : '—'}</td>
          <td><div class="row-actions">${c.phone ? waBtn(`data-cust="${c.id}"`, '', 'xs') : ''}</div></td></tr>`;
      }).join('')}</tbody></table>${rows.length > 300 ? `<p class="muted small" style="padding:10px 12px">İlk 300 kayıt gösteriliyor, aramayı daraltın.</p>` : ''}`
      : emptyState('👥', state.customers.length ? 'Eşleşen müşteri yok' : 'Henüz müşteri yok', '<button class="btn primary" data-act="newCustomer">＋ Müşteri ekle</button>');
  };
  list();
  $('#cSearch').oninput = e => { f.q = e.target.value; list(); };
  $('#cType').onchange = e => { f.type = e.target.value; list(); };
}

function noteItem(n) {
  const ico = { whatsapp: '💬', call: '📞', note: '🗒️', system: '⚙️' }[n.kind] || '🗒️';
  return `<div class="tl-item"><div class="tl-ico ${n.kind}">${ico}</div><div class="grow"><div class="small muted">${fmtDateTime(n.at)}</div><div class="tl-body">${esc(n.text)}</div></div></div>`;
}

function viewCustomerDetail(view, id) {
  const c = byId('customers', id);
  if (!c) { view.innerHTML = emptyState('🤷', 'Müşteri bulunamadı', '<a class="btn" href="#/customers">Müşterilere dön</a>'); return; }
  const pols = state.policies.filter(p => p.customerId === id).sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''));
  const quotes = state.quotes.filter(q => q.customerId === id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const claims = state.claims.filter(x => x.customerId === id);
  const notes = state.notes.filter(n => n.customerId === id);
  const tasks = state.tasks.filter(t => t.customerId === id && !t.done);
  const active = pols.filter(p => policyStatus(p) === 'aktif');
  const tab = ui.custTab;
  const tabs = [['policies', `Poliçeler (${pols.length})`], ['quotes', `Teklifler (${quotes.length})`], ['claims', `Hasarlar (${claims.length})`],
    ['notes', `Notlar & geçmiş (${notes.length})`], ['files', 'Belgeler'], ['tasks', `Görevler (${tasks.length})`]];

  let body = '';
  if (tab === 'policies') body = pols.length ? `<div class="table-wrap"><table class="stack"><thead><tr><th>Branş</th><th>Şirket</th><th class="hide-mobile">Konu</th><th>Bitiş</th><th class="num">Prim</th><th>Durum</th></tr></thead><tbody>
      ${pols.map(p => `<tr class="click" data-open="openPolicy:${p.id}"><td><b>${esc(p.branch)}</b><div class="small muted">${esc(p.policyNo || '')}</div></td><td>${esc(p.company || '')}</td>
        <td class="hide-mobile">${esc(p.subject || '')}</td><td>${fmtDate(p.endDate)} ${policyStatus(p) === 'aktif' && daysUntil(p.endDate) <= 30 ? daysBadge(daysUntil(p.endDate)) : ''}</td>
        <td class="num">${money(p.premium)}</td><td>${statusBadge(p)}</td></tr>`).join('')}</tbody></table></div>`
    : emptyState('📄', 'Poliçe yok', `<button class="btn primary" data-act="newPolicy" data-cust="${id}">＋ Poliçe ekle</button>`);
  if (tab === 'quotes') body = quotes.map(q => `<div class="list-item click" data-open="openQuote:${q.id}"><div class="grow"><div class="title">${esc(q.branch)} ${q.subject ? '· ' + esc(q.subject) : ''}</div>
      <div class="meta">${fmtDate((q.createdAt || '').slice(0, 10))} · ${esc(q.source || '')} ${q.lostReason ? '· ' + esc(q.lostReason) : ''}</div></div>
      <span class="badge ${q.stage === 'kazanildi' ? 'green' : q.stage === 'kaybedildi' ? '' : 'amber'}">${STAGE_LABEL[q.stage]}</span></div>`).join('')
    || emptyState('📝', 'Teklif yok', `<button class="btn primary" data-act="newQuote" data-cust="${id}">＋ Teklif talebi</button>`);
  if (tab === 'claims') body = claims.map(x => `<div class="list-item click" data-open="openClaim:${x.id}"><div class="grow"><div class="title">${esc(x.fileNo || 'Dosya no yok')} · ${esc(byId('policies', x.policyId)?.branch || '')}</div>
      <div class="meta">${fmtDate(x.date)} · ${esc((x.description || '').slice(0, 80))}</div></div><span class="badge ${x.status === 'kapandi' ? 'green' : 'amber'}">${CLAIM_LABEL[x.status]}</span></div>`).join('')
    || emptyState('🛠️', 'Hasar dosyası yok', `<button class="btn" data-act="newClaim" data-cust="${id}">＋ Hasar dosyası</button>`);
  if (tab === 'notes') body = `<form id="noteForm" class="card-pad" style="border-bottom:1px solid var(--line)">
      <textarea name="text" rows="3" placeholder="Not ekleyin – ör. WhatsApp konuşmasındaki önemli bilgiyi buraya yapıştırın" required></textarea>
      <div class="hstack mt"><select name="kind" style="width:auto">${opts([['note', '🗒️ Not'], ['call', '📞 Telefon görüşmesi'], ['whatsapp', '💬 WhatsApp yazışması']])}</select>
      <button class="btn primary" style="margin-left:auto">Ekle</button></div></form>
      <div class="timeline">${notes.map(noteItem).join('') || '<div class="empty">Henüz not yok</div>'}</div>`;
  if (tab === 'files') body = `<div class="card-pad" id="custFiles"></div>`;
  if (tab === 'tasks') body = `${tasks.map(taskRow).join('') || emptyState('✅', 'Açık görev yok')}<div class="card-pad"><button class="btn" data-act="newTask" data-cust="${id}">＋ Görev ekle</button></div>`;

  view.innerHTML = `
    <div class="mb"><a href="#/customers" class="muted">‹ Müşteriler</a></div>
    <div class="card card-pad mb">
      <div class="detail-head"><div class="avatar">${esc(initials(c.name))}</div>
        <div style="flex:1;min-width:200px"><h1>${esc(c.name)}</h1>
          <div class="hstack mt" style="margin-top:6px">${c.type === 'kurumsal' ? '<span class="badge blue">Kurumsal</span>' : '<span class="badge">Bireysel</span>'}
          ${c.kvkk ? '<span class="badge green">KVKK onayı var</span>' : '<span class="badge amber">KVKK onayı yok</span>'}
          ${active.length ? `<span class="badge teal">${active.length} aktif poliçe · ${money(active.reduce((a, p) => a + num(p.premium), 0))}</span>` : ''}
          ${(c.tags || '').split(',').filter(t => t.trim()).map(t => `<span class="badge">${esc(t.trim())}</span>`).join('')}</div></div>
        <div class="hstack">${c.phone ? `${waBtn(`data-cust="${id}"`)}<a class="btn sm" href="tel:${esc(c.phone)}">📞 Ara</a>` : ''}
          <button class="btn sm" data-act="editCustomer" data-id="${id}">✏️ Düzenle</button></div>
      </div>
      <div class="kv mt">
        <div><span>Telefon</span><b>${esc(fmtPhone(c.phone)) || '—'}</b></div>
        <div><span>${c.type === 'kurumsal' ? 'VKN' : 'TC kimlik'}</span><b>${esc(c.tc) || '—'}</b></div>
        <div><span>E-posta</span><b>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</b></div>
        <div><span>Doğum tarihi</span><b>${fmtDate(c.birthDate)}</b></div>
        <div><span>Şehir</span><b>${esc(c.city) || '—'}</b></div>
        <div><span>Adres</span><b>${esc(c.address) || '—'}</b></div>
        ${c.notes ? `<div style="grid-column:1/-1"><span>Not</span><b style="white-space:pre-wrap">${esc(c.notes)}</b></div>` : ''}
      </div>
      <div class="hstack mt"><button class="btn sm" data-act="newQuote" data-cust="${id}">＋ Teklif</button><button class="btn sm" data-act="newPolicy" data-cust="${id}">＋ Poliçe</button>
        <button class="btn sm" data-act="newClaim" data-cust="${id}">＋ Hasar</button><button class="btn sm" data-act="newTask" data-cust="${id}">＋ Görev</button></div>
    </div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'active' : ''}" data-act="setTab" data-tab="${k}">${l}</button>`).join('')}</div>
    <div class="card">${body}</div>`;

  if (tab === 'notes') $('#noteForm').onsubmit = e => {
    e.preventDefault(); const d = formData(e.target);
    addNote({ customerId: id, kind: d.kind, text: d.text.trim() }); commit(); toast('Not eklendi');
  };
  if (tab === 'files') renderFiles($('#custFiles'), { customerId: id });
}

function openCustomerForm(id, preset = {}, onSaved) {
  const c = id ? byId('customers', id) : { type: 'bireysel', kvkk: false, ...preset };
  openModal({
    title: id ? 'Müşteriyi düzenle' : 'Yeni müşteri',
    body: `<form id="cf" class="form-grid">
      ${field('Tür', `<select name="type">${opts([['bireysel', 'Bireysel'], ['kurumsal', 'Kurumsal']], c.type)}</select>`)}
      ${field('Ad Soyad / Unvan *', `<input name="name" required value="${esc(c.name || '')}">`)}
      ${field('Cep telefonu', `<input name="phone" inputmode="tel" value="${esc(c.phone || '')}" placeholder="05xx xxx xx xx">`)}
      ${field('TC kimlik / VKN', `<input name="tc" inputmode="numeric" maxlength="11" value="${esc(c.tc || '')}">`)}
      ${field('E-posta', `<input name="email" type="email" value="${esc(c.email || '')}">`)}
      ${field('Doğum tarihi', `<input name="birthDate" type="date" value="${esc(c.birthDate || '')}">`)}
      ${field('Şehir / İlçe', `<input name="city" value="${esc(c.city || '')}">`)}
      ${field('Etiketler (virgülle)', `<input name="tags" value="${esc(c.tags || '')}" placeholder="VIP, referans: Ayşe H.">`)}
      ${field('Adres', `<input name="address" value="${esc(c.address || '')}">`, 'full')}
      ${field('Notlar', `<textarea name="notes" rows="2">${esc(c.notes || '')}</textarea>`, 'full')}
      <label class="check full"><input type="checkbox" name="kvkk" ${c.kvkk ? 'checked' : ''}> Müşteri KVKK aydınlatma metnini onayladı</label>
    </form>`,
    foot: `${id ? '<button class="btn danger" id="cDel">Müşteriyi ve tüm verilerini sil</button>' : ''}<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" id="cSave">Kaydet</button>`,
    onMount(el, close) {
      const form = $('#cf', el);
      $('#cSave', el).onclick = async () => {
        if (!form.reportValidity()) return;
        const d = formData(form);
        const data = { ...d, id: c.id, name: d.name.trim(), kvkk: form.kvkk.checked };
        const dup = findDuplicate(data);
        if (dup && !await confirmBox(`Aynı telefon veya TC ile kayıtlı bir müşteri var: ${dup.name}. Yine de kaydedilsin mi?`, 'Kaydet', false)) return;
        const saved = upsert('customers', data);
        close(); commit(id ? '' : `Yeni müşteri: ${saved.name}`); toast('Müşteri kaydedildi');
        if (onSaved) onSaved(saved); else if (!id) location.hash = `#/customers/${saved.id}`;
      };
      $('#cDel', el) && ($('#cDel', el).onclick = async () => {
        if (!await confirmBox(`${c.name} ve bu müşteriye ait TÜM poliçe, teklif, hasar, not ve belgeler kalıcı olarak silinecek (KVKK silme talebi). Emin misiniz?`, 'Kalıcı olarak sil')) return;
        try { await Docs.removeCustomer(id); } catch (e) { return toast('Belgeler silinemedi (internet bağlantısı?). Müşteri silinmedi.', 'err'); }
        const polIds = state.policies.filter(p => p.customerId === id).map(p => p.id);
        ['policies', 'quotes', 'claims', 'notes', 'tasks'].forEach(k => { state[k] = state[k].filter(x => x.customerId !== id); });
        state.claims = state.claims.filter(x => !polIds.includes(x.policyId));
        remove('customers', id);
        close(); location.hash = '#/customers'; commit('Müşteri ve verileri silindi (KVKK)'); toast('Müşteri silindi');
      });
    },
  });
}

/* ============================== Documents ============================== */

async function renderFiles(box, { customerId, policyId, claimId }) {
  if (!box) return;
  let files = [];
  try { files = await Docs.list({ customerId, policyId, claimId }); }
  catch (e) { box.innerHTML = '<p class="err">Belge deposu açılamadı (gizli pencere olabilir).</p>'; return; }
  files.sort((a, b) => b.at.localeCompare(a.at));
  const label = f => { const p = byId('policies', f.policyId); return p ? `${p.branch} poliçesi` : f.claimId ? 'Hasar dosyası' : 'Müşteri'; };
  box.innerHTML = `<div class="files">${files.map(f => `<div class="file-row"><span>${/pdf/.test(f.mime) ? '📕' : /image/.test(f.mime) ? '🖼️' : '📎'}</span>
      <div class="grow" title="${esc(f.name)}">${esc(f.name)}<div class="small muted">${label(f)} · ${(f.size / 1024).toFixed(0)} KB · ${fmtDate(f.at.slice(0, 10))}</div></div>
      <button type="button" class="btn xs" data-f-open="${f.id}">Aç</button><button type="button" class="btn xs danger" data-f-del="${f.id}">Sil</button></div>`).join('') || '<p class="muted">Belge yok</p>'}</div>
    <label class="btn sm mt" style="cursor:pointer">📎 Belge ekle (PDF, fotoğraf)<input type="file" multiple hidden accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"></label>`;
  $('input[type=file]', box).onchange = async e => {
    let added = 0;
    for (const file of e.target.files) {
      if (file.size > 20 * 1024 * 1024) { toast(`${file.name} 20 MB'tan büyük`, 'err'); continue; }
      try {
        await Docs.add({ id: uid(), customerId, policyId: policyId || '', claimId: claimId || '', name: file.name, mime: file.type, size: file.size, at: new Date().toISOString() }, file);
        added++;
      } catch (err) { toast(`${file.name} yüklenemedi: ${err.message}`, 'err'); }
    }
    if (added) toast('Belge eklendi');
    renderFiles(box, { customerId, policyId, claimId });
  };
  box.onclick = async e => {
    const o = e.target.closest('[data-f-open]'), d = e.target.closest('[data-f-del]');
    if (o) {
      const f = files.find(x => x.id === o.dataset.fOpen);
      const win = window.open('', '_blank'); // opened synchronously so popup blockers allow it
      try { const url = await Docs.url(f); if (win) win.location.href = url; else location.href = url; }
      catch (err) { win?.close(); toast('Belge açılamadı: ' + err.message, 'err'); }
    }
    if (d && await confirmBox('Belge silinsin mi?', 'Sil')) {
      try { await Docs.remove(files.find(x => x.id === d.dataset.fDel)); } catch (err) { toast('Silinemedi: ' + err.message, 'err'); }
      renderFiles(box, { customerId, policyId, claimId });
    }
  };
}

/* ============================== Policies ============================== */

function viewPolicies(view) {
  const f = ui.policies;
  view.innerHTML = `
    <div class="page-head"><div><h1>Poliçeler</h1><div class="muted">${state.policies.length} kayıt</div></div>
      <div class="actions"><button class="btn" data-act="importCsv">⬆ İçe aktar</button><button class="btn" id="pExport">⬇ Excel'e aktar</button><button class="btn primary" data-act="newPolicy">＋ Poliçe</button></div></div>
    <div class="filters">
      <input type="search" id="pSearch" placeholder="Müşteri, plaka, poliçe no…" value="${esc(f.q)}">
      <select id="pBranch"><option value="">Tüm branşlar</option>${opts(BRANCHES, f.branch)}</select>
      <select id="pCompany"><option value="">Tüm şirketler</option>${opts(companyList(), f.company)}</select>
      <select id="pStatus">${opts([['', 'Tüm durumlar'], ['aktif', 'Aktif'], ['bitti', 'Süresi doldu'], ['yenilendi', 'Yenilendi'], ['kaybedildi', 'Kaybedildi'], ['iptal', 'İptal']], f.status)}</select>
      <select id="pExp">${opts([['', 'Bitiş: tümü'], ['30', '30 gün içinde'], ['60', '60 gün içinde'], ['90', '90 gün içinde']], f.exp)}</select>
    </div>
    <div class="card"><div class="table-wrap" id="pList"></div></div>`;
  const filtered = () => {
    const nq = norm(f.q);
    return state.policies.filter(p => {
      const c = custOf(p);
      if (f.branch && p.branch !== f.branch) return false;
      if (f.company && p.company !== f.company) return false;
      if (f.status && policyStatus(p) !== f.status) return false;
      if (f.exp) { const d = daysUntil(p.endDate); if (d === null || d < 0 || d > +f.exp) return false; }
      return !nq || norm(`${c?.name} ${c?.phone} ${p.policyNo} ${p.subject} ${(p.subject || '').replace(/\s/g, '')} ${p.company}`).includes(nq);
    }).sort((a, b) => (a.endDate || '').localeCompare(b.endDate || ''));
  };
  const list = () => {
    const rows = filtered(), shown = rows.slice(0, 300);
    $('#pList').innerHTML = rows.length ? `<table class="stack"><thead><tr><th>Müşteri</th><th>Branş</th><th class="hide-mobile">Şirket</th><th class="hide-mobile">Konu</th><th>Bitiş</th><th class="num">Prim</th><th class="num hide-mobile">Komisyon</th><th class="hide-mobile">Durum</th></tr></thead><tbody>
      ${shown.map(p => `<tr class="click" data-open="openPolicy:${p.id}"><td><b>${esc(custOf(p)?.name || '—')}</b><div class="small muted">${esc(p.policyNo || '')}</div></td>
        <td>${esc(p.branch)}</td><td class="hide-mobile">${esc(p.company || '')}</td><td class="hide-mobile">${esc(p.subject || '')}</td>
        <td>${fmtDate(p.endDate)}${policyStatus(p) === 'aktif' && daysUntil(p.endDate) <= 30 ? '<br>' + daysBadge(daysUntil(p.endDate)) : ''}</td>
        <td class="num">${money(p.premium)}</td><td class="num hide-mobile">${money(p.commission)}</td><td class="hide-mobile">${statusBadge(p)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="5"><b>${rows.length} poliçe</b>${rows.length > 300 ? ' (ilk 300 gösteriliyor)' : ''}</td><td class="num"><b>${money(rows.reduce((a, p) => a + num(p.premium), 0))}</b></td>
        <td class="num hide-mobile"><b>${money(rows.reduce((a, p) => a + num(p.commission), 0))}</b></td><td class="hide-mobile"></td></tr></tfoot></table>`
      : emptyState('📄', 'Eşleşen poliçe yok', state.policies.length ? '' : '<button class="btn primary" data-act="newPolicy">＋ Poliçe ekle</button> <button class="btn" data-act="importCsv">Excel/CSV içe aktar</button>');
  };
  list();
  $('#pSearch').oninput = e => { f.q = e.target.value; list(); };
  [['#pBranch', 'branch'], ['#pCompany', 'company'], ['#pStatus', 'status'], ['#pExp', 'exp']].forEach(([s, k]) => { $(s).onchange = e => { f[k] = e.target.value; list(); }; });
  $('#pExport').onclick = () => exportPoliciesCSV(filtered());
}

function openPolicyForm(id, preset = {}, onSaved) {
  const p = id ? structuredClone(byId('policies', id)) : { branch: 'Trafik', startDate: todayStr(), endDate: addMonths(todayStr(), 12), payment: 'kart', status: 'aktif', ...preset };
  const c = custOf(p);
  const [subjL, subjPh] = subjectLabel(p.branch);
  const claims = id ? state.claims.filter(x => x.policyId === id) : [];

  openModal({
    title: id ? `${p.branch} poliçesi – ${c?.name || ''}` : 'Yeni poliçe', wide: true,
    body: `<form id="pf" class="form-grid">${custDatalist()}
      ${field('Müşteri *', `<input name="customer" list="custList" required value="${esc(c ? custLabel(c) : '')}" placeholder="İsim yazıp seçin ya da yeni isim girin">`)}
      ${field('Telefon (yeni müşteri için)', `<input name="newPhone" inputmode="tel" placeholder="05xx xxx xx xx" ${c ? 'disabled' : ''}>`)}
      ${field('Branş', `<select name="branch">${opts(BRANCHES, p.branch)}</select>`)}
      ${field('Sigorta şirketi', `<select name="company"><option value="">Seçin</option>${opts(companyList(p.company), p.company)}</select>`)}
      ${field('Poliçe no', `<input name="policyNo" value="${esc(p.policyNo || '')}">`)}
      ${field(`<span id="pSubjL">${subjL}</span>`, `<input name="subject" value="${esc(p.subject || '')}" placeholder="${esc(subjPh)}">`)}
      ${field('Başlangıç', `<input type="date" name="startDate" required value="${esc(p.startDate || '')}">`)}
      ${field('Bitiş', `<input type="date" name="endDate" required value="${esc(p.endDate || '')}">`)}
      ${field('Brüt prim (₺)', `<input type="number" step="0.01" min="0" name="premium" value="${esc(p.premium ?? '')}">`)}
      ${field(`Komisyon (₺) <span class="muted" id="rateHint"></span>`, `<input type="number" step="0.01" min="0" name="commission" value="${esc(p.commission ?? '')}">`)}
      ${field('Ödeme', `<select name="payment">${opts(Object.entries(PAYMENT), p.payment)}</select>`)}
      ${field('Taksit sayısı', `<input type="number" name="instCount" min="1" max="12" value="${esc(p.installments?.length || p.instCount || 3)}">`, 'inst-count')}
      ${id ? field('Durum', `<select name="status">${opts([['aktif', 'Aktif'], ['yenilendi', 'Yenilendi'], ['kaybedildi', 'Kaybedildi'], ['iptal', 'İptal']], p.status)}</select>`) : ''}
      ${field('Notlar', `<textarea name="notes" rows="2" placeholder="Teminat, muafiyet, özel şartlar…">${esc(p.notes || '')}</textarea>`, 'full')}
      ${p.installments?.length ? `<div class="full"><b>Taksitler</b><div class="card mt">${p.installments.map((inst, i) => `<div class="list-item"><div class="grow">${i + 1}. taksit · ${fmtDate(inst.due)} · <b>${money(inst.amount)}</b></div>
        ${inst.paid ? `<span class="badge green">Ödendi ${fmtDate(inst.paidAt)}</span>` : daysBadge(daysUntil(inst.due))}</div>`).join('')}</div><p class="muted small">Tahsilatları Tahsilat ekranından işaretleyin.</p></div>` : ''}
      ${claims.length ? `<div class="full"><b>Hasar dosyaları</b>${claims.map(x => `<div><a href="#" data-act="openClaim" data-id="${x.id}">${esc(x.fileNo || 'Dosya')} – ${CLAIM_LABEL[x.status]}</a></div>`).join('')}</div>` : ''}
      ${id ? '<div class="full"><b>Belgeler</b><div id="pFiles" class="mt"></div></div>' : '<p class="full muted small">Poliçe PDF\'ini kaydettikten sonra ekleyebilirsiniz.</p>'}
    </form>`,
    foot: `${id ? '<button class="btn danger" id="pDel">Sil</button>' : ''}<span class="spacer"></span>
      ${id ? `${waBtn(`data-pol="${id}" data-kind="police"`, 'Bilgi gönder')}${policyStatus(p) === 'aktif' || policyStatus(p) === 'bitti' ? `<button class="btn" data-act="startRenewal" data-id="${id}">🔁 Yenileme teklifi</button>` : ''}<button class="btn" data-act="newClaim" data-cust="${p.customerId}" data-pol="${id}">🛠️ Hasar</button>` : ''}
      <button class="btn primary" id="pSave">Kaydet</button>`,
    onMount(el, close) {
      const form = $('#pf', el);
      let endTouched = !!id;
      const rate = () => state.settings.rates[form.branch.value] || 0;
      const hint = () => { $('#rateHint', el).textContent = rate() ? `(%${rate()} öneri: ${money(num(form.premium.value) * rate() / 100)})` : ''; };
      const toggleInst = () => { $('.inst-count', el).hidden = form.payment.value !== 'taksit'; };
      hint(); toggleInst();
      form.payment.onchange = toggleInst;
      form.branch.onchange = () => { const [l, ph] = subjectLabel(form.branch.value); $('#pSubjL', el).textContent = l; form.subject.placeholder = ph; hint(); };
      form.premium.oninput = () => { hint(); if (!form.commission.dataset.touched) form.commission.value = num(form.premium.value) ? (num(form.premium.value) * rate() / 100).toFixed(2) : ''; };
      form.commission.oninput = () => { form.commission.dataset.touched = '1'; };
      if (p.commission) form.commission.dataset.touched = '1';
      else if (num(form.premium.value)) form.premium.oninput();
      form.endDate.oninput = () => { endTouched = true; };
      form.startDate.onchange = () => { if (!endTouched && form.startDate.value) form.endDate.value = addMonths(form.startDate.value, 12); };
      form.customer.oninput = () => { form.newPhone.disabled = !!findCustomer(form.customer.value); };
      if (id) renderFiles($('#pFiles', el), { customerId: p.customerId, policyId: id });

      $('#pSave', el).onclick = async () => {
        if (!form.reportValidity()) return;
        const d = formData(form);
        if (d.endDate < d.startDate) return toast('Bitiş tarihi başlangıçtan önce olamaz', 'err');
        let cust = findCustomer(d.customer);
        if (!cust) {
          if (!await confirmBox(`"${d.customer}" kayıtlı değil. Yeni müşteri olarak eklensin mi?`, 'Ekle', false)) return;
          cust = upsert('customers', { name: d.customer.trim(), phone: d.newPhone || '', type: 'bireysel', kvkk: false });
        }
        const prevPremium = byId('policies', id)?.premium;
        const data = { ...p, ...d, customerId: cust.id, premium: num(d.premium), commission: num(d.commission), status: d.status || p.status || 'aktif' };
        delete data.customer; delete data.newPhone;
        const sameShape = p.installments?.length && data.payment === p.payment && (data.payment !== 'taksit' || +d.instCount === p.installments.length) && num(prevPremium) === data.premium && data.startDate === p.startDate;
        data.installments = sameShape ? p.installments : buildInstallments(data, p.installments);
        const saved = upsert('policies', data);
        onSaved?.(saved);
        if (!id) addNote({ customerId: cust.id, kind: 'system', text: `Poliçe eklendi: ${saved.company || ''} ${saved.branch} ${saved.policyNo ? '#' + saved.policyNo : ''}` });
        close(); commit(id ? '' : `Yeni poliçe: ${cust.name} – ${saved.branch}`); toast('Poliçe kaydedildi');
        if (!id && cust.phone) {
          openModal({ title: 'Poliçe kaydedildi ✅', body: `<p>${esc(cust.name)} müşterisine poliçe bilgisini WhatsApp'tan gönderelim mi?</p>`,
            foot: `<span class="spacer"></span><button class="btn" data-close>Şimdi değil</button>${waBtn(`data-pol="${saved.id}" data-kind="police" data-close`, 'Gönder', '')}` });
        }
      };
      $('#pDel', el) && ($('#pDel', el).onclick = async () => {
        if (!await confirmBox('Poliçe silinsin mi? (Sadece hatalı kayıtlar için. Biten poliçeleri silmek yerine durumunu değiştirin.)', 'Sil')) return;
        remove('policies', id); close(); commit('Poliçe silindi');
      });
    },
  });
}

/* ============================== Claims ============================== */

function viewClaims(view) {
  const f = ui.claims;
  const rows = state.claims.filter(x => f.status === 'all' || (f.status === 'open' ? x.status !== 'kapandi' : x.status === f.status))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  view.innerHTML = `
    <div class="page-head"><div><h1>Hasar dosyaları</h1></div><div class="actions"><button class="btn primary" data-act="newClaim">＋ Hasar dosyası</button></div></div>
    <div class="filters"><select id="clStatus">${opts([['open', 'Açık dosyalar'], ['all', 'Tümü'], ...CLAIM_STAGES], f.status)}</select></div>
    <div class="card"><div class="table-wrap">${rows.length ? `<table class="stack"><thead><tr><th>Müşteri</th><th>Dosya / Poliçe</th><th>Hasar tarihi</th><th class="num hide-mobile">Tutar</th><th>Durum</th><th></th></tr></thead><tbody>
      ${rows.map(x => { const p = byId('policies', x.policyId); return `<tr class="click" data-open="openClaim:${x.id}"><td><b>${esc(custOf(x)?.name || '—')}</b></td>
        <td>${esc(x.fileNo || '—')}<div class="small muted">${esc(p ? `${p.branch} · ${p.company || ''}` : '')}</div></td><td>${fmtDate(x.date)}</td>
        <td class="num hide-mobile">${x.amount ? money(x.amount) : '—'}</td><td><span class="badge ${x.status === 'kapandi' ? 'green' : 'amber'}">${CLAIM_LABEL[x.status]}</span></td>
        <td>${waBtn(`data-claim="${x.id}"`, 'Bilgi ver', 'xs')}</td></tr>`; }).join('')}</tbody></table>`
      : emptyState('🛠️', 'Hasar dosyası yok')}</div></div>`;
  $('#clStatus').onchange = e => { f.status = e.target.value; render(); };
}

function openClaimForm(id, preset = {}) {
  const x = id ? byId('claims', id) : { status: 'bildirildi', date: todayStr(), ...preset };
  const c = custOf(x) || custOf(byId('policies', x.policyId));
  const polOpts = cid => state.policies.filter(p => p.customerId === cid)
    .map(p => `<option value="${p.id}" ${p.id === x.policyId ? 'selected' : ''}>${esc(`${p.branch} · ${p.company || ''} · ${p.subject || p.policyNo || ''}`)}</option>`).join('');
  const stageIdx = CLAIM_STAGES.findIndex(s => s[0] === x.status);
  openModal({
    title: id ? `Hasar dosyası – ${c?.name || ''}` : 'Yeni hasar dosyası',
    body: `${id ? `<div class="steps mb">${CLAIM_STAGES.map(([k, l], i) => `<span class="${i < stageIdx ? 'done' : i === stageIdx ? 'cur' : ''}">${l}</span>`).join('')}</div>` : ''}
      <form id="clf" class="form-grid">${custDatalist()}
      ${field('Müşteri *', `<input name="customer" list="custList" required value="${esc(c ? custLabel(c) : '')}">`)}
      ${field('Poliçe', `<select name="policyId"><option value="">Seçin</option>${c ? polOpts(c.id) : ''}</select>`)}
      ${field('Hasar dosya no', `<input name="fileNo" value="${esc(x.fileNo || '')}">`)}
      ${field('Hasar tarihi', `<input type="date" name="date" value="${esc(x.date || '')}">`)}
      ${field('Durum', `<select name="status">${opts(CLAIM_STAGES, x.status)}</select>`)}
      ${field('Tahmini / ödenen tutar (₺)', `<input type="number" step="0.01" name="amount" value="${esc(x.amount || '')}">`)}
      ${field('Olay açıklaması', `<textarea name="description" rows="3">${esc(x.description || '')}</textarea>`, 'full')}
      ${field('Notlar (eksper, servis, eksik evrak…)', `<textarea name="notes" rows="2">${esc(x.notes || '')}</textarea>`, 'full')}
      ${id && c ? '<div class="full"><b>Belgeler (tutanak, fotoğraflar)</b><div id="clFiles" class="mt"></div></div>' : ''}
    </form>`,
    foot: `${id ? '<button class="btn danger" id="clDel">Sil</button>' : ''}<span class="spacer"></span>${id ? waBtn(`data-claim="${id}"`, 'Durum bildir') : ''}<button class="btn primary" id="clSave">Kaydet</button>`,
    onMount(el, close) {
      const form = $('#clf', el);
      form.customer.onchange = () => { const cc = findCustomer(form.customer.value); form.policyId.innerHTML = '<option value="">Seçin</option>' + (cc ? polOpts(cc.id) : ''); };
      if (id && c) renderFiles($('#clFiles', el), { customerId: c.id, claimId: id });
      $('#clSave', el).onclick = () => {
        if (!form.reportValidity()) return;
        const d = formData(form), cc = findCustomer(d.customer);
        if (!cc) return toast('Önce müşteriyi kaydedin ya da listeden seçin', 'err');
        const statusChanged = id && x.status !== d.status;
        delete d.customer;
        const saved = upsert('claims', { ...x, ...d, customerId: cc.id, amount: num(d.amount) });
        if (!id) addNote({ customerId: cc.id, kind: 'system', text: `Hasar dosyası açıldı ${saved.fileNo || ''}` });
        else if (statusChanged) addNote({ customerId: cc.id, kind: 'system', text: `Hasar ${saved.fileNo || ''}: ${CLAIM_LABEL[saved.status]}` });
        close(); commit(id ? '' : 'Yeni hasar dosyası'); toast('Hasar dosyası kaydedildi');
        if (statusChanged && cc.phone) openComposer({ claimId: saved.id });
      };
      $('#clDel', el) && ($('#clDel', el).onclick = async () => { if (await confirmBox('Hasar dosyası silinsin mi?', 'Sil')) { remove('claims', id); close(); commit(); } });
    },
  });
}

/* ============================== Collections ============================== */

function viewCollections(view) {
  const f = ui.collections;
  const all = installmentList();
  const open = all.filter(x => !x.inst.paid);
  const groups = f.show === 'paid'
    ? [['Son 60 günde ödenenler', all.filter(x => x.inst.paid && x.inst.paidAt >= addDays(todayStr(), -60)).reverse()]]
    : [['Gecikmiş', open.filter(x => x.days < 0)], ['Bu hafta', open.filter(x => x.days >= 0 && x.days <= 7)],
       ['Bu ay', open.filter(x => x.days > 7 && x.days <= 31)], ['Sonra', open.filter(x => x.days > 31)]];
  view.innerHTML = `
    <div class="page-head"><div><h1>Tahsilat</h1><div class="muted">Primini acentenin tahsil ettiği poliçelerin taksitleri</div></div></div>
    <div class="grid kpis">
      <div class="card kpi alert"><div class="label">Gecikmiş</div><div class="value">${money(open.filter(x => x.days < 0).reduce((a, x) => a + num(x.inst.amount), 0))}</div></div>
      <div class="card kpi"><div class="label">30 gün içinde</div><div class="value">${money(open.filter(x => x.days >= 0 && x.days <= 30).reduce((a, x) => a + num(x.inst.amount), 0))}</div></div>
      <div class="card kpi"><div class="label">Toplam açık</div><div class="value">${money(open.reduce((a, x) => a + num(x.inst.amount), 0))}</div></div>
    </div>
    <div class="tabs"><button class="${f.show === 'open' ? 'active' : ''}" id="tOpen">Bekleyen</button><button class="${f.show === 'paid' ? 'active' : ''}" id="tPaid">Ödenenler</button></div>
    ${groups.filter(([, r]) => r.length).map(([t, r]) => `<div class="card mb"><div class="card-head"><h2>${t}</h2><span class="badge">${r.length}</span></div>${r.slice(0, 200).map(instRow).join('')}</div>`).join('')
      || `<div class="card">${emptyState('💳', 'Kayıt yok. Poliçede ödeme şeklini “Taksitli – acenteye” seçtiğinizde taksitler burada görünür.')}</div>`}`;
  $('#tOpen').onclick = () => { f.show = 'open'; render(); };
  $('#tPaid').onclick = () => { f.show = 'paid'; render(); };
}

/* ============================== Tasks ============================== */

function viewTasks(view) {
  const open = state.tasks.filter(t => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const done = state.tasks.filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 20);
  view.innerHTML = `
    <div class="page-head"><h1>Görevler</h1></div>
    <form id="qtask" class="card card-pad mb hstack"><input name="title" placeholder="Hızlı görev ekle – ör. Ahmet Bey'in ruhsatını iste" required style="flex:1;min-width:200px">
      <input type="date" name="due" value="${todayStr()}" style="width:auto"><button class="btn primary">Ekle</button></form>
    <div class="card mb"><div class="card-head"><h2>Açık</h2><span class="badge">${open.length}</span></div>${open.map(taskRow).join('') || emptyState('🎉', 'Hepsi tamam')}</div>
    ${done.length ? `<div class="card"><div class="card-head"><h2>Tamamlanan (son 20)</h2></div>${done.map(taskRow).join('')}</div>` : ''}`;
  $('#qtask').onsubmit = e => { e.preventDefault(); const d = formData(e.target); upsert('tasks', { title: d.title.trim(), due: d.due, done: false }); commit(); };
}

function openTaskForm(id, preset = {}) {
  const t = id ? byId('tasks', id) : { due: todayStr(), done: false, ...preset };
  const c = custOf(t);
  openModal({
    title: id ? 'Görev' : 'Yeni görev',
    body: `<form id="tf" class="form-grid">${custDatalist()}
      ${field('Görev *', `<input name="title" required value="${esc(t.title || '')}">`, 'full')}
      ${field('Tarih', `<input type="date" name="due" value="${esc(t.due || '')}">`)}
      ${field('Müşteri (opsiyonel)', `<input name="customer" list="custList" value="${esc(c ? custLabel(c) : '')}">`)}
      ${field('Not', `<textarea name="notes" rows="2">${esc(t.notes || '')}</textarea>`, 'full')}</form>`,
    foot: `${id ? '<button class="btn danger" id="tDel">Sil</button>' : ''}<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" id="tSave">Kaydet</button>`,
    onMount(el, close) {
      const form = $('#tf', el);
      $('#tSave', el).onclick = () => {
        if (!form.reportValidity()) return;
        const d = formData(form);
        upsert('tasks', { ...t, title: d.title.trim(), due: d.due, notes: d.notes, customerId: findCustomer(d.customer)?.id || '' });
        close(); commit(); toast('Görev kaydedildi');
      };
      $('#tDel', el) && ($('#tDel', el).onclick = () => { remove('tasks', id); close(); commit(); });
    },
  });
}

/* ============================== Reports ============================== */

function viewReports(view) {
  const f = ui.reports;
  const today = todayStr();
  const from = f.range === 'year' ? today.slice(0, 4) + '-01-01' : f.range === '12' ? addMonths(today, -12) : '0000';
  const pols = state.policies.filter(p => p.status !== 'iptal' && (p.startDate || '') >= from && (p.startDate || '') <= today);
  const totalP = pols.reduce((a, p) => a + num(p.premium), 0), totalC = pols.reduce((a, p) => a + num(p.commission), 0);

  const months = Array.from({ length: 12 }, (_, i) => addMonths(today.slice(0, 7) + '-01', i - 11).slice(0, 7));
  const byMonth = months.map(m => { const ps = state.policies.filter(p => p.status !== 'iptal' && (p.startDate || '').startsWith(m)); return { m, p: ps.reduce((a, x) => a + num(x.premium), 0), c: ps.reduce((a, x) => a + num(x.commission), 0) }; });
  const maxM = Math.max(1, ...byMonth.map(x => x.p));

  const group = key => {
    const g = {};
    pols.forEach(p => { const k = p[key] || '—'; g[k] = g[k] || { n: 0, p: 0, c: 0 }; g[k].n++; g[k].p += num(p.premium); g[k].c += num(p.commission); });
    return Object.entries(g).sort((a, b) => b[1].p - a[1].p);
  };
  const groupTable = (title, rows) => `<div class="card"><div class="card-head"><h2>${title}</h2></div><div class="table-wrap"><table>
    <thead><tr><th></th><th class="num">Adet</th><th class="num">Prim</th><th class="num hide-mobile">Komisyon</th><th class="hide-mobile">Pay</th></tr></thead><tbody>
    ${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.n}</td><td class="num">${money(v.p)}</td><td class="num hide-mobile">${money(v.c)}</td>
      <td class="hide-mobile"><div class="hbar"><div style="width:${totalP ? (v.p / totalP * 100).toFixed(1) : 0}%"></div></div></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Veri yok</td></tr>'}
    </tbody></table></div></div>`;

  // Renewal retention: policies whose term ended in the last 12 months
  const ended = state.policies.filter(p => p.endDate && p.endDate < today && p.endDate >= addMonths(today, -12) && p.status !== 'iptal');
  const renewed = ended.filter(p => p.status === 'yenilendi').length;
  const lost = ended.filter(p => p.status === 'kaybedildi');
  const retention = ended.length ? Math.round(renewed / ended.length * 100) : null;

  const qs = state.quotes.filter(q => (q.createdAt || '').slice(0, 10) >= from);
  const won = qs.filter(q => q.stage === 'kazanildi').length, lostQ = qs.filter(q => q.stage === 'kaybedildi');
  const conv = won + lostQ.length ? Math.round(won / (won + lostQ.length) * 100) : null;
  const reasons = {}; [...lostQ.map(q => q.lostReason), ...lost.map(p => p.lostReason)].forEach(r => { r = r || 'Belirtilmedi'; reasons[r] = (reasons[r] || 0) + 1; });
  const sources = {}; qs.forEach(q => { const s = q.source || '—'; sources[s] = sources[s] || { n: 0, w: 0 }; sources[s].n++; if (q.stage === 'kazanildi') sources[s].w++; });

  view.innerHTML = `
    <div class="page-head"><h1>Raporlar</h1><div class="actions"><select id="rRange" style="width:auto">${opts([['12', 'Son 12 ay'], ['year', 'Bu yıl'], ['all', 'Tüm zamanlar']], f.range)}</select></div></div>
    <div class="grid kpis">
      <div class="card kpi"><div class="label">Üretim (prim)</div><div class="value">${money(totalP)}</div><div class="sub">${pols.length} poliçe</div></div>
      <div class="card kpi"><div class="label">Komisyon</div><div class="value">${money(totalC)}</div><div class="sub">ort. %${totalP ? (totalC / totalP * 100).toFixed(1) : 0}</div></div>
      <div class="card kpi"><div class="label">Yenileme oranı</div><div class="value">${retention === null ? '—' : '%' + retention}</div><div class="sub">son 12 ayda biten ${ended.length} poliçe</div></div>
      <div class="card kpi"><div class="label">Teklif dönüşümü</div><div class="value">${conv === null ? '—' : '%' + conv}</div><div class="sub">${won} kazanıldı / ${lostQ.length} kaybedildi</div></div>
      <div class="card kpi"><div class="label">Müşteri</div><div class="value">${state.customers.length}</div><div class="sub">${new Set(state.policies.filter(p => policyStatus(p) === 'aktif').map(p => p.customerId)).size} aktif poliçeli</div></div>
    </div>
    <div class="card mb"><div class="card-head"><h2>Aylık üretim (son 12 ay)</h2><span class="small muted" style="margin-left:auto">■ prim ■ komisyon</span></div>
      <div class="bars">${byMonth.map(x => `<div class="bar" title="${x.m}: ${money(x.p)} prim, ${money(x.c)} komisyon">
        <div style="display:flex;gap:2px;align-items:flex-end;width:100%;justify-content:center;flex:1"><div class="fill" style="height:${x.p / maxM * 100}%"></div><div class="fill c" style="height:${x.c / maxM * 100}%"></div></div>
        <div class="lbl">${MONTHS[+x.m.slice(5) - 1]}</div></div>`).join('')}</div></div>
    <div class="grid two mb">${groupTable('Şirket bazında', group('company'))}${groupTable('Branş bazında', group('branch'))}</div>
    <div class="grid two">
      <div class="card"><div class="card-head"><h2>Talep kaynakları</h2></div><div class="table-wrap"><table><thead><tr><th></th><th class="num">Talep</th><th class="num">Kazanılan</th><th class="num">Oran</th></tr></thead><tbody>
        ${Object.entries(sources).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.n}</td><td class="num">${v.w}</td><td class="num">%${Math.round(v.w / v.n * 100)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Veri yok</td></tr>'}</tbody></table></div></div>
      <div class="card"><div class="card-head"><h2>Kayıp nedenleri</h2></div>
        ${Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="list-item"><div class="grow">${esc(k)}</div><b>${n}</b></div>`).join('') || emptyState('👍', 'Kayıp yok')}</div>
    </div>`;
  $('#rRange').onchange = e => { f.range = e.target.value; render(); };
}

/* ============================== Settings & data ============================== */

function viewSettings(view) {
  const s = state.settings;
  view.innerHTML = `
    <div class="page-head"><h1>Ayarlar & Veri</h1></div>
    <div class="grid two mb">
      <form class="card" id="sfAgency"><div class="card-head"><h2>Acente bilgileri</h2></div><div class="card-pad form-grid">
        ${field('Acente adı', `<input name="agencyName" value="${esc(s.agencyName)}">`)}
        ${field('Adınız (mesaj imzası)', `<input name="ownerName" value="${esc(s.ownerName)}" placeholder="Sevgi Demirkol">`)}
        ${field('Telefon', `<input name="phone" value="${esc(s.phone)}">`)}
        ${field('Yenileme takip süresi (gün)', `<input type="number" min="15" max="120" name="renewalWindow" value="${esc(s.renewalWindow)}">`)}
        <div class="full"><button class="btn primary">Kaydet</button></div></div></form>
      <div class="card"><div class="card-head"><h2>${Cloud.enabled ? 'Bu cihazın kilidi (PIN)' : 'Güvenlik'}</h2></div><div class="card-pad">
        <p class="muted">PIN belirlerseniz panel ${Cloud.enabled ? 'bu cihazda ' : ''}açılışta ve 15 dakika işlem yapılmadığında kilitlenir.${Cloud.enabled ? ' Telefonunuz için önerilir.' : ''}</p>
        <form id="sfPin" class="hstack"><input type="password" name="pin" inputmode="numeric" minlength="4" placeholder="Yeni PIN (en az 4 hane)" style="flex:1">
          <button class="btn primary">${s.pinHash ? 'PIN değiştir' : 'PIN belirle'}</button></form>
        ${s.pinHash ? '<button class="btn sm danger mt" id="pinOff">PIN\'i kaldır</button>' : ''}
        ${Cloud.enabled ? '' : '<p class="muted small mt">Not: Veriler bu cihazın tarayıcısında saklanır. Telefon + bilgisayar arası senkronizasyon ve gerçek kullanıcı girişi için bulut sürümüne geçilmelidir.</p>'}
      </div></div>
    </div>

    ${Cloud.enabled ? `<div class="grid two mb" id="cloudCards"></div>` : ''}

    <div class="card mb"><div class="card-head"><h2>Yedekleme & veri</h2></div><div class="card-pad">
      ${Cloud.enabled
        ? `<p>Verileriniz bulutta saklanıyor ve <b>her gece otomatik yedekleniyor</b> (son 30 gün). İsterseniz ayrıca elle bir kopya indirebilirsiniz.</p>`
        : `<p>Son yedek: <b>${s.lastBackupAt ? fmtDateTime(s.lastBackupAt) : 'hiç alınmadı'}</b>. Haftada bir yedek alıp Google Drive / iCloud'a kaydetmenizi öneririm.</p>`}
      <div class="hstack mt">
        <button class="btn primary" data-act="backup">⬇ ${Cloud.enabled ? 'Veri kopyası indir' : 'Tam yedek indir (belgeler dahil)'}</button>
        ${isOwner() ? '<button class="btn" id="restore">⬆ Yedek dosyasından geri yükle</button>' : ''}
      </div>
      <div class="hstack mt">
        <button class="btn" data-act="importCsv">⬆ Excel/CSV poliçe listesi içe aktar</button>
        <button class="btn" id="csvTpl">Örnek CSV şablonu</button>
        <button class="btn" id="expCust">⬇ Müşteriler (Excel)</button>
        <button class="btn" id="expPol">⬇ Poliçeler (Excel)</button>
      </div>
      ${isOwner() ? '<div class="hstack mt"><button class="btn" data-act="loadDemo">Demo verisi yükle</button><button class="btn danger" id="wipe">Tüm verileri sil</button></div>' : ''}
    </div></div>

    <div class="card mb"><div class="card-head"><h2>WhatsApp mesaj şablonları</h2><div class="actions"><button class="btn sm" id="addTpl">＋ Şablon</button></div></div><div class="card-pad">
      <p class="muted small">Kullanılabilir alanlar: {ad} {brans} {sirket} {policeno} {bitis} {konu} {plaka} {prim} {teklifler} {dosya} {durum} {tutar} {vade} {acente}</p>
      <form id="sfTpl">${s.templates.map(t => `<div class="mt" data-tid="${t.id}"><div class="hstack"><input class="tn" value="${esc(t.name)}" style="flex:1"><button type="button" class="icon-btn tdel" aria-label="Sil">🗑</button></div>
        <textarea class="tt" rows="4" style="margin-top:6px">${esc(t.text)}</textarea></div>`).join('')}
        <button class="btn primary mt">Şablonları kaydet</button></form>
    </div></div>

    <div class="grid two mb">
      <form class="card" id="sfComp"><div class="card-head"><h2>Çalışılan sigorta şirketleri</h2></div><div class="card-pad">
        <textarea name="companies" rows="10">${esc(s.companies.join('\n'))}</textarea><p class="muted small">Her satıra bir şirket.</p><button class="btn primary">Kaydet</button></div></form>
      <form class="card" id="sfRates"><div class="card-head"><h2>Varsayılan komisyon oranları (%)</h2></div><div class="card-pad form-grid">
        ${BRANCHES.map(b => field(b, `<input type="number" step="0.1" min="0" max="100" name="${esc(b)}" value="${esc(s.rates[b] ?? '')}">`)).join('')}
        <div class="full"><button class="btn primary">Kaydet</button></div></div></form>
    </div>

    <div class="card"><div class="card-head"><h2>İşlem geçmişi${Cloud.enabled ? ' (bu cihaz)' : ''}</h2></div>
      ${state.log.slice(0, 40).map(l => `<div class="list-item"><div class="grow">${esc(l.text)}</div><span class="small muted">${fmtDateTime(l.at)}</span></div>`).join('') || emptyState('📜', 'Henüz işlem yok')}</div>
    ${Cloud.enabled && isOwner() ? '<div class="card mt" id="auditCard"><div class="card-head"><h2>Kim ne değiştirdi (tüm kullanıcılar)</h2></div><div class="empty">Yükleniyor…</div></div>' : ''}`;

  $('#sfAgency').onsubmit = e => { e.preventDefault(); Object.assign(s, formData(e.target)); s.renewalWindow = +s.renewalWindow || 60; commit('Acente bilgileri güncellendi'); toast('Kaydedildi'); };
  $('#sfPin').onsubmit = async e => { e.preventDefault(); const pin = e.target.pin.value; if (pin.length < 4) return toast('PIN en az 4 hane olmalı', 'err'); s.pinHash = await hashPin(pin); commit('PIN güncellendi'); toast('PIN belirlendi'); };
  $('#pinOff') && ($('#pinOff').onclick = () => { s.pinHash = ''; commit('PIN kaldırıldı'); });
  $('#sfComp').onsubmit = e => { e.preventDefault(); s.companies = e.target.companies.value.split('\n').map(x => x.trim()).filter(Boolean); commit(); toast('Kaydedildi'); };
  $('#sfRates').onsubmit = e => { e.preventDefault(); const d = formData(e.target); BRANCHES.forEach(b => { s.rates[b] = num(d[b]); }); commit(); toast('Kaydedildi'); };
  $('#sfTpl').onsubmit = e => {
    e.preventDefault();
    s.templates = $$('[data-tid]', e.target).map(div => { const old = s.templates.find(t => t.id === div.dataset.tid) || {}; return { ...old, id: div.dataset.tid, name: $('.tn', div).value, text: $('.tt', div).value }; });
    commit('Şablonlar güncellendi'); toast('Şablonlar kaydedildi');
  };
  $('#sfTpl').onclick = e => { const b = e.target.closest('.tdel'); if (b) b.closest('[data-tid]').remove(); };
  $('#addTpl').onclick = () => { s.templates.push({ id: 't_' + uid(), kind: 'genel', name: 'Yeni şablon', text: 'Merhaba {ad},\n\n{acente}' }); commit(); };
  $('#restore') && ($('#restore').onclick = () => pickFile('.json,application/json', restoreBackup));
  $('#csvTpl').onclick = () => download('mosso-police-sablonu.csv', toCSV([CSV_HEADERS, ['Ayşe Yılmaz', '0532 111 22 33', '12345678901', 'ayse@ornek.com', 'Kasko', 'Allianz', 'K-123456', '15.03.2026', '15.03.2027', '18.500,00', '2.775,00', '34 ABC 123']]));
  $('#expCust').onclick = () => download(`musteriler-${todayStr()}.csv`, toCSV([['Ad Soyad', 'Tür', 'Telefon', 'TC/VKN', 'E-posta', 'Doğum tarihi', 'Şehir', 'Adres', 'Etiketler', 'KVKK'],
    ...state.customers.map(c => [c.name, c.type, c.phone, c.tc, c.email, fmtDate(c.birthDate), c.city, c.address, c.tags, c.kvkk ? 'Evet' : 'Hayır'])]));
  $('#expPol').onclick = () => exportPoliciesCSV(state.policies);
  $('#wipe') && ($('#wipe').onclick = async () => {
    const where = Cloud.enabled ? 'buluttan ve TÜM cihazlardan' : 'bu cihazdan';
    if (!await confirmBox(`TÜM müşteri, poliçe, teklif ve belgeler ${where} silinecek. Önce yedek aldığınızdan emin olun. Devam?`, 'Hepsini sil')) return;
    try { await Docs.clear(); } catch (e) { return toast('Belgeler silinemedi: ' + e.message, 'err'); }
    const settings = state.settings; state = migrate({ settings });
    commit('Tüm veriler silindi'); toast('Veriler silindi');
  });
  if (Cloud.enabled) mountCloudSettings();
}

/* ---------- Cloud-only settings: account, 2FA, users, automatic backups, audit ---------- */

function mountCloudSettings() {
  const box = $('#cloudCards');
  const lastSync = Cloud.lastSync ? fmtDateTime(Cloud.lastSync) : '—';
  box.innerHTML = `
    <div class="card"><div class="card-head"><h2>Hesap & senkronizasyon</h2></div><div class="card-pad">
      <div class="kv"><div><span>Giriş yapan</span><b>${esc(Cloud.user?.email)}</b></div><div><span>Rol</span><b>${Cloud.isOwner ? 'Acente sahibi' : 'Çalışan'}</b></div>
        <div><span>Son eşitleme</span><b>${lastSync}</b></div><div><span>Gönderilmeyi bekleyen</span><b>${Cloud.pending}</b></div></div>
      ${Cloud.lastError ? `<p class="err small mt">Son hata: ${esc(Cloud.lastError)}</p>` : ''}
      <div class="hstack mt"><button class="btn sm" id="syncNow">⟳ Şimdi eşitle</button><button class="btn sm" id="chPw">Şifre değiştir</button><button class="btn sm danger" id="signOut2">Çıkış yap</button></div>
    </div></div>
    <div class="card"><div class="card-head"><h2>İki adımlı doğrulama (2FA)</h2></div><div class="card-pad" id="mfaBox"><p class="muted">Yükleniyor…</p></div></div>
    ${Cloud.isOwner ? `
    <div class="card"><div class="card-head"><h2>Kullanıcılar</h2></div><div class="card-pad">
      <div id="memberList"><p class="muted">Yükleniyor…</p></div>
      <form id="addMember" class="hstack mt"><input name="email" type="email" required placeholder="asistan@ornek.com" style="flex:1;min-width:180px">
        <select name="role" style="width:auto">${opts([['staff', 'Çalışan'], ['owner', 'Sahip']])}</select><button class="btn primary">Ekle</button></form>
      <p class="muted small mt">Önce kişiyi Supabase → Authentication → Users → <b>Invite user</b> ile davet edin, şifresini belirlesin, sonra buradan ekleyin. Çalışanlar raporları ve veri silme işlemlerini görmez.</p>
    </div></div>
    <div class="card"><div class="card-head"><h2>Otomatik yedekler</h2></div><div class="card-pad" id="autoBackups"><p class="muted">Yükleniyor…</p></div></div>` : ''}`;

  $('#syncNow').onclick = async () => { await Cloud.syncNow(); await Cloud.flush(); render(); toast(Cloud.lastError ? 'Eşitleme hatası: ' + Cloud.lastError : 'Eşitlendi', Cloud.lastError ? 'err' : ''); };
  $('#signOut2').onclick = () => Cloud.signOut();
  $('#chPw').onclick = () => openModal({
    title: 'Şifre değiştir',
    body: `<form id="pwf" class="form-grid">${field('Yeni şifre', '<input type="password" name="p1" minlength="8" required autocomplete="new-password">')}${field('Tekrar', '<input type="password" name="p2" minlength="8" required autocomplete="new-password">')}</form>`,
    foot: '<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" id="pwOk">Kaydet</button>',
    onMount(el, close) {
      $('#pwOk', el).onclick = async () => {
        const f = $('#pwf', el); if (!f.reportValidity()) return;
        if (f.p1.value !== f.p2.value) return toast('Şifreler aynı değil', 'err');
        try { await Cloud.changePassword(f.p1.value); close(); toast('Şifre değiştirildi'); } catch (e) { toast(e.message, 'err'); }
      };
    },
  });

  renderMfa();
  if (Cloud.isOwner) { renderMembers(); renderAutoBackups(); renderAudit(); }
  $('#addMember') && ($('#addMember').onsubmit = async e => {
    e.preventDefault(); const d = formData(e.target);
    try { await Cloud.members.add(d.email, d.role); toast('Kullanıcı eklendi'); e.target.reset(); renderMembers(); } catch (err) { toast(err.message, 'err'); }
  });
}

async function renderMfa() {
  const box = $('#mfaBox'); if (!box) return;
  let factors = [];
  try { factors = await Cloud.mfa.factors(); } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  if (factors.length) {
    box.innerHTML = `<p><span class="badge green">Açık</span> Girişte şifreye ek olarak telefonunuzdaki 6 haneli kod istenir.</p><button class="btn sm danger mt" id="mfaOff">2FA'yı kapat</button>`;
    $('#mfaOff').onclick = async () => {
      if (!await confirmBox('İki adımlı doğrulama kapatılsın mı? Hesabınız daha az korunur.', 'Kapat')) return;
      try { await Cloud.mfa.unenroll(factors[0].id); toast('2FA kapatıldı'); renderMfa(); } catch (e) { toast(e.message, 'err'); }
    };
    return;
  }
  box.innerHTML = `<p>Şifreniz çalınsa bile hesabınıza girilemesin: Google Authenticator veya Microsoft Authenticator ile <b>önerilir</b>.</p><button class="btn primary sm mt" id="mfaOn">2FA'yı aç</button>`;
  $('#mfaOn').onclick = async () => {
    let en;
    try { en = await Cloud.mfa.enroll(); } catch (e) { return toast(e.message, 'err'); }
    openModal({
      title: 'İki adımlı doğrulamayı aç',
      body: `<ol><li>Telefonunuzda Google Authenticator'ı açın ve <b>QR kodu tarayın</b>.</li><li>Uygulamada görünen 6 haneli kodu aşağıya yazın.</li></ol>
        <div class="hstack" style="justify-content:center"><img class="qr" src="${esc(en.totp.qr_code)}" alt="QR kod"></div>
        <p class="small muted mt">QR okutamıyorsanız bu anahtarı elle girin: <code class="secret">${esc(en.totp.secret)}</code></p>
        ${field('6 haneli kod', '<input id="mfaCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code">')}`,
      foot: '<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" id="mfaVerify">Doğrula ve aç</button>',
      onMount(el, close) {
        $('#mfaVerify', el).onclick = async () => {
          try { await Cloud.mfa.verify(en.id, $('#mfaCode', el).value.trim()); close(); toast('2FA açıldı ✅'); renderMfa(); }
          catch (e) { toast('Kod hatalı, tekrar deneyin', 'err'); }
        };
      },
    });
  };
}

async function renderMembers() {
  const box = $('#memberList'); if (!box) return;
  try {
    const list = await Cloud.members.list();
    box.innerHTML = list.map(m => `<div class="list-item" style="padding:8px 0"><div class="grow"><div class="title">${esc(m.email)}</div><div class="meta">${m.role === 'owner' ? 'Sahip' : 'Çalışan'} · ${fmtDate(m.created_at.slice(0, 10))}</div></div>
      ${m.user_id === Cloud.user.id ? '<span class="badge">Siz</span>' : `<button class="btn xs danger" data-rm="${m.user_id}">Çıkar</button>`}</div>`).join('');
    box.onclick = async e => {
      const b = e.target.closest('[data-rm]'); if (!b) return;
      if (!await confirmBox('Bu kullanıcının erişimi kaldırılsın mı?', 'Kaldır')) return;
      try { await Cloud.members.remove(b.dataset.rm); renderMembers(); } catch (err) { toast(err.message, 'err'); }
    };
  } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

async function renderAutoBackups() {
  const box = $('#autoBackups'); if (!box) return;
  try {
    const list = await Cloud.backups.list();
    box.innerHTML = list.length ? `<div class="files">${list.map(f => `<div class="file-row"><span>🗄️</span><div class="grow">${fmtDateTime(f.taken_at)}<div class="small muted">${(f.bytes / 1024).toFixed(0)} KB</div></div>
        <button class="btn xs" data-dl="${f.id}">İndir</button><button class="btn xs danger" data-rs="${f.id}">Geri dön</button></div>`).join('')}</div>
        <p class="muted small mt">Her gece 04:00'te alınır, son 14 gün saklanır.</p>`
      : '<p class="muted">Henüz otomatik yedek yok. İlk yedek bu gece 04:00\'te alınır.</p>';
    box.onclick = async e => {
      const dl = e.target.closest('[data-dl]'), rs = e.target.closest('[data-rs]');
      try {
        if (dl) { const b = await Cloud.backups.read(dl.dataset.dl); download(`mosso-otomatik-yedek-${b.takenAt.slice(0, 10)}.json`, JSON.stringify(b), 'application/json'); }
        if (rs) {
          const b = await Cloud.backups.read(rs.dataset.rs);
          const st = Cloud.backups.toState(b);
          if (!await confirmBox(`${fmtDateTime(b.takenAt)} tarihli yedeğe dönülecek (${st.customers.length} müşteri, ${st.policies.length} poliçe). O tarihten sonraki değişiklikler TÜM cihazlarda kaybolur. Devam?`, 'Geri dön')) return;
          state = migrate({ ...st, log: state.log, settings: { ...migrateSettings(st.settings), pinHash: state.settings.pinHash } });
          commit(`Otomatik yedeğe dönüldü: ${fmtDate(b.takenAt.slice(0, 10))}`); toast('Yedek geri yüklendi');
        }
      } catch (err) { toast(err.message, 'err'); }
    };
  } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

async function renderAudit() {
  const card = $('#auditCard'); if (!card) return;
  const TABLE_LABEL = { customers: 'Müşteri', policies: 'Poliçe', quotes: 'Teklif', claims: 'Hasar', tasks: 'Görev', notes: 'Not', files: 'Belge', settings: 'Ayarlar' };
  const ACTION_LABEL = { insert: 'eklendi', update: 'güncellendi', delete: 'silindi', restore: 'geri getirildi' };
  try {
    const [rows, members] = await Promise.all([Cloud.audit(60), Cloud.members.list()]);
    const who = Object.fromEntries(members.map(m => [m.user_id, m.email.split('@')[0]]));
    const label = r => {
      const rec = r.table_name === 'settings' ? null : byId(r.table_name, r.record_id);
      if (!rec) return '';
      const c = r.table_name === 'customers' ? rec : custOf(rec);
      return esc(c?.name || rec.title || rec.name || '');
    };
    card.innerHTML = `<div class="card-head"><h2>Kim ne değiştirdi (tüm kullanıcılar)</h2></div>` + (rows.map(r => `<div class="list-item"><div class="grow">
      <b>${TABLE_LABEL[r.table_name] || r.table_name}</b> ${ACTION_LABEL[r.action] || r.action} <span class="muted">${label(r)}</span></div>
      <span class="small muted">${esc(who[r.user_id] || 'sistem')} · ${fmtDateTime(r.at)}</span></div>`).join('') || emptyState('📜', 'Kayıt yok'));
  } catch (e) { card.innerHTML = `<div class="card-pad err">${esc(e.message)}</div>`; }
}

const CSV_HEADERS = ['Ad Soyad', 'Telefon', 'TC/VKN', 'E-posta', 'Branş', 'Şirket', 'Poliçe No', 'Başlangıç', 'Bitiş', 'Prim', 'Komisyon', 'Plaka/Konu'];

function toCSV(rows) {
  return '﻿' + rows.map(r => r.map(v => { v = String(v ?? ''); return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(';')).join('\r\n');
}
function exportPoliciesCSV(list) {
  const trNum = n => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  download(`policeler-${todayStr()}.csv`, toCSV([[...CSV_HEADERS, 'Durum'], ...list.map(p => { const c = custOf(p); return [c?.name, c?.phone, c?.tc, c?.email, p.branch, p.company, p.policyNo, fmtDate(p.startDate), fmtDate(p.endDate), trNum(p.premium), trNum(p.commission), p.subject, POLICY_STATUS[policyStatus(p)][0]]; })]));
}

function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/)[0];
  const delim = [';', '\t', ','].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}
function parseTrDate(v) {
  v = String(v || '').trim();
  let m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d{5}$/.test(v)) return toISO(new Date(Date.UTC(1899, 11, 30) + +v * 864e5)); // Excel serial date
  return '';
}
function parseTrNumber(v) {
  let s = String(v || '').replace(/[₺TLtl\s]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return num(s);
}

const CSV_ALIASES = {
  name: ['ad soyad', 'adi soyadi', 'musteri', 'musteri adi', 'unvan', 'sigortali', 'sigorta ettiren', 'isim', 'ad'],
  phone: ['telefon', 'tel', 'gsm', 'cep', 'cep telefonu'],
  tc: ['tc/vkn', 'tc', 'tckn', 'vkn', 'tc kimlik', 'kimlik no', 'tc no'],
  email: ['e-posta', 'eposta', 'email', 'e-mail', 'mail'],
  branch: ['brans', 'urun', 'tur', 'police turu'],
  company: ['sirket', 'sigorta sirketi', 'firma'],
  policyNo: ['police no', 'police numarasi', 'police'],
  startDate: ['baslangic', 'baslangic tarihi', 'tanzim tarihi'],
  endDate: ['bitis', 'bitis tarihi', 'vade', 'vade sonu'],
  premium: ['prim', 'brut prim', 'net prim', 'tutar'],
  commission: ['komisyon', 'komisyon tutari'],
  subject: ['plaka/konu', 'plaka', 'konu', 'sigorta konusu', 'adres'],
};
function mapHeaders(headers) {
  const h = headers.map(x => norm(x).trim()), map = {};
  Object.entries(CSV_ALIASES).forEach(([k, al]) => { const i = h.findIndex(x => al.includes(x)); if (i >= 0) map[k] = i; });
  Object.entries(CSV_ALIASES).forEach(([k, al]) => {
    if (map[k] !== undefined) return;
    const i = h.findIndex((x, idx) => !Object.values(map).includes(idx) && al.some(a => a.length >= 3 && x.startsWith(a)));
    if (i >= 0) map[k] = i;
  });
  return map;
}
const matchList = (v, list) => { const n = norm(v); return list.find(x => norm(x) === n) || list.find(x => n && (norm(x).includes(n) || n.includes(norm(x)))) || v; };

function importCSV(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let text = reader.result;
    if (text.includes('�')) { const r2 = new FileReader(); r2.onload = () => go(r2.result); r2.readAsText(file, 'windows-1254'); return; } // old Excel Turkish encoding
    go(text);
  };
  reader.readAsText(file, 'utf-8');
  function go(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return toast('Dosyada veri bulunamadı', 'err');
    const map = mapHeaders(rows[0]);
    if (map.name === undefined) return toast('“Ad Soyad” sütunu bulunamadı. Örnek şablonu kullanın.', 'err');
    const get = (r, k) => map[k] !== undefined ? String(r[map[k]] ?? '').trim() : '';
    const data = rows.slice(1).map(r => ({
      name: get(r, 'name'), phone: get(r, 'phone'), tc: get(r, 'tc'), email: get(r, 'email'),
      branch: matchList(get(r, 'branch'), BRANCHES), company: matchList(get(r, 'company'), state.settings.companies),
      policyNo: get(r, 'policyNo'), startDate: parseTrDate(get(r, 'startDate')), endDate: parseTrDate(get(r, 'endDate')),
      premium: parseTrNumber(get(r, 'premium')), commission: parseTrNumber(get(r, 'commission')), subject: get(r, 'subject'),
    })).filter(d => d.name);
    const withPolicy = data.filter(d => d.endDate || d.policyNo);
    const found = Object.keys(map).map(k => ({ name: 'Ad', phone: 'Telefon', tc: 'TC', email: 'E-posta', branch: 'Branş', company: 'Şirket', policyNo: 'Poliçe no', startDate: 'Başlangıç', endDate: 'Bitiş', premium: 'Prim', commission: 'Komisyon', subject: 'Konu' }[k]));
    openModal({
      title: 'İçe aktarma önizleme',
      body: `<p><b>${data.length}</b> satır okundu, <b>${withPolicy.length}</b> tanesinde poliçe bilgisi var.</p>
        <p class="muted small">Tanınan sütunlar: ${found.join(', ')}</p>
        <div class="table-wrap card"><table><thead><tr><th>Ad</th><th>Telefon</th><th>Branş</th><th>Şirket</th><th>Bitiş</th><th class="num">Prim</th></tr></thead><tbody>
        ${data.slice(0, 5).map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.phone)}</td><td>${esc(d.branch)}</td><td>${esc(d.company)}</td><td>${fmtDate(d.endDate)}</td><td class="num">${money(d.premium)}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted small mt">Aynı telefon ya da TC'ye sahip müşteriler birleştirilir.</p>`,
      foot: `<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" id="impOk">İçe aktar</button>`,
      onMount(el, close) {
        $('#impOk', el).onclick = () => {
          let nc = 0, np = 0;
          data.forEach(d => {
            let c = findDuplicate({ phone: d.phone, tc: d.tc }) || state.customers.find(x => norm(x.name) === norm(d.name) && !d.phone && !d.tc);
            if (!c) { c = upsert('customers', { name: d.name, phone: d.phone, tc: d.tc, email: d.email, type: d.tc.length === 10 ? 'kurumsal' : 'bireysel', kvkk: false }); nc++; }
            if (d.endDate || d.policyNo) {
              const start = d.startDate || (d.endDate ? addMonths(d.endDate, -12) : todayStr());
              upsert('policies', { customerId: c.id, branch: d.branch || 'Diğer', company: d.company, policyNo: d.policyNo, subject: d.subject, startDate: start,
                endDate: d.endDate || addMonths(start, 12), premium: d.premium, commission: d.commission || Math.round(d.premium * (state.settings.rates[d.branch] || 0)) / 100,
                payment: 'kart', installments: [], status: 'aktif' });
              np++;
            }
          });
          close(); commit(`İçe aktarıldı: ${nc} müşteri, ${np} poliçe`); toast(`${nc} yeni müşteri, ${np} poliçe eklendi`);
        };
      },
    });
  }
}

function pickFile(accept, cb) {
  const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
  i.onchange = () => i.files[0] && cb(i.files[0]); i.click();
}

const blobToDataURL = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });

async function exportBackup() {
  let files = [];
  // In cloud mode documents already live in Supabase Storage (and the nightly backup); the file holds records only.
  if (!Cloud.enabled) {
    try { files = await Promise.all((await idb.all()).map(async f => ({ ...f, blob: undefined, data: await blobToDataURL(f.blob) }))); } catch (e) { /* no file store */ }
  }
  state.settings.lastBackupAt = new Date().toISOString();
  save();
  download(`mosso-yedek-${todayStr()}.json`, JSON.stringify({ app: 'mosso-panel', version: 1, exportedAt: state.settings.lastBackupAt, state, files }), 'application/json');
  render(); toast('Yedek indirildi – güvenli bir yere kaydedin');
}
function restoreBackup(file) {
  const r = new FileReader();
  r.onload = async () => {
    let b; try { b = JSON.parse(r.result); } catch (e) { return toast('Dosya okunamadı', 'err'); }
    if (b.app === 'mosso-panel' && b.kind === 'auto' && b.tables) b = { ...b, exportedAt: b.takenAt, state: Cloud.backups.toState(b) }; // downloaded nightly backup
    if (b.app !== 'mosso-panel' || !b.state) return toast('Bu bir Mosso panel yedeği değil', 'err');
    const scope = Cloud.enabled ? 'TÜM cihazlardaki' : 'mevcut';
    if (!await confirmBox(`${fmtDateTime(b.exportedAt)} tarihli yedek yüklenecek, ${scope} veriler değiştirilecek. Devam?`, 'Geri yükle')) return;
    const pinHash = state.settings.pinHash;
    if (!Cloud.enabled) await idb.clear().catch(() => {});
    state = migrate({ ...b.state, files: Cloud.enabled ? (b.state.files || []) : [] });
    state.settings.pinHash = pinHash;
    save();
    let failed = 0;
    for (const f of b.files || []) { // documents embedded by the offline version
      const blob = await (await fetch(f.data)).blob(); const { data, ...meta } = f;
      try { await Docs.add(meta, blob); } catch (e) { failed++; }
    }
    commit('Yedekten geri yüklendi'); toast(failed ? `Yedek yüklendi, ${failed} belge yüklenemedi` : 'Yedek geri yüklendi', failed ? 'err' : '');
  };
  r.readAsText(file);
}

/* ============================== Global search ============================== */

(function setupSearch() {
  const input = $('#globalSearch'), box = $('#searchResults');
  let hl = 0;
  const run = () => {
    const q = norm(input.value.trim()), qd = input.value.replace(/\D/g, '');
    if (q.length < 2) { box.hidden = true; return; }
    const sq = q.replace(/\s/g, '');
    const cust = state.customers.filter(c => norm(c.name).includes(q) || (qd.length >= 4 && (waNumber(c.phone).includes(qd) || String(c.tc || '').includes(qd)))).slice(0, 6);
    const pols = state.policies.filter(p => norm(p.policyNo).includes(q) || norm(p.subject).replace(/\s/g, '').includes(sq)).slice(0, 6);
    const quotes = state.quotes.filter(x => !x.customerId && (norm(x.contactName).includes(q) || norm(x.subject).replace(/\s/g, '').includes(sq))).slice(0, 4);
    const res = [
      ...(cust.length ? [`<div class="grp">Müşteriler</div>`, ...cust.map(c => `<a href="#/customers/${c.id}">${esc(c.name)} <span class="muted small">${esc(fmtPhone(c.phone))}</span></a>`)] : []),
      ...(pols.length ? [`<div class="grp">Poliçeler</div>`, ...pols.map(p => `<a href="#" data-act="openPolicy" data-id="${p.id}">${esc(p.subject || p.policyNo)} <span class="muted small">${esc(custOf(p)?.name || '')} · ${esc(p.branch)} · ${fmtDate(p.endDate)}</span></a>`)] : []),
      ...(quotes.length ? [`<div class="grp">Teklif talepleri</div>`, ...quotes.map(x => `<a href="#" data-act="openQuote" data-id="${x.id}">${esc(x.contactName)} <span class="muted small">${esc(x.branch)}</span></a>`)] : []),
    ];
    box.innerHTML = res.join('') || '<div class="empty">Sonuç yok</div>';
    box.hidden = false; hl = 0; $$('a', box)[0]?.classList.add('hl');
  };
  input.addEventListener('input', run);
  input.addEventListener('focus', run);
  input.addEventListener('keydown', e => {
    const links = $$('a', box);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); links[hl]?.classList.remove('hl'); hl = (hl + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length; links[hl]?.classList.add('hl'); }
    if (e.key === 'Enter' && links[hl]) { e.preventDefault(); links[hl].click(); }
    if (e.key === 'Escape') { box.hidden = true; input.blur(); }
  });
  box.addEventListener('click', e => { if (e.target.closest('a')) { box.hidden = true; input.value = ''; } });
  document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) box.hidden = true; });
})();

(function setupQuickAdd() {
  const btn = $('#quickAddBtn'), menu = $('#quickAddMenu');
  btn.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  document.addEventListener('click', () => { menu.hidden = true; });
  menu.onclick = e => {
    const b = e.target.closest('[data-new]'); if (!b) return;
    ({ quote: () => openQuoteForm(), policy: () => openPolicyForm(), customer: () => openCustomerForm(), claim: () => openClaimForm(), task: () => openTaskForm() })[b.dataset.new]();
  };
})();

/* ============================== PIN lock ============================== */

async function hashPin(pin) {
  const data = new TextEncoder().encode('mosso:' + pin);
  if (crypto.subtle) return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join('');
  let h = 5381; for (const b of data) h = ((h << 5) + h + b) >>> 0; return 'x' + h.toString(16);
}
function lock() {
  if (!state.settings.pinHash) return toast('Önce Ayarlar\'dan bir PIN belirleyin');
  $('#lockScreen').hidden = false; $('#lockPin').value = ''; $('#lockErr').hidden = true; $('#lockPin').focus();
}
$('#lockBtn').onclick = lock;
$('#lockForm').onsubmit = async e => {
  e.preventDefault();
  if (await hashPin($('#lockPin').value) === state.settings.pinHash) $('#lockScreen').hidden = true;
  else { $('#lockErr').hidden = false; $('#lockPin').value = ''; }
};
(function idleLock() {
  let t;
  const reset = () => { clearTimeout(t); t = setTimeout(() => { if (state.settings.pinHash) lock(); }, 15 * 60 * 1000); };
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(ev => document.addEventListener(ev, reset, { passive: true }));
  reset();
})();

/* ============================== Demo data ============================== */

function seedDemo() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const first = ['Ahmet', 'Mehmet', 'Ayşe', 'Fatma', 'Mustafa', 'Zeynep', 'Emre', 'Elif', 'Can', 'Selin', 'Burak', 'Deniz', 'Hakan', 'Gül', 'Murat', 'Esra', 'Oğuz', 'Seda', 'Kemal', 'İrem'];
  const last = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Aydın', 'Öztürk', 'Arslan', 'Doğan', 'Koç', 'Kurt', 'Özdemir', 'Aksoy'];
  const firms = ['Ege Lojistik Ltd. Şti.', 'Moda Kafe Gıda A.Ş.', 'Yıldız Mimarlık', 'Kartal Oto Servis'];
  const plates = () => `34 ${String.fromCharCode(65 + Math.floor(rnd() * 26))}${String.fromCharCode(65 + Math.floor(rnd() * 26))} ${100 + Math.floor(rnd() * 899)}`;
  const today = todayStr();
  const custs = [];
  for (let i = 0; i < 28; i++) {
    const corp = i < firms.length;
    custs.push(upsert('customers', {
      type: corp ? 'kurumsal' : 'bireysel', name: corp ? firms[i] : `${pick(first)} ${pick(last)}`,
      phone: `05${pick(['32', '33', '35', '42', '44', '05', '55'])}${String(1000000 + Math.floor(rnd() * 8999999))}`,
      tc: corp ? String(1000000000 + Math.floor(rnd() * 8999999999)) : '', email: '', city: pick(['Kadıköy', 'Beşiktaş', 'Ataşehir', 'Üsküdar', 'Maltepe']),
      birthDate: corp ? '' : `${1965 + Math.floor(rnd() * 35)}-${today.slice(5, 7)}-${pad(Math.min(28, Math.max(1, +today.slice(8) + Math.floor(rnd() * 20) - 3)))}`,
      kvkk: rnd() > .3, tags: rnd() > .8 ? 'VIP' : '',
    }));
  }
  const prem = { Trafik: [4000, 9000], Kasko: [12000, 38000], DASK: [600, 1800], Konut: [1500, 4500], 'Tamamlayıcı Sağlık': [9000, 22000], 'Özel Sağlık': [25000, 60000], 'Ferdi Kaza': [800, 2500], 'İşyeri': [6000, 20000] };
  custs.forEach((c, i) => {
    const branches = c.type === 'kurumsal' ? ['İşyeri', 'Kasko', 'Trafik'] : [pick(['Trafik', 'Kasko', 'DASK', 'Tamamlayıcı Sağlık', 'Konut']), ...(rnd() > .5 ? [pick(['Trafik', 'DASK', 'Özel Sağlık', 'Ferdi Kaza'])] : [])];
    [...new Set(branches)].forEach(b => {
      const end = addDays(today, Math.floor(rnd() * 360) - (i < 4 ? 25 : 10));
      const [lo, hi] = prem[b] || [2000, 8000];
      const premium = Math.round((lo + rnd() * (hi - lo)) / 10) * 10;
      const payment = rnd() > .8 ? 'taksit' : 'kart';
      const p = { customerId: c.id, branch: b, company: pick(DEFAULT_COMPANIES.slice(0, 9)), policyNo: String(Math.floor(1e7 + rnd() * 9e7)),
        subject: ['Trafik', 'Kasko'].includes(b) ? plates() : ['DASK', 'Konut', 'İşyeri'].includes(b) ? `${c.city} – UAVT ${Math.floor(1e9 + rnd() * 9e9)}` : 'Kendisi',
        startDate: addMonths(end, -12), endDate: end, premium, commission: Math.round(premium * (DEFAULT_RATES[b] || 10)) / 100,
        payment, instCount: 4, status: 'aktif' };
      p.installments = buildInstallments(p);
      p.installments.forEach(x => { if (x.due < addDays(today, -5)) { x.paid = true; x.paidAt = x.due; } });
      upsert('policies', p);
    });
  });
  // Older renewed/lost policies so reports have history
  custs.slice(4, 16).forEach((c, i) => {
    const end = addDays(today, -Math.floor(rnd() * 300) - 5);
    upsert('policies', { customerId: c.id, branch: pick(['Trafik', 'Kasko', 'DASK']), company: pick(DEFAULT_COMPANIES.slice(0, 9)), startDate: addMonths(end, -12), endDate: end,
      premium: 5000 + Math.round(rnd() * 15000), commission: 900, payment: 'kart', installments: [], status: i % 4 === 0 ? 'kaybedildi' : 'yenilendi', lostReason: i % 4 === 0 ? pick(LOST_REASONS.slice(0, 3)) : '' });
  });
  const leadNames = ['Serkan Uçar', 'Nazlı Er', 'Tolga Acar', 'Pınar Güneş', 'Cem Baysal', 'Merve Tan'];
  leadNames.forEach((n, i) => {
    const stage = ['yeni', 'bilgi', 'hazirlaniyor', 'gonderildi', 'kazanildi', 'kaybedildi'][i];
    const b = pick(['Kasko', 'Trafik', 'Tamamlayıcı Sağlık', 'DASK']);
    upsert('quotes', { contactName: n, phone: `0536${1000000 + i * 1234567}`, branch: b, subject: ['Kasko', 'Trafik'].includes(b) ? plates() : '', source: pick(['WhatsApp', 'WhatsApp', 'Instagram', 'Referans']),
      stage, followUp: addDays(today, i - 2), details: 'WhatsApp: "Merhaba, aracım için kasko fiyatı alabilir miyim? 2020 model Renault Clio"',
      offers: i >= 2 ? [{ company: 'Allianz', premium: 21500, note: '%2 muafiyet' }, { company: 'Sompo', premium: 19800, note: '' }, { company: 'Anadolu Sigorta', premium: 23400, note: 'İkame araç 15 gün' }] : [],
      lostReason: stage === 'kaybedildi' ? 'Fiyat yüksek' : '' });
  });
  const claimPol = state.policies.find(p => p.branch === 'Kasko');
  if (claimPol) upsert('claims', { customerId: claimPol.customerId, policyId: claimPol.id, fileNo: 'H-2026-0412', date: addDays(today, -9), status: 'eksper', amount: 14500, description: 'Otoparkta arkadan çarpma, tampon ve stop lambası hasarı' });
  upsert('tasks', { title: 'Ege Lojistik filo listesi güncellemesini iste', due: today, done: false, customerId: custs[0].id });
  upsert('tasks', { title: 'Allianz bölge müdürüne komisyon mutabakatı gönder', due: addDays(today, 1), done: false });
  addNote({ customerId: custs[5].id, kind: 'whatsapp', text: 'Müşteri: "Eşimi de sağlık sigortasına ekleyebilir miyiz?" → Mart yenilemesinde eklenecek.' });
}

/* ============================== Boot ============================== */

// Remote edits re-render the page, except while someone is typing in it (re-checked when they leave the field).
let remotePending = false;
function onRemoteChange() {
  const a = document.activeElement;
  if (a && a.closest('#view') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { remotePending = true; return; }
  render();
}
document.addEventListener('focusout', () => { if (remotePending) { remotePending = false; setTimeout(onRemoteChange, 0); } });

(async function boot() {
  if (Cloud.enabled) {
    const ok = await Cloud.start({
      getState: () => state,
      setState: s => { state = s; },
      migrateState: migrate,
      migrateSettings,
      save,
      onRemoteChange,
      confirm: (text, label) => confirmBox(text, label, false),
      toast,
      localFiles: () => idb.all().catch(() => []),
    });
    if (!ok) return;
    $('#logoutBtn').hidden = false;
    $('#logoutBtn').onclick = () => Cloud.signOut();
    $('#whoami').hidden = false;
    $('#whoami').textContent = Cloud.user.email;
    $('#syncStatus').onclick = () => { location.hash = '#/settings'; };
  }
  booted = true;
  if (state.settings.pinHash) lock();
  render();
})();
