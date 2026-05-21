# 📱 Safaricom SIM Serial Scanner

A mobile web app to scan Safaricom SIM card barcodes and store serials in a PostgreSQL database.

## Features
- 📷 Camera barcode scanning (phone/webcam)
- 💾 PostgreSQL database storage
- 🔍 Search & filter records
- 📊 Status tracking (In Stock / Sold / Inactive)
- ⬇️ CSV export
- 📱 Mobile-first design

---

## 🚀 Deploy to Vercel (Step by Step)

### Step 1 — Create a free database

Go to **[Neon.tech](https://neon.tech)** (free PostgreSQL):
1. Sign up → Create a project → Copy the **Connection string**
   It looks like: `postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require`

> You can also use [Supabase](https://supabase.com) → Project Settings → Database → Connection string (use the "URI" format)

### Step 2 — Deploy to Vercel

1. Push this project to **GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   # Create a repo on github.com then:
   git remote add origin https://github.com/YOUR_USERNAME/sim-scanner.git
   git push -u origin main
   ```

2. Go to **[vercel.com](https://vercel.com)** → New Project → Import your GitHub repo

3. In Vercel, go to **Settings → Environment Variables** and add:
   ```
   DATABASE_URL = postgresql://user:pass@host/dbname
   ```

4. Click **Deploy** — your app will be live in ~1 minute!

### Step 3 — Initialize the database

After deploying, visit:
```
https://your-app.vercel.app/api/init
```
This creates the `sim_serials` table automatically (it's safe to run multiple times).

---

## 💻 Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local and add your DATABASE_URL

# 3. Initialize database (run once)
curl -X POST http://localhost:3000/api/init

# 4. Start dev server
npm run dev
```

Open http://localhost:3000

---

## 📋 Database Schema

```sql
CREATE TABLE sim_serials (
  id          SERIAL PRIMARY KEY,
  serial      VARCHAR(30) NOT NULL UNIQUE,
  status      VARCHAR(20) NOT NULL DEFAULT 'in_stock',
  note        TEXT,
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/init` | Create database table |
| GET | `/api/serials` | List serials (supports `?search=&status=&page=`) |
| POST | `/api/serials` | Save a serial `{serial, note, status}` |
| PATCH | `/api/serials` | Update status/note `{id, status, note}` |
| DELETE | `/api/serials?id=123` | Delete one record |
| DELETE | `/api/serials?id=all` | Delete all records |
| GET | `/api/export` | Download CSV |
