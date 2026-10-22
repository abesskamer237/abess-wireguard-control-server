import test from 'node:test';
import assert from 'node:assert/strict';
test('peer name validation policy examples',()=>{
  const safe=s=>typeof s==='string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,30}$/.test(s);
  assert.equal(safe('phone-01'),true);
  assert.equal(safe('device_2'),true);
  assert.equal(safe('../etc/passwd'),false);
  assert.equal(safe(''),false);
  assert.equal(safe('space name'),false);
});
