/**
 * mvdct CLI JavaScript Wrapper
 * LAN9662 VelocityDRIVE 보드 제어를 위한 JavaScript 구현
 */

class MvdctCLI {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
        this.buffer = '';
        this.isConnected = false;
        this.commandQueue = [];
        this.currentCommand = null;
        this.responseCallback = null;
    }

    /**
     * WebSerial API 지원 확인
     */
    static isSupported() {
        return 'serial' in navigator;
    }

    /**
     * 시리얼 포트 연결
     */
    async connect(baudRate = 115200) {
        try {
            // 포트 선택
            this.port = await navigator.serial.requestPort();
            
            // 포트 열기
            await this.port.open({ 
                baudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });

            // 스트림 설정
            const textDecoder = new TextDecoderStream();
            const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
            this.reader = textDecoder.readable.getReader();

            const textEncoder = new TextEncoderStream();
            const writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
            this.writer = textEncoder.writable.getWriter();

            this.isConnected = true;

            // 읽기 시작
            this.readLoop();

            console.log('✅ Connected to serial port');
            return true;
        } catch (error) {
            console.error('❌ Connection failed:', error);
            throw error;
        }
    }

    /**
     * 연결 해제
     */
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
        console.log('Disconnected from serial port');
    }

    /**
     * 데이터 읽기 루프
     */
    async readLoop() {
        while (this.isConnected) {
            try {
                const { value, done } = await this.reader.read();
                if (done) break;
                
                this.buffer += value;
                this.processBuffer();
            } catch (error) {
                console.error('Read error:', error);
                break;
            }
        }
    }

    /**
     * 버퍼 처리
     */
    processBuffer() {
        // 응답 끝 확인 (프롬프트 또는 특정 패턴)
        if (this.buffer.includes('\n') || this.buffer.includes('>')) {
            const response = this.buffer;
            this.buffer = '';
            
            if (this.responseCallback) {
                this.responseCallback(response);
                this.responseCallback = null;
            }
            
            // 다음 명령 처리
            this.processNextCommand();
        }
    }

    /**
     * 명령어 전송
     */
    async sendCommand(command) {
        if (!this.isConnected) {
            throw new Error('Not connected to device');
        }

        return new Promise((resolve, reject) => {
            this.commandQueue.push({
                command,
                resolve,
                reject
            });

            if (!this.currentCommand) {
                this.processNextCommand();
            }
        });
    }

    /**
     * 다음 명령 처리
     */
    async processNextCommand() {
        if (this.commandQueue.length === 0) {
            this.currentCommand = null;
            return;
        }

        this.currentCommand = this.commandQueue.shift();
        
        try {
            // 명령 전송
            await this.writer.write(this.currentCommand.command + '\n');
            
            // 응답 대기 (타임아웃 설정)
            const timeout = setTimeout(() => {
                this.currentCommand.reject(new Error('Command timeout'));
                this.currentCommand = null;
                this.processNextCommand();
            }, 10000);

            this.responseCallback = (response) => {
                clearTimeout(timeout);
                this.currentCommand.resolve(response);
                this.currentCommand = null;
            };
        } catch (error) {
            this.currentCommand.reject(error);
            this.currentCommand = null;
            this.processNextCommand();
        }
    }

    /**
     * YANG GET 명령
     */
    async yangGet(path) {
        const response = await this.sendCommand(`get ${path}`);
        return this.parseResponse(response);
    }

    /**
     * YANG SET 명령
     */
    async yangSet(path, value) {
        const response = await this.sendCommand(`set ${path} ${value}`);
        return this.parseResponse(response);
    }

    /**
     * YANG DELETE 명령
     */
    async yangDelete(path) {
        const response = await this.sendCommand(`delete ${path}`);
        return this.parseResponse(response);
    }

    /**
     * 응답 파싱
     */
    parseResponse(response) {
        // 에러 체크
        if (response.includes('error') || response.includes('Error')) {
            return {
                success: false,
                error: response,
                data: null
            };
        }

        // JSON 응답 파싱 시도
        try {
            const jsonMatch = response.match(/{.*}/s);
            if (jsonMatch) {
                return {
                    success: true,
                    data: JSON.parse(jsonMatch[0]),
                    raw: response
                };
            }
        } catch (e) {
            // JSON 파싱 실패 시 raw 반환
        }

        return {
            success: true,
            data: response.trim(),
            raw: response
        };
    }

    /**
     * CBS 설정
     */
    async configureCBS(interface, tc, idleSlope) {
        const basePath = `/ieee802-dot1q-sched:interfaces/interface[name='${interface}']/scheduler/traffic-class[index='${tc}']/credit-based-shaper`;
        
        const commands = [
            `${basePath}/idle-slope ${idleSlope}`,
            `${basePath}/send-slope ${-(100000 - idleSlope)}`,
            `${basePath}/admin-idleslope-enabled true`
        ];

        const results = [];
        for (const cmd of commands) {
            const result = await this.yangSet(cmd, '');
            results.push(result);
        }
        
        return results;
    }

    /**
     * TAS 설정
     */
    async configureTAS(interface, cycleTime, gclEntries) {
        const basePath = `/ieee802-dot1q-sched:interfaces/interface[name='${interface}']/scheduler`;
        const baseTime = Date.now() * 1000000 + 1000000000; // 1초 후 시작
        
        const commands = [
            { path: `${basePath}/admin-base-time`, value: baseTime },
            { path: `${basePath}/admin-cycle-time`, value: cycleTime },
            { path: `${basePath}/admin-control-list-length`, value: gclEntries.length }
        ];

        // GCL 엔트리 추가
        gclEntries.forEach((entry, index) => {
            commands.push(
                { path: `${basePath}/admin-control-list[index='${index}']/gate-states-value`, value: entry.gate },
                { path: `${basePath}/admin-control-list[index='${index}']/time-interval-value`, value: entry.duration }
            );
        });

        // Gate 활성화
        commands.push({ path: `${basePath}/gate-enabled`, value: 'true' });

        const results = [];
        for (const cmd of commands) {
            const result = await this.yangSet(cmd.path, cmd.value);
            results.push(result);
        }
        
        return results;
    }

    /**
     * Priority 매핑 설정
     */
    async configurePriorityMapping(pcpToPriority) {
        const basePath = `/ieee802-dot1q-bridge:bridges/bridge[name='br0']/component[name='br0']/traffic-class-table`;
        const results = [];

        for (const [pcp, priority] of Object.entries(pcpToPriority)) {
            const path = `${basePath}/traffic-class-map[priority-code-point='${pcp}']/priority`;
            const result = await this.yangSet(path, priority);
            results.push(result);
        }
        
        return results;
    }

    /**
     * Priority to TC 매핑 설정
     */
    async configurePriorityToTC(priorityToTC) {
        const basePath = `/ieee802-dot1q-bridge:bridges/bridge[name='br0']/component[name='br0']/traffic-class-table`;
        const results = [];

        for (const [priority, tc] of Object.entries(priorityToTC)) {
            const path = `${basePath}/traffic-class-map[priority='${priority}']/traffic-class`;
            const result = await this.yangSet(path, tc);
            results.push(result);
        }
        
        return results;
    }

    /**
     * VLAN 추가
     */
    async addVLAN(vlanId, ports = [0, 1]) {
        const basePath = `/ieee802-dot1q-bridge:bridges/bridge[name='br0']/component[name='br0']`;
        
        const commands = [
            { path: `${basePath}/filtering-database/vlan-registration-entry[vlan-id='${vlanId}']/vids`, value: vlanId }
        ];

        // 포트별 VLAN 멤버십 설정
        ports.forEach(port => {
            commands.push({
                path: `${basePath}/bridge-port[port-number='${port}']/pvid`,
                value: vlanId
            });
        });

        const results = [];
        for (const cmd of commands) {
            const result = await this.yangSet(cmd.path, cmd.value);
            results.push(result);
        }
        
        return results;
    }

    /**
     * PTP 설정
     */
    async configurePTP(config) {
        const basePath = `/ieee1588-ptp:instances/instance[instance-number='0']`;
        
        const commands = [
            { path: `${basePath}/default-ds/domain-number`, value: config.domain || 0 },
            { path: `${basePath}/default-ds/priority1`, value: config.priority1 || 128 },
            { path: `${basePath}/default-ds/priority2`, value: config.priority2 || 128 },
            { path: `${basePath}/default-ds/clock-quality/clock-class`, value: config.clockClass || 248 },
            { path: `${basePath}/enable`, value: 'true' }
        ];

        const results = [];
        for (const cmd of commands) {
            const result = await this.yangSet(cmd.path, cmd.value);
            results.push(result);
        }
        
        return results;
    }

    /**
     * 디바이스 정보 가져오기
     */
    async getDeviceInfo() {
        return await this.yangGet('/ietf-system:system-state/platform');
    }

    /**
     * 인터페이스 상태 가져오기
     */
    async getInterfaces() {
        return await this.yangGet('/ietf-interfaces:interfaces');
    }

    /**
     * 브리지 상태 가져오기
     */
    async getBridgeStatus() {
        return await this.yangGet('/ieee802-dot1q-bridge:bridges');
    }

    /**
     * 통계 가져오기
     */
    async getStatistics(interface = 'eth0') {
        return await this.yangGet(`/ietf-interfaces:interfaces-state/interface[name='${interface}']/statistics`);
    }

    /**
     * 설정 저장
     */
    async saveConfiguration() {
        return await this.sendCommand('save');
    }

    /**
     * 재부팅
     */
    async reboot() {
        return await this.sendCommand('reboot');
    }
}

// Export for use in HTML
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MvdctCLI;
}