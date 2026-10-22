import test from 'node:test';
import assert from 'node:assert/strict';
import { removeManagedPeerBlock } from '../peer-config.mjs';

test('removes only the requested managed peer and preserves following peers', () => {
  const source = [
    '[Interface]',
    'Address = 10.77.0.1/24',
    '',
    '# managed-by-luna-api:phone-1',
    '[Peer]',
    'PublicKey = PHONE1',
    'AllowedIPs = 10.77.0.2/32',
    '',
    '[Peer]',
    'PublicKey = MANUAL',
    'AllowedIPs = 10.77.0.99/32',
    '',
    '# managed-by-luna-api:laptop-1',
    '[Peer]',
    'PublicKey = LAPTOP',
    'AllowedIPs = 10.77.0.3/32',
    ''
  ].join('\n');

  const result = removeManagedPeerBlock(source, 'phone-1');
  assert.equal(result.removed, true);
  assert.doesNotMatch(result.config, /PHONE1/);
  assert.match(result.config, /PublicKey = MANUAL/);
  assert.match(result.config, /PublicKey = LAPTOP/);
  assert.match(result.config, /# managed-by-luna-api:laptop-1/);
});

test('does not modify config when the managed marker is absent', () => {
  const source = '[Interface]\nAddress = 10.77.0.1/24\n[Peer]\nPublicKey = MANUAL';
  assert.deepEqual(removeManagedPeerBlock(source, 'missing'), { config: source, removed: false });
});

test('removes the last managed peer without removing the interface', () => {
  const source = '[Interface]\nAddress = 10.77.0.1/24\n\n# managed-by-luna-api:phone-1\n[Peer]\nPublicKey = PHONE1\nAllowedIPs = 10.77.0.2/32\n';
  const result = removeManagedPeerBlock(source, 'phone-1');
  assert.equal(result.removed, true);
  assert.match(result.config, /\[Interface\]/);
  assert.doesNotMatch(result.config, /PHONE1/);
});
