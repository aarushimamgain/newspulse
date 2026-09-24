/**
 * @file server.js
 * @description News Pulse — Express REST API
 *
 * Serves topic-cluster and article data from a local SQLite database
 * populated by the Python ingestion pipeline (/scraper/pipeline.py).
 *
 * Base URL (local dev): http://localhost:5000
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  ENDPOINT SUMMARY                                                       │
 * ├────────┬───────────────────────────┬────────────────────────────────────┤
 * │ Method │ Path                      │ Description                        │
 * ├────────┼───────────────────────────┼────────────────────────────────────┤
 * │ GET    │ /                         │ API health / info                   │
 * │ GET    │ /clusters                 │ List all topic clusters             │
 * │ GET    │ /clusters/:id             │ Single cluster + its articles       │
 * │ GET    │ /articles                 │ Paginated article search            │
 * │ GET    │ /timeline                 │ Clusters formatted for timeline     │
 * │ POST   │ /ingest/trigger           │ Kick off Python scraper job         │
 * │ GET    │ /ingest/status/:jobId     │ Poll scraper job status             │
 * └────────┴───────────────────────────┴────────────────────────────────────┘
 */

'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const db      = require('./db');
const { triggerScraperJob, getJobStatus } = require('./scraper_runner');

const app  = express();
const PORT = process.env.PORT || 5000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse a positive integer from a string.
 * Returns NaN if the value is not a valid positive integer.
 *
 * @param {string} str - The string to parse.
 * @returns {number} Parsed integer or NaN.
 */
function parsePositiveInt(str) {
  const n = parseInt(str, 10);
  return n > 0 ? n : NaN;
}

// ===========================================================================
//  GET /
//  Health check & API info
// ===========================================================================
/**
 * @route   GET /
 * @summary API health check and metadata.
 *
 * @response 200 {Object}
 *   @field {string} name        - Human-readable API name.
 *   @field {string} description - Short description of what the API does.
 *   @field {string} version     - Semver API version.
 *   @field {Object} endpoints   - Map of available route paths to descriptions.
 *
 * @example Request
 *   GET http://localhost:5000/
 *
 * @example Response 200
 *   {
 *     "name": "News Pulse API",
 *     "description": "REST API serving news clusters, articles, and timeline data",
 *     "version": "1.0.0",
 *     "endpoints": {
 *       "GET /clusters":             "List all topic clusters",
 *       "GET /clusters/:id":         "Single cluster with all articles",
 *       "GET /articles":             "Paginated article list with optional filters",
 *       "GET /timeline":             "Clusters formatted for the timeline chart",
 *       "POST /ingest/trigger":      "Trigger the Python ingestion pipeline",
 *       "GET /ingest/status/:jobId": "Poll the status of an ingestion job"
 *     }
 *   }
 */
app.get('/', (_req, res) => {
  res.json({
    name:        'News Pulse API',
    description: 'REST API serving news clusters, articles, and timeline data',
    version:     '1.0.0',
    endpoints: {
      'GET /clusters':             'List all topic clusters',
      'GET /clusters/:id':         'Single cluster with all articles',
      'GET /articles':             'Paginated article list with optional filters',
      'GET /timeline':             'Clusters formatted for the timeline chart',
      'POST /ingest/trigger':      'Trigger the Python ingestion pipeline',
      'GET /ingest/status/:jobId': 'Poll the status of an ingestion job'
    }
  });
});

