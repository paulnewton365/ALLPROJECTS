# Smartsheet Project Snapshot Dashboard

A live, auto-refreshing project dashboard deployed on Vercel that pulls data directly from Smartsheet.

Shows project status (RAG), financials (budget vs actuals), overservice flags, workload by PM, and a filterable/sortable project table.

---

## Quick Start

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create smartsheet-dashboard --private --push
```

### 2. Deploy to Vercel

Go to [vercel.com/new](https://vercel.com/new) and import your GitHub repo.

### 3. Set Environment Variables in Vercel

Go to your project **Settings > Environment Variables** and add:

| Variable | Value |
|---|---|
| `SMARTSHEET_API_TOKEN` | Your Smartsheet API token |
| `SMARTSHEET_SOURCE_ID` | *(set after step 4)* |
| `SMARTSHEET_SOURCE_TYPE` | `report` or `sheet` |

### 4. Discover Your Source ID

After deploying, visit:

```
https://your-app.vercel.app/api/discover
```

This returns a JSON list of all your sheets and reports with their IDs. Find the one you want to use.

To inspect a specific source and see its columns:

```
https://your-app.vercel.app/api/discover?inspect=SHEET_ID&type=sheet
```

### 5. Configure Column Mapping

Add these env vars in Vercel to match your Smartsheet column names:

| Variable | Your Column Name |
|---|---|
| `COL_PROJECT_NAME` | e.g. `Project Name` |
| `COL_CLIENT_NAME` | e.g. `Client` |
| `COL_STATUS` | e.g. `Status` |
| `COL_PROJECT_MANAGER` | e.g. `Project Manager` |
| `COL_BUDGET_ALLOCATED` | e.g. `Budget` |
| `COL_BUDGET_SPENT` | e.g. `Actuals` |
| `COL_PERCENT_COMPLETE` | e.g. `% Complete` |

### 6. Redeploy

After updating env vars, trigger a redeployment in Vercel and your dashboard is live.

---

## Local Development

```bash
npm install
cp .env.example .env.local   # Edit with your values
npm run dev
```

Visit `http://localhost:3000`

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/discover` | List all sheets and reports |
| `GET /api/discover?inspect=ID&type=sheet` | Inspect columns and sample data |
| `GET /api/snapshot` | Full dashboard data as JSON |

---

## Customization

### Status Colors

Edit `lib/config.js` to change which status values map to green/yellow/red. Or set custom values via env vars in a future update.

### Dashboard Title

Set `DASHBOARD_TITLE` env var in Vercel.

---

## Architecture

```
app/
  page.js             → React dashboard (client-side)
  layout.js           → HTML shell
  api/
    snapshot/route.js  → Fetches + transforms Smartsheet data
    discover/route.js  → Lists sheets/reports for setup
lib/
  smartsheet.js        → Smartsheet REST API client
  config.js            → Column mapping + status config
```

Data flows: **Smartsheet API → /api/snapshot → React dashboard**

The dashboard fetches fresh data from Smartsheet on every page load via the `/api/snapshot` endpoint. There's also a manual refresh button.
