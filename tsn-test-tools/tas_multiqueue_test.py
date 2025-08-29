#!/usr/bin/env python3
"""
LAN9662 Multi-Queue TAS (Time-Aware Shaper) Test
8개 Traffic Class별 Gate Control List 제어 테스트
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
import asyncio
from scapy.all import *
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

class TASMultiQueueTest:
    def __init__(self, port1_if='enp11s0', port2_if='enp15s0', serial_port='/dev/ttyACM0'):
        self.port1_if = port1_if
        self.port2_if = port2_if
        self.serial_port = serial_port
        self.vlan_id = 10
        self.results_dir = Path(f"tas_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        self.results_dir.mkdir(exist_ok=True)
        
        # mvdct 경로
        self.mvdct_path = "/home/kim/Downloads/Microchip_VelocityDRIVE_CT-CLI-linux-2025.07.12/mvdct"
        self.dr_path = "/home/kim/velocitydrivesp-support/dr"
        
        # Gate Control List 설정
        self.gcl_config = {
            'cycle_time_ms': 200,  # 200ms cycle
            'slots': [
                {'tc': 0, 'duration_ms': 50, 'gate_state': 0x01},    # TC0: 50ms
                {'tc': 1, 'duration_ms': 30, 'gate_state': 0x02},    # TC1: 30ms
                {'tc': 2, 'duration_ms': 25, 'gate_state': 0x04},    # TC2: 25ms
                {'tc': 3, 'duration_ms': 25, 'gate_state': 0x08},    # TC3: 25ms
                {'tc': 4, 'duration_ms': 20, 'gate_state': 0x10},    # TC4: 20ms
                {'tc': 5, 'duration_ms': 20, 'gate_state': 0x20},    # TC5: 20ms
                {'tc': 6, 'duration_ms': 15, 'gate_state': 0x40},    # TC6: 15ms
                {'tc': 7, 'duration_ms': 15, 'gate_state': 0x80},    # TC7: 15ms
            ]
        }
        
        self.test_results = {
            'tas_schedule': {},
            'throughput': {},
            'packet_stats': {}
        }
    
    def execute_cmd(self, cmd):
        """Execute shell command"""
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
            return result.stdout
        except Exception as e:
            print(f"Command error: {e}")
            return None
    
    def configure_port_and_vlan(self):
        """포트 및 VLAN 설정"""
        print("\n[1/6] 포트 및 VLAN 설정 중...")
        
        config = f"""
# Set the default priority on ports
- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/default-priority"
  : 0
- ? "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/default-priority"
  : 0

# Set the VLAN TAG port type
- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/port-type"
  : ieee802-dot1q-bridge:c-vlan-bridge-port
- ? "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/port-type"
  : ieee802-dot1q-bridge:c-vlan-bridge-port

# Set the default VID
- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/pvid"
  : {self.vlan_id}
- ? "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/pvid"
  : {self.vlan_id}

# Add VLAN
- ? "/ieee802-dot1q-bridge:bridges/bridge[name='b0']/component[name='c0']/filtering-database/vlan-registration-entry"
  : database-id: 0
    vids: '{self.vlan_id}'
    entry-type: static
    port-map:
    - port-ref: 1
      static-vlan-registration-entries:
        vlan-transmitted: tagged
    - port-ref: 2
      static-vlan-registration-entries:
        vlan-transmitted: tagged
"""
        
        config_file = self.results_dir / "port_vlan_config.yaml"
        config_file.write_text(config)
        
        if Path(self.dr_path).exists():
            cmd = f"sudo {self.dr_path} mup1cc -d {self.serial_port} -m ipatch -i {config_file}"
        else:
            cmd = f"sudo {self.mvdct_path} device {self.serial_port} patch {config_file}"
        
        result = self.execute_cmd(cmd)
        print(f"✓ 포트 및 VLAN {self.vlan_id} 설정 완료")
        return result
    
    def configure_pcp_mapping(self):
        """PCP to TC 1:1 매핑 설정"""
        print("\n[2/6] PCP to TC 매핑 설정 중...")
        
        # Port 1 (ingress) decoding map
        decoding_map = """
# Create decoding map for Port 1
- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/pcp-decoding-table/pcp-decoding-map"
  : pcp: 8P0D

- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/pcp-decoding-table/pcp-decoding-map[pcp='8P0D']/priority-map"
  :"""
        
        # 1:1 매핑 (PCP → Priority/TC)
        for i in range(8):
            decoding_map += f"""
    - priority-code-point: {i}
      priority: {i}
      drop-eligible: false"""
        
        # Port 2 (egress) encoding map
        encoding_map = """

# Create encoding map for Port 2
- ? "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/pcp-encoding-table/pcp-encoding-map"
  : pcp: 8P0D

- ? "/ietf-interfaces:interfaces/interface[name='2']/ieee802-dot1q-bridge:bridge-port/pcp-encoding-table/pcp-encoding-map[pcp='8P0D']/priority-map"
  :"""
        
        # 1:1 매핑 (Priority → PCP)
        for i in range(8):
            encoding_map += f"""
    - priority: {i}
      dei: false
      priority-code-point: {i}"""
        
        config = decoding_map + encoding_map
        
        config_file = self.results_dir / "pcp_mapping.yaml"
        config_file.write_text(config)
        
        if Path(self.dr_path).exists():
            cmd = f"sudo {self.dr_path} mup1cc -d {self.serial_port} -m ipatch -i {config_file}"
        else:
            cmd = f"sudo {self.mvdct_path} device {self.serial_port} patch {config_file}"
        
        result = self.execute_cmd(cmd)
        print("✓ PCP to TC 1:1 매핑 설정 완료")
        return result
    
    def configure_tas_gcl(self):
        """TAS Gate Control List 설정"""
        print("\n[3/6] TAS Gate Control List 설정 중...")
        
        # Gate enable
        config = """
# Enable TAS on Port 1 (egress)
- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/gate-enabled"
  : true

# Gate Control List
- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/admin-control-list/gate-control-entry"
  :"""
        
        # GCL entries 생성
        for idx, slot in enumerate(self.gcl_config['slots'], 1):
            duration_ns = slot['duration_ms'] * 1000000  # ms to ns
            config += f"""
    - index: {idx}
      operation-name: ieee802-dot1q-sched:set-gate-states
      time-interval-value: {duration_ns}
      gate-states-value: {slot['gate_state']}"""
        
        # Queue max SDU (모두 0으로 설정 - 제한 없음)
        for tc in range(8):
            config += f"""

- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/queue-max-sdu-table[traffic-class='{tc}']/queue-max-sdu"
  : 0"""
        
        # Admin gate states (모든 TC 열림)
        config += """

# Admin gate states
- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/admin-gate-states"
  : 255

# Base time
- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/admin-base-time/seconds"
  : "10"

- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/admin-base-time/nanoseconds"
  : 0
"""
        
        # Cycle time
        cycle_time_ns = self.gcl_config['cycle_time_ms'] * 1000000
        config += f"""
# Cycle time ({self.gcl_config['cycle_time_ms']}ms)
- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/admin-cycle-time/numerator"
  : {cycle_time_ns}

- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/admin-cycle-time/denominator"
  : 1000000000

# Cycle time extension
- ? "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/admin-cycle-time-extension"
  : 10000000
