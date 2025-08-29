# LAN9662 VelocityDRIVE Board Configuration Commands

## 📋 목차
1. [기본 연결 및 확인](#기본-연결-및-확인)
2. [CBS 설정 명령어](#cbs-설정-명령어)
3. [TAS 설정 명령어](#tas-설정-명령어)
4. [CBS+TAS 통합 설정](#cbstas-통합-설정)
5. [검증 및 모니터링](#검증-및-모니터링)

---

## 🔌 기본 연결 및 확인

### 시리얼 연결
```bash
# 포트 확인
ls -la /dev/ttyACM*

# minicom 연결
minicom -D /dev/ttyACM0 -b 115200

# screen 연결
screen /dev/ttyACM0 115200
```

### 초기 상태 확인
```bash
# 버전 확인
dr version

# 인터페이스 상태
dr mup1cc coap get /ietf-interfaces/interfaces

# 브리지 설정 확인
dr mup1cc coap get /ieee802-dot1q-bridge/bridges

# PTP 상태 확인
dr mup1cc coap get /ieee1588-ptp/instances
```

---

## 📊 CBS 설정 명령어

### Priority Mapping 설정 (PCP → Priority → TC)

#### Step 1: PCP to Priority 매핑
```bash
# PCP 0-3 → Priority 6
dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/pcp=0/priority 6
dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/pcp=1/priority 6
dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/pcp=2/priority 6
dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/pcp=3/priority 6

# PCP 4-7 → Priority 2
dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/pcp=4/priority 2
dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/pcp=5/priority 2
dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/pcp=6/priority 2
dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/pcp=7/priority 2
```

#### Step 2: Priority to Traffic Class 매핑
```bash
# Priority 2 → TC2
dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/priority=2/traffic-class 2

# Priority 6 → TC6
dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/priority=6/traffic-class 6
```

### CBS Idle-Slope 설정

#### TC2 설정 (1.5 Mbps)
```bash
# Idle slope (credit 증가율)
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/idle-slope 1500

# Send slope (credit 감소율)
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/send-slope -1500

# Hi-credit (최대 credit)
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/hi-credit 3000

# Lo-credit (최소 credit)
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/lo-credit -3000

# CBS 활성화
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/enabled true
```

#### TC6 설정 (3.5 Mbps)
```bash
# Idle slope
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs/idle-slope 3500

# Send slope
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs/send-slope -3500

# Hi-credit
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs/hi-credit 7000

# Lo-credit
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs/lo-credit -7000

# CBS 활성화
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs/enabled true
```

### CBS 설정 확인
```bash
# TC2 CBS 상태 확인
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs

# TC6 CBS 상태 확인
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs

# 전체 스케줄러 상태
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler
```

---

## ⏰ TAS 설정 명령어

### Gate Control List 설정 (200ms 사이클, 8개 TC)

#### Step 1: 기본 시간 설정
```bash
# 현재 시간 기준 2초 후 시작 (나노초 단위)
# Linux에서: echo $(($(date +%s)*1000000000 + 2000000000))
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-base-time 1703001234000000000

# 사이클 시간 (200ms = 200,000,000 ns)
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-cycle-time 200000000

# GCL 엔트리 개수
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list-length 8
```

#### Step 2: Gate Control List 엔트리 설정

```bash
# TC0: 0-50ms (Gate 0x01)
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/0/time-interval 50000000
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/0/gate-states 0x01

# TC1: 50-80ms (Gate 0x02)
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/1/time-interval 30000000
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/1/gate-states 0x02

# TC2: 80-100ms (Gate 0x04)
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/2/time-interval 20000000
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/2/gate-states 0x04

# TC3: 100-120ms (Gate 0x08)
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/3/time-interval 20000000
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/3/gate-states 0x08

# TC4: 120-140ms (Gate 0x10)
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/4/time-interval 20000000
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/4/gate-states 0x10

# TC5: 140-160ms (Gate 0x20)
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/5/time-interval 20000000
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/5/gate-states 0x20

# TC6: 160-180ms (Gate 0x40)
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/6/time-interval 20000000
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/6/gate-states 0x40

# TC7: 180-200ms (Gate 0x80)
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/7/time-interval 20000000
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/7/gate-states 0x80
```

#### Step 3: TAS 활성화
```bash
# Gate 활성화
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/gate-enabled true

# Config change 트리거
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/config-change true
```

### TAS 상태 확인
```bash
# 현재 적용된 GCL 확인
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/oper-control-list

# Gate 상태 확인
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/gate-enabled

# 사이클 시간 확인
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/oper-cycle-time

# 현재 시간 확인
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/current-time
```

---

## 🔄 CBS+TAS 통합 설정

### 전체 설정 스크립트
```bash
#!/bin/bash
# cbs_tas_setup.sh

echo "🚀 CBS + TAS 통합 설정 시작"

# 1. Priority Mapping
echo "Step 1: Priority Mapping..."
for pcp in 0 1 2 3; do
    dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/pcp=$pcp/priority 6
done

for pcp in 4 5 6 7; do
    dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/pcp=$pcp/priority 2
done

dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/priority=2/traffic-class 2
dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/priority=6/traffic-class 6

# 2. CBS 설정
echo "Step 2: CBS Configuration..."
# TC2
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/idle-slope 1500
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/send-slope -1500
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/enabled true

# TC6
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs/idle-slope 3500
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs/send-slope -3500
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs/enabled true

# 3. TAS 설정
echo "Step 3: TAS Configuration..."
BASE_TIME=$(($(date +%s)*1000000000 + 2000000000))
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-base-time $BASE_TIME
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-cycle-time 200000000

# GCL 설정
for i in {0..7}; do
    case $i in
        0) INTERVAL=50000000; GATE=0x01 ;;
        1) INTERVAL=30000000; GATE=0x02 ;;
        *) INTERVAL=20000000; GATE=$((1 << i)) ;;
    esac
    
    dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/$i/time-interval $INTERVAL
    dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/$i/gate-states $GATE
done

# 4. 활성화
echo "Step 4: Activation..."
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/gate-enabled true
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/config-change true

echo "✅ 설정 완료!"
```

---

## 🔍 검증 및 모니터링

### 통계 확인
```bash
# 포트별 통계
dr mup1cc coap get /ietf-interfaces/interface=eth0/statistics

# TC별 통계
dr mup1cc coap get /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table

# CBS credit 상태
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/credit
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs/credit
```

### Gate 동작 모니터링
```bash
# 현재 게이트 상태
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/current-gate-states

# Gate control 이벤트
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/tick-granularity

# 설정 변경 대기 중인지 확인
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/config-pending
```

### 오류 카운터
```bash
# Frame 오류
dr mup1cc coap get /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/filtering-database/statistics

# Gate violations
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/transmission-overrun
```

---

## 📝 문제 해결

### CBS가 동작하지 않을 때
```bash
# CBS 상태 확인
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs

# 포트 속도 확인 (CBS 계산에 필요)
dr mup1cc coap get /ietf-interfaces/interface=eth0/speed

# Credit 리셋
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/credit 0
```

### TAS Gate가 열리지 않을 때
```bash
# PTP 동기화 확인
dr mup1cc coap get /ieee1588-ptp/instances/instance=0/current-ds/offset-from-master

# 시스템 시간 확인
dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/current-time

# GCL 재설정
dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/config-change true
```

### 초기화
```bash
# 공장 초기화
dr factory-reset

# 재부팅
dr reboot

# 설정 저장
dr save
```

---

## 🔗 참고 링크

- [IEEE 802.1Q-2018 Standard](https://standards.ieee.org/standard/802_1Q-2018.html)
- [YANG Models](https://github.com/YangModels/yang)
- [Microchip Documentation](https://www.microchip.com/en-us/products/ethernet-solutions)

---

*이 문서는 실제 LAN9662 보드 설정을 위한 명령어 참조 가이드입니다.*