'use client';

export default function Timeline({ clusters, onSelectCluster }) {
  if (!clusters || clusters.length === 0) {
    return (
      <div className="empty-state">
        <p>No clusters found matching your source filter.</p>
      </div>
    );
  }

  // Determine overall timeline min and max boundaries
  const timestamps = clusters.flatMap((c) => [
    new Date(c.start).getTime(),
    new Date(c.end).getTime()
  ]).filter((t) => !isNaN(t));

  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const totalDuration = maxTime - minTime || 1; // avoid division by zero

  const formatDateTime = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
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
    <div className="timeline-list">
      {clusters.map((cluster) => {
        const startTime = new Date(cluster.start).getTime();
        const endTime = new Date(cluster.end).getTime();

        // Calculate position percentages along the time axis
        const leftPercent = Math.max(0, Math.min(100, ((startTime - minTime) / totalDuration) * 100));
        const rawWidth = ((endTime - startTime) / totalDuration) * 100;
        // Minimum width so single-point clusters are easily visible
        const widthPercent = Math.max(2.5, Math.min(100 - leftPercent, rawWidth));

        return (
          <div
            key={cluster.id}
            className="timeline-card"
            onClick={() => onSelectCluster(cluster)}
            title="Click to view articles in this cluster"
          >
            <div className="timeline-card-header">
              <span className="cluster-topic-label">{cluster.label}</span>
              <span className="article-count-tag">
                {cluster.articleCount} {cluster.articleCount === 1 ? 'article' : 'articles'}
              </span>
            </div>

            {/* Time Span Bar */}
            <div className="timeline-bar-wrapper">
              <div
                className="timeline-bar-fill"
                style={{
                  marginLeft: `${leftPercent}%`,
                  width: `${widthPercent}%`
                }}
              />
            </div>

            <div className="timeline-meta">
              <div className="time-range">
                <span><strong>Active:</strong> {formatDateTime(cluster.start)}</span>
                {cluster.start !== cluster.end && (
                  <span> &rarr; {formatDateTime(cluster.end)}</span>
                )}
              </div>

              {cluster.sources && cluster.sources.length > 0 && (
                <div className="source-badges">
                  {cluster.sources.map((s) => (
                    <span key={s} className={getSourceBadgeClass(s)}>
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