"""
        
        config_file = self.results_dir / "tas_gcl_config.yaml"
        config_file.write_text(config)
        
        if Path(self.dr_path).exists():
            cmd = f"sudo {self.dr_path} mup1cc -d {self.serial_port} -m ipatch -i {config_file}"
        else:
            cmd = f"sudo {self.mvdct_path} device {self.serial_port} patch {config_file}"
        
        result = self.execute_cmd(cmd)
        
        print(f"✓ TAS GCL 설정 완료 (Cycle: {self.gcl_config['cycle_time_ms']}ms)")
        for slot in self.gcl_config['slots']:
            print(f"  - TC{slot['tc']}: {slot['duration_ms']}ms")
        
        return result
    
    def setup_network_interfaces(self):
        """네트워크 인터페이스 설정"""
        print("\n[4/6] 네트워크 인터페이스 설정 중...")
        
        # PC1 (sender) 설정
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
        
        print("✓ 네트워크 인터페이스 설정 완료")
    
    def generate_traffic_for_tc(self, tc, duration=30):
        """특정 TC에 대한 트래픽 생성"""
        src_ip = f"10.0.{self.vlan_id}.1"
        dst_ip = f"10.0.{self.vlan_id}.2"
        port = 5000 + tc
        
        # 각 TC별로 다른 패킷 크기와 속도
        packet_sizes = [64, 128, 256, 512, 1024, 1200, 1400, 1500]
        packet_size = packet_sizes[tc]
        rate_mbps = 10 + tc * 2  # TC별로 다른 속도
        
        print(f"  TC{tc}: Port {port}, {packet_size} bytes, {rate_mbps} Mbps")
        
        # VLAN 인터페이스에 tc filter 설정
        vlan_if = f"vlan{self.vlan_id}"
        
        # clsact qdisc 생성
        self.execute_cmd(f"sudo tc qdisc replace dev {vlan_if} clsact 2>/dev/null")
        
        # 포트별 skb priority 설정
        self.execute_cmd(f"""
            sudo tc filter add dev {vlan_if} egress protocol ip prio {10+tc} u32 \
                match ip dport {port} 0xffff \
                action skbedit priority {tc}
        """)
        
        # Scapy로 패킷 생성 및 전송
        def send_packets():
            packets_sent = 0
            start_time = time.time()
            
            while time.time() - start_time < duration:
                # VLAN 태그 포함 패킷 생성
                pkt = Ether()/Dot1Q(vlan=self.vlan_id, prio=tc)/IP(src=src_ip, dst=dst_ip)/UDP(dport=port)/Raw(b'X'*packet_size)
                
                # 패킷 전송
                sendp(pkt, iface=vlan_if, verbose=0)
                packets_sent += 1
                
                # 속도 조절
                time.sleep(0.001)  # 1ms 간격
            
            return packets_sent
        
        # iperf3 사용 (대안)
        cmd = f"""
            timeout {duration} iperf3 -u -c {dst_ip} -B {src_ip} -p {port} \
                -b {rate_mbps}M -l {packet_size} -i 1 2>/dev/null
        """
        
        result = self.execute_cmd(cmd)
        
        return {'tc': tc, 'port': port, 'packet_size': packet_size, 'rate': rate_mbps}
    
    def run_multiqueue_test(self, test_duration=30):
        """다중 큐 테스트 실행"""
        print("\n[5/6] 다중 큐 트래픽 전송 테스트 시작...")
        
        # iperf3 서버 시작 (모든 포트)
        print("iperf3 서버 시작 중...")
        for tc in range(8):
            port = 5000 + tc
            cmd = f"iperf3 -s -p {port} -D 2>/dev/null"
            self.execute_cmd(cmd)
        
        time.sleep(2)
        
        # Wireshark 캡처 시작
        capture_file = self.results_dir / "tas_multiqueue.pcap"
        print(f"패킷 캡처 시작: {capture_file}")
        capture_cmd = f"sudo tcpdump -i {self.port1_if} -w {capture_file} vlan {self.vlan_id} &"
        self.execute_cmd(capture_cmd)
        
        time.sleep(2)
        
        # 각 TC별로 동시에 트래픽 전송
        print(f"\n{test_duration}초 동안 8개 TC로 동시 트래픽 전송...")
        
        threads = []
        for tc in range(8):
            t = threading.Thread(target=self.generate_traffic_for_tc, args=(tc, test_duration))
            t.start()
            threads.append(t)
        
        # 모든 스레드 완료 대기
        for t in threads:
            t.join()
        
        print("\n트래픽 전송 완료")
        
        # 캡처 중지
        time.sleep(2)
        self.execute_cmd("sudo pkill tcpdump")
        self.execute_cmd("sudo pkill iperf3")
        
        return capture_file
    
    def analyze_tas_results(self, pcap_file):
        """TAS 결과 분석 및 시각화"""
        print("\n[6/6] 결과 분석 및 시각화...")
        
        # tshark로 패킷 분석
        cmd = f"""
            tshark -r {pcap_file} -T fields \
                -e frame.time_relative \
                -e vlan.priority \
                -e frame.len \
                -e udp.dstport 2>/dev/null
        """
        
        output = self.execute_cmd(cmd)
        
        if not output:
            print("패킷 분석 실패")
            return
        
        # 데이터 파싱
        data = []
        for line in output.strip().split('\n'):
            if line:
                parts = line.split('\t')
                if len(parts) >= 3:
                    try:
                        time = float(parts[0])
                        priority = int(parts[1]) if parts[1] else -1
                        size = int(parts[2])
                        port = int(parts[3]) if len(parts) > 3 and parts[3] else 0
                        tc = port - 5000 if port >= 5000 else priority
                        
                        data.append({
                            'time': time,
                            'tc': tc,
                            'priority': priority,
                            'size': size,
                            'port': port
                        })
                    except:
                        continue
        
        if not data:
            print("데이터 파싱 실패")
            return
        
        df = pd.DataFrame(data)
        
        # TC별 통계
        print("\n=== Traffic Class별 통계 ===")
        for tc in range(8):
            tc_data = df[df['tc'] == tc]
            if len(tc_data) > 0:
                count = len(tc_data)
                total_bytes = tc_data['size'].sum()
                duration = tc_data['time'].max() - tc_data['time'].min()
                
                if duration > 0:
                    throughput = (total_bytes * 8) / (duration * 1e6)  # Mbps
                    avg_size = tc_data['size'].mean()
                    
                    print(f"TC{tc}:")
                    print(f"  - Packets: {count}")
                    print(f"  - Throughput: {throughput:.2f} Mbps")
                    print(f"  - Avg packet size: {avg_size:.0f} bytes")
                    
                    self.test_results['throughput'][f'TC{tc}'] = throughput
                    self.test_results['packet_stats'][f'TC{tc}'] = {
                        'count': count,
                        'avg_size': avg_size
                    }
        
        # 시각화
        self.visualize_tas_results(df)
        
        # CSV 저장
        csv_file = self.results_dir / "tas_analysis.csv"
        df.to_csv(csv_file, index=False)
        print(f"\n분석 결과 저장: {csv_file}")
    
    def visualize_tas_results(self, df):
        """TAS 결과 시각화"""
        fig, axes = plt.subplots(3, 1, figsize=(14, 12))
        
        # 1. Gate Schedule 시각화
        ax1 = axes[0]
        
        # GCL 스케줄 그리기
        colors = plt.cm.Set3(np.linspace(0, 1, 8))
        time_offset = 0
        
        for slot in self.gcl_config['slots']:
            tc = slot['tc']
            duration = slot['duration_ms']
            
            rect = mpatches.Rectangle((time_offset, tc - 0.4), duration, 0.8,
                                     facecolor=colors[tc], edgecolor='black', linewidth=1)
            ax1.add_patch(rect)
            ax1.text(time_offset + duration/2, tc, f'{duration}ms',
                    ha='center', va='center', fontsize=8)
            
            time_offset += duration
        
        ax1.set_xlim(0, self.gcl_config['cycle_time_ms'])
        ax1.set_ylim(-0.5, 7.5)
        ax1.set_xlabel('Time (ms)')
        ax1.set_ylabel('Traffic Class')
        ax1.set_title('TAS Gate Control Schedule (200ms cycle)')
        ax1.set_yticks(range(8))
        ax1.set_yticklabels([f'TC{i}' for i in range(8)])
        ax1.grid(True, alpha=0.3)
        
        # 2. 시간별 패킷 전송 패턴
        ax2 = axes[1]
        
        # 시간 구간별로 그룹화 (10ms 단위)
        time_bins = np.arange(0, df['time'].max() + 0.01, 0.01)  # 10ms bins
        
        for tc in range(8):
            tc_data = df[df['tc'] == tc]
            if len(tc_data) > 0:
                hist, bin_edges = np.histogram(tc_data['time'], bins=time_bins)
                bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2
                ax2.plot(bin_centers, hist, label=f'TC{tc}', color=colors[tc], alpha=0.7)
        
        ax2.set_xlabel('Time (s)')
        ax2.set_ylabel('Packets per 10ms')
        ax2.set_title('Packet Transmission Pattern over Time')
        ax2.legend(ncol=4, loc='upper right')
        ax2.grid(True, alpha=0.3)
        
        # 3. TC별 처리량 막대 그래프
        ax3 = axes[2]
        
        tc_throughputs = []
        tc_labels = []
        
        for tc in range(8):
            if f'TC{tc}' in self.test_results['throughput']:
                tc_throughputs.append(self.test_results['throughput'][f'TC{tc}'])
                tc_labels.append(f'TC{tc}')
        
        if tc_throughputs:
            bars = ax3.bar(tc_labels, tc_throughputs, color=colors[:len(tc_labels)])
            
            # 값 표시
            for bar, val in zip(bars, tc_throughputs):
                height = bar.get_height()
                ax3.text(bar.get_x() + bar.get_width()/2., height,
                        f'{val:.1f}', ha='center', va='bottom')
        
        ax3.set_xlabel('Traffic Class')
        ax3.set_ylabel('Throughput (Mbps)')
        ax3.set_title('Throughput per Traffic Class')
        ax3.grid(True, alpha=0.3, axis='y')
        
        plt.tight_layout()
        
        # 그래프 저장
        plot_file = self.results_dir / "tas_multiqueue_analysis.png"
        plt.savefig(plot_file, dpi=300, bbox_inches='tight')
        print(f"\n시각화 그래프 저장: {plot_file}")
        
        plt.show()
    
    def verify_tas_configuration(self):
        """TAS 설정 확인"""
        print("\nTAS 설정 확인 중...")
        
        fetch_config = """
