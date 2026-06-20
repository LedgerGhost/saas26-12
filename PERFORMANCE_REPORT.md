# Performance & Stress Test Report

## Methodology
We used **k6** to simulate traffic against our Nginx API Gateway (`http://localhost/`) to observe how the microservices architecture handles concurrent user load.

## Load Profile
- **Tool:** k6
- **Duration:** 40 seconds total
- **Load Pattern:** 1. Ramp-up to 20 virtual users (VUs) over 10s
  2. Increase to 50 VUs over 20s
  3. Ramp-down to 0 VUs over 10s

## Results Summary
The infrastructure demonstrated outstanding stability under the simulated load. The Nginx gateway efficiently distributed incoming traffic across the microservices with a 0% error rate.

### Key Metrics
- **Total HTTP Requests:** 1040
- **Failed Requests:** 0 (0.00%)
- **Success Rate (Checks):** 100.00% (3120/3120 passed)
- **Average Response Time:** 23.18 ms
- **Max Response Time:** 240.39 ms
- **95th Percentile (p95):** 66.39 ms

## Raw k6 Terminal Output



execution: local
   script: tests\load_test.js
   output: -

scenarios: (100.00%) 1 scenario, 50 max VUs, 1m10s max duration (incl. graceful stop):
         * default: Up to 50 looping VUs for 40s over 3 stages
✓ status is 200
✓ response time is < 500ms
✓ response time is < 1000ms

checks_total.......: 3120    76.363226/s
checks_succeeded...: 100.00% 3120 out of 3120
checks_failed......: 0.00%   0 out of 3120

http_req_duration..............: avg=23.18ms min=3.25ms med=12.24ms max=240.39ms p(90)=49.55ms p(95)=66.39ms
http_req_failed................: 0.00%  0 out of 1040
http_reqs......................: 1040   25.454409/s
iteration_duration.............: avg=1.02s  min=1s     med=1.01s  max=1.24s    p(90)=1.05s  p(95)=1.08s

iterations.....................: 1040   25.454409/s
vus............................: 2      min=2        max=49
vus_max........................: 50     min=50       max=50
data_received..................: 1.2 MB 30 kB/s
data_sent......................: 68 kB  1.7 kB/s


## Conclusion
The current microservices setup handles high concurrency smoothly. With an average response time of ~23ms and zero dropouts, the system is highly performant and production-ready for the current MVP scope.
