import os
import sys

# Ensure script directory is in sys.path regardless of execution working directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import json
import sqlite3
import datetime

from config import DEFAULT_DB_PATH
from extractor import fetch_all_feeds, extract_article_body
from clusterer import cluster_articles


def init_db(db_path: str):
    """Ensures database directory and required tables exist."""
    db_dir = os.path.dirname(db_path)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clusters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)
    
    cursor.execute("""
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
    )
    """)
    conn.commit()
    conn.close()

def get_existing_urls(db_path: str) -> set:
    """Returns set of article URLs already stored in SQLite."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT url FROM articles")
    urls = {row[0] for row in cursor.fetchall()}
    conn.close()
    return urls

def get_existing_clusters_with_articles(db_path: str) -> list:
    """Loads existing clusters and their articles from SQLite."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, label, created_at FROM clusters")
    cluster_rows = cursor.fetchall()
    
    clusters = []
    for c_row in cluster_rows:
        c_id = c_row["id"]
        cursor.execute("SELECT title, summary FROM articles WHERE cluster_id = ?", (c_id,))
        articles = [dict(a) for a in cursor.fetchall()]
        clusters.append({
            "id": c_id,
            "label": c_row["label"],
            "articles": articles
        })
        
    conn.close()
    return clusters

def run_pipeline():
    """Main ingestion and clustering workflow."""
    print("=== Starting News Pulse Ingestion Pipeline ===")
    print(f"Database path: {DEFAULT_DB_PATH}")
    
    init_db(DEFAULT_DB_PATH)
    
    existing_urls = get_existing_urls(DEFAULT_DB_PATH)
    print(f"Found {len(existing_urls)} existing articles in database.")
    
    raw_articles = fetch_all_feeds()
    print(f"Fetched {len(raw_articles)} total items from RSS feeds.")
    
    # Filter out duplicates (both from DB and within the current feed list)
    seen_urls = set(existing_urls)
    new_articles = []
    for a in raw_articles:
        url = a.get("url", "").strip()
        if url and url not in seen_urls:
            seen_urls.add(url)
            new_articles.append(a)
            
    print(f"Identified {len(new_articles)} new unique articles to process.")
    
    if not new_articles:
        print("No new articles to process. Everything is up-to-date.")
        result = {"status": "completed", "new_articles": 0, "new_clusters": 0}
        print(json.dumps(result))
        return result
        
    # Extract article full text when possible (graceful failure built-in)
    print("Attempting body text extraction for new articles...")
    for idx, article in enumerate(new_articles, start=1):
        print(f"[{idx}/{len(new_articles)}] Extracting: {article['title'][:60]}...")
        body = extract_article_body(article["url"])
        article["content"] = body
        
    # Group articles into topic clusters
    print("Clustering articles with 3-word overlap threshold...")
    existing_clusters = get_existing_clusters_with_articles(DEFAULT_DB_PATH)
    clustered_data = cluster_articles(new_articles, existing_clusters)
    
    # Save into SQLite database
    conn = sqlite3.connect(DEFAULT_DB_PATH)
    cursor = conn.cursor()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    new_cluster_count = 0
    
    for cluster in clustered_data:
        # Create cluster record if it's new
        if cluster.get("is_new") or cluster.get("id") is None:
            cursor.execute(
                "INSERT INTO clusters (label, created_at) VALUES (?, ?)",
                (cluster["label"], now_iso)
            )
            cluster["id"] = cursor.lastrowid
            new_cluster_count += 1
        else:
            # Update label if cluster gained articles
            cursor.execute(
                "UPDATE clusters SET label = ? WHERE id = ?",
                (cluster["label"], cluster["id"])
            )
            
        # Assign cluster_id to new articles in this cluster
        for article in cluster["articles"]:
            if "cluster_id" not in article or article["cluster_id"] is None:
                article["cluster_id"] = cluster["id"]
                
    # Insert new articles
    for article in new_articles:
        cursor.execute(
            """
            INSERT OR IGNORE INTO articles (title, summary, content, source, url, published_at, cluster_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                article["title"],
                article["summary"],
                article["content"],
                article["source"],
                article["url"],
                article["published_at"],
                article["cluster_id"]
            )
        )
        
    conn.commit()
    conn.close()
    
    print(f"Ingestion complete: Added {len(new_articles)} articles in {new_cluster_count} new clusters.")
    result = {
        "status": "completed",
        "new_articles": len(new_articles),
        "new_clusters": new_cluster_count
    }
    print(json.dumps(result))
    return result

if __name__ == "__main__":
    try:
        run_pipeline()
    except Exception as e:
        print(f"Pipeline error: {e}", file=sys.stderr)
        sys.exit(1)