# TAS 활성화 상태
- "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/gate-enabled"

# Gate Control List
- "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/admin-control-list"

# Cycle time
- "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/ieee802-dot1q-sched-bridge:gate-parameter-table/admin-cycle-time"

# PCP mapping
- "/ietf-interfaces:interfaces/interface[name='1']/ieee802-dot1q-bridge:bridge-port/pcp-decoding-table/pcp-decoding-map"
"""
        
        fetch_file = self.results_dir / "fetch_tas_config.yaml"
        fetch_file.write_text(fetch_config)
        
        if Path(self.dr_path).exists():
            cmd = f"sudo {self.dr_path} mup1cc -d {self.serial_port} -m get -i {fetch_file}"
        else:
            cmd = f"sudo {self.mvdct_path} device {self.serial_port} get -i {fetch_file}"
        
        result = self.execute_cmd(cmd)
        
        verify_file = self.results_dir / "tas_config_verify.txt"
        if result:
            verify_file.write_text(result)
            print(f"TAS 설정 확인 저장: {verify_file}")
    
    def generate_report(self):
        """테스트 보고서 생성"""
        report = f"""
# TAS Multi-Queue Test Report
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Test Configuration
- VLAN ID: {self.vlan_id}
- Cycle Time: {self.gcl_config['cycle_time_ms']}ms
- Number of Traffic Classes: 8

