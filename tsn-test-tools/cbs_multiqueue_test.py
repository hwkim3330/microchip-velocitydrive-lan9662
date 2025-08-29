#!/usr/bin/env python3
"""
LAN9662 CBS Multi-Queue Test with Priority Mapping
Decoding Map Priority 중복 설정 후 PCP 전송 테스트
"""

import os
import sys
import time
import subprocess
import json
import yaml
import numpy as np
import pandas as pd
from datetime import datetime
from pathlib import Path
import threading
import queue
import socket
import struct
from scapy.all import *

class CBSMultiQueueTest:
    def __init__(self, port1_if='enp11s0', port2_if='enp15s0', serial_port='/dev/ttyACM0'):
        self.port1_if = port1_if  # PC1 연결 (ingress)
        self.port2_if = port2_if  # PC2 연결 (egress)
        self.serial_port = serial_port
        self.vlan_id = 100
        self.results_dir = Path(f"cbs_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        self.results_dir.mkdir(exist_ok=True)
        
        # mvdct 경로
        self.mvdct_path = "/home/kim/Downloads/Microchip_VelocityDRIVE_CT-CLI-linux-2025.07.12/mvdct"
        self.dr_path = "/home/kim/velocitydrivesp-support/dr"
        
        # 테스트 결과 저장
        self.test_results = {
            'cbs': {},
            'tas': {},
            'latency': [],
            'throughput': []
        }
        
    def execute_cmd(self, cmd):
        """Execute shell command"""
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
            return result.stdout
        except Exception as e:
            print(f"Command error: {e}")
            return None
    
    def configure_board_common(self):
        """보드 공통 설정 [Port 1, 2]"""
        print("\n[1/5] 보드 공통 설정 중...")
        
        config = """
# 기본 VLAN 1 제거
- ? "/ieee802-dot1q-bridge:bridges/bridge[name='b0']/component[name='c0']/filtering-database/vlan-registration-entry[database-id='0'][vids='1']"
  :

# 포트 1, 2를 C-TAG aware 포트로 지정
- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/port-type"
  : ieee802-dot1q-bridge:c-vlan-bridge-port
- ? "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/port-type"
  : ieee802-dot1q-bridge:c-vlan-bridge-port

# Tagged 프레임만 허용 + Ingress filtering 활성화
- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/acceptable-frame"
  : admit-only-VLAN-tagged-frames
- ? "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/acceptable-frame"
  : admit-only-VLAN-tagged-frames
- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/enable-ingress-filtering"
  : true
- ? "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/enable-ingress-filtering"
  : true

# VLAN 100: 포트1/포트2 둘 다 tagged 멤버
- ? "/ieee802-dot1q-bridge:bridges/bridge[name='b0']/component[name='c0']/filtering-database/vlan-registration-entry"
  : database-id: 0
    vids: '100'
    entry-type: static
    port-map:
      - port-ref: 1
        static-vlan-registration-entries:
          vlan-transmitted: tagged
      - port-ref: 2
        static-vlan-registration-entries:
          vlan-transmitted: tagged

# QoS (PCP 매핑 포트1 -> 포트2)
# PCP Decoding (ingress/포트1): 8P0D로 매핑 활성화
- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/pcp-decoding-table/pcp-decoding-map"
  : pcp: 8P0D
# PCP Encoding (egress/포트2): 8P0D로 매핑 활성화
- ? "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/pcp-encoding-table/pcp-encoding-map"
  : pcp: 8P0D
"""
        
        config_file = self.results_dir / "cbs_vlan_pcp_board.yaml"
        config_file.write_text(config)
        
        # mvdct 또는 dr 사용
        if Path(self.dr_path).exists():
            cmd = f"sudo {self.dr_path} mup1cc -d {self.serial_port} -m ipatch -i {config_file}"
        else:
            cmd = f"sudo {self.mvdct_path} device {self.serial_port} patch {config_file}"
        
        result = self.execute_cmd(cmd)
        print("✓ 보드 공통 설정 완료")
        return result
    
    def configure_priority_mapping(self):
        """Priority 중복 매핑 설정 (PCP 0-3 → Priority 6, PCP 4-7 → Priority 2)"""
        print("\n[2/5] Priority 중복 매핑 설정 중...")
        
        config = """
- "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/pcp-decoding-table/pcp-decoding-map[pcp='8P0D']/priority-map":
  - priority-code-point: 0
    priority: 6
    drop-eligible: false
  - priority-code-point: 1
    priority: 6
    drop-eligible: false
  - priority-code-point: 2
    priority: 6
    drop-eligible: false
  - priority-code-point: 3
    priority: 6
    drop-eligible: false
  - priority-code-point: 4
    priority: 2
    drop-eligible: false
  - priority-code-point: 5
    priority: 2
    drop-eligible: false
  - priority-code-point: 6
    priority: 2
    drop-eligible: false
  - priority-code-point: 7
    priority: 2
    drop-eligible: false

- "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/pcp-encoding-table/pcp-encoding-map[pcp='8P0D']/priority-map":
  - priority: 0
    dei: false
    priority-code-point: 0
  - priority: 1
    dei: false
    priority-code-point: 1
  - priority: 2
    dei: false
    priority-code-point: 2
  - priority: 3
    dei: false
    priority-code-point: 3
  - priority: 4
    dei: false
    priority-code-point: 4
  - priority: 5
    dei: false
    priority-code-point: 5
  - priority: 6
    dei: false
    priority-code-point: 6
  - priority: 7
    dei: false
    priority-code-point: 7
"""
        
        config_file = self.results_dir / "priority_mapping.yaml"
        config_file.write_text(config)
        
        if Path(self.dr_path).exists():
            cmd = f"sudo {self.dr_path} mup1cc -d {self.serial_port} -m ipatch -i {config_file}"
        else:
            cmd = f"sudo {self.mvdct_path} device {self.serial_port} patch {config_file}"
        
        result = self.execute_cmd(cmd)
        print("✓ Priority 매핑 설정 완료")
        print("  - PCP 0-3 → Priority 6 (TC6)")
        print("  - PCP 4-7 → Priority 2 (TC2)")
        return result
    
    def configure_cbs_idle_slope(self):
        """CBS idle-slope 설정"""
        print("\n[3/5] CBS idle-slope 설정 중...")
        
        config = """
- "/ietf-interfaces:interfaces/interface[name='2']/mchp-velocitysp-port:eth-qos/config/traffic-class-shapers":
  - traffic-class: 0
    credit-based:
      idle-slope: 500
  - traffic-class: 1
    credit-based:
      idle-slope: 1000
  - traffic-class: 2
    credit-based:
      idle-slope: 1500
  - traffic-class: 3
    credit-based:
      idle-slope: 2000
  - traffic-class: 4
    credit-based:
      idle-slope: 2500
  - traffic-class: 5
    credit-based:
      idle-slope: 3000
  - traffic-class: 6
    credit-based:
      idle-slope: 3500
  - traffic-class: 7
    credit-based:
      idle-slope: 4000
"""
        
        config_file = self.results_dir / "cbs_idle_slope.yaml"
        config_file.write_text(config)
        
        if Path(self.dr_path).exists():
            cmd = f"sudo {self.dr_path} mup1cc -d {self.serial_port} -m ipatch -i {config_file}"
        else:
            cmd = f"sudo {self.mvdct_path} device {self.serial_port} patch {config_file}"
        
        result = self.execute_cmd(cmd)
        print("✓ CBS idle-slope 설정 완료")
        print("  - TC2: 1.5 Mbps")
        print("  - TC6: 3.5 Mbps")
        return result
    
    def setup_pc_sender(self):
        """PC1 sender 설정"""
        print("\n[4/5] PC1 Sender 설정 중...")
        
        # VLAN 인터페이스 생성
        commands = [
            f"sudo ip link del vlan{self.vlan_id} 2>/dev/null || true",
            f"sudo ip link add link {self.port1_if} name vlan{self.vlan_id} type vlan id {self.vlan_id}",
            f"sudo ip addr add 10.0.{self.vlan_id}.1/24 dev vlan{self.vlan_id}",
            f"sudo ip link set vlan{self.vlan_id} up",
            # egress QoS map 설정 (skb priority → PCP)
            f"sudo ip link set dev vlan{self.vlan_id} type vlan egress-qos-map 0:0 1:1 2:2 3:3 4:4 5:5 6:6 7:7"
        ]
        
        for cmd in commands:
            self.execute_cmd(cmd)
        
        print("✓ PC1 Sender 설정 완료")
    
    def setup_pc_receiver(self):
        """PC2 receiver 설정"""
        print("\n[5/5] PC2 Receiver 설정 중...")
        
        # VLAN 인터페이스 생성
        commands = [
            f"sudo ip link del vlan{self.vlan_id} 2>/dev/null || true",
            f"sudo ip link add link {self.port2_if} name vlan{self.vlan_id} type vlan id {self.vlan_id}",
            f"sudo ip addr add 10.0.{self.vlan_id}.2/24 dev vlan{self.vlan_id}",
            f"sudo ip link set vlan{self.vlan_id} up"
        ]
        
        for cmd in commands:
            self.execute_cmd(cmd)
        
        print("✓ PC2 Receiver 설정 완료")
    
    def send_traffic_with_pcp(self, pcp, port, rate_mbps, duration=10):
        """특정 PCP 값으로 트래픽 전송"""
        src_ip = f"10.0.{self.vlan_id}.1"
        dst_ip = f"10.0.{self.vlan_id}.2"
        
        # tc filter로 skb priority 설정
        vlan_if = f"vlan{self.vlan_id}"
        
        # clsact qdisc 추가
        self.execute_cmd(f"sudo tc qdisc replace dev {vlan_if} clsact")
        
        # 포트별 skb priority 설정
        self.execute_cmd(f"""
            sudo tc filter add dev {vlan_if} egress protocol ip prio {10+pcp} u32 \
                match ip dport {port} 0xffff \
                action skbedit priority {pcp}
        """)
        
        # iperf3로 트래픽 생성
        cmd = f"""
            iperf3 -u -c {dst_ip} -B {src_ip} -p {port} \
                -b {rate_mbps}M -t {duration} -l 1200 -i 1
        """
        
        result = self.execute_cmd(cmd)
        return result
    
    def run_cbs_test(self):
        """CBS 테스트 실행"""
        print("\n" + "="*60)
        print(" CBS Multi-Queue Test 시작")
        print("="*60)
        
        # 설정 적용
        self.configure_board_common()
        self.configure_priority_mapping()
        self.configure_cbs_idle_slope()
        self.setup_pc_sender()
        self.setup_pc_receiver()
        
        # iperf3 서버 시작 (PC2)
        print("\niperf3 서버 시작 중...")
        for port in range(5000, 5008):
            cmd = f"iperf3 -s -p {port} -D"
            self.execute_cmd(cmd)
        
        time.sleep(2)
        
        # Wireshark 캡처 시작
        print("\nWireshark 캡처 시작...")
        capture_file = self.results_dir / "cbs_test.pcap"
        capture_cmd = f"sudo tcpdump -i {self.port2_if} -w {capture_file} vlan {self.vlan_id} &"
        self.execute_cmd(capture_cmd)
        
        time.sleep(2)
        
        # 트래픽 전송 (8개 포트, PCP 0-7)
        print("\n트래픽 전송 시작...")
        print("Port 5000-5003: PCP 0-3 → Priority 6 (TC6, 3.5 Mbps)")
        print("Port 5004-5007: PCP 4-7 → Priority 2 (TC2, 1.5 Mbps)")
        
        threads = []
        for i in range(8):
            port = 5000 + i
            pcp = i
            rate = 5 + i * 0.1  # 기본 5Mbps + 증가분
            
            print(f"  Port {port} (PCP {pcp}): {rate} Mbps")
            
            t = threading.Thread(target=self.send_traffic_with_pcp, 
                                args=(pcp, port, rate, 10))
            t.start()
            threads.append(t)
        
        # 모든 스레드 대기
        for t in threads:
            t.join()
        
        print("\n트래픽 전송 완료")
        
        # 캡처 중지
        time.sleep(2)
        self.execute_cmd("sudo pkill tcpdump")
        
        # iperf3 서버 중지
        self.execute_cmd("sudo pkill iperf3")
        
        print(f"\n캡처 파일: {capture_file}")
        
        return capture_file
    
    def analyze_results(self, pcap_file):
        """결과 분석"""
        print("\n" + "="*60)
        print(" 결과 분석")
        print("="*60)
        
        # tshark로 VLAN priority 분석
        cmd = f"tshark -r {pcap_file} -T fields -e frame.time_relative -e vlan.priority -e frame.len 2>/dev/null"
        output = self.execute_cmd(cmd)
        
        if output:
            # 데이터 파싱
            data = []
            for line in output.strip().split('\n'):
                if line:
                    parts = line.split('\t')
                    if len(parts) >= 3:
                        try:
                            time = float(parts[0])
                            priority = int(parts[1])
                            size = int(parts[2])
                            data.append({'time': time, 'priority': priority, 'size': size})
                        except:
                            continue
            
            df = pd.DataFrame(data)
            
            # Priority별 통계
            print("\nVLAN Priority별 통계:")
            for prio in sorted(df['priority'].unique()):
                prio_data = df[df['priority'] == prio]
                count = len(prio_data)
                total_bytes = prio_data['size'].sum()
                duration = prio_data['time'].max() - prio_data['time'].min()
                
                if duration > 0:
                    throughput = (total_bytes * 8) / (duration * 1e6)  # Mbps
                    print(f"  Priority {prio}: {count} packets, {throughput:.2f} Mbps")
            
            # 예상 결과
            print("\n예상 결과:")
            print("  - Priority 6 (PCP 0-3): ~3.5 Mbps (TC6 idle-slope)")
            print("  - Priority 2 (PCP 4-7): ~1.5 Mbps (TC2 idle-slope)")
            
            # CSV 저장
            csv_file = self.results_dir / "cbs_analysis.csv"
            df.to_csv(csv_file, index=False)
            print(f"\n분석 결과 저장: {csv_file}")
    
    def verify_configuration(self):
        """설정 확인"""
        print("\n설정 확인 중...")
        
        fetch_config = """
# 포트 타입
- "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/port-type"
- "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/port-type"

# VLAN 100 멤버십
- "/ieee802-dot1q-bridge:bridges/bridge[name='b0']/component[name='c0']/filtering-database/vlan-registration-entry[database-id='0'][vids='100']"

# PCP 디코딩/인코딩 맵
- "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/pcp-decoding-table/pcp-decoding-map"
- "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/pcp-encoding-table/pcp-encoding-map"

# CBS 설정
- "/ietf-interfaces:interfaces/interface[name='2']/mchp-velocitysp-port:eth-qos/config/traffic-class-shapers"
"""
        
        fetch_file = self.results_dir / "fetch_config.yaml"
        fetch_file.write_text(fetch_config)
        
        if Path(self.dr_path).exists():
            cmd = f"sudo {self.dr_path} mup1cc -d {self.serial_port} -m get -i {fetch_file}"
        else:
            cmd = f"sudo {self.mvdct_path} device {self.serial_port} get -i {fetch_file}"
        
        result = self.execute_cmd(cmd)
        
        verify_file = self.results_dir / "verify_config.txt"
        verify_file.write_text(result if result else "Failed to fetch")
        print(f"설정 확인 결과: {verify_file}")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='LAN9662 CBS Multi-Queue Test')
    parser.add_argument('--port1', default='enp11s0', help='PC1 interface (ingress)')
    parser.add_argument('--port2', default='enp15s0', help='PC2 interface (egress)')
    parser.add_argument('--serial', default='/dev/ttyACM0', help='Serial port')
    parser.add_argument('--verify-only', action='store_true', help='Only verify configuration')
    
    args = parser.parse_args()
    
    # 테스트 실행
    tester = CBSMultiQueueTest(args.port1, args.port2, args.serial)
    
    if args.verify_only:
        tester.verify_configuration()
    else:
        # CBS 테스트 실행
        pcap_file = tester.run_cbs_test()
        
        # 결과 분석
        if pcap_file and pcap_file.exists():
            tester.analyze_results(pcap_file)
        
        # 설정 확인
        tester.verify_configuration()
        
        print("\n테스트 완료!")
        print(f"결과 디렉토리: {tester.results_dir}")

if __name__ == "__main__":
    main()