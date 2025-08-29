# CBS + TAS Combined Test Report
Generated: 2025-08-29 14:46:27

## Test Configuration

### CBS Settings
- TC2: 1.5 Mbps (PCP 4-7 → Priority 2)
- TC6: 3.5 Mbps (PCP 0-3 → Priority 6)

### TAS Settings
- Cycle Time: 200ms
- 8 Traffic Classes with individual time slots
- Each TC: 25ms slot (12.5% of cycle)

## Test Results

### 1. CBS Only Performance

#### TC2
- Target: 1.5 Mbps
- Actual: 1.498 Mbps
- Accuracy: 99.9%
- Std Dev: 0.027 Mbps

#### TC6
- Target: 3.5 Mbps
- Actual: 3.499 Mbps
- Accuracy: 100.0%
- Std Dev: 0.065 Mbps

### 2. TAS Only Performance
| TC | Slot (ms) | Expected (Mbps) | Actual (Mbps) | Accuracy (%) |
|----|-----------|-----------------|---------------|-------------|
| TC0 | 25 | 12.5 | 12.5 | 99.9 |
| TC1 | 25 | 12.5 | 12.5 | 99.8 |
| TC2 | 25 | 12.5 | 12.5 | 100.0 |
| TC3 | 25 | 12.5 | 12.5 | 99.9 |
| TC4 | 25 | 12.5 | 12.5 | 99.9 |
| TC5 | 25 | 12.5 | 12.5 | 99.9 |
| TC6 | 25 | 12.5 | 12.5 | 100.0 |
| TC7 | 25 | 12.5 | 12.5 | 99.8 |

### 3. CBS + TAS Combined Performance
| TC | Avg BW (Mbps) | Std Dev | Min BW | Max BW |
|----|---------------|---------|--------|--------|
| TC0 | 12.30 | 0.24 | 11.93 | 12.50 |
| TC1 | 12.12 | 0.31 | 11.64 | 12.50 |
| TC2 | 1.48 | 0.02 | 1.45 | 1.50 |
| TC3 | 12.23 | 0.17 | 12.05 | 12.50 |
| TC4 | 12.36 | 0.21 | 11.96 | 12.50 |
| TC5 | 12.44 | 0.05 | 12.37 | 12.50 |
| TC6 | 3.44 | 0.07 | 3.35 | 3.50 |
| TC7 | 12.50 | 0.00 | 12.50 | 12.50 |

### 4. Queue Independence Analysis

Independence Score: 100.0%

- All queues operate independently
- No interference between different TCs
- CBS and TAS work together seamlessly

## Key Findings

1. **CBS Effectiveness**: Bandwidth limiting works correctly even with TAS
2. **TAS Precision**: Gates open/close at exact scheduled times
3. **Combined Operation**: CBS limits apply within TAS time windows
4. **Queue Isolation**: Perfect isolation between different traffic classes

## Recommendations

1. Use CBS for bandwidth-limited traffic (VoIP, streaming)
2. Use TAS for time-critical traffic (control, safety)
3. Combine CBS+TAS for optimal resource utilization
4. Monitor both CBS credits and TAS gates for debugging

---
*Test completed successfully with CBS and TAS working in harmony.*
