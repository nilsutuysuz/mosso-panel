# Mosso Sigorta – Acente Paneli

No installation, build step or internet connection needed (only the WhatsApp links need a connection).

## Opening it
- **Quickest:** double-click `index.html` to open it in Chrome or Safari.
- **Recommended:** put the `panel/` folder online under one fixed address, for example `panel.mossosigorta.com` on the existing hosting, or a free host like Netlify or Cloudflare Pages. That way it opens from the same address on her phone too, and "Ana ekrana ekle" (add to home screen) works like an app.

> ⚠️ Data is stored **in the browser of the device where it's used** (localStorage + IndexedDB). Phone and laptop do **not** share data. Use **Ayarlar → Tam yedek indir** every week. The cloud version (Supabase) is the next step for sync.

## First day
1. **Ayarlar:** enter your name (used as the message signature) and set a PIN.
2. **Ayarlar → Örnek CSV şablonu:** download it, paste your current Excel list into it, then use **İçe aktar**. Columns are also matched automatically, so a list with "Ad Soyad, Telefon, Branş, Şirket, Bitiş, Prim, Plaka" columns works too.
3. Each morning, open **Ana Sayfa** and go through renewals and follow-ups with the 💬 buttons.

## Daily flow (instead of WhatsApp)
| What happened | What to do in the panel |
|---|---|
| A quote request arrives on WhatsApp | **＋ → Teklif talebi**, paste the message into "Talep detayı" |
| Information is missing | Teklif → 💬 WhatsApp → "Bilgi / evrak isteme" template |
| Quotes are back from the insurers | Add a row per insurer → 💬 → "Teklifleri gönder" (sends a sorted list) |
| The customer accepts | **Poliçeleştir** → the policy form opens pre-filled → Kaydet → send the policy details |
| A policy is about to expire | **Yenilemeler** → Hatırlat / Teklif başlat |
| An important note from a conversation | Customer page → Notlar & geçmiş |
| A policy PDF | Policy → Belgeler → Belge ekle |

Product requirements: `../REQUIREMENTS.md`
