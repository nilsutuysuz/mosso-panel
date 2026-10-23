/* Mosso panel – cloud sync over Supabase.
 * Inactive (app runs local-only) unless config.js provides a project URL and anon key.
 *
 * How sync works:
 *  - The full app state is cached per user in IndexedDB, so the panel opens instantly and works offline.
 *  - After every local save we hash each record and compare with the hash last synced; differences go
 *    into a persistent outbox that is upserted to Supabase (deletes become tombstones).
 *  - Remote changes arrive via Realtime and a periodic "changed since lastSync" pull.
 *    A record that still has a local pending change keeps the local version (last write wins). */
'use strict';

const Cloud = (() => {
  const cfg = window.MOSSO_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const COLLS = ['customers', 'policies', 'quotes', 'claims', 'tasks', 'notes', 'files'];
  const TABLES = [...COLLS, 'settings'];
  const DEVICE_SETTINGS = ['pinHash', 'lastBackupAt']; // stay on this device, never synced
  const PAGE = 1000;
  const FULL_RESYNC_AFTER = 25 * 864e5; // server purges tombstones after 30 days

  let sb = null, hooks = null, user = null, agencyId = null, role = 'staff';
  let meta = freshMeta();
  let pushing = false, pullPromise = null, pullAgain = false, lastError = '';
  let pulledOnce = false; // until the server has been read once, local default settings must not overwrite it
  let pushTimer, detectTimer, persistTimer, remoteTimer, retryDelay = 2000, channel = null;

  function freshMeta() { return { agencyId: null, role: null, lastSync: null, synced: {}, outbox: {}, migrated: false }; }

  /* ---------------------------------------------------------------- small helpers */

  const kv = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        const r = indexedDB.open('mosso_cloud', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      });
    },
    async op(mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const t = db.transaction('kv', mode), q = fn(t.objectStore('kv'));
        t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error);
      });
    },
    get(k) { return this.op('readonly', s => s.get(k)); },
    set(k, v) { return this.op('readwrite', s => s.put(v, k)); },
    del(k) { return this.op('readwrite', s => s.delete(k)); },
  };

  // Key-order independent JSON, so the server's jsonb (which reorders keys) hashes the same as ours.
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  function hash(str) { // cyrb53
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }
  const hashObj = o => hash(stable(o));
  const okey = (t, id) => `${t}|${id}`;
  const shareSettings = s => Object.fromEntries(Object.entries(s || {}).filter(([k]) => !DEVICE_SETTINGS.includes(k)));
  const recordsOf = (st, t) => t === 'settings' ? [['main', shareSettings(st.settings)]] : (st[t] || []).map(r => [r.id, r]);
  const pendingCount = () => Object.keys(meta.outbox).length;
  const must = ({ data, error }) => { if (error) throw error; return data; };

  /* ---------------------------------------------------------------- local cache */

  const cacheKey = () => 'cache:' + user.id;
  function persistSoon() { clearTimeout(persistTimer); persistTimer = setTimeout(persistNow, 400); }
  async function persistNow() {
    clearTimeout(persistTimer);
    if (!user) return;
    try { await kv.set(cacheKey(), { state: hooks.getState(), meta }); } catch (e) { console.warn('cache write failed', e); }
  }

  /* ---------------------------------------------------------------- outgoing changes */

  function changed() { // called by the app after every save
    if (!user) return;
    clearTimeout(detectTimer); detectTimer = setTimeout(detectChanges, 300);
    persistSoon();
  }
  function detectChanges() {
    clearTimeout(detectTimer);
    if (!user) return;
    const st = hooks.getState();
    let n = 0;
    for (const t of TABLES) {
      const synced = meta.synced[t] ||= {};
      if (t === 'settings' && !synced.main && !pulledOnce) continue; // fresh device: take the server's settings first
      const seen = new Set();
      for (const [id, obj] of recordsOf(st, t)) {
        seen.add(id);
        if (synced[id] !== hashObj(obj)) { meta.outbox[okey(t, id)] = 1; n++; }
      }
      for (const id in synced) if (!seen.has(id)) { meta.outbox[okey(t, id)] = 1; n++; }
    }
    persistSoon(); renderStatus();
    if (n) schedulePush(0);
  }
  function schedulePush(delay = 800) { clearTimeout(pushTimer); pushTimer = setTimeout(push, delay); }

  async function push() {
    if (pushing || !user || !pendingCount()) return renderStatus();
    if (!navigator.onLine) return renderStatus();
    pushing = true; renderStatus();
    let failed = false;
    try {
      const groups = {};
      Object.keys(meta.outbox).forEach(k => { const i = k.indexOf('|'); (groups[k.slice(0, i)] ||= []).push(k.slice(i + 1)); });
      for (const t of TABLES) {
        const ids = groups[t];
        if (!ids) continue;
        const current = new Map(recordsOf(hooks.getState(), t));
        for (let i = 0; i < ids.length; i += 500) {
          const chunk = ids.slice(i, i + 500);
          const rows = chunk.map(id => {
            const obj = current.get(id);
            return obj ? { agency_id: agencyId, id, data: obj, deleted_at: null } : { agency_id: agencyId, id, data: {}, deleted_at: new Date().toISOString() };
          });
          const sent = rows.map(r => r.deleted_at ? null : hashObj(r.data));
          must(await sb.from(t).upsert(rows, { onConflict: 'agency_id,id' }));
          const now = new Map(recordsOf(hooks.getState(), t));
          const synced = meta.synced[t] ||= {};
          chunk.forEach((id, j) => {
            if (sent[j] === null) delete synced[id]; else synced[id] = sent[j];
            const cur = now.get(id);
            if ((cur ? hashObj(cur) : null) === sent[j]) delete meta.outbox[okey(t, id)]; // else it changed again while sending
          });
        }
      }
      lastError = ''; retryDelay = 2000;
    } catch (e) {
      failed = true; lastError = e.message || String(e);
      console.warn('sync push failed', e);
      clearTimeout(pushTimer); pushTimer = setTimeout(push, retryDelay); retryDelay = Math.min(retryDelay * 2, 60000);
    } finally {
      pushing = false; persistSoon(); renderStatus();
      if (!failed && pendingCount()) schedulePush(300);
    }
  }

  /* ---------------------------------------------------------------- incoming changes */

  function applyRows(t, rows) {
    const st = hooks.getState();
    const synced = meta.synced[t] ||= {};
    let changedAny = false;
    if (t === 'settings') {
      const r = rows.find(x => x.id === 'main');
      if (!r || r.deleted_at || meta.outbox[okey(t, 'main')]) return false;
      const h = hashObj(r.data);
      if (synced.main === h) return false;
      st.settings = hooks.migrateSettings({ ...st.settings, ...r.data });
      synced.main = h;
      return true;
    }
    const arr = st[t] ||= [];
    const idx = new Map(arr.map((r, i) => [r.id, i]));
    let holes = false;
    for (const r of rows) {
      if (meta.outbox[okey(t, r.id)]) continue; // local edit waiting to be pushed wins
      if (r.deleted_at) {
        if (idx.has(r.id) && arr[idx.get(r.id)]) { arr[idx.get(r.id)] = null; holes = true; changedAny = true; }
        delete synced[r.id];
        continue;
      }
      const obj = { ...r.data, id: r.id };
      const h = hashObj(obj);
      if (synced[r.id] === h && idx.has(r.id) && arr[idx.get(r.id)]) continue;
      if (idx.has(r.id)) arr[idx.get(r.id)] = obj; else { idx.set(r.id, arr.length); arr.push(obj); }
      synced[r.id] = h; changedAny = true;
    }
    if (holes) st[t] = arr.filter(Boolean);
    return changedAny;
  }

  function remoteChanged() { clearTimeout(remoteTimer); remoteTimer = setTimeout(() => { persistSoon(); hooks.onRemoteChange(); }, 250); }

  function pull(opts) {
    if (pullPromise) { pullAgain = true; return pullPromise; }
    pullPromise = doPull(opts).finally(() => { pullPromise = null; if (pullAgain) { pullAgain = false; pull(); } });
    return pullPromise;
  }
  async function doPull({ full = false } = {}) {
    if (!user || !navigator.onLine) return renderStatus();
    detectChanges(); // make sure unsaved local edits are in the outbox before we compare with the server
    full = full || !meta.lastSync || Date.now() - new Date(meta.lastSync) > FULL_RESYNC_AFTER;
    const since = full ? null : new Date(new Date(meta.lastSync).getTime() - 120000).toISOString(); // overlap for in-flight commits
    let maxTs = meta.lastSync, changedAny = false;
    renderStatus(true);
    try {
      for (const t of TABLES) {
        const serverIds = new Set();
        for (let from = 0; ; from += PAGE) {
          let q = sb.from(t).select('id,data,updated_at,deleted_at').eq('agency_id', agencyId);
          q = since ? q.gte('updated_at', since) : q.is('deleted_at', null);
          const data = must(await q.order('updated_at').order('id').range(from, from + PAGE - 1));
          for (const r of data) { serverIds.add(r.id); if (!maxTs || r.updated_at > maxTs) maxTs = r.updated_at; }
          if (applyRows(t, data)) changedAny = true;
          if (data.length < PAGE) break;
        }
        if (full && t !== 'settings') { // drop what the server no longer has, unless it is waiting to be pushed
          const st = hooks.getState(), before = (st[t] || []).length;
          st[t] = (st[t] || []).filter(r => serverIds.has(r.id) || meta.outbox[okey(t, r.id)]);
          if (st[t].length !== before) changedAny = true;
          for (const id in meta.synced[t] || {}) if (!serverIds.has(id)) delete meta.synced[t][id];
        }
      }
      meta.lastSync = maxTs || meta.lastSync;
      pulledOnce = true;
      lastError = '';
    } catch (e) {
      lastError = e.message || String(e);
      console.warn('sync pull failed', e);
    }
    persistSoon(); renderStatus();
    if (changedAny) remoteChanged();
    if (pendingCount()) schedulePush(0);
  }

  function subscribe() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('mosso-sync');
    for (const t of TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `agency_id=eq.${agencyId}` }, p => {
        if (p.new && p.new.id && applyRows(t, [p.new])) remoteChanged();
      });
    }
    channel.subscribe(s => { if (s === 'SUBSCRIBED') pull(); });
  }

  /* ---------------------------------------------------------------- status pill */

  function renderStatus(busy) {
    const el = document.getElementById('syncStatus');
    if (!el || !user) return;
    const n = pendingCount();
    let cls = 'ok', text = 'Senkronize';
    if (!navigator.onLine) { cls = 'warn'; text = n ? `Çevrimdışı · ${n} bekliyor` : 'Çevrimdışı'; }
    else if (lastError) { cls = 'err'; text = 'Eşitleme hatası'; }
    else if (busy || pushing || n) { cls = 'busy'; text = n ? `Gönderiliyor (${n})` : 'Eşitleniyor'; }
    el.className = `sync-pill ${cls}`;
    el.textContent = text;
    el.title = (lastError ? `Hata: ${lastError}\n` : '') + (meta.lastSync ? `Son eşitleme: ${new Date(meta.lastSync).toLocaleString('tr-TR')}` : '');
    el.hidden = false;
  }

  /* ---------------------------------------------------------------- login screens */

  const brand = '<img class="auth-logo" src="logo.svg" alt="Mosso Sigorta" width="110" height="90">';
  function authUI(mode, info = '') {
    return new Promise(resolve => {
      let el = document.getElementById('authScreen');
      if (!el) { el = document.createElement('div'); el.id = 'authScreen'; document.body.appendChild(el); }
      el.hidden = false;
      const views = {
        login: `<h2>Giriş yap</h2>
          <input name="email" type="email" autocomplete="username" placeholder="E-posta" required>
          <input name="password" type="password" autocomplete="current-password" placeholder="Şifre" required>
          <button class="btn primary block">Giriş</button>
          <div class="auth-links"><a href="#" data-mode="forgot">Şifremi unuttum</a><a href="#" data-mode="signup">Hesap oluştur</a></div>`,
        signup: `<h2>Hesap oluştur</h2>
          <p class="muted small">İlk açılan hesap acente sahibi olur. Diğer kullanıcıları sahibi ekler.</p>
          <input name="email" type="email" autocomplete="username" placeholder="E-posta" required>
          <input name="password" type="password" autocomplete="new-password" placeholder="Şifre (en az 8 karakter)" minlength="8" required>
          <button class="btn primary block">Hesap oluştur</button>
          <div class="auth-links"><a href="#" data-mode="login">Girişe dön</a></div>`,
        forgot: `<h2>Şifre sıfırlama</h2>
          <input name="email" type="email" autocomplete="username" placeholder="E-posta" required>
          <button class="btn primary block">Sıfırlama bağlantısı gönder</button>
          <div class="auth-links"><a href="#" data-mode="login">Girişe dön</a></div>`,
        recovery: `<h2>Yeni şifre belirleyin</h2>
          <input name="password" type="password" autocomplete="new-password" placeholder="Yeni şifre (en az 8 karakter)" minlength="8" required>
          <input name="password2" type="password" autocomplete="new-password" placeholder="Yeni şifre (tekrar)" minlength="8" required>
          <button class="btn primary block">Şifreyi kaydet</button>`,
        mfa: `<h2>Doğrulama kodu</h2>
          <p class="muted">Authenticator uygulamanızdaki 6 haneli kodu girin</p>
          <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="123456" required>
          <button class="btn primary block">Doğrula</button>
          <div class="auth-links"><a href="#" data-mode="logout">Başka hesapla giriş</a></div>`,
        nomember: `<h2>Erişim bekleniyor</h2>
          <p>Hesabınız (${escapeHtml(user?.email || '')}) henüz bir acenteye bağlı değil. Acente sahibinin sizi <b>Ayarlar → Kullanıcılar</b> bölümünden eklemesi gerekiyor.</p>
          <button type="button" class="btn block" data-mode="reload">Tekrar dene</button>
          <div class="auth-links"><a href="#" data-mode="logout">Çıkış yap</a></div>`,
      };
      el.innerHTML = `<form class="lock-card" novalidate>${brand}${views[mode]}<p class="err" hidden></p><p class="ok-msg small" ${info ? '' : 'hidden'}>${escapeHtml(info)}</p></form>`;
      const form = el.querySelector('form'), err = el.querySelector('.err'), okMsg = el.querySelector('.ok-msg');
      const fail = m => { err.textContent = m; err.hidden = false; btn.disabled = false; };
      const btn = form.querySelector('button.primary');
      form.querySelector('input')?.focus();
      el.onclick = async e => {
        const a = e.target.closest('[data-mode]');
        if (!a) return;
        e.preventDefault();
        if (a.dataset.mode === 'logout') { await sb.auth.signOut().catch(() => {}); location.reload(); return; }
        if (a.dataset.mode === 'reload') { location.reload(); return; }
        authUI(a.dataset.mode).then(resolve);
      };
      form.onsubmit = async e => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        err.hidden = true; okMsg.hidden = true; btn.disabled = true;
        const v = Object.fromEntries(new FormData(form));
        try {
          if (mode === 'login') {
            const { error } = await sb.auth.signInWithPassword({ email: v.email.trim(), password: v.password });
            if (error) return fail(error.message === 'Invalid login credentials' ? 'E-posta veya şifre hatalı' : error.message);
          } else if (mode === 'signup') {
            const { data, error } = await sb.auth.signUp({ email: v.email.trim(), password: v.password, options: { emailRedirectTo: appUrl() } });
            if (error) return fail(/not allowed|disabled/i.test(error.message) ? 'Yeni kayıt kapalı. Acente sahibinden davet isteyin.' : error.message);
            if (!data.session) return authUI('login', 'Hesap oluşturuldu. E-postanıza gelen onay bağlantısına tıklayıp giriş yapın.').then(resolve);
          } else if (mode === 'forgot') {
            const { error } = await sb.auth.resetPasswordForEmail(v.email.trim(), { redirectTo: appUrl() });
            if (error) return fail(error.message);
            return authUI('login', 'Sıfırlama bağlantısı gönderildi. E-postanızı bu cihazda açın.').then(resolve);
          } else if (mode === 'recovery') {
            if (v.password !== v.password2) return fail('Şifreler aynı değil');
            const { error } = await sb.auth.updateUser({ password: v.password });
            if (error) return fail(error.message);
          } else if (mode === 'mfa') {
            const { data, error } = await sb.auth.mfa.listFactors();
            if (error) return fail(error.message);
            const factor = data.totp.find(f => f.status === 'verified');
            const res = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: v.code.trim() });
            if (res.error) return fail('Kod hatalı ya da süresi geçmiş');
          }
          el.hidden = true; el.innerHTML = '';
          resolve(true);
        } catch (ex) { fail(navigator.onLine ? (ex.message || 'Bir hata oluştu') : 'İnternet bağlantısı yok'); }
      };
    });
  }
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const appUrl = () => location.origin + location.pathname;

  /* ---------------------------------------------------------------- start / stop */

  async function start(h) {
    hooks = h;
    if (!window.supabase) {
      document.body.innerHTML = '<div class="empty">Bulut bağlantı kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.</div>';
      throw new Error('supabase-js not loaded');
    }
    let recovery = false;
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    sb.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') recovery = true;
      if (event === 'SIGNED_OUT' && user) { user = null; location.reload(); }
    });

    let session = (await sb.auth.getSession()).data.session;
    if (session && recovery) await authUI('recovery');
    while (!session) { await authUI('login'); session = (await sb.auth.getSession()).data.session; }
    if (location.search.includes('code=')) history.replaceState(null, '', appUrl() + location.hash);

    const aal = (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data;
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') await authUI('mfa');
    user = (await sb.auth.getSession()).data.session.user;

    let cached = null;
    try { cached = await kv.get(cacheKey()); } catch (e) { /* private window */ }
    if (cached?.meta) meta = { ...freshMeta(), ...cached.meta };

    let membership = null;
    if (navigator.onLine) {
      const { data, error } = await sb.from('agency_members').select('agency_id, role').eq('user_id', user.id).order('created_at').limit(1).maybeSingle();
      membership = error ? null : data;
      if (error && meta.agencyId) membership = { agency_id: meta.agencyId, role: meta.role };
    } else if (meta.agencyId) membership = { agency_id: meta.agencyId, role: meta.role };
    if (!membership) { await authUI('nomember'); return false; }

    if (meta.agencyId && meta.agencyId !== membership.agency_id) { meta = freshMeta(); cached = null; }
    agencyId = meta.agencyId = membership.agency_id;
    role = meta.role = membership.role;
    hooks.setState(cached?.state ? hooks.migrateState(cached.state) : hooks.migrateState({}));

    window.addEventListener('online', () => { renderStatus(); pull(); schedulePush(0); });
    window.addEventListener('offline', () => renderStatus());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); else persistNow(); });
    window.addEventListener('pagehide', persistNow);
    setInterval(() => pull(), 5 * 60 * 1000);
    renderStatus();
    subscribe();
    pull().then(maybeMigrateLocal);
    return true;
  }

  // One-time import of data entered in the offline-only version on this device.
  async function maybeMigrateLocal() {
    if (meta.migrated) return;
    let old = null;
    try { old = JSON.parse(localStorage.getItem('mosso_panel_v1')); } catch (e) { /* none */ }
    const counts = old ? COLLS.map(c => (old[c] || []).length).reduce((a, b) => a + b, 0) : 0;
    if (!counts) { meta.migrated = true; persistSoon(); return; }
    const ok = await hooks.confirm(`Bu cihazda bulut öncesi sürümden ${old.customers?.length || 0} müşteri ve ${old.policies?.length || 0} poliçe var. Buluta aktarılsın mı?`, 'Aktar');
    meta.migrated = true; persistSoon();
    if (!ok) return;
    const st = hooks.getState();
    for (const c of COLLS) {
      const have = new Set((st[c] ||= []).map(r => r.id));
      (old[c] || []).forEach(r => { if (r.id && !have.has(r.id)) st[c].push(r); });
    }
    if (!meta.synced.settings?.main && old.settings) st.settings = hooks.migrateSettings({ ...st.settings, ...shareSettings(old.settings) });
    hooks.save();
    let moved = 0;
    try {
      const files = await hooks.localFiles();
      for (const f of files) { const { blob, ...m } = f; if (!st.files.some(x => x.id === m.id)) { await docs.add(m, blob); moved++; } }
    } catch (e) { console.warn('file migration', e); }
    hooks.toast(`Veriler buluta aktarıldı${moved ? ` (${moved} belge)` : ''}`);
  }

  async function signOut() {
    detectChanges();
    const n = pendingCount();
    if (n && !await hooks.confirm(`${n} değişiklik henüz buluta gönderilmedi. Çıkış yaparsanız bu cihazdan silinir. Yine de çıkılsın mı?`, 'Çıkış yap')) return;
    const id = user.id;
    user = null;
    clearTimeout(persistTimer);
    await kv.del('cache:' + id).catch(() => {});
    await sb.auth.signOut().catch(() => {});
    location.reload();
  }

  /* ---------------------------------------------------------------- documents (Supabase Storage) */

  const docs = {
    async list({ customerId, policyId, claimId }) {
      return (hooks.getState().files || []).filter(f => f.customerId === customerId && (!policyId || f.policyId === policyId) && (!claimId || f.claimId === claimId));
    },
    async add(m, blob) {
      if (!navigator.onLine) throw new Error('Belge yüklemek için internet bağlantısı gerekli');
      const safe = m.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);
      const path = `${agencyId}/${m.customerId}/${m.id}-${safe}`;
      must(await sb.storage.from('documents').upload(path, blob, { contentType: m.mime || 'application/octet-stream' }));
      hooks.getState().files.push({ ...m, path });
      hooks.save();
    },
    async remove(f) {
      if (f.path) must(await sb.storage.from('documents').remove([f.path]));
      const st = hooks.getState();
      st.files = st.files.filter(x => x.id !== f.id);
      hooks.save();
    },
    async url(f) { return must(await sb.storage.from('documents').createSignedUrl(f.path, 300)).signedUrl; },
    async removeCustomer(customerId) {
      const st = hooks.getState(), mine = st.files.filter(f => f.customerId === customerId);
      if (mine.length) must(await sb.storage.from('documents').remove(mine.map(f => f.path).filter(Boolean)));
      st.files = st.files.filter(f => f.customerId !== customerId);
    },
    async clear() {
      const paths = (hooks.getState().files || []).map(f => f.path).filter(Boolean);
      for (let i = 0; i < paths.length; i += 100) must(await sb.storage.from('documents').remove(paths.slice(i, i + 100)));
    },
  };

  /* ---------------------------------------------------------------- account, members, backups, audit */

  const rpc = async (fn, args) => must(await sb.rpc(fn, args));

  const api = {
    members: {
      list: () => rpc('list_members'),
      add: (email, r) => rpc('add_member', { p_email: email, p_role: r }),
      remove: id => rpc('remove_member', { p_user: id }),
    },
    backups: { // nightly snapshots taken inside the database (public.take_backups)
      list: () => rpc('list_backups'),
      async read(id) { return must(await sb.from('backups').select('payload').eq('id', id).single()).payload; },
      toState(b) { // auto-backup format → app state
        const out = {};
        for (const c of COLLS) out[c] = (b.tables[c] || []).map(r => ({ ...r.data, id: r.id }));
        out.settings = b.tables.settings?.find(r => r.id === 'main')?.data || {};
        return out;
      },
    },
    mfa: {
      async factors() { return must(await sb.auth.mfa.listFactors()).totp.filter(f => f.status === 'verified'); },
      async enroll() {
        const all = must(await sb.auth.mfa.listFactors()).all || [];
        for (const f of all.filter(x => x.status === 'unverified')) await sb.auth.mfa.unenroll({ factorId: f.id });
        return must(await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Mosso ' + Date.now() }));
      },
      async verify(factorId, code) { must(await sb.auth.mfa.challengeAndVerify({ factorId, code })); },
      async unenroll(factorId) { must(await sb.auth.mfa.unenroll({ factorId })); },
    },
    async audit(limit = 60) {
      return must(await sb.from('audit_log').select('at,user_id,table_name,record_id,action').eq('agency_id', agencyId).order('at', { ascending: false }).limit(limit));
    },
    async changePassword(pw) { must(await sb.auth.updateUser({ password: pw })); },
  };

  return {
    enabled, start, changed, signOut, docs, ...api,
    syncNow: () => { detectChanges(); return pull(); },
    flush: async () => { detectChanges(); await push(); await persistNow(); },
    get user() { return user; },
    get role() { return role; },
    get isOwner() { return role === 'owner'; },
    get pending() { return pendingCount(); },
    get lastSync() { return meta.lastSync; },
    get lastError() { return lastError; },
    _debug: { get meta() { return meta; }, pull, push, detectChanges },
  };
})();
