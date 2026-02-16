import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Input } from '@fluentui/react-components';
import { useReactFlow, Node as FlowNode } from '@xyflow/react';

interface Props {
  nodes: FlowNode[];
  isDarkMode?: boolean;
}

const NodeSearch: React.FC<Props> = ({ nodes, isDarkMode }) => {
  const [query, setQuery] = useState('');
  const { setCenter } = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(() => {
    if (!query) return [] as FlowNode[];
    const q = query.toLowerCase();
    return nodes.filter((n) => {
      // exclude hidden nodes from search
      if ((n as any).hidden) return false;
      const data: any = n.data || {};
      const label = data.label ?? (data.table ? `${data.schemaName || ''}.${data.table.name}`.replace(/^\./, '') : '');
      return String(label || n.id).toLowerCase().includes(q);
    });
  }, [nodes, query]);

  const handleSelect = useCallback((node: FlowNode) => {
    const width = (node as any).width ?? 300;
    const height = (node as any).height ?? 200;
    const x = node.position.x + width / 2;
    const y = node.position.y + height / 2;
    setCenter(x, y, { zoom: 1.2, duration: 300 });
    setQuery('');
  }, [setCenter]);

  // close results when clicking outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      // event.target is EventTarget — cast to any to avoid collision with FlowNode type
      if (!containerRef.current.contains(e.target as any)) {
        setQuery('');
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', marginLeft: 12 }}>
      <Input
        placeholder="Search"
        value={query}
        onChange={(e: any) => setQuery(e.target.value)}
        size="small"
        aria-label="Search"
      />
      {results.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 36,
            left: 0,
            zIndex: 1200,
            background: isDarkMode ? '#2b2b2b' : '#fff',
            border: `1px solid ${isDarkMode ? '#444' : '#ddd'}`,
            boxShadow: '0 4px 8px rgba(0,0,0,0.12)',
            maxHeight: 240,
            overflowY: 'auto',
            minWidth: 220,
          }}
        >
          {results.map((n) => {
            const data: any = n.data || {};
            const label = data.label ?? (data.table ? `${data.schemaName || ''}.${data.table.name}`.replace(/^\./, '') : n.id);
            return (
              <div
                key={n.id}
                style={{ padding: '8px 12px', cursor: 'pointer' }}
                onClick={() => handleSelect(n)}
              >
                {label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default NodeSearch;
