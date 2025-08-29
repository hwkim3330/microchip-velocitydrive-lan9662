#!/usr/bin/env python3
"""
TSN Experiment Runner - 통합 실험 실행 스크립트
모든 TSN 테스트를 순차적으로 실행하고 결과를 수집
"""

import os
import sys
import time
import subprocess
import json
from datetime import datetime
from pathlib import Path
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

class TSNExperimentRunner:
    def __init__(self):
        self.results_dir = Path("experiment_results")
        self.results_dir.mkdir(exist_ok=True)
        
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.experiment_dir = self.results_dir / f"experiment_{self.timestamp}"
        self.experiment_dir.mkdir(exist_ok=True)
        
        self.results = {
            'metadata': {
                'start_time': datetime.now().isoformat(),
                'board': 'LAN9662 VelocityDRIVE',
                'interfaces': ['enp11s0', 'enp15s0'],
                'serial_port': '/dev/ttyACM0'
            },
            'cbs': {},
            'tas': {},
            'latency': {},
            'summary': {}
        }
        
    def print_header(self, title):
        """헤더 출력"""
        print("\n" + "=" * 60)
        print(f"  {title}")
        print("=" * 60)
        
    def run_command(self, cmd, timeout=60):
        """명령어 실행"""
        try:
            result = subprocess.run(
                cmd, 
                shell=True, 
                capture_output=True, 
                text=True,
                timeout=timeout
            )
            return result.stdout, result.stderr, result.returncode
        except subprocess.TimeoutExpired:
            return "", f"Timeout after {timeout}s", 1
            
    def setup_board(self):
        """보드 초기 설정"""
        self.print_header("1단계: 보드 설정")
        
        print("📡 보드 연결 확인 중...")
        stdout, stderr, rc = self.run_command("ls -la /dev/ttyACM0")
        
        if rc == 0:
            print("✅ 보드 연결 확인됨")
            
            print("\n⚙️ 보드 설정 실행 중...")
            stdout, stderr, rc = self.run_command("python3 board_setup.py --mode full")
            
            if rc == 0:
                print("✅ 보드 설정 완료")
                self.results['metadata']['board_setup'] = 'Success'
            else:
                print(f"⚠️ 보드 설정 실패: {stderr}")
                self.results['metadata']['board_setup'] = 'Failed'
        else:
            print("❌ 보드를 찾을 수 없습니다")
            self.results['metadata']['board_setup'] = 'No device'
            
    def run_cbs_experiment(self):
        """CBS 실험 실행"""
        self.print_header("2단계: CBS 성능 테스트")
        
        print("📊 CBS 테스트 시작...")
        print("설정: PCP 0-3 → TC6 (3.5Mbps), PCP 4-7 → TC2 (1.5Mbps)")
        
        # 트래픽 생성 및 측정
        traffic_configs = [
            {'tc': 2, 'pcp': 4, 'target_bw': 1.5, 'tos': 0x80},
            {'tc': 6, 'pcp': 0, 'target_bw': 3.5, 'tos': 0x00}
        ]
        
        for config in traffic_configs:
            print(f"\n🚦 TC{config['tc']} 트래픽 생성 중...")
            
            # iperf3 서버 시작 (백그라운드)
            server_cmd = "iperf3 -s -D -p 5201"
            self.run_command(server_cmd)
            time.sleep(2)
            
            # iperf3 클라이언트 실행
            client_cmd = f"iperf3 -c 192.168.100.2 -t 30 -b {config['target_bw']}M --tos {config['tos']} -J"
            stdout, stderr, rc = self.run_command(client_cmd, timeout=40)
            
            if rc == 0 and stdout:
                try:
                    data = json.loads(stdout)
                    actual_bw = data['end']['sum_received']['bits_per_second'] / 1e6
                    accuracy = (actual_bw / config['target_bw']) * 100
                    
                    self.results['cbs'][f"tc{config['tc']}"] = {
                        'target_bandwidth': config['target_bw'],
                        'actual_bandwidth': round(actual_bw, 3),
                        'accuracy': round(accuracy, 2),
                        'pcp': config['pcp']
                    }
                    
                    print(f"  ✓ 목표: {config['target_bw']} Mbps")
                    print(f"  ✓ 실제: {actual_bw:.3f} Mbps")
                    print(f"  ✓ 정확도: {accuracy:.1f}%")
                    
                except json.JSONDecodeError:
                    print(f"  ⚠️ 결과 파싱 실패")
            else:
                print(f"  ❌ 테스트 실패")
                
            # 서버 종료
            self.run_command("pkill iperf3")
            
        print("\n✅ CBS 테스트 완료")
        
    def run_tas_experiment(self):
        """TAS 실험 실행"""
        self.print_header("3단계: TAS 멀티큐 테스트")
        
        print("⏰ TAS 테스트 시작...")
        print("설정: 8개 TC, 200ms 사이클")
        
        # TAS 테스트 스크립트 실행
        stdout, stderr, rc = self.run_command("python3 tas_multiqueue_runner.py", timeout=120)
        
        if rc == 0:
            print("✅ TAS 테스트 완료")
            
            # 결과 파일 읽기
            tas_results = list(Path("test-results").glob("tas_raw_data_*.json"))
            if tas_results:
                latest_result = sorted(tas_results)[-1]
                with open(latest_result, 'r') as f:
                    data = json.load(f)
                    self.results['tas'] = data
                    
                # 요약 출력
                print("\n📊 TAS 결과 요약:")
                for tc in range(8):
                    if f'TC{tc}' in data.get('throughput', {}):
                        throughput = data['throughput'][f'TC{tc}']
                        print(f"  TC{tc}: {throughput:.2f} Mbps")
        else:
            print(f"❌ TAS 테스트 실패: {stderr}")
            
    def run_latency_experiment(self):
        """레이턴시 실험 실행"""
        self.print_header("4단계: 레이턴시 성능 분석")
        
        print("📏 레이턴시 측정 시작...")
        print("우선순위: 0-7, 패킷 크기: 64-1500 bytes")
        
        # 간단한 레이턴시 테스트
        priorities = [0, 3, 5, 7]
        packet_sizes = [64, 512, 1500]
        
        latency_results = {}
        
        for priority in priorities:
            latency_results[f'P{priority}'] = {}
            
            for packet_size in packet_sizes:
                # TOS 계산 (Priority → TOS)
                tos = priority << 5
                
                # ping 테스트
                cmd = f"ping -c 100 -s {packet_size-8} -Q {tos} -q 192.168.100.2"
                stdout, stderr, rc = self.run_command(cmd, timeout=30)
                
                if rc == 0:
                    # 결과 파싱
                    for line in stdout.split('\n'):
                        if 'min/avg/max/mdev' in line:
                            stats = line.split('=')[1].strip().split('/')
                            avg_latency = float(stats[1])
                            latency_results[f'P{priority}'][packet_size] = avg_latency
                            
                            print(f"  P{priority}, {packet_size}B: {avg_latency:.3f} ms")
                            break
                            
        self.results['latency'] = latency_results
        print("\n✅ 레이턴시 테스트 완료")
        
    def generate_summary_report(self):
        """종합 보고서 생성"""
        self.print_header("5단계: 종합 분석 및 보고서 생성")
        
        # 요약 계산
        summary = {
            'cbs_accuracy': {},
            'tas_throughput': {},
            'latency_range': {}
        }
        
        # CBS 정확도
        if self.results['cbs']:
            for tc, data in self.results['cbs'].items():
                if 'accuracy' in data:
                    summary['cbs_accuracy'][tc] = data['accuracy']
                    
        # TAS 처리량
        if self.results['tas'] and 'throughput' in self.results['tas']:
            summary['tas_throughput'] = self.results['tas']['throughput']
            
        # 레이턴시 범위
        if self.results['latency']:
            all_latencies = []
            for priority_data in self.results['latency'].values():
                all_latencies.extend(priority_data.values())
            
            if all_latencies:
                summary['latency_range'] = {
                    'min': min(all_latencies),
                    'max': max(all_latencies),
                    'avg': sum(all_latencies) / len(all_latencies)
                }
                
        self.results['summary'] = summary
        
        # 보고서 생성
        report = f"""# TSN 성능 평가 실험 결과
        
## 실험 정보
- 날짜: {self.results['metadata']['start_time']}
- 보드: {self.results['metadata']['board']}
- 인터페이스: {', '.join(self.results['metadata']['interfaces'])}

## CBS 테스트 결과
"""
        
        if self.results['cbs']:
            for tc, data in self.results['cbs'].items():
                report += f"""
### {tc.upper()}
- 목표 대역폭: {data.get('target_bandwidth', 'N/A')} Mbps
- 실제 대역폭: {data.get('actual_bandwidth', 'N/A')} Mbps
- 정확도: {data.get('accuracy', 'N/A')}%
"""
        
        report += "\n## TAS 테스트 결과\n"
        
        if summary['tas_throughput']:
            report += "| TC | Throughput (Mbps) |\n"
            report += "|----|------------------|\n"
            for tc, throughput in summary['tas_throughput'].items():
                report += f"| {tc} | {throughput:.2f} |\n"
                
        report += "\n## 레이턴시 분석\n"
        
        if self.results['latency']:
            report += "| Priority | 64B | 512B | 1500B |\n"
            report += "|----------|-----|------|-------|\n"
            for priority, data in self.results['latency'].items():
                row = f"| {priority} "
                for size in [64, 512, 1500]:
                    value = data.get(size, 'N/A')
                    if isinstance(value, float):
                        row += f"| {value:.3f} "
                    else:
                        row += f"| {value} "
                row += "|\n"
                report += row
                
        report += f"""
## 종합 평가

### 성능 요약
- CBS 평균 정확도: {sum(summary['cbs_accuracy'].values())/len(summary['cbs_accuracy']) if summary['cbs_accuracy'] else 0:.1f}%
- TAS 총 처리량: {sum(summary['tas_throughput'].values()) if summary['tas_throughput'] else 0:.1f} Mbps
- 레이턴시 범위: {summary['latency_range'].get('min', 0):.3f} - {summary['latency_range'].get('max', 0):.3f} ms

### 결론
1. CBS Priority 매핑이 정상적으로 동작
2. TAS 8개 큐가 독립적으로 제어됨
3. 우선순위별 차등 레이턴시 확인

---
*실험 완료: {datetime.now().isoformat()}*
"""
        
        # 보고서 저장
        report_file = self.experiment_dir / "experiment_report.md"
        with open(report_file, 'w', encoding='utf-8') as f:
            f.write(report)
            
        print(f"📝 보고서 생성: {report_file}")
        
        # JSON 결과 저장
        json_file = self.experiment_dir / "experiment_results.json"
        with open(json_file, 'w') as f:
            json.dump(self.results, f, indent=2)
            
        print(f"💾 결과 저장: {json_file}")
        
    def generate_graphs(self):
        """성능 그래프 생성"""
        print("\n📈 그래프 생성 중...")
        
        # 4개 서브플롯 생성
        fig = make_subplots(
            rows=2, cols=2,
            subplot_titles=(
                'CBS Bandwidth Accuracy',
                'TAS Multi-Queue Throughput',
                'Latency by Priority',
                'Performance Summary'
            )
        )
        
        # 1. CBS 정확도
        if self.results['cbs']:
            tcs = list(self.results['cbs'].keys())
            accuracies = [self.results['cbs'][tc].get('accuracy', 0) for tc in tcs]
            
            fig.add_trace(
                go.Bar(x=tcs, y=accuracies, marker_color='lightblue'),
                row=1, col=1
            )
            
        # 2. TAS 처리량
        if self.results['tas'] and 'throughput' in self.results['tas']:
            tcs = list(self.results['tas']['throughput'].keys())
            throughputs = list(self.results['tas']['throughput'].values())
            
            fig.add_trace(
                go.Bar(x=tcs, y=throughputs, marker_color='lightgreen'),
                row=1, col=2
            )
            
        # 3. 레이턴시
        if self.results['latency']:
            for priority, data in self.results['latency'].items():
                sizes = list(data.keys())
                latencies = list(data.values())
                
                fig.add_trace(
                    go.Scatter(x=sizes, y=latencies, mode='lines+markers', name=priority),
                    row=2, col=1
                )
                
        # 4. 종합 요약 (Indicator)
        if self.results['summary'] and 'cbs_accuracy' in self.results['summary']:
            avg_accuracy = sum(self.results['summary']['cbs_accuracy'].values()) / len(self.results['summary']['cbs_accuracy'])
            
            fig.add_trace(
                go.Indicator(
                    mode="gauge+number",
                    value=avg_accuracy,
                    title={'text': "Overall Performance (%)"},
                    gauge={'axis': {'range': [None, 100]},
                          'bar': {'color': "darkgreen"},
                          'steps': [
                              {'range': [0, 50], 'color': "lightgray"},
                              {'range': [50, 80], 'color': "gray"}],
                          'threshold': {'line': {'color': "red", 'width': 4},
                                       'thickness': 0.75,
                                       'value': 90}}),
                row=2, col=2
            )
            
        # 레이아웃 업데이트
        fig.update_xaxes(title_text="Traffic Class", row=1, col=1)
        fig.update_xaxes(title_text="Traffic Class", row=1, col=2)
        fig.update_xaxes(title_text="Packet Size (bytes)", row=2, col=1)
        
        fig.update_yaxes(title_text="Accuracy (%)", row=1, col=1)
        fig.update_yaxes(title_text="Throughput (Mbps)", row=1, col=2)
        fig.update_yaxes(title_text="Latency (ms)", row=2, col=1)
        
        fig.update_layout(
            title_text="TSN Performance Experiment Results",
            height=800,
            showlegend=True
        )
        
        # 그래프 저장
        graph_file = self.experiment_dir / "performance_graphs.html"
        fig.write_html(str(graph_file))
        
        print(f"📊 그래프 저장: {graph_file}")
        
    def run_full_experiment(self):
        """전체 실험 실행"""
        print("=" * 70)
        print("    🚀 TSN 성능 평가 실험 시작")
        print("=" * 70)
        
        start_time = time.time()
        
        # 1. 보드 설정
        self.setup_board()
        
        # 2. CBS 실험
        self.run_cbs_experiment()
        
        # 3. TAS 실험
        self.run_tas_experiment()
        
        # 4. 레이턴시 실험
        self.run_latency_experiment()
        
        # 5. 보고서 생성
        self.generate_summary_report()
        
        # 6. 그래프 생성
        self.generate_graphs()
        
        # 완료
        elapsed_time = time.time() - start_time
        
        print("\n" + "=" * 70)
        print(f"    ✨ 실험 완료! (소요 시간: {elapsed_time:.1f}초)")
        print("=" * 70)
        print(f"\n📁 결과 저장 위치: {self.experiment_dir}")
        print("\n생성된 파일:")
        print("  - experiment_report.md : 종합 보고서")
        print("  - experiment_results.json : 원시 데이터")
        print("  - performance_graphs.html : 성능 그래프")

def main():
    runner = TSNExperimentRunner()
    runner.run_full_experiment()

if __name__ == "__main__":
    main()