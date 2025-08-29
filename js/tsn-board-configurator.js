/**
 * TSN Board Configurator using WebSerial API
 * LAN9662 보드 설정을 위한 프론트엔드 도구
 */

class TSNBoardConfigurator {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
        this.isConnected = false;
        
        // CBS 설정
        this.cbsConfig = {
            tc2: {
                idleSlope: 1500,
                sendSlope: -1500,
                hiCredit: 3000,
                loCredit: -3000,
                priority: 2,
                pcpValues: [4, 5, 6, 7]
            },
            tc6: {
                idleSlope: 3500,
                sendSlope: -3500,
                hiCredit: 7000,
                loCredit: -7000,
                priority: 6,
                pcpValues: [0, 1, 2, 3]
            }
        };
        
        // TAS 설정 (200ms 사이클, 8개 TC)
        this.tasConfig = {
            cycleTimeNs: 200000000,
            gcl: [
                { tc: 0, startMs: 0,   durationMs: 50, gateState: 0x01 },
                { tc: 1, startMs: 50,  durationMs: 30, gateState: 0x02 },
                { tc: 2, startMs: 80,  durationMs: 20, gateState: 0x04 },
                { tc: 3, startMs: 100, durationMs: 20, gateState: 0x08 },
                { tc: 4, startMs: 120, durationMs: 20, gateState: 0x10 },
                { tc: 5, startMs: 140, durationMs: 20, gateState: 0x20 },
                { tc: 6, startMs: 160, durationMs: 20, gateState: 0x40 },
                { tc: 7, startMs: 180, durationMs: 20, gateState: 0x80 }
            ]
        };
        
