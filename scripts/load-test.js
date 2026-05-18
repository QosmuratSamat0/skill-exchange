import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

const SETUP_USERS = Number(__ENV.SETUP_USERS || 120);
const SETUP_BATCH = Number(__ENV.SETUP_BATCH || 20);

export const options = {
  stages: [
    { duration: '1m', target: 50 }, // ramp up to 50 users
    { duration: '3m', target: 50 }, // stay at 50 users
    { duration: '1m', target: 0 },  // ramp down
  ],
  setupTimeout: '10m',
};

const BASE_URL = 'http://127.0.0.1:8080/api/v1';

export function setup() {
  const password = 'Password123!';
  const users = [];
  const seed = randomString(8);
  const credentials = Array.from({ length: SETUP_USERS }, (_, index) => ({
    email: `user_${seed}_${index}_${randomString(6)}@example.com`,
    password,
  }));

  for (let start = 0; start < credentials.length; start += SETUP_BATCH) {
    const batch = credentials.slice(start, start + SETUP_BATCH);

    const registerResponses = http.batch(
      batch.map((entry) => ({
        method: 'POST',
        url: `${BASE_URL}/users/register`,
        body: JSON.stringify({ email: entry.email, password: entry.password }),
        params: { headers: { 'Content-Type': 'application/json' } },
      }))
    );

    const loginRequests = [];
    const registeredEntries = [];

    registerResponses.forEach((res, index) => {
      if (res.status !== 201) {
        console.log(`Setup registration failed: ${res.status} body: ${res.body}`);
        return;
      }

      const entry = batch[index];
      registeredEntries.push(entry);
      loginRequests.push({
        method: 'POST',
        url: `${BASE_URL}/users/login`,
        body: JSON.stringify({ email: entry.email, password: entry.password }),
        params: { headers: { 'Content-Type': 'application/json' } },
      });
    });

    if (loginRequests.length === 0) {
      continue;
    }

    const loginResponses = http.batch(loginRequests);
    loginResponses.forEach((res, index) => {
      if (res.status !== 200) {
        console.log(`Setup login failed: ${res.status} body: ${res.body}`);
        return;
      }

      const token = res.json('access_token');
      if (!token) {
        console.log(`Setup missing access_token: ${res.status} body: ${res.body}`);
        return;
      }

      users.push({ email: registeredEntries[index].email, token });
    });

    console.log(`Setup progress: ${users.length}/${SETUP_USERS} users ready`);
  }

  return { users };
}

export default function (data) {
  const users = data.users || [];
  if (users.length === 0) {
    console.log('No users created in setup()');
    sleep(1);
    return;
  }

  const user = users[Math.floor(Math.random() * users.length)];
  const authToken = user.token;

  const mode = Math.random() < 0.8 ? 'text' : 'voice';
  const myGender = Math.random() < 0.5 ? 'male' : 'female';

  // 1) Get Profile
  let res = http.get(`${BASE_URL}/users/me`, {
    headers: { 'Authorization': `Bearer ${authToken}` },
  });
  if (res.status !== 200) {
    console.log(`Get profile failed: ${res.status} ${res.body}`);
  }
  check(res, { 'got profile': (r) => r.status === 200 });

  // 2) Start Matchmaking
  res = http.post(`${BASE_URL}/match/search`, JSON.stringify({
    filter: {
      mode,
      my_gender: myGender,
      gender: 'any',
    },
  }), {
    headers: { 
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json' 
    },
  });
  if (res.status !== 202) {
    console.log(`Match search failed: ${res.status} body: ${res.body}`);
  }
  check(res, { 'match search started': (r) => r.status === 202 });

  sleep(0.5);
}
