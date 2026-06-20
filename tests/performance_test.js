import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  scenarios: {
    // Σενάριο 1: Φυσιολογική κίνηση (Load Test)
    normal_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 15 }, // Ανεβαίνει στους 15 χρήστες
        { duration: '20s', target: 15 }, // Μένει σταθερό στους 15
        { duration: '10s', target: 0 },  // Πέφτει στο 0
      ],
      gracefulRampDown: '5s',
    },
    // Σενάριο 2: Ακραία πίεση (Stress Test) - Αυτό που εκτελέσαμε!
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 30 }, // Απότομο ramp-up στους 30
        { duration: '20s', target: 50 }, // Πίεση στα άκρα στους 50 χρήστες
        { duration: '10s', target: 0 },  // Ramp-down
      ],
      gracefulRampDown: '5s',
      startTime: '45s', // Ξεκινάει αφού τελειώσει το πρώτο
    },
  },
};

export default function () {
  const res = http.get('http://localhost/');

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time is < 500ms': (r) => r.timings.duration < 500,
    'response time is < 1000ms': (r) => r.timings.duration < 1000,
  });

  sleep(1);
}
