#!/usr/bin/env python3
"""
LAN9662 VelocityDRIVE Board Control Server
mvdct CLI를 사용한 웹 기반 보드 제어 서버
"""

from flask import Flask, render_template_string, request, jsonify
from flask_cors import CORS
import subprocess
import json
import time
from datetime import datetime
import threading
import queue
import os

app = Flask(__name__)
CORS(app)

# mvdct 경로
MVDCT_PATH = "/home/kim/Downloads/Microchip_VelocityDRIVE_CT-CLI-linux-2025.07.12/mvdct"
DEFAULT_PORT = "/dev/ttyACM0"

# 명령어 큐
command_queue = queue.Queue()
response_cache = {}

class BoardController:
    def __init__(self):
        self.port = DEFAULT_PORT
        self.is_connected = False
        self.command_history = []
        
    def execute_command(self, cmd):
        """mvdct 명령어 실행"""
        try:
            full_cmd = f"{MVDCT_PATH} {cmd}"
            result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True, timeout=10)
            
            response = {
                'success': result.returncode == 0,
                'stdout': result.stdout,
                'stderr': result.stderr,
                'command': cmd,
                'timestamp': datetime.now().isoformat()
            }
            
            # 히스토리 저장
            self.command_history.append(response)
            if len(self.command_history) > 100:
                self.command_history = self.command_history[-100:]
                
            return response
        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'error': 'Command timeout',
                'command': cmd,
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'command': cmd,
                'timestamp': datetime.now().isoformat()
            }
    
    def get_device_info(self):
        """디바이스 정보 가져오기"""
        cmd = f"device {self.port} get /ietf-system:system-state/platform"
        return self.execute_command(cmd)
    
    def set_value(self, path, value):
        """YANG 값 설정"""
        cmd = f"device {self.port} set {path} {value}"
        return self.execute_command(cmd)
    
    def get_value(self, path):
        """YANG 값 가져오기"""
        cmd = f"device {self.port} get {path}"
        return self.execute_command(cmd)
    
    def configure_cbs(self, tc, idle_slope):
        """CBS 설정"""
        base_path = f"/ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler/traffic-class[index='{tc}']/credit-based-shaper"
        
        commands = [
            f"{base_path}/idle-slope {idle_slope}",
            f"{base_path}/send-slope -{idle_slope}",
            f"{base_path}/admin-idleslope-enabled true"
        ]
        
        results = []
        for cmd_path in commands:
            result = self.set_value(cmd_path, "")
            results.append(result)
        
        return results
    
    def configure_tas(self, gcl_entries):
        """TAS 설정"""
        base_path = "/ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler"
        
        # 기본 시간 설정
        base_time = int(time.time() * 1e9) + int(1e9)
        
        commands = [
            (f"{base_path}/admin-base-time", str(base_time)),
            (f"{base_path}/admin-cycle-time", "200000000"),
            (f"{base_path}/admin-control-list-length", str(len(gcl_entries)))
        ]
        
        # GCL 엔트리 추가
        for i, entry in enumerate(gcl_entries):
            commands.append((f"{base_path}/admin-control-list[index='{i}']/gate-states-value", str(entry['gate'])))
            commands.append((f"{base_path}/admin-control-list[index='{i}']/time-interval-value", str(entry['duration'])))
        
        # TAS 활성화
        commands.append((f"{base_path}/gate-enabled", "true"))
        
        results = []
        for path, value in commands:
            result = self.set_value(path, value)
            results.append(result)
        
        return results
    
    def configure_priority_mapping(self, pcp_to_priority):
        """Priority 매핑 설정"""
        base_path = "/ieee802-dot1q-bridge:bridges/bridge[name='br0']/component[name='br0']/traffic-class-table"
        
        results = []
        for pcp, priority in pcp_to_priority.items():
            path = f"{base_path}/traffic-class-map[priority-code-point='{pcp}']/priority"
            result = self.set_value(path, str(priority))
            results.append(result)
        
        return results

