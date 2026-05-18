import http from 'k6/http';
import { check, sleep } from 'k6';

// 5.3 Load Simulation
// This script simulates system load to test capacity limits. 
export const options = {
    stages: [
        { duration: '30s', target: 50 },  // Ramp up to 50 users
        { duration: '1m', target: 50 },   // Sustain 50 users for 1 minute
        { duration: '30s', target: 150 }, // Spike to 150 users (Stress Test)
        { duration: '30s', target: 0 },   // Ramp down to 0 users
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
        http_req_failed: ['rate<0.01'],   // Error rate should be less than 1%
    },
};

export default function () {
    // 1. Simulate Repeated API calls to backend services (via API Gateway)
    // Adjust the URL according to how you expose it or run it via localhost
    const BASE_URL = __ENV.API_URL || 'http://localhost:8080';

    // Call Health Check
    let resHealth = http.get(`${BASE_URL}/api/v1/health`);
    check(resHealth, {
        'health is status 200': (r) => r.status === 200,
    });

    // Example of calling a user endpoint
    // Assuming API gateway forwards /api/v1/users to User Service
    let resUsers = http.get(`${BASE_URL}/api/v1/users`);
    check(resUsers, {
        'users is status 200 or 401': (r) => r.status === 200 || r.status === 401, 
    });

    // Simulate think time 
    sleep(1);
}