// ===========================================================================
//  GET /clusters
//  List all topic clusters
// ===========================================================================
/**
 * @route   GET /clusters
 * @summary Returns all topic clusters that contain at least one article,
 *          sorted by the most-recently-updated cluster first.
 *
 * @queryparam {string} [source] - Filter clusters to only those containing
 *             at least one article from this source.
 *             Accepted values (case-sensitive): BBC | NPR | Guardian
 *
 * @response 200 {Array<ClusterSummary>}
 *   @field {number}   id                  - Cluster primary key.
 *   @field {string}   label               - Auto-generated topic label
 *                                           (e.g. "senate climate").
 *   @field {number}   articleCount        - Total articles in this cluster.
 *   @field {string}   earliestArticleTime - ISO 8601 timestamp of the oldest article.
 *   @field {string}   latestArticleTime   - ISO 8601 timestamp of the newest article.
 *   @field {string[]} sources             - Distinct publisher names present
 *                                           (e.g. ["BBC", "NPR"]).
 *
 * @response 500 {Object} { "error": "Failed to fetch clusters" }
 *
 * @example Request
 *   GET /clusters
 *   GET /clusters?source=BBC
 *
 * @example Response 200
 *   [
 *     {
 *       "id": 12,
 *       "label": "senate climate",
 *       "articleCount": 5,
 *       "earliestArticleTime": "2024-11-01T08:00:00.000Z",
 *       "latestArticleTime":   "2024-11-03T14:22:00.000Z",
 *       "sources": ["BBC", "NPR"]
 *     }
 *   ]
 */