# 컨트롤러 인스턴스
controller = BoardController()

@app.route('/')
def index():
    """메인 페이지"""
    return render_template_string(HTML_TEMPLATE)

@app.route('/api/status')
def get_status():
    """보드 상태 확인"""
    info = controller.get_device_info()
    return jsonify(info)

@app.route('/api/execute', methods=['POST'])
def execute():
    """명령어 실행"""
    data = request.json
    cmd = data.get('command', '')
    result = controller.execute_command(cmd)
    return jsonify(result)

@app.route('/api/set', methods=['POST'])
def set_yang():
    """YANG 값 설정"""
    data = request.json
    path = data.get('path', '')
    value = data.get('value', '')
    result = controller.set_value(path, value)
    return jsonify(result)

@app.route('/api/get', methods=['POST'])
def get_yang():
    """YANG 값 가져오기"""
    data = request.json
    path = data.get('path', '')
    result = controller.get_value(path)
    return jsonify(result)

@app.route('/api/cbs/configure', methods=['POST'])
def configure_cbs():
    """CBS 설정"""
    data = request.json
    tc = data.get('tc', 0)
    idle_slope = data.get('idle_slope', 1500)
    results = controller.configure_cbs(tc, idle_slope)
    return jsonify({'results': results})

@app.route('/api/tas/configure', methods=['POST'])
def configure_tas():
    """TAS 설정"""
    data = request.json
    gcl = data.get('gcl', [])
    results = controller.configure_tas(gcl)
    return jsonify({'results': results})

@app.route('/api/priority/configure', methods=['POST'])
def configure_priority():
    """Priority 매핑 설정"""
    data = request.json
    mapping = data.get('mapping', {})
    results = controller.configure_priority_mapping(mapping)
    return jsonify({'results': results})

@app.route('/api/history')
def get_history():
    """명령어 히스토리"""
    return jsonify(controller.command_history)

