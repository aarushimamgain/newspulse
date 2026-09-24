import re
from collections import Counter
from config import STOP_WORDS, SIMILARITY_THRESHOLD

def extract_meaningful_words(title: str, summary: str) -> set:
    """
    Extracts a set of meaningful words from title and summary:
    1. Combines title and summary
    2. Converts to lowercase
    3. Removes punctuation
    4. Strips common stop words and very short words (< 3 chars)
    """
    combined_text = f"{title or ''} {summary or ''}".lower()
    # Replace punctuation and special characters with spaces
    cleaned_text = re.sub(r"[^\w\s]", " ", combined_text)
    words = cleaned_text.split()
    
    meaningful = {
        w for w in words
        if len(w) >= 3 and w not in STOP_WORDS and not w.isdigit()
    }
    return meaningful

def generate_cluster_label(articles: list) -> str:
    """
    Generates a descriptive 2-3 word cluster label based on the most frequent
    meaningful words across all articles in the cluster.
    """
    word_counter = Counter()
    for article in articles:
        words = extract_meaningful_words(article.get("title", ""), article.get("summary", ""))
        word_counter.update(words)
    
    # Take the top 2-3 most common words
    most_common = word_counter.most_common(3)
    if not most_common:
        return "general news"
    return " ".join(word for word, count in most_common)

def cluster_articles(new_articles: list, existing_clusters: list) -> list:
    """
    Clusters articles using keyword overlap (threshold = 3 shared meaningful words).
    
    Arguments:
    - new_articles: List of fresh article dicts to cluster.
    - existing_clusters: List of existing cluster dicts from database, each with:
        { "id": int, "label": str, "articles": list of article dicts }
        
    Returns:
    - List of updated/new cluster dicts with their assigned articles.
    """
    # Work with a combined mutable list of clusters
    clusters = []
    
    # Load existing clusters
    for ec in existing_clusters:
        cluster_entry = {
            "id": ec.get("id"),
            "label": ec.get("label", ""),
            "articles": list(ec.get("articles", [])),
            "is_new": False
        }
        clusters.append(cluster_entry)
        
    for article in new_articles:
        article_words = extract_meaningful_words(article.get("title", ""), article.get("summary", ""))
        matched_cluster = None
        
        # Check against existing clusters
        for cluster in clusters:
            # Check overlap with any article already in the cluster
            for existing_art in cluster["articles"]:
                existing_words = extract_meaningful_words(
                    existing_art.get("title", ""), 
                    existing_art.get("summary", "")
                )
                shared_words = article_words.intersection(existing_words)
                if len(shared_words) >= SIMILARITY_THRESHOLD:
                    matched_cluster = cluster
                    break
            if matched_cluster:
                break
                
        if matched_cluster:
            matched_cluster["articles"].append(article)
        else:
            # Create a brand new cluster
            new_cluster = {
                "id": None, # Will be assigned by database auto-increment
                "label": "",
                "articles": [article],
                "is_new": True
            }
            clusters.append(new_cluster)
            
    # Update cluster labels based on all their articles
    for cluster in clusters:
        cluster["label"] = generate_cluster_label(cluster["articles"])
        
    return clusters
