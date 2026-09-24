'use client';

export default function SourceFilter({ selectedSources, onChange }) {
  const sources = [
    { id: 'BBC', label: 'BBC' },
    { id: 'NPR', label: 'NPR' },
    { id: 'Guardian', label: 'Guardian' }
  ];

  const handleToggle = (sourceId) => {
    if (selectedSources.includes(sourceId)) {
      onChange(selectedSources.filter((s) => s !== sourceId));
    } else {
      onChange([...selectedSources, sourceId]);
    }
  };

  return (
    <div className="filter-group">
      <span className="filter-label">Filter by Source:</span>
      {sources.map((source) => (
        <label key={source.id} className="checkbox-item">
          <input
            type="checkbox"
            checked={selectedSources.includes(source.id)}
            onChange={() => handleToggle(source.id)}
          />
          <span>{source.label}</span>
        </label>
      ))}
    </div>
  );
}