# HTML 템플릿
HTML_TEMPLATE = '''
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LAN9662 Board Control Center</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        
        header {
            background: white;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        h1 {
            color: #333;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .status {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 14px;
            margin-left: auto;
        }
        
        .status.connected {
            background: #10b981;
            color: white;
        }
        
        .status.disconnected {
            background: #ef4444;
            color: white;
        }
        
        .main-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        
        .card {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        .card h2 {
            color: #667eea;
            margin-bottom: 15px;
            font-size: 20px;
        }
        
        .form-group {
            margin-bottom: 15px;
        }
        
        label {
            display: block;
            margin-bottom: 5px;
            color: #555;
            font-weight: 500;
        }
        
        input, select, textarea {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 14px;
        }
        
        textarea {
            min-height: 100px;
            font-family: 'Courier New', monospace;
        }
        
        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-weight: 500;
            transition: transform 0.2s;
        }
        
        button:hover {
            transform: translateY(-2px);
        }
        
        button:active {
            transform: translateY(0);
        }
        
        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 15px;
        }
        
        .console {
            background: #1e1e1e;
            color: #0f0;
            padding: 15px;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            max-height: 300px;
            overflow-y: auto;
            margin-top: 15px;
        }
        
        .console-line {
            margin-bottom: 5px;
        }
        
        .console-line.error {
            color: #f44;
        }
        
        .console-line.success {
            color: #0f0;
        }
        
        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .tab {
            padding: 10px 20px;
            background: #f0f0f0;
            border-radius: 5px 5px 0 0;
            cursor: pointer;
            transition: background 0.3s;
        }
        
        .tab.active {
            background: white;
        }
        
        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
        }
        
        .gcl-entry {
            display: grid;
            grid-template-columns: 1fr 2fr 2fr 1fr;
            gap: 10px;
            margin-bottom: 10px;
            align-items: center;
        }
        
        .gcl-entry input {
            padding: 5px;
        }
        
        .priority-mapping {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
        }
        
        .mapping-item {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .mapping-item label {
            margin: 0;
            min-width: 50px;
        }
        
        .mapping-item input {
            width: 60px;
        }
        
        @media (max-width: 768px) {
            .main-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>
                🎛️ LAN9662 Board Control Center
                <span id="status" class="status disconnected">Disconnected</span>
            </h1>
        </header>
        
        <div class="tabs">
            <div class="tab active" onclick="switchTab('command')">Direct Command</div>
            <div class="tab" onclick="switchTab('cbs')">CBS Configuration</div>
            <div class="tab" onclick="switchTab('tas')">TAS Configuration</div>
            <div class="tab" onclick="switchTab('priority')">Priority Mapping</div>
            <div class="tab" onclick="switchTab('yang')">YANG Browser</div>
        </div>
        
        <div class="main-grid">
            <!-- Direct Command Tab -->
            <div id="command-tab" class="tab-content active">
                <div class="card">
                    <h2>🖥️ Direct Command Execution</h2>
                    <div class="form-group">
                        <label>Command (without mvdct prefix):</label>
                        <textarea id="command-input" placeholder="device /dev/ttyACM0 get /ietf-system:system-state/platform"></textarea>
                    </div>
                    <button onclick="executeCommand()">Execute Command</button>
                </div>
            </div>
            
            <!-- CBS Configuration Tab -->
            <div id="cbs-tab" class="tab-content">
                <div class="card">
                    <h2>📊 CBS Configuration</h2>
                    <div class="form-group">
                        <label>Traffic Class:</label>
                        <select id="cbs-tc">
                            <option value="0">TC0</option>
                            <option value="1">TC1</option>
                            <option value="2">TC2</option>
                            <option value="3">TC3</option>
                            <option value="4">TC4</option>
                            <option value="5">TC5</option>
                            <option value="6">TC6</option>
                            <option value="7">TC7</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Idle Slope (kbps):</label>
                        <input type="number" id="cbs-idle-slope" value="1500">
                    </div>
                    <button onclick="configureCBS()">Apply CBS Configuration</button>
                </div>
            </div>
            
            <!-- TAS Configuration Tab -->
            <div id="tas-tab" class="tab-content">
                <div class="card">
                    <h2>⏰ TAS Configuration</h2>
                    <div class="form-group">
                        <label>Gate Control List:</label>
                        <div id="gcl-entries">
                            <div class="gcl-entry">
                                <span>TC0</span>
                                <input type="number" placeholder="Duration (ns)" value="50000000">
                                <input type="text" placeholder="Gate (hex)" value="0x01">
                                <button onclick="removeGCLEntry(this)">Remove</button>
                            </div>
                        </div>
                        <button onclick="addGCLEntry()">Add Entry</button>
                    </div>
                    <button onclick="configureTAS()">Apply TAS Configuration</button>
                </div>
            </div>
            
            <!-- Priority Mapping Tab -->
            <div id="priority-tab" class="tab-content">
                <div class="card">
                    <h2>🎯 Priority Mapping</h2>
                    <div class="form-group">
                        <label>PCP to Priority Mapping:</label>
                        <div class="priority-mapping">
                            <div class="mapping-item">
                                <label>PCP 0:</label>
                                <input type="number" id="pcp-0" value="0" min="0" max="7">
                            </div>
                            <div class="mapping-item">
                                <label>PCP 1:</label>
                                <input type="number" id="pcp-1" value="1" min="0" max="7">
                            </div>
                            <div class="mapping-item">
                                <label>PCP 2:</label>
                                <input type="number" id="pcp-2" value="2" min="0" max="7">
                            </div>
                            <div class="mapping-item">
                                <label>PCP 3:</label>
                                <input type="number" id="pcp-3" value="3" min="0" max="7">
                            </div>
                            <div class="mapping-item">
                                <label>PCP 4:</label>
                                <input type="number" id="pcp-4" value="4" min="0" max="7">
                            </div>
                            <div class="mapping-item">
                                <label>PCP 5:</label>
                                <input type="number" id="pcp-5" value="5" min="0" max="7">
                            </div>
                            <div class="mapping-item">
                                <label>PCP 6:</label>
                                <input type="number" id="pcp-6" value="6" min="0" max="7">
                            </div>
                            <div class="mapping-item">
                                <label>PCP 7:</label>
                                <input type="number" id="pcp-7" value="7" min="0" max="7">
                            </div>
                        </div>
                    </div>
                    <button onclick="configurePriorityMapping()">Apply Priority Mapping</button>
                </div>
            </div>
            
            <!-- YANG Browser Tab -->
            <div id="yang-tab" class="tab-content">
                <div class="card">
                    <h2>🌲 YANG Browser</h2>
                    <div class="form-group">
                        <label>YANG Path:</label>
                        <input type="text" id="yang-path" placeholder="/ietf-system:system-state/platform">
                    </div>
                    <div class="button-group">
                        <button onclick="yangGet()">GET</button>
                        <button onclick="yangSet()">SET</button>
                    </div>
                    <div class="form-group" id="yang-value-group" style="display:none; margin-top:15px;">
                        <label>Value:</label>
                        <input type="text" id="yang-value" placeholder="Enter value to set">
                    </div>
                </div>
            </div>
            
            <!-- Console Output -->
            <div class="card">
                <h2>📜 Console Output</h2>
                <div class="console" id="console">
                    <div class="console-line">Ready for commands...</div>
                </div>
                <button onclick="clearConsole()">Clear Console</button>
            </div>
        </div>
    </div>
    
    <script>
        const API_BASE = 'http://localhost:5000/api';
        
        // Tab switching
        function switchTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Show selected tab
            document.getElementById(tabName + '-tab').classList.add('active');
            event.target.classList.add('active');
        }
        
        // Console functions
        function addToConsole(message, type = 'info') {
            const console = document.getElementById('console');
            const line = document.createElement('div');
            line.className = `console-line ${type}`;
            const timestamp = new Date().toLocaleTimeString();
            line.textContent = `[${timestamp}] ${message}`;
            console.appendChild(line);
            console.scrollTop = console.scrollHeight;
        }
        
        function clearConsole() {
            document.getElementById('console').innerHTML = '<div class="console-line">Console cleared.</div>';
        }
        
        // Execute command
        async function executeCommand() {
            const command = document.getElementById('command-input').value;
            if (!command) {
                addToConsole('Please enter a command', 'error');
                return;
            }
            
            addToConsole(`Executing: ${command}`, 'info');
            
            try {
                const response = await fetch(`${API_BASE}/execute`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({command})
                });
                
                const result = await response.json();
                
                if (result.success) {
                    addToConsole('Command executed successfully', 'success');
                    if (result.stdout) addToConsole(result.stdout, 'info');
                } else {
                    addToConsole('Command failed', 'error');
                    if (result.stderr) addToConsole(result.stderr, 'error');
                    if (result.error) addToConsole(result.error, 'error');
                }
            } catch (error) {
                addToConsole(`Error: ${error.message}`, 'error');
            }
        }
        
        // CBS Configuration
        async function configureCBS() {
            const tc = document.getElementById('cbs-tc').value;
            const idleSlope = document.getElementById('cbs-idle-slope').value;
            
            addToConsole(`Configuring CBS for TC${tc} with idle-slope ${idleSlope} kbps`, 'info');
            
            try {
                const response = await fetch(`${API_BASE}/cbs/configure`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        tc: parseInt(tc),
                        idle_slope: parseInt(idleSlope)
                    })
                });
                
                const result = await response.json();
                addToConsole('CBS configuration applied', 'success');
            } catch (error) {
                addToConsole(`Error: ${error.message}`, 'error');
            }
        }
        
        // TAS Configuration
        function addGCLEntry() {
            const container = document.getElementById('gcl-entries');
            const tcIndex = container.children.length;
            
            const entry = document.createElement('div');
            entry.className = 'gcl-entry';
            entry.innerHTML = `
                <span>TC${tcIndex}</span>
                <input type="number" placeholder="Duration (ns)" value="20000000">
                <input type="text" placeholder="Gate (hex)" value="0x${(1 << tcIndex).toString(16).padStart(2, '0')}">
                <button onclick="removeGCLEntry(this)">Remove</button>
            `;
            
            container.appendChild(entry);
        }
        
        function removeGCLEntry(button) {
            button.parentElement.remove();
        }
        
        async function configureTAS() {
            const entries = document.querySelectorAll('#gcl-entries .gcl-entry');
            const gcl = [];
            
            entries.forEach((entry, index) => {
                const duration = entry.querySelector('input[type="number"]').value;
                const gate = entry.querySelector('input[type="text"]').value;
                
                gcl.push({
                    index: index,
                    duration: parseInt(duration),
                    gate: parseInt(gate)
                });
            });
            
            addToConsole(`Configuring TAS with ${gcl.length} entries`, 'info');
            
            try {
                const response = await fetch(`${API_BASE}/tas/configure`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({gcl})
                });
                
                const result = await response.json();
                addToConsole('TAS configuration applied', 'success');
            } catch (error) {
                addToConsole(`Error: ${error.message}`, 'error');
            }
        }
        
        // Priority Mapping
        async function configurePriorityMapping() {
            const mapping = {};
            
            for (let i = 0; i < 8; i++) {
                mapping[i] = parseInt(document.getElementById(`pcp-${i}`).value);
            }
            
            addToConsole('Configuring priority mapping', 'info');
            
            try {
                const response = await fetch(`${API_BASE}/priority/configure`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({mapping})
                });
                
                const result = await response.json();
                addToConsole('Priority mapping applied', 'success');
            } catch (error) {
                addToConsole(`Error: ${error.message}`, 'error');
            }
        }
        
        // YANG Browser
        async function yangGet() {
            const path = document.getElementById('yang-path').value;
            if (!path) {
                addToConsole('Please enter a YANG path', 'error');
                return;
            }
            
            addToConsole(`GET ${path}`, 'info');
            
            try {
                const response = await fetch(`${API_BASE}/get`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({path})
                });
                
                const result = await response.json();
                
                if (result.success) {
                    addToConsole('GET successful', 'success');
                    if (result.stdout) addToConsole(result.stdout, 'info');
                } else {
                    addToConsole('GET failed', 'error');
                    if (result.stderr) addToConsole(result.stderr, 'error');
                }
            } catch (error) {
                addToConsole(`Error: ${error.message}`, 'error');
            }
        }
        
        function yangSet() {
            document.getElementById('yang-value-group').style.display = 'block';
        }
        
        // Status check
        async function checkStatus() {
            try {
                const response = await fetch(`${API_BASE}/status`);
                const result = await response.json();
                
                const statusEl = document.getElementById('status');
                if (result.success) {
                    statusEl.className = 'status connected';
                    statusEl.textContent = 'Connected';
                } else {
                    statusEl.className = 'status disconnected';
                    statusEl.textContent = 'Disconnected';
                }
            } catch (error) {
                const statusEl = document.getElementById('status');
                statusEl.className = 'status disconnected';
                statusEl.textContent = 'Server Error';
            }
        }
        
        // Initialize
        window.onload = function() {
            checkStatus();
            setInterval(checkStatus, 5000);
            
            // Add initial GCL entries
            for (let i = 1; i < 8; i++) {
                addGCLEntry();
            }
        };
    </script>
</body>
</html>
'''

if __name__ == '__main__':
    print("🚀 LAN9662 Board Control Server")
    print(f"📡 Using mvdct: {MVDCT_PATH}")
    print(f"🔌 Default port: {DEFAULT_PORT}")
    print("🌐 Server running on http://localhost:5000")
    print("-" * 50)
    app.run(host='0.0.0.0', port=5000, debug=True)