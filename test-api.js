// test-api.js - Quick API verification suite for Hustle backend
const http = require('http');

const PORT = process.env.PORT || 5001;

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('Testing Hustle Auth API on port', PORT);
  let failures = 0;

  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/status',
      method: 'GET'
    });
    if (res.status === 200) {
      console.log('✅ Health check OK');
    } else {
      console.error('❌ Health check failed');
      failures++;
    }
  } catch (err) {
    console.error('❌ Connection error (is server running?):', err.message);
    process.exit(1);
  }

  // Customer signin check
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/signin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      identifier: 'customer@hustle.local',
      password: 'password123'
    });

    if (res.status === 200 && res.data.token) {
      console.log('✅ Demo customer login OK (JWT verified)');
    } else {
      console.error('❌ Demo login failed');
      failures++;
    }
  } catch (err) {
    console.error('❌ Login error:', err.message);
    failures++;
  }

  // Worker signin check
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/signin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      identifier: 'worker@hustle.local',
      password: 'password123'
    });

    if (res.status === 200 && res.data.token && res.data.user.role === 'worker') {
      console.log('✅ Demo worker partner login OK (role: worker)');
    } else {
      console.error('❌ Demo worker login failed');
      failures++;
    }
  } catch (err) {
    console.error('❌ Worker login error:', err.message);
    failures++;
  }

  process.exit(failures === 0 ? 0 : 1);
}

runTests();
