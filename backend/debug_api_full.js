
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { generateToken } = require('./lib/auth-utils');
const { fetch } = require('./lib/fetch-utils');

async function test() {
  const userId = 'user_mk5vb7v2_ebe837825fb2';
  // const token = generateToken({ userId, username: 'testuser' });
  const token = 'c107b7e1f822c7e1e444fc5310d2a4b2d15ff3fe1ad25a21mkd2tvvu';
  console.log('Using token:', token);

  const url = `http://localhost:4001/api/credits/balance?userId=${userId}`;
  console.log('Fetching:', url);

  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Body:', text);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

test();
