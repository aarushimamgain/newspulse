# News Pulse — Topic-Clustered News Timeline

A lightweight, full-stack news timeline system that ingests live articles from major news RSS feeds, groups related articles into topic clusters using a transparent keyword-overlap approach, and visualizes them along an interactive timeline.

---

## 1. Project Overview

**News Pulse** continuously collects news articles from public RSS feeds (BBC News, NPR, The Guardian), extracts the full text of articles where available, automatically groups articles covering the same topic into clusters, and presents them in a clean, interactive timeline.

Users can:
- Observe when particular news stories were active across a timeline.
- Filter clusters by news source (BBC, NPR, Guardian).
- Click any topic cluster to inspect all individual articles in chronological order.
- Click **"Refresh Data"** to trigger a real-time ingestion run in the background with immediate UI updates.

---

## 2. Architecture

The system is designed with simplicity, reliability, and modularity in mind:

```
[ Public RSS Feeds ] (BBC, NPR, The Guardian)
         │
         ▼
[ Python Ingestion Pipeline ] (/scraper)
  ├── 1. RSS Fetching & Date Normalization (feedparser)
  ├── 2. Body Text Extraction (requests + BeautifulSoup)
  ├── 3. Keyword-Overlap Topic Clustering (threshold = 3)
  └── 4. Persistent Storage (SQLite)
         │
         ▼
[ SQLite Database ] (newspulse.sqlite)
         │
         ▼
[ Node.js + Express REST API ] (/backend)
  ├── Serves /clusters, /clusters/:id, /timeline
  └── Child Process Ingestion Runner (POST /ingest/trigger, GET /ingest/status/:id)
         │
         ▼
[ Next.js + React Frontend ] (/frontend)
  ├── Timeline Visualization
  ├── Source Filters (BBC / NPR / Guardian)
  ├── Cluster Details Modal
  └── Ingestion Status Polling ("Updating news...")
```

---

## 3. Technologies Used

- **Python (v3.9+)**:
  - `feedparser`: Clean parsing of RSS feeds across differing XML schemas.
  - `requests`: Fetching raw article web pages with custom headers.
  - `beautifulsoup4`: Extracting paragraph text and stripping boilerplate HTML.
  - `sqlite3`: Native Python interface for reading/writing local database records.
- **Node.js + Express (v22+)**:
  - `express`: Fast, minimalist REST API server.
  - `better-sqlite3`: Synchronous, ultra-fast SQLite driver.
  - `cors` & `dotenv`: Cross-origin request handling and environment variable configuration.
  - `child_process`: Spawning the Python pipeline on demand with an in-memory job tracker.
- **Next.js + React (v14+)**:
  - Modern React App Router with lightweight Vanilla CSS styling.
  - Interactive visual timeline charting active cluster windows.
  - Non-blocking state management for source filtering and polling ingestion status.
- **SQLite**:
  - Zero-configuration local SQL database. Structured so it can be swapped with PostgreSQL/MySQL if scaled.

---

## 4. How to Run Locally

### Prerequisites
- Node.js (v18 or higher)
- Python (v3.8 or higher)
- npm (installed with Node.js)

### Step 1: Install Python Dependencies
```bash
cd scraper
pip install -r requirements.txt
```

### Step 2: Run Initial Ingestion (Optional — can also be triggered from UI)
```bash
python pipeline.py
```
*This populates `backend/newspulse.sqlite` with live articles and topic clusters.*

### Step 3: Start Node.js Express Backend
```bash
cd ../backend
npm install
npm start
```
*Backend will run at `http://localhost:5000`.*

### Step 4: Start Next.js Frontend
```bash
cd ../frontend
npm install
npm run dev
```
*Frontend will run at `http://localhost:3000`.*

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 5. RSS Sources

The system ingests from three public feeds:

| Source | RSS Feed URL |
| :--- | :--- |
| **BBC News** | `http://feeds.bbci.co.uk/news/rss.xml` |
| **NPR** | `https://feeds.npr.org/1001/rss.xml` |
| **The Guardian** | `https://www.theguardian.com/world/rss` |

---

## 6. Topic Grouping Algorithm

The topic clustering uses a keyword-overlap strategy:

