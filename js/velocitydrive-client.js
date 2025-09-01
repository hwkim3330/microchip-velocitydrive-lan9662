/**
 * VelocityDRIVE WebSerial Client
 * Complete implementation that mimics mvdct CLI behavior
 * 
 * Features:
 * - WebSerial API communication
 * - MUP1 protocol handling
 * - CoAP/CBOR message encoding
 * - YANG path operations
 * - Device ping/discovery
 */

class VelocityDriveClient {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.protocol = new MUP1Protocol();
        this.connected = false;
        this.deviceInfo = null;
        this.yangCatalogId = null;
        this.responseCallbacks = new Map();
        this.eventListeners = new Map();
        
        // Bind methods
        this.handleData = this.handleData.bind(this);
        this.readLoop = this.readLoop.bind(this);
    }

    // Event management
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => callback(data));
        }
    }

    // Connection management
    async connect(options = {}) {
        try {
            // Request serial port
            this.port = await navigator.serial.requestPort();
            
            // Open with appropriate settings
            await this.port.open({
                baudRate: options.baudRate || 115200,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });

            // Set up writer
            const textEncoder = new TextEncoderStream();
            const writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
            this.writer = textEncoder.writable.getWriter();

            // Start reading
            this.readLoop();

            this.connected = true;
            this.emit('connected');

            // Perform device discovery
            await this.discoverDevice();

            return true;
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    async disconnect() {
        try {
            this.connected = false;
            
            if (this.writer) {
                await this.writer.close();
                this.writer = null;
            }
            
            if (this.reader) {
                await this.reader.cancel();
                this.reader = null;
            }
            
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
            
            this.emit('disconnected');
        } catch (error) {
            this.emit('error', error);
        }
    }

    // Read loop for incoming data
    async readLoop() {
        while (this.port.readable && this.connected) {
            const reader = this.port.readable.getReader();
            this.reader = reader;
            
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    
                    await this.handleData(value);
                }
            } catch (error) {
                if (this.connected) {
                    this.emit('error', error);
                }
                break;
            } finally {
                reader.releaseLock();
            }
        }
    }

    // Handle incoming data
    async handleData(data) {
        this.emit('rawData', { direction: 'receive', data });
        
        // Convert to text and check for ping responses
        const text = new TextDecoder().decode(data);
        
        // Handle ping response (device identification)
        if (text.includes('VelocitySP-v')) {
            const deviceInfo = this.protocol.parsePingResponse(data);
            if (deviceInfo) {
                this.deviceInfo = deviceInfo;
                this.emit('deviceDiscovered', deviceInfo);
                
                // Now get YANG catalog
                await this.getYangCatalog();
            }
            return;
        }

        // Handle CoAP responses
        const frames = this.protocol.processData(data);
        for (const frame of frames) {
            await this.handleCoAPFrame(frame);
        }
    }

    // Handle CoAP frame
    async handleCoAPFrame(frame) {
        const coap = CoAPMessage.decode(frame);
        if (coap && coap.payload) {
            // Decode CBOR payload
            const decoded = CBORCodec.decode(coap.payload);
            
            // Check if this is YANG catalog response
            if (this.isYangCatalogResponse(decoded)) {
                this.yangCatalogId = this.extractCatalogId(coap.payload);
                this.emit('yangCatalogReceived', this.yangCatalogId);
            } else {
                // Regular data response
                this.emit('dataReceived', {
                    messageId: coap.messageId,
                    code: coap.code,
                    data: decoded
                });
            }
        }
    }

    // Device discovery (ping)
    async discoverDevice() {
        const pingMessage = this.protocol.createPingMessage();
        await this.sendRaw(pingMessage);
        this.emit('rawData', { direction: 'send', data: pingMessage });
    }

    // Get YANG catalog
    async getYangCatalog() {
        // From logs: FETCH with /ietf-constrained-yang-library:yang-library/checksum
        const coapMessage = this.protocol.createCoAPMessage(
            'FETCH', 
            '/ietf-constrained-yang-library:yang-library/checksum'
        );
        
        await this.sendRaw(coapMessage);
        this.emit('rawData', { direction: 'send', data: coapMessage });
    }

    // Check if response contains YANG catalog
    isYangCatalogResponse(data) {
        // Look for catalog checksum pattern
        return data && typeof data === 'object' && 'checksum' in data;
    }

    extractCatalogId(payload) {
        // Extract catalog ID from payload
        // From logs: "5151bae07677b1501f9cf52637f2a38f"
        const hex = Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join('');
        return hex;
    }

    // Send raw data
    async sendRaw(data) {
        if (!this.connected || !this.writer) {
            throw new Error('Not connected to device');
        }
        
        try {
            await this.writer.write(data);
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    // High-level YANG operations
    async yangGet(path) {
        if (!this.yangCatalogId) {
            throw new Error('YANG catalog not loaded');
        }
        
        const coapMessage = this.protocol.createCoAPMessage('GET', path);
        await this.sendRaw(coapMessage);
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, 10000);
            
            const handler = (data) => {
                clearTimeout(timeout);
                this.off('dataReceived', handler);
                resolve(data);
            };
            
            this.on('dataReceived', handler);
        });
    }

    async yangSet(path, value) {
        if (!this.yangCatalogId) {
            throw new Error('YANG catalog not loaded');
        }
        
        // Encode value as CBOR
        const payload = CBORCodec.encode(value);
        const coapMessage = this.protocol.createCoAPMessage('PUT', path, payload);
        await this.sendRaw(coapMessage);
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, 10000);
            
            const handler = (data) => {
                clearTimeout(timeout);
                this.off('dataReceived', handler);
                resolve(data);
            };
            
            this.on('dataReceived', handler);
        });
    }

    async yangDelete(path) {
        if (!this.yangCatalogId) {
            throw new Error('YANG catalog not loaded');
        }
        
        const coapMessage = this.protocol.createCoAPMessage('DELETE', path);
        await this.sendRaw(coapMessage);
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, 10000);
            
            const handler = (data) => {
                clearTimeout(timeout);
                this.off('dataReceived', handler);
                resolve(data);
            };
            
            this.on('dataReceived', handler);
        });
    }

    // Remove event listener
    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    // Convenience methods for TSN operations
    async getCBSConfig(trafficClass) {
        const basePath = `/ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler/traffic-class[index='${trafficClass}']/credit-based-shaper`;
        return await this.yangGet(basePath);
    }

    async setCBSConfig(trafficClass, idleSlope, sendSlope = null) {
        const basePath = `/ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler/traffic-class[index='${trafficClass}']/credit-based-shaper`;
        
        await this.yangSet(`${basePath}/idle-slope`, idleSlope);
        await this.yangSet(`${basePath}/send-slope`, sendSlope || -idleSlope);
        await this.yangSet(`${basePath}/admin-idleslope-enabled`, true);
    }

    async getTASConfig() {
        const basePath = `/ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler`;
        return await this.yangGet(basePath);
    }

    async setTASConfig(cycleTime, baseTime, gclEntries) {
        const basePath = `/ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler`;
        
        await this.yangSet(`${basePath}/admin-cycle-time`, cycleTime);
        await this.yangSet(`${basePath}/admin-base-time`, baseTime);
        await this.yangSet(`${basePath}/admin-control-list-length`, gclEntries.length);
        
        // Set GCL entries
        for (let i = 0; i < gclEntries.length; i++) {
            const entry = gclEntries[i];
            await this.yangSet(`${basePath}/admin-control-list[index='${i}']/gate-states-value`, entry.gateStates);
            await this.yangSet(`${basePath}/admin-control-list[index='${i}']/time-interval-value`, entry.timeInterval);
        }
        
        // Enable TAS
        await this.yangSet(`${basePath}/gate-enabled`, true);
    }

    async getInterfaces() {
        return await this.yangGet('/ietf-interfaces:interfaces');
    }

    async getBridges() {
        return await this.yangGet('/ieee802-dot1q-bridge:bridges');
    }

    async getPTPStatus() {
        return await this.yangGet('/ieee1588-ptp:instances');
    }

    // Status and diagnostics
    isConnected() {
        return this.connected;
    }

    getDeviceInfo() {
        return this.deviceInfo;
    }

    getYangCatalogId() {
        return this.yangCatalogId;
    }
}

// Export for use in HTML
if (typeof window !== 'undefined') {
    window.VelocityDriveClient = VelocityDriveClient;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VelocityDriveClient;
}