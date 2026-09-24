import os

# RSS Feeds specified in the assessment
FEEDS = [
    {
        "source": "BBC",
        "url": "http://feeds.bbci.co.uk/news/rss.xml"
    },
    {
        "source": "NPR",
        "url": "https://feeds.npr.org/1001/rss.xml"
    },
    {
        "source": "Guardian",
        "url": "https://www.theguardian.com/world/rss"
    }
]

# Database configuration (defaults to backend folder SQLite file)
DEFAULT_DB_PATH = os.path.abspath(
    os.getenv("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "..", "backend", "newspulse.sqlite"))
)

# Topic Clustering Threshold: minimum shared meaningful words to consider articles related
SIMILARITY_THRESHOLD = 3

# Standard English stop words
STOP_WORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", 
    "aren't", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", 
    "but", "by", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", 
    "doing", "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", 
    "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", 
    "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", 
    "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", 
    "me", "more", "most", "mustn't", "my", "myself", "no", "nor", "not", "of", "off", "on", 
    "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", 
    "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", 
    "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", 
    "there", "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", 
    "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", 
    "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", "when's", 
    "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", 
    "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", 
    "yours", "yourself", "yourselves", "said", "says", "also", "will", "one", "two", "new", 
    "first", "per", "cent", "news", "us", "mr", "mrs", "ms", "continue", "reading", "watch",
    "live", "image", "copyright", "caption", "source", "reuters", "getty", "images",
    "bbc", "npr", "guardian", "told", "can", "may", "like", "just", "now", "see", "many", "even"
}

