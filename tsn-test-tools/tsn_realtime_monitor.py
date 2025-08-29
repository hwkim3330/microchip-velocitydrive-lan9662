#!/usr/bin/env python3
"""
TSN Real-time Performance Monitor and Visualizer
CBS/TAS 실시간 모니터링 및 시각화 대시보드
"""

import os
import sys
import time
import threading
import subprocess
import numpy as np
import pandas as pd
from datetime import datetime
from pathlib import Path
from collections import deque
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import tkinter as tk
from tkinter import ttk, scrolledtext
import json
import yaml

class TSNRealtimeMonitor:
    def __init__(self, serial_port='/dev/ttyACM0'):
        self.serial_port = serial_port
        self.monitoring = False
        self.data_queue = deque(maxlen=1000)
        
        # mvdct 경로
        self.mvdct_path = "/home/kim/Downloads/Microchip_VelocityDRIVE_CT-CLI-linux-2025.07.12/mvdct"
        self.dr_path = "/home/kim/velocitydrivesp-support/dr"
        
        # 실시간 데이터 저장
        self.realtime_data = {
            'timestamps': deque(maxlen=100),
            'tc_throughput': {f'TC{i}': deque(maxlen=100) for i in range(8)},
            'tc_latency': {f'TC{i}': deque(maxlen=100) for i in range(8)},
            'tc_packet_loss': {f'TC{i}': deque(maxlen=100) for i in range(8)},
            'tc_queue_depth': {f'TC{i}': deque(maxlen=100) for i in range(8)}
        }
        
        # 통계 데이터
        self.statistics = {
            'total_packets': 0,
            'total_bytes': 0,
            'start_time': None,
            'tc_stats': {f'TC{i}': {'packets': 0, 'bytes': 0, 'drops': 0} for i in range(8)}
        }
        
        # GUI 설정
        self.setup_gui()
    
    def setup_gui(self):
        """GUI 설정"""
        self.root = tk.Tk()
        self.root.title("TSN Real-time Performance Monitor")
        self.root.geometry("1600x900")
        
        # 스타일 설정
        style = ttk.Style()
        style.theme_use('clam')
        
        # 메인 프레임
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # 제어 패널
        control_frame = ttk.LabelFrame(main_frame, text="Control Panel", padding="10")
        control_frame.grid(row=0, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        # 시작/정지 버튼
        self.start_btn = ttk.Button(control_frame, text="Start Monitoring", command=self.start_monitoring)
        self.start_btn.grid(row=0, column=0, padx=5)
        
        self.stop_btn = ttk.Button(control_frame, text="Stop Monitoring", command=self.stop_monitoring, state='disabled')
        self.stop_btn.grid(row=0, column=1, padx=5)
        
        # CBS 테스트 버튼
        self.cbs_btn = ttk.Button(control_frame, text="Run CBS Test", command=self.run_cbs_test)
        self.cbs_btn.grid(row=0, column=2, padx=5)
        
        # TAS 테스트 버튼
        self.tas_btn = ttk.Button(control_frame, text="Run TAS Test", command=self.run_tas_test)
        self.tas_btn.grid(row=0, column=3, padx=5)
        
        # 리프레시 레이트
        ttk.Label(control_frame, text="Refresh Rate (ms):").grid(row=0, column=4, padx=5)
        self.refresh_var = tk.StringVar(value="1000")
        refresh_spin = ttk.Spinbox(control_frame, from_=100, to=5000, increment=100, 
                                   textvariable=self.refresh_var, width=10)
        refresh_spin.grid(row=0, column=5, padx=5)
        
        # 상태 표시
        self.status_label = ttk.Label(control_frame, text="Status: Idle", foreground="blue")
        self.status_label.grid(row=0, column=6, padx=20)
        
        # 그래프 영역
        graph_frame = ttk.LabelFrame(main_frame, text="Real-time Graphs", padding="10")
        graph_frame.grid(row=1, column=0, sticky=(tk.W, tk.E, tk.N, tk.S), pady=5)
        
        # matplotlib Figure 생성
        self.fig, self.axes = plt.subplots(2, 2, figsize=(12, 8))
        self.fig.suptitle('TSN Real-time Performance Monitoring', fontsize=14, fontweight='bold')
        
        # 그래프 초기화
        self.setup_graphs()
        
        # Canvas에 Figure 추가
        self.canvas = FigureCanvasTkAgg(self.fig, master=graph_frame)
        self.canvas.draw()
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)
        
        # 통계 테이블
        stats_frame = ttk.LabelFrame(main_frame, text="Traffic Class Statistics", padding="10")
        stats_frame.grid(row=1, column=1, sticky=(tk.W, tk.E, tk.N, tk.S), pady=5, padx=5)
        
        # 테이블 생성
        columns = ('TC', 'Throughput (Mbps)', 'Latency (ms)', 'Loss (%)', 'Queue Depth')
        self.stats_tree = ttk.Treeview(stats_frame, columns=columns, show='headings', height=10)
        
        for col in columns:
            self.stats_tree.heading(col, text=col)
            self.stats_tree.column(col, width=120)
        
        # 초기 데이터 추가
        for i in range(8):
            self.stats_tree.insert('', 'end', values=(f'TC{i}', '0.00', '0.00', '0.00', '0'))
        
        self.stats_tree.pack(fill=tk.BOTH, expand=True)
        
        # 로그 영역
        log_frame = ttk.LabelFrame(main_frame, text="System Log", padding="10")
        log_frame.grid(row=2, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        self.log_text = scrolledtext.ScrolledText(log_frame, height=8, width=100)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        # 메뉴바
        self.setup_menu()
        
        # 그리드 가중치 설정
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=3)
        main_frame.columnconfigure(1, weight=1)
        main_frame.rowconfigure(1, weight=1)
    
    def setup_menu(self):
        """메뉴바 설정"""
        menubar = tk.Menu(self.root)
        self.root.config(menu=menubar)
        
        # File 메뉴
        file_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="File", menu=file_menu)
        file_menu.add_command(label="Export Data", command=self.export_data)
        file_menu.add_command(label="Load Data", command=self.load_data)
        file_menu.add_separator()
        file_menu.add_command(label="Exit", command=self.root.quit)
        
        # View 메뉴
        view_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="View", menu=view_menu)
        view_menu.add_command(label="CBS Details", command=self.show_cbs_details)
        view_menu.add_command(label="TAS Schedule", command=self.show_tas_schedule)
        view_menu.add_command(label="Statistics", command=self.show_statistics)
        
        # Tools 메뉴
        tools_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Tools", menu=tools_menu)
        tools_menu.add_command(label="Configure CBS", command=self.configure_cbs)
        tools_menu.add_command(label="Configure TAS", command=self.configure_tas)
        tools_menu.add_command(label="Verify Config", command=self.verify_config)
    
    def setup_graphs(self):
        """그래프 초기화"""
        # 1. Throughput 그래프
        self.ax_throughput = self.axes[0, 0]
        self.ax_throughput.set_title('Throughput per Traffic Class')
        self.ax_throughput.set_xlabel('Time (s)')
        self.ax_throughput.set_ylabel('Throughput (Mbps)')
        self.ax_throughput.grid(True, alpha=0.3)
        self.ax_throughput.set_ylim(0, 100)
        
        # 2. Latency 그래프
        self.ax_latency = self.axes[0, 1]
        self.ax_latency.set_title('Latency per Traffic Class')
        self.ax_latency.set_xlabel('Time (s)')
        self.ax_latency.set_ylabel('Latency (ms)')
        self.ax_latency.grid(True, alpha=0.3)
        self.ax_latency.set_ylim(0, 20)
        
        # 3. Packet Loss 그래프
        self.ax_loss = self.axes[1, 0]
        self.ax_loss.set_title('Packet Loss per Traffic Class')
        self.ax_loss.set_xlabel('Time (s)')
        self.ax_loss.set_ylabel('Packet Loss (%)')
        self.ax_loss.grid(True, alpha=0.3)
        self.ax_loss.set_ylim(0, 5)
        
        # 4. Queue Depth 그래프
        self.ax_queue = self.axes[1, 1]
        self.ax_queue.set_title('Queue Depth per Traffic Class')
        self.ax_queue.set_xlabel('Time (s)')
        self.ax_queue.set_ylabel('Queue Depth (packets)')
        self.ax_queue.grid(True, alpha=0.3)
        self.ax_queue.set_ylim(0, 1000)
        
        # 라인 객체 생성
        colors = plt.cm.Set1(np.linspace(0, 1, 8))
        self.lines = {
            'throughput': [],
            'latency': [],
            'loss': [],
            'queue': []
        }
        
        for i in range(8):
            line_throughput, = self.ax_throughput.plot([], [], label=f'TC{i}', color=colors[i])
            line_latency, = self.ax_latency.plot([], [], label=f'TC{i}', color=colors[i])
            line_loss, = self.ax_loss.plot([], [], label=f'TC{i}', color=colors[i])
            line_queue, = self.ax_queue.plot([], [], label=f'TC{i}', color=colors[i])
            
            self.lines['throughput'].append(line_throughput)
            self.lines['latency'].append(line_latency)
            self.lines['loss'].append(line_loss)
            self.lines['queue'].append(line_queue)
        
        # 범례 추가
        self.ax_throughput.legend(loc='upper right', ncol=4, fontsize=8)
        self.ax_latency.legend(loc='upper right', ncol=4, fontsize=8)
        self.ax_loss.legend(loc='upper right', ncol=4, fontsize=8)
        self.ax_queue.legend(loc='upper right', ncol=4, fontsize=8)
        
        plt.tight_layout()
    
    def start_monitoring(self):
        """모니터링 시작"""
        self.monitoring = True
        self.statistics['start_time'] = datetime.now()
        
        self.start_btn.config(state='disabled')
        self.stop_btn.config(state='normal')
        self.status_label.config(text="Status: Monitoring...", foreground="green")
        
        self.log("Monitoring started at " + datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        
        # 모니터링 스레드 시작
        self.monitor_thread = threading.Thread(target=self.monitor_loop, daemon=True)
        self.monitor_thread.start()
        
        # 애니메이션 시작
        self.ani = animation.FuncAnimation(self.fig, self.update_graphs, 
                                         interval=int(self.refresh_var.get()),
                                         blit=False)
        self.canvas.draw()
    
    def stop_monitoring(self):
        """모니터링 중지"""
        self.monitoring = False
        
        self.start_btn.config(state='normal')
        self.stop_btn.config(state='disabled')
        self.status_label.config(text="Status: Stopped", foreground="red")
        
        self.log("Monitoring stopped at " + datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        
        # 애니메이션 중지
        if hasattr(self, 'ani'):
            self.ani.event_source.stop()
    
    def monitor_loop(self):
        """모니터링 루프"""
        while self.monitoring:
            try:
                # 포트 통계 가져오기
                stats = self.get_port_statistics()
                
                # 데이터 처리
                self.process_statistics(stats)
                
                # 대기
                time.sleep(1)
                
            except Exception as e:
                self.log(f"Monitor error: {e}")
                time.sleep(5)
    
    def get_port_statistics(self):
        """포트 통계 가져오기"""
        # 실제 구현에서는 mvdct를 사용하여 실제 통계를 가져옴
        # 여기서는 시뮬레이션 데이터 생성
        
        stats = {}
        current_time = time.time()
        
        for i in range(8):
            tc = f'TC{i}'
            
            # 시뮬레이션 데이터 (실제로는 보드에서 가져와야 함)
            stats[tc] = {
                'throughput': np.random.uniform(10, 50) + i * 5,
                'latency': np.random.uniform(0.5, 2.0) + i * 0.2,
                'packet_loss': np.random.uniform(0, 0.5),
                'queue_depth': np.random.randint(0, 500)
            }
        
        return stats
    
    def process_statistics(self, stats):
        """통계 처리 및 저장"""
        timestamp = time.time()
        
        if self.statistics['start_time']:
            elapsed = timestamp - time.mktime(self.statistics['start_time'].timetuple())
            self.realtime_data['timestamps'].append(elapsed)
        
        for tc, data in stats.items():
            self.realtime_data['tc_throughput'][tc].append(data['throughput'])
            self.realtime_data['tc_latency'][tc].append(data['latency'])
            self.realtime_data['tc_packet_loss'][tc].append(data['packet_loss'])
            self.realtime_data['tc_queue_depth'][tc].append(data['queue_depth'])
            
            # 통계 업데이트
            self.statistics['tc_stats'][tc]['packets'] += np.random.randint(100, 1000)
            self.statistics['tc_stats'][tc]['bytes'] += np.random.randint(10000, 100000)
    
    def update_graphs(self, frame):
        """그래프 업데이트"""
        if not self.monitoring or len(self.realtime_data['timestamps']) == 0:
            return self.lines['throughput']
        
        timestamps = list(self.realtime_data['timestamps'])
        
        # 각 TC별로 라인 업데이트
        for i in range(8):
            tc = f'TC{i}'
            
            # Throughput
            if len(self.realtime_data['tc_throughput'][tc]) > 0:
                self.lines['throughput'][i].set_data(timestamps, 
                                                    list(self.realtime_data['tc_throughput'][tc]))
            
            # Latency
            if len(self.realtime_data['tc_latency'][tc]) > 0:
                self.lines['latency'][i].set_data(timestamps,
                                                 list(self.realtime_data['tc_latency'][tc]))
            
            # Packet Loss
            if len(self.realtime_data['tc_packet_loss'][tc]) > 0:
                self.lines['loss'][i].set_data(timestamps,
                                              list(self.realtime_data['tc_packet_loss'][tc]))
            
            # Queue Depth
            if len(self.realtime_data['tc_queue_depth'][tc]) > 0:
                self.lines['queue'][i].set_data(timestamps,
                                               list(self.realtime_data['tc_queue_depth'][tc]))
        
        # X축 범위 조정
        if len(timestamps) > 1:
            for ax in [self.ax_throughput, self.ax_latency, self.ax_loss, self.ax_queue]:
                ax.set_xlim(max(0, timestamps[-1] - 30), timestamps[-1] + 1)
                ax.relim()
        
        # 통계 테이블 업데이트
        self.update_stats_table()
        
        return self.lines['throughput']
    
    def update_stats_table(self):
        """통계 테이블 업데이트"""
        for i in range(8):
            tc = f'TC{i}'
            
            # 최신 값 가져오기
            throughput = self.realtime_data['tc_throughput'][tc][-1] if self.realtime_data['tc_throughput'][tc] else 0
            latency = self.realtime_data['tc_latency'][tc][-1] if self.realtime_data['tc_latency'][tc] else 0
            loss = self.realtime_data['tc_packet_loss'][tc][-1] if self.realtime_data['tc_packet_loss'][tc] else 0
            queue = self.realtime_data['tc_queue_depth'][tc][-1] if self.realtime_data['tc_queue_depth'][tc] else 0
            
            # 테이블 업데이트
            item = self.stats_tree.get_children()[i]
            self.stats_tree.item(item, values=(tc, f'{throughput:.2f}', f'{latency:.2f}', 
                                              f'{loss:.2f}', f'{queue}'))
    
    def run_cbs_test(self):
        """CBS 테스트 실행"""
        self.log("Starting CBS test...")
        
        # CBS 테스트 스크립트 실행
        cmd = "python3 /home/kim/cbs_multiqueue_test.py"
        
        def run_test():
            try:
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
                self.log(f"CBS test completed: {result.stdout[:500]}")
            except Exception as e:
                self.log(f"CBS test error: {e}")
        
        thread = threading.Thread(target=run_test, daemon=True)
        thread.start()
    
    def run_tas_test(self):
        """TAS 테스트 실행"""
        self.log("Starting TAS test...")
        
        # TAS 테스트 스크립트 실행
        cmd = "python3 /home/kim/tas_multiqueue_test.py"
        
        def run_test():
            try:
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
                self.log(f"TAS test completed: {result.stdout[:500]}")
            except Exception as e:
                self.log(f"TAS test error: {e}")
        
        thread = threading.Thread(target=run_test, daemon=True)
        thread.start()
    
    def show_cbs_details(self):
        """CBS 상세 정보 표시"""
        window = tk.Toplevel(self.root)
        window.title("CBS Configuration Details")
        window.geometry("600x400")
        
        text = scrolledtext.ScrolledText(window, height=20, width=70)
        text.pack(fill=tk.BOTH, expand=True)
        
        details = """
CBS (Credit-Based Shaper) Configuration
========================================

Traffic Class Configuration:
- TC0: Idle Slope = 500 kbps
- TC1: Idle Slope = 1000 kbps
- TC2: Idle Slope = 1500 kbps
- TC3: Idle Slope = 2000 kbps
- TC4: Idle Slope = 2500 kbps
- TC5: Idle Slope = 3000 kbps
- TC6: Idle Slope = 3500 kbps
- TC7: Idle Slope = 4000 kbps

Priority Mapping:
- PCP 0-3 → Priority 6 (TC6)
- PCP 4-7 → Priority 2 (TC2)

Expected Results:
- TC6 group: ~3.5 Mbps throughput
- TC2 group: ~1.5 Mbps throughput
"""
        text.insert('1.0', details)
        text.config(state='disabled')
    
    def show_tas_schedule(self):
        """TAS 스케줄 표시"""
        window = tk.Toplevel(self.root)
        window.title("TAS Gate Control Schedule")
        window.geometry("800x600")
        
        # 그래프 생성
        fig, ax = plt.subplots(figsize=(10, 6))
        
        # Gate schedule 시각화
        schedule = [
            {'tc': 0, 'start': 0, 'duration': 50},
            {'tc': 1, 'start': 50, 'duration': 30},
            {'tc': 2, 'start': 80, 'duration': 25},
            {'tc': 3, 'start': 105, 'duration': 25},
            {'tc': 4, 'start': 130, 'duration': 20},
            {'tc': 5, 'start': 150, 'duration': 20},
            {'tc': 6, 'start': 170, 'duration': 15},
            {'tc': 7, 'start': 185, 'duration': 15}
        ]
        
        colors = plt.cm.Set3(np.linspace(0, 1, 8))
        
        for slot in schedule:
            rect = plt.Rectangle((slot['start'], slot['tc'] - 0.4), 
                                slot['duration'], 0.8,
                                facecolor=colors[slot['tc']], 
                                edgecolor='black', linewidth=1)
            ax.add_patch(rect)
            ax.text(slot['start'] + slot['duration']/2, slot['tc'],
                   f"{slot['duration']}ms", ha='center', va='center')
        
        ax.set_xlim(0, 200)
        ax.set_ylim(-0.5, 7.5)
        ax.set_xlabel('Time (ms)')
        ax.set_ylabel('Traffic Class')
        ax.set_title('TAS Gate Control Schedule (200ms cycle)')
        ax.set_yticks(range(8))
        ax.set_yticklabels([f'TC{i}' for i in range(8)])
        ax.grid(True, alpha=0.3)
        
        canvas = FigureCanvasTkAgg(fig, master=window)
        canvas.draw()
        canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)
    
    def show_statistics(self):
        """통계 표시"""
        window = tk.Toplevel(self.root)
        window.title("Performance Statistics")
        window.geometry("600x400")
        
        text = scrolledtext.ScrolledText(window, height=20, width=70)
        text.pack(fill=tk.BOTH, expand=True)
        
        stats_text = f"""
Performance Statistics
======================
Start Time: {self.statistics['start_time']}
Total Packets: {self.statistics['total_packets']}
Total Bytes: {self.statistics['total_bytes']}

Traffic Class Statistics:
"""
        
        for tc, data in self.statistics['tc_stats'].items():
            stats_text += f"""
{tc}:
  Packets: {data['packets']}
  Bytes: {data['bytes']}
  Drops: {data['drops']}
"""
        
        text.insert('1.0', stats_text)
        text.config(state='disabled')
    
    def configure_cbs(self):
        """CBS 설정 창"""
        self.log("Opening CBS configuration window...")
        # 별도 창으로 CBS 설정 인터페이스 제공
    
    def configure_tas(self):
        """TAS 설정 창"""
        self.log("Opening TAS configuration window...")
        # 별도 창으로 TAS 설정 인터페이스 제공
    
    def verify_config(self):
        """설정 확인"""
        self.log("Verifying configuration...")
        
        # 설정 확인 명령 실행
        if Path(self.dr_path).exists():
            cmd = f"sudo {self.dr_path} mup1cc -d {self.serial_port} -m get"
        else:
            cmd = f"sudo {self.mvdct_path} device {self.serial_port} get"
        
        def verify():
            try:
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
                self.log(f"Configuration: {result.stdout[:500]}")
            except Exception as e:
                self.log(f"Verify error: {e}")
        
        thread = threading.Thread(target=verify, daemon=True)
        thread.start()
    
    def export_data(self):
        """데이터 내보내기"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"tsn_monitor_data_{timestamp}.json"
        
        export_data = {
            'timestamp': timestamp,
            'statistics': self.statistics,
            'realtime_data': {
                'timestamps': list(self.realtime_data['timestamps']),
                'tc_throughput': {tc: list(data) for tc, data in self.realtime_data['tc_throughput'].items()},
                'tc_latency': {tc: list(data) for tc, data in self.realtime_data['tc_latency'].items()},
                'tc_packet_loss': {tc: list(data) for tc, data in self.realtime_data['tc_packet_loss'].items()},
                'tc_queue_depth': {tc: list(data) for tc, data in self.realtime_data['tc_queue_depth'].items()}
            }
        }
        
        with open(filename, 'w') as f:
            json.dump(export_data, f, indent=2, default=str)
        
        self.log(f"Data exported to {filename}")
    
    def load_data(self):
        """데이터 불러오기"""
        from tkinter import filedialog
        
        filename = filedialog.askopenfilename(
            title="Select data file",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")]
        )
        
        if filename:
            try:
                with open(filename, 'r') as f:
                    data = json.load(f)
                
                # 데이터 로드
                self.statistics = data.get('statistics', self.statistics)
                
                # 실시간 데이터 로드
                if 'realtime_data' in data:
                    for key in self.realtime_data:
                        if key in data['realtime_data']:
                            self.realtime_data[key] = deque(data['realtime_data'][key], maxlen=100)
                
                self.log(f"Data loaded from {filename}")
                
                # 그래프 업데이트
                self.update_graphs(None)
                
            except Exception as e:
                self.log(f"Load error: {e}")
    
    def log(self, message):
        """로그 메시지 추가"""
        timestamp = datetime.now().strftime('%H:%M:%S')
        log_message = f"[{timestamp}] {message}\n"
        
        self.log_text.insert(tk.END, log_message)
        self.log_text.see(tk.END)
    
    def run(self):
        """GUI 실행"""
        self.log("TSN Real-time Monitor started")
        self.log("Ready to monitor CBS and TAS performance")
        
        self.root.mainloop()

def main():
    monitor = TSNRealtimeMonitor()
    monitor.run()

if __name__ == "__main__":
    main()