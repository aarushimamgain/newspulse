'use client';

import { useEffect } from 'react';

export default function ClusterModal({ cluster, onClose }) {
  if (!cluster) return null;

  const isLoading = !cluster.articles || cluster.articles.length === 0;

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const formatDate = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const getSourceBadgeClass = (source) => {
    const s = (source || '').toLowerCase();
    if (s.includes('bbc')) return 'badge badge-bbc';
    if (s.includes('npr')) return 'badge badge-npr';
    if (s.includes('guardian')) return 'badge badge-guardian';
    return 'badge';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Topic: {cluster.label}</h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {cluster.articles?.length || cluster.articleCount} articles in this cluster
            </span>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {isLoading ? (
            /* Skeleton loader shown while articles are being fetched */
            <div className="modal-skeleton">
              <div className="skeleton-spinner" />
              <span className="skeleton-label">Loading articles&hellip;</span>
            </div>
          ) : (
            /* Articles fade in once the full detail is ready */
            <div className="modal-articles-list">
              {cluster.articles.map((article) => (
                <div key={article.id || article.url} className="article-item">
                  <h3 className="article-headline">{article.title}</h3>
                  <div className="article-meta">
                    <span className={getSourceBadgeClass(article.source)}>{article.source}</span>
                    <span>{formatDate(article.published_at)}</span>
                  </div>
                  {article.summary && (
                    <p className="article-summary">{article.summary}</p>
                  )}
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="article-link"
                  >
                    Read original article &rarr;
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
