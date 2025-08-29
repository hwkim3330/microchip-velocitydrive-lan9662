/**
 * WebSerial Core Library for LAN9662 VelocityDRIVE
 * 완전히 새로운 WebSerial 통신 구현
 */

class WebSerialCore {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
        this.connected = false;
        this.buffer = '';
        this.responseResolvers = [];
        this.readLoop = null;
    }

    async connect(baudRate = 115200) {
        try {
            // 포트 선택
            this.port = await navigator.serial.requestPort();
            
            // 포트 열기
            await this.port.open({ 
                baudRate: baudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });
            
            // Writer 설정
            const textEncoder = new TextEncoderStream();
            const writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
            this.writer = textEncoder.writable.getWriter();
            
            // Reader 설정
            this.startReading();
            
            this.connected = true;
            console.log('✅ WebSerial 연결 성공');
            return true;
            
        } catch (error) {
            console.error('❌ WebSerial 연결 실패:', error);
            this.connected = false;
            throw error;
        }
    }

    async startReading() {
        while (this.port.readable) {
            const reader = this.port.readable.getReader();
            
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    
                    const text = this.decoder.decode(value);
                    this.buffer += text;
                    
                    // 응답 처리
                    this.processBuffer();
                }
            } catch (error) {
                console.error('읽기 오류:', error);
            } finally {
                reader.releaseLock();
            }
        }
    }

    processBuffer() {
        // 줄 단위로 처리
        const lines = this.buffer.split('\n');
        
        // 마지막 줄은 아직 완성되지 않았을 수 있으므로 버퍼에 유지
        this.buffer = lines.pop() || '';
        
        // 완성된 줄들 처리
        for (const line of lines) {
            if (line.trim()) {
                this.handleResponse(line);
            }
        }
    }

    handleResponse(line) {
        console.log('📥 응답:', line);
        
        // 대기 중인 resolver가 있으면 처리
        if (this.responseResolvers.length > 0) {
            const resolver = this.responseResolvers.shift();
            resolver(line);
        }
    }

    async sendCommand(command) {
        if (!this.connected || !this.writer) {
            throw new Error('WebSerial이 연결되지 않았습니다');
        }

        try {
            // 명령어 전송
            await this.writer.write(command + '\n');
            console.log('📤 명령어 전송:', command);
            
            // 응답 대기 (Promise 생성)
            return new Promise((resolve) => {
                this.responseResolvers.push(resolve);
                
                // 타임아웃 설정 (5초)
                setTimeout(() => {
                    const index = this.responseResolvers.indexOf(resolve);
                    if (index > -1) {
                        this.responseResolvers.splice(index, 1);
                        resolve('TIMEOUT');
                    }
                }, 5000);
            });
            
        } catch (error) {
            console.error('명령어 전송 실패:', error);
            throw error;
        }
    }

    async disconnect() {
        try {
            if (this.writer) {
                await this.writer.close();
                this.writer = null;
            }
            
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
            
            this.connected = false;
            console.log('✅ WebSerial 연결 종료');
            
        } catch (error) {
            console.error('연결 종료 실패:', error);
        }
    }

    isConnected() {
        return this.connected;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSerialCore;
}