        this.commandQueue = [];
        this.commandHistory = [];
    }
    
    async connect() {
        try {
            // WebSerial API 요청
            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate: 115200 });
            
            // Reader/Writer 설정
            const textDecoder = new TextDecoderStream();
            const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
            this.reader = textDecoder.readable.getReader();
            
            const textEncoder = new TextEncoderStream();
            const writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
            this.writer = textEncoder.writable.getWriter();
            
            this.isConnected = true;
            
            // 연속 읽기 시작
            this.readLoop();
            
            console.log('✅ 보드 연결 성공');
            this.updateConnectionStatus(true);
            
            // 초기 상태 확인
            await this.checkBoardStatus();
            
            return true;
        } catch (error) {
            console.error('❌ 연결 실패:', error);
            this.updateConnectionStatus(false);
            return false;
        }
    }
    
    async disconnect() {
        if (this.reader) {
            await this.reader.cancel();
            await this.reader.releaseLock();
        }
        if (this.writer) {
            await this.writer.close();
            await this.writer.releaseLock();
        }
        if (this.port) {
            await this.port.close();
        }
        
        this.isConnected = false;
        this.updateConnectionStatus(false);
        console.log('🔌 보드 연결 해제');
    }
    
    async readLoop() {
        while (this.isConnected) {
            try {
                const { value, done } = await this.reader.read();
                if (done) break;
                
                this.handleResponse(value);
            } catch (error) {
                console.error('읽기 오류:', error);
                break;
            }
        }
    }
    
    handleResponse(data) {
        // 응답 파싱 및 UI 업데이트
        const timestamp = new Date().toISOString();
        const response = {
            timestamp,
            data: data.trim()
        };
        
        this.commandHistory.push(response);
        this.updateResponseDisplay(response);
        
        // 응답 분석
        if (data.includes('error')) {
            console.error('⚠️ 오류 응답:', data);
        } else if (data.includes('ok') || data.includes('success')) {
            console.log('✅ 성공:', data);
        }
    }
    
    async sendCommand(command) {
        if (!this.isConnected) {
            console.error('보드가 연결되지 않음');
            return false;
        }
        
        try {
            // 명령어 전송
            await this.writer.write(command + '\n');
            
            // 명령어 기록
            this.commandHistory.push({
                timestamp: new Date().toISOString(),
                command,
                type: 'sent'
            });
            
            this.updateCommandDisplay(command);
            
            // 응답 대기
            await this.delay(100);
            
            return true;
        } catch (error) {
            console.error('명령어 전송 실패:', error);
            return false;
        }
    }
    
    async checkBoardStatus() {
        console.log('📋 보드 상태 확인 중...');
        
        const statusCommands = [
            'dr version',
            'dr mup1cc coap get /ietf-interfaces/interfaces',
            'dr mup1cc coap get /ieee802-dot1q-bridge/bridges',
            'dr mup1cc coap get /ieee1588-ptp/instances'
        ];
        
        for (const cmd of statusCommands) {
            await this.sendCommand(cmd);
            await this.delay(200);
        }
    }
    
    async configureCBS() {
        console.log('📊 CBS 설정 시작...');
        
        const commands = [];
        
        // PCP to Priority 매핑
        for (let pcp = 0; pcp <= 7; pcp++) {
            const priority = pcp <= 3 ? 6 : 2;
            commands.push(
                `dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/pcp=${pcp}/priority ${priority}`
            );
        }
        
        // Priority to TC 매핑
        commands.push(
            'dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/priority=2/traffic-class 2',
            'dr mup1cc coap post /ieee802-dot1q-bridge/bridges/bridge=br0/component=0/traffic-class-table/priority=6/traffic-class 6'
        );
        
        // TC2 CBS 설정
        commands.push(
            `dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/idle-slope ${this.cbsConfig.tc2.idleSlope}`,
            `dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/send-slope ${this.cbsConfig.tc2.sendSlope}`,
            `dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/hi-credit ${this.cbsConfig.tc2.hiCredit}`,
            `dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/lo-credit ${this.cbsConfig.tc2.loCredit}`,
            'dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=2/cbs/enabled true'
        );
        
        // TC6 CBS 설정
        commands.push(
            `dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs/idle-slope ${this.cbsConfig.tc6.idleSlope}`,
            `dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs/send-slope ${this.cbsConfig.tc6.sendSlope}`,
            `dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs/hi-credit ${this.cbsConfig.tc6.hiCredit}`,
            `dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs/lo-credit ${this.cbsConfig.tc6.loCredit}`,
            'dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/traffic-class=6/cbs/enabled true'
        );
        
        // 명령어 실행
        for (const cmd of commands) {
            await this.sendCommand(cmd);
            await this.delay(150);
            this.updateProgress('CBS', commands.indexOf(cmd) + 1, commands.length);
        }
        
        console.log('✅ CBS 설정 완료');
        return true;
    }
    
    async configureTAS() {
        console.log('⏰ TAS 설정 시작...');
        
        const commands = [];
        
        // Base time 계산 (2초 후)
        const baseTime = Date.now() * 1000000 + 2000000000;
        
        // 기본 설정
        commands.push(
            `dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-base-time ${baseTime}`,
            `dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-cycle-time ${this.tasConfig.cycleTimeNs}`,
            'dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list-length 8'
        );
        
        // GCL 엔트리 설정
        for (let i = 0; i < this.tasConfig.gcl.length; i++) {
            const entry = this.tasConfig.gcl[i];
            const intervalNs = entry.durationMs * 1000000;
            
            commands.push(
                `dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/${i}/time-interval ${intervalNs}`,
                `dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/admin-control-list/${i}/gate-states ${entry.gateState}`
            );
        }
        
        // TAS 활성화
        commands.push(
            'dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/gate-enabled true',
            'dr mup1cc coap post /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/config-change true'
        );
        
        // 명령어 실행
        for (const cmd of commands) {
            await this.sendCommand(cmd);
            await this.delay(150);
            this.updateProgress('TAS', commands.indexOf(cmd) + 1, commands.length);
        }
        
        console.log('✅ TAS 설정 완료');
        return true;
    }
    
    async configureCBSandTAS() {
        console.log('🔄 CBS + TAS 통합 설정 시작...');
        
        await this.configureCBS();
        await this.delay(500);
        await this.configureTAS();
        
        console.log('✅ CBS + TAS 통합 설정 완료');
        return true;
    }
    
    async configurePTP() {
        console.log('🕐 PTP 설정 시작...');
        
        const commands = [
            'dr mup1cc coap post /ieee1588-ptp/instances/instance=0/default-ds/domain-number 0',
            'dr mup1cc coap post /ieee1588-ptp/instances/instance=0/default-ds/priority1 128',
            'dr mup1cc coap post /ieee1588-ptp/instances/instance=0/default-ds/priority2 128',
            'dr mup1cc coap post /ieee1588-ptp/instances/instance=0/default-ds/clock-quality/clock-class 248',
            'dr mup1cc coap post /ieee1588-ptp/instances/instance=0/ports/port=1/port-ds/log-announce-interval 0',
            'dr mup1cc coap post /ieee1588-ptp/instances/instance=0/ports/port=1/port-ds/log-sync-interval -3',
            'dr mup1cc coap post /ieee1588-ptp/instances/instance=0/enable true'
        ];
        
        for (const cmd of commands) {
            await this.sendCommand(cmd);
            await this.delay(150);
        }
        
        console.log('✅ PTP 설정 완료');
        return true;
    }
    
    async monitorGates() {
        console.log('👁️ Gate 모니터링 시작...');
        
        const monitorCommands = [
            'dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/current-gate-states',
            'dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/current-time',
            'dr mup1cc coap get /ieee802-dot1q-sched/interfaces/interface=eth0/scheduler/transmission-overrun'
        ];
        
        // 10초 동안 모니터링
        for (let i = 0; i < 10; i++) {
            for (const cmd of monitorCommands) {
                await this.sendCommand(cmd);
                await this.delay(100);
            }
            await this.delay(900);
            
            this.updateGateVisualization(i);
        }
        
        console.log('✅ Gate 모니터링 완료');
    }
    
    async saveConfiguration() {
        console.log('💾 설정 저장 중...');
        await this.sendCommand('dr save');
        await this.delay(500);
        console.log('✅ 설정 저장 완료');
    }
    
    async factoryReset() {
        console.log('🔄 초기화 중...');
        await this.sendCommand('dr factory-reset');
        await this.delay(1000);
        await this.sendCommand('dr reboot');
        console.log('✅ 초기화 완료 (재부팅 중...)');
    }
    
    // UI 업데이트 함수들
    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.textContent = connected ? '연결됨' : '연결 안됨';
            statusEl.className = connected ? 'status-connected' : 'status-disconnected';
        }
    }
    
    updateCommandDisplay(command) {
        const displayEl = document.getElementById('command-display');
        if (displayEl) {
            const entry = document.createElement('div');
            entry.className = 'command-entry sent';
            entry.innerHTML = `
                <span class="timestamp">${new Date().toLocaleTimeString()}</span>
                <span class="command">${command}</span>
            `;
            displayEl.appendChild(entry);
            displayEl.scrollTop = displayEl.scrollHeight;
        }
    }
    
    updateResponseDisplay(response) {
        const displayEl = document.getElementById('command-display');
        if (displayEl) {
            const entry = document.createElement('div');
            entry.className = 'command-entry received';
            entry.innerHTML = `
                <span class="timestamp">${new Date().toLocaleTimeString()}</span>
                <span class="response">${response.data}</span>
            `;
            displayEl.appendChild(entry);
            displayEl.scrollTop = displayEl.scrollHeight;
        }
    }
    
    updateProgress(type, current, total) {
        const progressEl = document.getElementById(`${type.toLowerCase()}-progress`);
        if (progressEl) {
            const percentage = (current / total) * 100;
            progressEl.style.width = `${percentage}%`;
            progressEl.textContent = `${current}/${total}`;
        }
    }
    
    updateGateVisualization(cycleCount) {
        // Gate 시각화 업데이트 (별도 구현)
        if (window.gateVisualizer) {
            window.gateVisualizer.updateCycle(cycleCount);
        }
    }
    
    // 유틸리티 함수
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    exportCommandHistory() {
        const blob = new Blob([JSON.stringify(this.commandHistory, null, 2)], 
                            { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `board_config_${Date.now()}.json`;
        a.click();
    }
}

// 전역 인스턴스 생성
window.tsnConfigurator = new TSNBoardConfigurator();

// DOM이 로드되면 이벤트 리스너 추가
document.addEventListener('DOMContentLoaded', () => {
    // 연결 버튼
    const connectBtn = document.getElementById('connect-board-btn');
    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            if (window.tsnConfigurator.isConnected) {
                await window.tsnConfigurator.disconnect();
                connectBtn.textContent = 'Connect Board';
            } else {
                await window.tsnConfigurator.connect();
                connectBtn.textContent = 'Disconnect';
            }
        });
    }
    
    // CBS 설정 버튼
    const cbsBtn = document.getElementById('configure-cbs-btn');
    if (cbsBtn) {
        cbsBtn.addEventListener('click', () => {
            window.tsnConfigurator.configureCBS();
        });
    }
    
    // TAS 설정 버튼
    const tasBtn = document.getElementById('configure-tas-btn');
    if (tasBtn) {
        tasBtn.addEventListener('click', () => {
            window.tsnConfigurator.configureTAS();
        });
    }
    
    // CBS+TAS 설정 버튼
    const combinedBtn = document.getElementById('configure-combined-btn');
    if (combinedBtn) {
        combinedBtn.addEventListener('click', () => {
            window.tsnConfigurator.configureCBSandTAS();
        });
    }
    
    // 모니터링 버튼
    const monitorBtn = document.getElementById('monitor-gates-btn');
    if (monitorBtn) {
        monitorBtn.addEventListener('click', () => {
            window.tsnConfigurator.monitorGates();
        });
    }
});

console.log('TSN Board Configurator loaded');