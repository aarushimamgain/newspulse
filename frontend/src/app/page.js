'use client';

import { useState, useEffect, useCallback } from 'react';
import SourceFilter from '../components/SourceFilter';
import Timeline from '../components/Timeline';
import ClusterModal from '../components/ClusterModal';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function Home() {
  const [timelineData, setTimelineData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isIngesting, setIsIngesting] = useState(false);
  const [selectedSources, setSelectedSources] = useState(['BBC', 'NPR', 'Guardian']);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  // Fetch timeline data from backend
  const fetchTimeline = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/timeline`);
      if (!res.ok) throw new Error('Failed to fetch timeline data');
      const data = await res.json();
      setTimelineData(data);
    } catch (err) {
      console.error('Fetch timeline error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  // Handle Refresh Ingestion
  const handleRefresh = async () => {
    try {
      setIsIngesting(true);
      setStatusMessage('Updating news...');

      // 1. Trigger ingestion
      const triggerRes = await fetch(`${API_BASE}/ingest/trigger`, {
        method: 'POST'
      });
      if (!triggerRes.ok) throw new Error('Failed to trigger ingestion');
      const { jobId } = await triggerRes.json();

      // 2. Poll job status
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/ingest/status/${jobId}`);
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();

          if (statusData.status === 'completed') {
            clearInterval(pollInterval);
            setIsIngesting(false);
            setStatusMessage('');
            // 3. Re-fetch timeline after completion
            fetchTimeline();
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            setIsIngesting(false);
            setStatusMessage('Ingestion failed. Check backend logs.');
          }
        } catch (pollErr) {
          console.error('Polling error:', pollErr);
          clearInterval(pollInterval);
          setIsIngesting(false);
          setStatusMessage('Error checking ingestion status.');
        }
      }, 1500);
    } catch (error) {
      console.error('Refresh trigger error:', error);
      setIsIngesting(false);
      setStatusMessage('Could not start update.');
    }
  };

  // Open cluster detail modal
  const handleSelectCluster = async (cluster) => {
    try {
      setSelectedCluster(cluster); // display initial meta
      const res = await fetch(`${API_BASE}/clusters/${cluster.id}`);
      if (res.ok) {
        const fullDetail = await res.json();
        setSelectedCluster(fullDetail);
      }
    } catch (err) {
      console.error('Fetch cluster detail error:', err);
    }
  };

  // Frontend filtering by selected sources
  const filteredClusters = timelineData.filter((c) => {
    if (selectedSources.length === 0) return false;
    // Show cluster if any of its sources match selected sources
    if (!c.sources || c.sources.length === 0) return true;
    return c.sources.some((s) => selectedSources.includes(s));
  });

  return (
    <main className="container">
      {/* Header */}
      <header className="header">
        <h1>News Pulse</h1>
        <p>Topic-clustered news timeline</p>
      </header>

      {/* Controls: Source Filter & Refresh Button */}
      <div className="controls-bar">
        <SourceFilter
          selectedSources={selectedSources}
          onChange={setSelectedSources}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {statusMessage && (
            <span className="status-indicator">
              &bull; {statusMessage}
            </span>
          )}
          <button
            className="btn-refresh"
            onClick={handleRefresh}
            disabled={isIngesting}
          >
            {isIngesting ? 'Updating news...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {/* Main Timeline Section */}
      <section className="timeline-section">
        <div className="section-title">
          <h2>Active Topic Timeline</h2>
          <span className="cluster-count-badge">
            {filteredClusters.length} topic clusters
          </span>
        </div>

        {loading ? (
          <div className="empty-state">
            <p>Loading timeline clusters...</p>
          </div>
        ) : (
          <Timeline
            clusters={filteredClusters}
            onSelectCluster={handleSelectCluster}
          />
        )}
      </section>

      {/* Cluster Detail Modal */}
      {selectedCluster && (
        <ClusterModal
          cluster={selectedCluster}
          onClose={() => setSelectedCluster(null)}
        />
      )}
    </main>
  );
}