## Gate Control Schedule
"""
        for slot in self.gcl_config['slots']:
            report += f"- TC{slot['tc']}: {slot['duration_ms']}ms (Gate: 0x{slot['gate_state']:02X})\n"
        
        report += "\n## Test Results\n\n### Throughput per TC\n"
        
        for tc, throughput in self.test_results['throughput'].items():
            report += f"- {tc}: {throughput:.2f} Mbps\n"
        
        report += "\n### Packet Statistics\n"
        
        for tc, stats in self.test_results['packet_stats'].items():
            report += f"- {tc}: {stats['count']} packets, avg size {stats['avg_size']:.0f} bytes\n"
        
        report_file = self.results_dir / "tas_test_report.md"
        report_file.write_text(report)
        print(f"\n테스트 보고서 생성: {report_file}")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='LAN9662 Multi-Queue TAS Test')
    parser.add_argument('--port1', default='enp11s0', help='Port 1 interface')
    parser.add_argument('--port2', default='enp15s0', help='Port 2 interface')
    parser.add_argument('--serial', default='/dev/ttyACM0', help='Serial port')
    parser.add_argument('--duration', type=int, default=30, help='Test duration (seconds)')
    parser.add_argument('--verify-only', action='store_true', help='Only verify configuration')
    
    args = parser.parse_args()
    
    # 테스트 실행
    tester = TASMultiQueueTest(args.port1, args.port2, args.serial)
    
    if args.verify_only:
        tester.verify_tas_configuration()
    else:
        print("\n" + "="*70)
        print(" LAN9662 Multi-Queue TAS Test")
        print("="*70)
        
        # 설정 적용
        tester.configure_port_and_vlan()
        tester.configure_pcp_mapping()
        tester.configure_tas_gcl()
        tester.setup_network_interfaces()
        
        # 테스트 실행
        pcap_file = tester.run_multiqueue_test(args.duration)
        
        # 결과 분석
        if pcap_file and pcap_file.exists():
            tester.analyze_tas_results(pcap_file)
        
        # 설정 확인
        tester.verify_tas_configuration()
        
        # 보고서 생성
        tester.generate_report()
        
        print("\n" + "="*70)
        print(" 테스트 완료!")
        print(f" 결과 디렉토리: {tester.results_dir}")
        print("="*70)

if __name__ == "__main__":
    main()