app.get('/clusters', (req, res) => {
  try {
    const { source } = req.query;

    const rows = db.prepare(`
      SELECT
        c.id,
        c.label,
        COUNT(a.id)                     AS articleCount,
        MIN(a.published_at)             AS earliestArticleTime,
        MAX(a.published_at)             AS latestArticleTime,
        GROUP_CONCAT(DISTINCT a.source) AS sources
      FROM clusters c
      JOIN articles a ON a.cluster_id = c.id
      GROUP BY c.id
      HAVING COUNT(a.id) > 0
      ORDER BY latestArticleTime DESC
    `).all();

    // Optional source filter applied in JS to avoid complex HAVING rewrite.
    const filtered = source
      ? rows.filter((r) => r.sources && r.sources.split(',').includes(source))
      : rows;

    const formatted = filtered.map((r) => ({
      id:                  r.id,
      label:               r.label,
      articleCount:        r.articleCount,
      earliestArticleTime: r.earliestArticleTime,
      latestArticleTime:   r.latestArticleTime,
      sources:             r.sources ? r.sources.split(',') : []
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching clusters:', error);
    res.status(500).json({ error: 'Failed to fetch clusters' });
  }
});

// ===========================================================================
//  GET /clusters/:id
//  Single cluster detail with all articles
// ===========================================================================
/**
 * @route   GET /clusters/:id
 * @summary Returns full cluster metadata and all articles belonging to it,
 *          sorted chronologically (earliest → latest).
 *
 * @pathparam {number} id - Integer primary key of the cluster.
 *
 * @response 200 {ClusterDetail}
 *   @field {number}    id           - Cluster primary key.
 *   @field {string}    label        - Auto-generated topic label.
 *   @field {string}    createdAt    - ISO 8601 timestamp when the cluster
 *                                    was first created by the pipeline.
 *   @field {number}    articleCount - Total number of articles.
 *   @field {Article[]} articles     - Array of article objects:
 *     @field {number} articles[].id           - Article primary key.
 *     @field {string} articles[].title        - Article headline.
 *     @field {string} articles[].summary      - RSS feed summary/description.
 *     @field {string} articles[].content      - Full body text (may be null if
 *                                               the site blocked extraction).
 *     @field {string} articles[].source       - Publisher name (BBC|NPR|Guardian).
 *     @field {string} articles[].url          - Canonical article URL.
 *     @field {string} articles[].published_at - ISO 8601 publication timestamp.
 *
 * @response 400 {Object} { "error": "Invalid cluster ID" }
 *   Returned when :id is not a valid integer.
 *
 * @response 404 {Object} { "error": "Cluster not found" }
 *   Returned when no cluster exists for the given :id.
 *
 * @response 500 {Object} { "error": "Failed to fetch cluster detail" }
 *
 * @example Request
 *   GET /clusters/12
 *
 * @example Response 200
 *   {
 *     "id": 12,
 *     "label": "senate climate",
 *     "createdAt": "2024-11-01T08:00:00.000Z",
 *     "articleCount": 3,
 *     "articles": [
 *       {
 *         "id": 55,
 *         "title": "Senate passes climate bill",
 *         "summary": "The US Senate voted ...",
 *         "content": "WASHINGTON — The Senate on Thursday ...",
 *         "source": "NPR",
 *         "url": "https://www.npr.org/...",
 *         "published_at": "2024-11-01T08:00:00.000Z"
 *       }
 *     ]
 *   }
 */
app.get('/clusters/:id', (req, res) => {
  try {
    const clusterId = parseInt(req.params.id, 10);
    if (isNaN(clusterId)) {
      return res.status(400).json({ error: 'Invalid cluster ID' });
    }

    const cluster = db
      .prepare('SELECT id, label, created_at FROM clusters WHERE id = ?')
      .get(clusterId);

    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    // Sort articles chronologically (earliest first) for timeline reading.
    const articles = db
      .prepare(`
        SELECT id, title, summary, content, source, url, published_at
        FROM   articles
        WHERE  cluster_id = ?
        ORDER  BY published_at ASC
      `)
      .all(clusterId);

    res.json({
      id:           cluster.id,
      label:        cluster.label,
      createdAt:    cluster.created_at,
      articleCount: articles.length,
      articles
    });
  } catch (error) {
    console.error('Error fetching cluster detail:', error);
    res.status(500).json({ error: 'Failed to fetch cluster detail' });
  }
});

// ===========================================================================
//  GET /articles
//  Paginated article list with optional filters
// ===========================================================================
/**
 * @route   GET /articles
 * @summary Returns a paginated list of articles with optional filtering by
 *          source and/or cluster. Results are ordered by newest first.
 *
 * @queryparam {string} [source]     - Filter by publisher name
 *             (case-sensitive: BBC | NPR | Guardian).
 * @queryparam {number} [cluster_id] - Filter articles belonging to a
 *             specific cluster.
 * @queryparam {number} [page=1]     - 1-indexed page number.
 * @queryparam {number} [limit=20]   - Articles per page (max capped at 100).
 *
 * @response 200 {PaginatedArticles}
 *   @field {number}    total      - Total matching articles (pre-pagination).
 *   @field {number}    page       - Current page number.
 *   @field {number}    limit      - Articles per page used in this response.
 *   @field {number}    totalPages - Total number of pages available.
 *   @field {Article[]} articles   - Array of article objects (newest first).
 *     @field {number} articles[].id           - Article primary key.
 *     @field {string} articles[].title        - Article headline.
 *     @field {string} articles[].summary      - RSS feed summary/description.
 *     @field {string} articles[].content      - Full body text (may be null).
 *     @field {string} articles[].source       - Publisher name.
 *     @field {string} articles[].url          - Canonical article URL.
 *     @field {string} articles[].published_at - ISO 8601 publication timestamp.
 *     @field {number} articles[].cluster_id   - ID of the cluster this article
 *                                               belongs to (may be null).
 *
 * @response 400 {Object} { "error": "Invalid page or limit value" }
 *   Returned when page or limit are not valid positive integers.
 *
 * @response 400 {Object} { "error": "Invalid cluster_id value" }
 *   Returned when cluster_id is provided but not a valid integer.
 *
 * @response 500 {Object} { "error": "Failed to fetch articles" }
 *
 * @example Request
 *   GET /articles
 *   GET /articles?source=BBC&page=2&limit=10
 *   GET /articles?cluster_id=12
 *
 * @example Response 200
 *   {
 *     "total": 93,
 *     "page": 1,
 *     "limit": 20,
 *     "totalPages": 5,
 *     "articles": [
 *       { "id": 93, "title": "...", "source": "BBC", ... },
 *       ...
 *     ]
 *   }
 */
app.get('/articles', (req, res) => {
  try {
    // --- Pagination ---
    const page  = parsePositiveInt(req.query.page  || '1');
    let   limit = parsePositiveInt(req.query.limit || '20');

    if (isNaN(page) || isNaN(limit)) {
      return res.status(400).json({ error: 'Invalid page or limit value' });
    }
    if (limit > 100) limit = 100; // Hard cap to prevent excessively large queries.

    const offset = (page - 1) * limit;

    // --- Dynamic WHERE clause from optional filters ---
    const conditions = [];
    const bindings   = [];

    if (req.query.source) {
      conditions.push('source = ?');
      bindings.push(req.query.source);
    }

    if (req.query.cluster_id !== undefined) {
      const cid = parseInt(req.query.cluster_id, 10);
      if (isNaN(cid)) {
        return res.status(400).json({ error: 'Invalid cluster_id value' });
      }
      conditions.push('cluster_id = ?');
      bindings.push(cid);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count for pagination metadata.
    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM articles ${where}`)
      .get(...bindings);

    // Fetch the requested page, newest first.
    const articles = db
      .prepare(`
        SELECT   id, title, summary, content, source, url, published_at, cluster_id
        FROM     articles
        ${where}
        ORDER BY published_at DESC
        LIMIT    ? OFFSET ?
      `)
      .all(...bindings, limit, offset);

    res.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      articles
    });
  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// ===========================================================================
//  GET /timeline
//  Clusters formatted for the frontend timeline chart
// ===========================================================================
/**
 * @route   GET /timeline
 * @summary Returns all topic clusters with start/end timestamps optimised
 *          for plotting along a horizontal time axis. Ordered chronologically
 *          by start time (oldest first).
 *
 * @response 200 {Array<TimelineEntry>}
 *   @field {number}   id           - Cluster primary key.
 *   @field {string}   label        - Auto-generated topic label.
 *   @field {string}   start        - ISO 8601 timestamp of the earliest article.
 *   @field {string}   end          - ISO 8601 timestamp of the latest article.
 *   @field {number}   articleCount - Number of articles in this cluster.
 *   @field {number}   intensity    - Alias of articleCount used by the frontend
 *                                    to scale visual bar weight.
 *   @field {string[]} sources      - Distinct publisher names in this cluster.
 *
 * @response 500 {Object} { "error": "Failed to fetch timeline data" }
 *
 * @example Request
 *   GET /timeline
 *
 * @example Response 200
 *   [
 *     {
 *       "id": 3,
 *       "label": "typhoon japan",
 *       "start": "2024-10-28T04:00:00.000Z",
 *       "end":   "2024-10-30T18:45:00.000Z",
 *       "articleCount": 7,
 *       "intensity": 7,
 *       "sources": ["BBC", "Guardian"]
 *     }
 *   ]
 */
app.get('/timeline', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        c.id,
        c.label,
        MIN(a.published_at)             AS start,
        MAX(a.published_at)             AS end,
        COUNT(a.id)                     AS articleCount,
        GROUP_CONCAT(DISTINCT a.source) AS sources
      FROM clusters c
      JOIN articles a ON a.cluster_id = c.id
      GROUP BY c.id
      HAVING COUNT(a.id) > 0
      ORDER BY start ASC
    `).all();

    const timelineData = rows.map((r) => ({
      id:           r.id,
      label:        r.label,
      start:        r.start,
      end:          r.end,
      articleCount: r.articleCount,
      intensity:    r.articleCount, // visual weight hint for the chart
      sources:      r.sources ? r.sources.split(',') : []
    }));

    res.json(timelineData);
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline data' });
  }
});

// ===========================================================================
//  POST /ingest/trigger
//  Launch the Python scraper as a background child process
// ===========================================================================
/**
 * @route   POST /ingest/trigger
 * @summary Spawns the Python ingestion pipeline (scraper/pipeline.py) as a
 *          background child process. Returns immediately with a jobId that
 *          can be polled via GET /ingest/status/:jobId.
 *
 *          The pipeline performs four steps:
 *            1. Fetch RSS feeds from BBC, NPR, and The Guardian.
 *            2. Extract full article body text via BeautifulSoup.
 *            3. Cluster articles by keyword overlap (threshold = 3 words).
 *            4. Persist new clusters and articles into newspulse.sqlite.
 *
 * @body    (none) — No request body required.
 *
 * @response 202 {Object} Accepted — job has been queued.
 *   @field {string} jobId   - Unique job identifier
 *                             (e.g. "job_1699876543210_abc12").
 *   @field {string} status  - Always "pending" immediately after creation.
 *   @field {string} message - Human-readable confirmation string.
 *
 * @response 500 {Object} { "error": "Failed to trigger ingestion pipeline" }
 *   Returned only if the child process could not be spawned at all.
 *
 * @example Request
 *   POST /ingest/trigger
 *
 * @example Response 202
 *   {
 *     "jobId":   "job_1699876543210_abc12",
 *     "status":  "pending",
 *     "message": "Ingestion pipeline triggered"
 *   }
 */
app.post('/ingest/trigger', (_req, res) => {
  try {
    const jobId = triggerScraperJob();
    res.status(202).json({
      jobId,
      status:  'pending',
      message: 'Ingestion pipeline triggered'
    });
  } catch (error) {
    console.error('Error triggering ingestion:', error);
    res.status(500).json({ error: 'Failed to trigger ingestion pipeline' });
  }
});

// ===========================================================================
//  GET /ingest/status/:jobId
//  Poll the status of a scraper job
// ===========================================================================
/**
 * @route   GET /ingest/status/:jobId
 * @summary Returns the current execution status of an ingestion job previously
 *          created by POST /ingest/trigger.
 *
 *          Jobs are stored in-memory for the lifetime of the server process.
 *          A server restart clears all job records.
 *
 * @pathparam {string} jobId - The job identifier returned by POST /ingest/trigger.
 *
 * @response 200 {JobStatus}
 *   @field {string}      jobId       - The job identifier.
 *   @field {string}      status      - Current status:
 *                                      "pending"   — queued, not yet started.
 *                                      "running"   — child process is active.
 *                                      "completed" — exited with code 0.
 *                                      "failed"    — exited with non-zero code
 *                                                    or spawn error.
 *   @field {string|null} startedAt   - ISO 8601 timestamp when the process
 *                                      started, or null if still pending.
 *   @field {string|null} completedAt - ISO 8601 timestamp when the process
 *                                      exited, or null if still running.
 *   @field {string|null} error       - Error message when status is "failed",
 *                                      otherwise null.
 *
 * @response 404 {Object} { "error": "Job ID not found" }
 *   Returned when the jobId does not exist (e.g. server restarted after trigger).
 *
 * @response 500 {Object} { "error": "Failed to retrieve job status" }
 *
 * @example Request
 *   GET /ingest/status/job_1699876543210_abc12
 *
 * @example Response 200 — while running
 *   {
 *     "jobId":       "job_1699876543210_abc12",
 *     "status":      "running",
 *     "startedAt":   "2024-11-13T10:15:43.210Z",
 *     "completedAt": null,
 *     "error":       null
 *   }
 *
 * @example Response 200 — after completion
 *   {
 *     "jobId":       "job_1699876543210_abc12",
 *     "status":      "completed",
 *     "startedAt":   "2024-11-13T10:15:43.210Z",
 *     "completedAt": "2024-11-13T10:16:08.900Z",
 *     "error":       null
 *   }
 */
app.get('/ingest/status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job ID not found' });
    }

    res.json({
      jobId:       job.jobId,
      status:      job.status,
      startedAt:   job.startedAt,
      completedAt: job.completedAt,
      error:       job.error
    });
  } catch (error) {
    console.error('Error checking job status:', error);
    res.status(500).json({ error: 'Failed to retrieve job status' });
  }
});

// ===========================================================================
//  Fallback 404 handler
// ===========================================================================
/**
 * Catch-all for any route not matched above.
 *
 * @response 404 {Object}
 *   @field {string} error  - "Route not found"
 *   @field {string} method - HTTP method that was requested.
 *   @field {string} path   - URL path that was requested.
 */
app.use((req, res) => {
  res.status(404).json({
    error:  'Route not found',
    method: req.method,
    path:   req.path
  });
});

// ===========================================================================
//  Start server
// ===========================================================================
app.listen(PORT, () => {
  console.log(`News Pulse Backend listening at http://localhost:${PORT}`);
  console.log('Registered endpoints:');
  console.log('  GET    /');
  console.log('  GET    /clusters');
  console.log('  GET    /clusters/:id');
  console.log('  GET    /articles');
  console.log('  GET    /timeline');
  console.log('  POST   /ingest/trigger');
  console.log('  GET    /ingest/status/:jobId');
});
