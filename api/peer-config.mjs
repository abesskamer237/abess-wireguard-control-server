/**
 * Remove exactly one peer block created by this API.
 * The marker is authoritative; unrelated [Peer] blocks are preserved.
 */
export function removeManagedPeerBlock(config, name) {
  const lines = String(config).split(/\r?\n/);
  const marker = '# managed-by-abess-api:' + name;
  const index = lines.findIndex(line => line.trim() === marker);
  if (index < 0) return { config, removed: false };

  let end = index + 1;
  if (lines[end]?.trim() === '[Peer]') end++;
  while (end < lines.length) {
    const line = lines[end].trim();
    if (line === '[Interface]' || line === '[Peer]' || line.startsWith('# managed-by-abess-api:')) break;
    end++;
  }

  const kept = [...lines.slice(0, index), ...lines.slice(end)];
  return { config: kept.join('\n'), removed: true };
}
