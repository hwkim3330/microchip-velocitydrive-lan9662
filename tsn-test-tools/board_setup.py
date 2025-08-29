#!/usr/bin/env python3
"""
LAN9662 VelocityDRIVE Board Setup and Configuration
실제 하드웨어 설정을 위한 통합 스크립트
"""

import serial
import time
import json
import argparse
from datetime import datetime
from pathlib import Path

class LAN9662BoardSetup:
    def __init__(self, port='/dev/ttyACM0', baudrate=115200):
        """보드 초기화"""
        self.port = port
        self.mvdct_path = "/home/kim/Downloads/Microchip_VelocityDRIVE_CT-CLI-linux-2025.07.12/mvdct"
        self.config_history = []
        
    def send_command(self, cmd, wait_time=0.1):
        """명령어 전송 및 응답 받기"""
        import subprocess
        
        # mvdct를 사용한 명령어 실행
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=5)
            response = result.stdout + result.stderr
        except Exception as e:
            print(f"⚠️ 명령 실행 실패: {e}")
            response = str(e)
            
        # 기록 저장
        self.config_history.append({
            'timestamp': datetime.now().isoformat(),
            'command': cmd,
            'response': response.strip()
        })
        
        print(f"📤 CMD: {cmd}")
        print(f"📥 RSP: {response.strip()[:100]}...")  # 처음 100자만 표시
        
        return response
    
    def check_board_status(self):
        """보드 상태 확인"""
        print("\n🔍 보드 상태 확인 중...")
        
        checks = {
            'version': f'{self.mvdct_path} device {self.port} get /ietf-system:system-state/platform',
            'interfaces': f'{self.mvdct_path} device {self.port} get /ietf-interfaces:interfaces',
            'bridge': f'{self.mvdct_path} device {self.port} get /ieee802-dot1q-bridge:bridges',
            'ptp': f'{self.mvdct_path} device {self.port} get /ieee1588-ptp:instances'
        }
        
        status = {}
        for name, cmd in checks.items():
            response = self.send_command(cmd)
            status[name] = 'OK' if response and 'error' not in response.lower() else 'FAIL'
            
        return status
    
    def setup_basic_network(self):
        """기본 네트워크 설정"""
        print("\n⚙️ 기본 네트워크 설정 중...")
        
        commands = [
            # 인터페이스 활성화
            f"{self.mvdct_path} device {self.port} set /ietf-interfaces:interfaces/interface[name='eth0']/enabled true",
            f"{self.mvdct_path} device {self.port} set /ietf-interfaces:interfaces/interface[name='eth1']/enabled true",
            
            # 브리지 설정
            f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-bridge:bridges/bridge[name='br0']/bridge-type provider-bridge",
            f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-bridge:bridges/bridge[name='br0']/component[name='br0']/bridge-port[port-number='0']/port-type customer-edge-port",
            f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-bridge:bridges/bridge[name='br0']/component[name='br0']/bridge-port[port-number='1']/port-type customer-edge-port",
            
            # VLAN 설정
            f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-bridge:bridges/bridge[name='br0']/component[name='br0']/filtering-database/vlan-registration-entry[vlan-id='100']/vids 100",
            f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-bridge:bridges/bridge[name='br0']/component[name='br0']/filtering-database/vlan-registration-entry[vlan-id='10']/vids 10",
        ]
        
        for cmd in commands:
            self.send_command(cmd, wait_time=0.2)
            
    def configure_cbs(self):
        """CBS (Credit-Based Shaper) 설정"""
        print("\n📊 CBS 설정 중...")
        print("시나리오: PCP 0-3 → Priority 6 (3.5Mbps), PCP 4-7 → Priority 2 (1.5Mbps)")
        
        # Priority 매핑 설정
        pcp_mapping = [
            (0, 6), (1, 6), (2, 6), (3, 6),  # PCP 0-3 → Priority 6
            (4, 2), (5, 2), (6, 2), (7, 2),  # PCP 4-7 → Priority 2
        ]
        
        for pcp, priority in pcp_mapping:
            cmd = f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-bridge:bridges/bridge[name='br0']/component[name='br0']/traffic-class-table/traffic-class-map[priority-code-point='{pcp}']/priority {priority}"
            self.send_command(cmd)
            
        # Priority to TC 매핑
        priority_to_tc = [
            (2, 2),  # Priority 2 → TC2
            (6, 6),  # Priority 6 → TC6
        ]
        
        for priority, tc in priority_to_tc:
            cmd = f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-bridge:bridges/bridge[name='br0']/component[name='br0']/traffic-class-table/traffic-class-map[priority='{priority}']/traffic-class {tc}"
            self.send_command(cmd)
            
        # CBS idle-slope 설정
        cbs_configs = [
            (2, 1500),  # TC2: 1.5 Mbps
            (6, 3500),  # TC6: 3.5 Mbps
        ]
        
        for tc, idle_slope in cbs_configs:
            commands = [
                f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler/traffic-class[index='{tc}']/credit-based-shaper/idle-slope {idle_slope}",
                f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler/traffic-class[index='{tc}']/credit-based-shaper/send-slope -{idle_slope}",
                f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler/traffic-class[index='{tc}']/credit-based-shaper/admin-idleslope-enabled true",
            ]
            
            for cmd in commands:
                self.send_command(cmd)
                
        print("✅ CBS 설정 완료!")
        
    def configure_tas(self):
        """TAS (Time-Aware Shaper) 설정"""
        print("\n⏰ TAS 설정 중...")
        print("시나리오: 8개 TC, 200ms 사이클")
        
        # 기본 시간 설정 (1초 후 시작)
        base_time = int(time.time() * 1e9) + int(1e9)
        
        # 관리자 설정
        admin_config = [
            f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler/admin-base-time {base_time}",
            f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler/admin-cycle-time 200000000",  # 200ms in ns
            f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler/admin-control-list-length 8",
        ]
        
        for cmd in admin_config:
            self.send_command(cmd)
            
        # Gate Control List 설정
        gcl = [
            (0, 50000000, 0x01),   # TC0: 50ms
            (1, 30000000, 0x02),   # TC1: 30ms
            (2, 20000000, 0x04),   # TC2: 20ms
            (3, 20000000, 0x08),   # TC3: 20ms
            (4, 20000000, 0x10),   # TC4: 20ms
            (5, 20000000, 0x20),   # TC5: 20ms
            (6, 20000000, 0x40),   # TC6: 20ms
            (7, 20000000, 0x80),   # TC7: 20ms
        ]
        
        for index, duration, gate_state in gcl:
            commands = [
                f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler/admin-control-list[index='{index}']/gate-states-value {gate_state}",
                f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler/admin-control-list[index='{index}']/time-interval-value {duration}",
            ]
            
            for cmd in commands:
                self.send_command(cmd)
                
        # TAS 활성화
        self.send_command(f"{self.mvdct_path} device {self.port} set /ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler/gate-enabled true")
        
        print("✅ TAS 설정 완료!")
        
    def configure_ptp(self):
        """PTP (Precision Time Protocol) 설정"""
        print("\n🕐 PTP 설정 중...")
        
        ptp_commands = [
            # 기본 데이터셋 설정
            "dr mup1cc coap post /ieee1588-ptp/instances/instance=0/default-ds/domain-number 0",
            "dr mup1cc coap post /ieee1588-ptp/instances/instance=0/default-ds/priority1 128",
            "dr mup1cc coap post /ieee1588-ptp/instances/instance=0/default-ds/priority2 128",
            "dr mup1cc coap post /ieee1588-ptp/instances/instance=0/default-ds/clock-quality/clock-class 248",
            "dr mup1cc coap post /ieee1588-ptp/instances/instance=0/default-ds/clock-quality/clock-accuracy 254",
            
            # 포트 설정
            "dr mup1cc coap post /ieee1588-ptp/instances/instance=0/ports/port=1/port-ds/log-announce-interval 0",
            "dr mup1cc coap post /ieee1588-ptp/instances/instance=0/ports/port=1/port-ds/log-sync-interval -3",
            "dr mup1cc coap post /ieee1588-ptp/instances/instance=0/ports/port=1/port-ds/log-min-delay-req-interval -3",
            
            # PTP 활성화
            "dr mup1cc coap post /ieee1588-ptp/instances/instance=0/enable true",
        ]
        
        for cmd in ptp_commands:
            self.send_command(cmd)
            
        print("✅ PTP 설정 완료!")
        
    def configure_qos_mapping(self):
        """QoS 매핑 테이블 설정"""
        print("\n🎯 QoS 매핑 설정 중...")
        
        # DSCP to PCP 매핑
        dscp_to_pcp = [
            (0, 0),   # BE
            (8, 1),   # CS1
            (16, 2),  # CS2
            (24, 3),  # CS3
            (32, 4),  # CS4
            (40, 5),  # CS5
            (48, 6),  # CS6
            (56, 7),  # CS7
        ]
        
        for dscp, pcp in dscp_to_pcp:
            cmd = f"dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/dscp-table/dscp={dscp}/pcp {pcp}"
            self.send_command(cmd)
            
        print("✅ QoS 매핑 설정 완료!")
        
    def save_configuration(self):
        """설정 저장"""
        print("\n💾 설정 저장 중...")
        
        # 설정을 플래시에 저장
        self.send_command("dr save")
        
        # 설정 이력을 파일로 저장
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        config_file = Path(f"board_config_{timestamp}.json")
        
        with open(config_file, 'w') as f:
            json.dump(self.config_history, f, indent=2)
            
        print(f"✅ 설정 저장 완료: {config_file}")
        
    def full_setup(self):
        """전체 설정 실행"""
        print("=" * 60)
        print("🚀 LAN9662 보드 전체 설정 시작")
        print("=" * 60)
        
        # 1. 상태 확인
        status = self.check_board_status()
        print("\n📋 상태 확인 결과:")
        for item, result in status.items():
            icon = "✅" if result == "OK" else "❌"
            print(f"  {icon} {item}: {result}")
            
        # 2. 기본 네트워크 설정
        self.setup_basic_network()
        
        # 3. CBS 설정
        self.configure_cbs()
        
        # 4. TAS 설정
        self.configure_tas()
        
        # 5. PTP 설정
        self.configure_ptp()
        
        # 6. QoS 매핑 설정
        self.configure_qos_mapping()
        
        # 7. 설정 저장
        self.save_configuration()
        
        print("\n" + "=" * 60)
        print("✨ 보드 설정 완료!")
        print("=" * 60)
        
    def reset_to_default(self):
        """기본값으로 초기화"""
        print("\n🔄 기본값으로 초기화 중...")
        
        commands = [
            "dr factory-reset",
            "dr reboot"
        ]
        
        for cmd in commands:
            response = self.send_command(cmd)
            if "reboot" in cmd:
                print("⏳ 재부팅 중... 30초 대기")
                time.sleep(30)
                
        print("✅ 초기화 완료!")

def main():
    parser = argparse.ArgumentParser(description='LAN9662 Board Setup Tool')
    parser.add_argument('--port', default='/dev/ttyACM0', help='Serial port')
    parser.add_argument('--mode', choices=['full', 'cbs', 'tas', 'ptp', 'reset'], 
                       default='full', help='Setup mode')
    parser.add_argument('--check-only', action='store_true', help='Only check status')
    
    args = parser.parse_args()
    
    # 보드 연결
    board = LAN9662BoardSetup(port=args.port)
    
    if args.check_only:
        board.check_board_status()
    elif args.mode == 'full':
        board.full_setup()
    elif args.mode == 'cbs':
        board.configure_cbs()
    elif args.mode == 'tas':
        board.configure_tas()
    elif args.mode == 'ptp':
        board.configure_ptp()
    elif args.mode == 'reset':
        board.reset_to_default()

if __name__ == "__main__":
    main()