1. **Text Combination**: For each article, combine its `title` and `summary`.
2. **Text Cleaning**:
   - Convert all characters to lowercase.
   - Strip punctuation, special characters, and digits.
3. **Stop Word Filtering**: Remove common English stop words (`the`, `is`, `and`, `to`, `for`, `with`, etc.) and words with fewer than 3 characters.
4. **Meaningful Words**: Collect the remaining tokens into a unique word set for that article.
5. **Cluster Comparison**: Compare the article's meaningful words with existing clusters:
   - If the article shares **at least 3 meaningful words** with an article in an existing cluster, it is added to that cluster.
   - If no existing cluster meets this threshold, a new cluster is created.
6. **Cluster Label Generation**: The cluster label is generated from the **top 2–3 most common meaningful words** across all articles within the cluster (e.g. `"senate climate"` or `"typhoon japan"`).

---

## 7. Why Keyword Overlap Was Chosen

1. **Extreme Simplicity & Transparency**: Unlike black-box ML models or heavy vector embeddings, keyword overlap is 100% deterministic and easy to debug.
2. **Zero Heavy Dependencies**: Runs instantaneously without downloading multi-gigabyte models (e.g. PyTorch, spaCy, or SentenceTransformers) or needing paid external API keys (OpenAI).
3. **Interview Readability**: Any developer can grasp and explain the entire algorithm in less than a minute.

---

## 8. Threshold Used: 3 Shared Meaningful Words

- **1–2 shared words** creates over-clustering (false positives), erroneously grouping unrelated articles that happen to mention broad words like *"president"* or *"court"*.
- **4+ shared words** causes fragmentation (false negatives), creating dozens of single-article clusters because RSS summaries are concise.
- **3 shared words** strikes the ideal balance for short RSS headlines and descriptions.

---

## 9. Database Schema

Stored in `backend/newspulse.sqlite`:

```sql
CREATE TABLE IF NOT EXISTS clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    source TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    published_at TEXT NOT NULL,
    cluster_id INTEGER,
    FOREIGN KEY(cluster_id) REFERENCES clusters(id)
);
```

- **Deduplication**: `url UNIQUE` constraint ensures re-running the scraper never creates duplicate articles.

---

## 10. API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/clusters` | Returns list of topic clusters with label, article count, and time range. |
| `GET` | `/clusters/:id` | Returns cluster info and all articles in that cluster sorted chronologically. |
| `GET` | `/timeline` | Returns clusters formatted for the timeline chart (`id`, `label`, `start`, `end`, `articleCount`, `sources`). |
| `POST` | `/ingest/trigger` | Triggers Python scraper as a child process and returns a `{ jobId }`. |
| `GET` | `/ingest/status/:jobId` | Returns status (`pending`, `running`, `completed`, `failed`). |

---

## 11. Limitations & Edge Cases

1. **Vocabulary Divergence**:
   > *Keyword overlap works well for articles that share important words, but it may fail when two articles discuss the same event using very different vocabulary (e.g., "White House executive order" vs "President signs decree").*
2. **Graceful Web Scraping Degradation**:
   > *Some websites employ bot-detection, paywalls, or dynamic JavaScript rendering that prevents BeautifulSoup from extracting paragraph text. When body extraction fails or times out, the scraper gracefully falls back to using the RSS title and summary, ensuring the pipeline never crashes.*
3. **Single Outlier Clusters**:
   Articles about niche or unique events with no counterparts remain in single-article clusters until matching news breaks.

---

## 12. Deployment Architecture (Review Note)

For production deployment:
- **Frontend**: Deployed on **Vercel** (connects to backend via `NEXT_PUBLIC_API_URL`).
- **Backend**: Deployed on **Render** / **Railway** with Python runtime available.
- **Database**: Can use persistent disk on Render/Railway or switch to hosted **Supabase / Neon Postgres** by swapping the database driver.
- **Ingestion**: Triggered on-demand via `POST /ingest/trigger` or via GitHub Actions cron.
- **Environment Variables**:
  - `PORT=5000`
  - `DATABASE_PATH=./newspulse.sqlite`
  - `PYTHON_CMD=python`
  - `SCRAPER_SCRIPT_PATH=../scraper/pipeline.py`
  - `NEXT_PUBLIC_API_URL=https://your-backend.onrender.com`