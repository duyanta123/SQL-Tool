import { memo } from 'react';
import { MiniMap, type MiniMapProps } from '@xyflow/react';
import { useAppStore } from '@/store/useAppStore';

export const MiniMapStyled = memo((props: Partial<MiniMapProps>) => {
  const dark = useAppStore(s => s.resolvedTheme === 'dark');
  return (
    <MiniMap
      {...props}
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        width: 160,
        height: 100,
        ...props.style,
      }}
      nodeColor={node => {
        const data = node.data as { kind?: string; tableType?: string };
        if (!data?.kind) return '#d4d4d4';
        switch (data.kind) {
          case 'source': return '#737373';
          case 'target': return '#30a46c';
          case 'cte': return '#8b5cf6';
          case 'subquery': return '#f97316';
          case 'aggregate': return '#ec4899';
          case 'literal': return '#a3a3a3';
          case 'table':
            if (data.tableType === 'cte') return '#8b5cf6';
            if (data.tableType === 'subquery') return '#f97316';
            return '#525252';
          default: return '#d4d4d4';
        }
      }}
      maskColor={dark ? 'rgba(18,19,23,0.75)' : 'rgba(255,255,255,0.7)'}
      pannable
      zoomable
    />
  );
});

MiniMapStyled.displayName = 'MiniMapStyled';
