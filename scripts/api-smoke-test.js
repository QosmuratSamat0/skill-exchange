import http from 'k6/http';
import { check } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8080';
const API_BASE = `${BASE_URL}/api/v1`;
const INTERNAL_TOKEN = __ENV.INTERNAL_TOKEN || '';

export const options = {
  vus: 1,
  iterations: 1,
};

function jsonHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return { headers };
}

function mustParseJSON(res, label) {
  try {
    return res.json();
  } catch (error) {
    console.log(`${label} invalid json: ${res.body}`);
    return null;
  }
}

function randomUUID() {
  const hex = '0123456789abcdef';
  const segment = (length) => Array.from({ length }, () => hex[Math.floor(Math.random() * hex.length)]).join('');
  return `${segment(8)}-${segment(4)}-${segment(4)}-${segment(4)}-${segment(12)}`;
}

function registerAndLogin(email, password) {
  const registerRes = http.post(
    `${API_BASE}/users/register`,
    JSON.stringify({ email, password }),
    jsonHeaders()
  );
  check(registerRes, {
    'register status 201': (r) => r.status === 201,
  });

  const loginRes = http.post(
    `${API_BASE}/users/login`,
    JSON.stringify({ email, password }),
    jsonHeaders()
  );
  check(loginRes, {
    'login status 200': (r) => r.status === 200,
  });

  const loginBody = mustParseJSON(loginRes, 'login');
  return {
    token: loginBody?.access_token || '',
  };
}

export function setup() {
  const password = 'Password123!';
  const seed = randomString(8);
  const primary = registerAndLogin(`smoke_${seed}_a@example.com`, password);
  const secondary = registerAndLogin(`smoke_${seed}_b@example.com`, password);

  return {
    primaryToken: primary.token,
    secondaryToken: secondary.token,
  };
}

export default function (data) {
  const primaryToken = data.primaryToken;
  const secondaryToken = data.secondaryToken;

  const healthRes = http.get(`${API_BASE}/health`);
  check(healthRes, {
    'gateway health 200': (r) => r.status === 200,
  });

  const metricsRes = http.get(`${BASE_URL}/metrics`);
  check(metricsRes, {
    'gateway metrics 200': (r) => r.status === 200,
    'gateway metrics body': (r) => r.body.includes('go_gc_duration_seconds'),
  });

  const docsRes = http.get(`${API_BASE}/docs/swagger.yaml`);
  check(docsRes, {
    'swagger 200': (r) => r.status === 200,
    'swagger body': (r) => r.body.includes('/match/search') || r.body.includes('/health:'),
  });

  const meRes = http.get(`${API_BASE}/users/me`, jsonHeaders(primaryToken));
  check(meRes, {
    'get me 200': (r) => r.status === 200,
  });
  const me = mustParseJSON(meRes, 'get me');
  const userId = me?.id || me?.Id || '';

  const updateRes = http.put(
    `${API_BASE}/users/me`,
    JSON.stringify({ gender: 'male', interests: ['music', 'books'] }),
    jsonHeaders(primaryToken)
  );
  check(updateRes, {
    'update me 200': (r) => r.status === 200,
  });

  const byIdRes = http.get(`${API_BASE}/users/${userId}`, jsonHeaders(primaryToken));
  check(byIdRes, {
    'get user by id 200': (r) => r.status === 200,
  });

  const bffRes = http.get(`${API_BASE}/bff/me`, jsonHeaders(primaryToken));
  check(bffRes, {
    'bff me 200': (r) => r.status === 200,
  });

  const searchRes = http.post(
    `${API_BASE}/match/search`,
    JSON.stringify({
      filter: {
        mode: 'text',
        my_gender: 'male',
        gender: 'any',
      },
    }),
    jsonHeaders(primaryToken)
  );
  check(searchRes, {
    'match search 202': (r) => r.status === 202,
  });

  const statusRes = http.get(`${API_BASE}/match/status`, jsonHeaders(primaryToken));
  check(statusRes, {
    'match status 200': (r) => r.status === 200,
  });

  const nextRes = http.post(
    `${API_BASE}/match/next`,
    JSON.stringify({}),
    jsonHeaders(primaryToken)
  );
  check(nextRes, {
    'match next 202': (r) => r.status === 202,
  });

  const cancelRes = http.del(`${API_BASE}/match/search`, null, jsonHeaders(primaryToken));
  check(cancelRes, {
    'match cancel 200': (r) => r.status === 200,
  });

  const secondMeRes = http.get(`${API_BASE}/users/me`, jsonHeaders(secondaryToken));
  const secondMe = mustParseJSON(secondMeRes, 'get secondary me');
  const reportedUserId = secondMe?.id || secondMe?.Id || '';

  const reportRes = http.post(
    `${API_BASE}/report/report`,
    JSON.stringify({
      room_id: randomUUID(),
      reported_user_id: reportedUserId,
      reason: 'smoke-test',
    }),
    jsonHeaders(primaryToken)
  );
  check(reportRes, {
    'create report 201': (r) => r.status === 201,
  });
  const reportBody = mustParseJSON(reportRes, 'create report');
  const reportId = reportBody?.report?.id || '';

  const getReportRes = http.get(`${API_BASE}/report/reports/${reportId}`, jsonHeaders(primaryToken));
  check(getReportRes, {
    'get report 200': (r) => r.status === 200,
  });

  if (INTERNAL_TOKEN) {
    const adminReportsRes = http.get(`${API_BASE}/report/admin/reports`, {
      headers: {
        Authorization: `Bearer ${primaryToken}`,
        'X-Internal-Token': INTERNAL_TOKEN,
      },
    });
    check(adminReportsRes, {
      'admin reports 200': (r) => r.status === 200,
    });
  } else {
    console.log('Skipping /api/v1/report/admin/reports: INTERNAL_TOKEN not provided');
  }
}
