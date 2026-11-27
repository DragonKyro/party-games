import { useId } from 'react';

// Inline SVG ids are document-global: two copies of the same illustration
// on a page would share (and fight over) `<defs>` ids. `useSvgIds` gives
// each instance its own.
//
//   const ids = useSvgIds('bowl', ['glass', 'water']);
//   <linearGradient id={ids.glass}> … fill={`url(#${ids.glass})`}

export function useSvgIds<K extends string>(prefix: string, keys: readonly K[]): Record<K, string> {
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = `${prefix}-${k}-${base}`;
  return out;
}
