import datetime
import re
import requests
# pyrefly: ignore [missing-import]
import feedparser
# pyrefly: ignore [missing-import]
from bs4 import BeautifulSoup
from config import FEEDS

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def clean_html(raw_html: str) -> str:
    """Removes HTML tags and normalizes whitespace."""
    if not raw_html:
        return ""
    soup = BeautifulSoup(raw_html, "html.parser")
    text = soup.get_text(separator=" ")
    return " ".join(text.split())

def parse_published_date(entry) -> str:
    """
    Extracts published date from feed entry and converts to ISO 8601 string.
    Handles published_parsed, updated_parsed, or returns current UTC time.
    """
    time_struct = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if time_struct:
        try:
            dt = datetime.datetime(*time_struct[:6], tzinfo=datetime.timezone.utc)
            return dt.isoformat()
        except Exception:
            pass
            
    # Fallback to current UTC time if date parsing fails or missing
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def extract_article_body(url: str) -> str:
    """
    Fetches the webpage at URL and extracts text from paragraph tags.
    If extraction fails (timeout, 403, network error, parse error), returns empty string
    without raising an exception or crashing the pipeline.
    """
    if not url:
        return ""
    try:
        response = requests.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=5,
            allow_redirects=True
        )
        if response.status_code != 200:
            return ""

        soup = BeautifulSoup(response.text, "html.parser")
        
        # Remove script, style, nav, footer, header elements to avoid boilerplate
        for element in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            element.decompose()

        paragraphs = soup.find_all("p")
        # Keep paragraphs that have reasonable length
        body_parts = [p.get_text().strip() for p in paragraphs if len(p.get_text().strip()) > 30]
        return "\n\n".join(body_parts)
    except Exception as e:
        # Graceful failure: Keep title/summary and continue
        return ""

def fetch_feed_articles(feed_config: dict) -> list:
    """
    Parses a single RSS feed and yields a list of normalized article dictionaries.
    """
    source_name = feed_config["source"]
    feed_url = feed_config["url"]
    articles = []

    try:
        feed = feedparser.parse(feed_url)
        for entry in feed.entries:
            title = getattr(entry, "title", "").strip()
            link = getattr(entry, "link", "").strip()
            if not title or not link:
                continue

            # Check multiple description fields
            raw_summary = (
                getattr(entry, "summary", None)
                or getattr(entry, "description", None)
                or ""
            )
            summary = clean_html(raw_summary)

            published_at = parse_published_date(entry)

            # Normalize dictionary
            article = {
                "source": source_name,
                "title": title,
                "summary": summary,
                "url": link,
                "published_at": published_at,
                "content": ""  # will attempt extraction in pipeline
            }
            articles.append(article)
    except Exception as e:
        print(f"[{source_name}] Error parsing feed: {e}")

    return articles

def fetch_all_feeds() -> list:
    """
    Fetches raw articles from all configured feeds.
    """
    all_articles = []
    for feed_info in FEEDS:
        print(f"Fetching RSS feed for {feed_info['source']}...")
        feed_articles = fetch_feed_articles(feed_info)
        print(f"Found {len(feed_articles)} articles from {feed_info['source']}")
        all_articles.extend(feed_articles)
    return all_articles
