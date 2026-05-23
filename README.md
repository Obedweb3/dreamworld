# 📱 DREAMWORD PROJECT — SIM Serial Scanner
**Made by Obed Tech**

Scan Safaricom SIM card barcodes with your phone camera and store serials in a Vercel Postgres database.

## Features
- 📷 Real camera barcode scanner (ZXing engine)
- 🔦 Flashlight/torch toggle for low-light scanning
- 💾 Vercel Postgres database (free, built-in)
- 🔍 Search & filter records
- 📊 Status tracking: In Stock / Sold / Inactive
- 📥 Bulk import (paste many serials at once)
- ⬇️ CSV export for Excel/Google Sheets
- 📱 Mobile-first PWA design

---

## 🚀 Deploy to Vercel — Step by Step

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
# Create repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/sim-scanner.git
git push -u origin main
```

### 2. Import on Vercel
1. Go to **vercel.com** → New Project
2. Import your GitHub repo → Click **Deploy**

### 3. Add FREE Vercel Postgres database
After first deploy:
1. Open your project on Vercel → click **Storage** tab
2. Click **Create Database** → choose **Postgres** → name it `sim-db`
3. Click **Connect to Project** → Vercel auto-sets all DB env vars

### 4. Redeploy
Deployments tab → 3 dots on latest → **Redeploy**

### 5. Initialize the table (once)
Visit in browser:
```
https://your-app.vercel.app/api/init
```
Should return: `{"ok":true,"message":"Database ready"}`

✅ Done!

---

## 💻 Local Dev
```bash
npm install
npm i -g vercel
vercel link          # link to your Vercel project
vercel env pull      # download DB credentials to .env.local
npm run dev          # http://localhost:3000
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/init` | Create table (safe to run multiple times) |
| GET | `/api/serials` | List serials (`?search=&status=&page=`) |
| POST | `/api/serials` | Save one serial `{serial, note, status}` |
| PATCH | `/api/serials` | Update `{id, status, note}` |
| DELETE | `/api/serials?id=123` | Delete one |
| DELETE | `/api/serials?id=all` | Delete all |
| POST | `/api/bulk` | Bulk import `{serials: string[]}` |
| GET | `/api/export` | Download CSV |
