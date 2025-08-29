/**
 * LAN966x Device Controller
 * High-level API for device management
 */

import MUP1Protocol from './velocitydrive-protocol.js';
import CoAPClient from './coap-client.js';

export class LAN966xController {
    constructor(connection) {
        this.connection = connection;
        this.protocol = new MUP1Protocol();
        this.coap = new CoAPClient(this);
        this.deviceInfo = null;
        this.ports = [];
        this.callbacks = new Map();
    }

    /**
     * Initialize device connection
     */
    async initialize() {
        // Send ping to check connection
        await this.ping();
        
        // Get device information
        await this.getDeviceInfo();
        
        // Get port configuration
        await this.getPortStatus();
        
        return this.deviceInfo;
    }

    /**
     * Send ping to device
     */
    async ping() {
        const frame = this.protocol.createPing();
        await this.connection.sendBytes(frame);
        
        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 1000);
            
            this.once('pong', () => {
                clearTimeout(timeout);
                resolve(true);
            });
        });
    }

    /**
     * Get device information
     */
    async getDeviceInfo() {
        const frame = this.protocol.createSystemRequest('info');
        await this.connection.sendBytes(frame);
        
        return new Promise((resolve) => {
            this.once('announcement', (data) => {
                this.deviceInfo = this.protocol.parseAnnouncement(data);
                resolve(this.deviceInfo);
            });
        });
    }

    /**
     * Get port status for all ports
     */
    async getPortStatus() {
        const ports = [];
        const numPorts = this.getPortCount();
        
        for (let i = 0; i < numPorts; i++) {
            const status = await this.getPortInfo(i);
            ports.push(status);
        }
        
        this.ports = ports;
        return ports;
    }

    /**
     * Get port count based on device type
     */
    getPortCount() {
        if (!this.deviceInfo) return 0;
        
        const deviceType = this.deviceInfo.deviceType.toLowerCase();
        if (deviceType.includes('9662')) return 2;
        if (deviceType.includes('9668')) return 8;
        if (deviceType.includes('9692')) return 12;
        
        return 2; // Default
    }

    /**
     * Get information for specific port
     */
    async getPortInfo(portIndex) {
        const oid = `/ietf-interfaces:interfaces/interface[name='eth${portIndex}']`;
        const result = await this.coap.get(oid);
        
        return {
            index: portIndex,
            name: `eth${portIndex}`,
            enabled: result?.enabled || false,
            speed: result?.speed || 'auto',
            duplex: result?.duplex || 'auto',
            linkStatus: result?.['oper-status'] || 'down',
            statistics: result?.statistics || {}
        };
    }

    /**
     * Configure port settings
     */
    async configurePort(portIndex, config) {
        const oid = `/ietf-interfaces:interfaces/interface[name='eth${portIndex}']`;
        
        const data = {
            enabled: config.enabled !== undefined ? config.enabled : true,
            speed: config.speed || 'auto',
            duplex: config.duplex || 'auto'
        };
        
        return await this.coap.put(oid, data);
    }

    /**
     * Create VLAN
     */
    async createVlan(vlanId, name, ports) {
        const oid = `/ieee802-dot1q-bridge:bridges/bridge[name='br0']/vlans`;
        
        const data = {
            vlan: {
                vid: vlanId,
                name: name,
                'member-ports': ports.map(p => `eth${p}`)
            }
        };
        
        return await this.coap.post(oid, data);
    }

    /**
     * Delete VLAN
     */
    async deleteVlan(vlanId) {
        const oid = `/ieee802-dot1q-bridge:bridges/bridge[name='br0']/vlans/vlan[vid='${vlanId}']`;
        return await this.coap.delete(oid);
    }

    /**
     * Get VLAN configuration
     */
    async getVlans() {
        const oid = `/ieee802-dot1q-bridge:bridges/bridge[name='br0']/vlans`;
        const result = await this.coap.get(oid);
        return result?.vlan || [];
    }

    /**
     * Configure PTP (Precision Time Protocol)
     */
    async configurePTP(config) {
        const oid = '/ieee1588-ptp:ptp/instance-list[instance-number="0"]';
        
        const data = {
            'default-ds': {
                'clock-quality': {
                    'clock-class': config.clockClass || 248,
                    'clock-accuracy': config.clockAccuracy || 254,
                    'offset-scaled-log-variance': config.variance || 65535
                },
                'priority1': config.priority1 || 128,
                'priority2': config.priority2 || 128,
                'domain-number': config.domain || 0
            },
            'port-ds-list': config.ports.map((port, idx) => ({
                'port-number': idx + 1,
                'port-state': port.state || 'initializing',
                'log-min-delay-req-interval': port.delayReqInterval || 0,
                'log-announce-interval': port.announceInterval || 1,
                'log-sync-interval': port.syncInterval || 0
            }))
        };
        
        return await this.coap.put(oid, data);
    }

    /**
     * Configure Time-Aware Scheduler (TAS)
     */
    async configureTAS(portIndex, schedule) {
        const oid = `/ieee802-dot1q-sched:interfaces/interface[name='eth${portIndex}']/schedule`;
        
        const data = {
            'admin-control-list': schedule.entries.map((entry, idx) => ({
                'index': idx,
                'operation-name': 'set-gate-states',
                'gate-states-value': entry.gateStates,
                'time-interval-value': entry.timeInterval
            })),
            'admin-cycle-time': schedule.cycleTime,
            'admin-base-time': schedule.baseTime || { seconds: 0, nanoseconds: 0 }
        };
        
        return await this.coap.put(oid, data);
    }

    /**
     * Configure Frame Preemption
     */
    async configureFramePreemption(portIndex, config) {
        const oid = `/ieee802-dot1q-preemption:interfaces/interface[name='eth${portIndex}']/frame-preemption`;
        
        const data = {
            'frame-preemption-status-table': {
                'frame-preemption-status': config.enabled ? 'express' : 'preemptable',
                'hold-advance': config.holdAdvance || 0,
                'release-advance': config.releaseAdvance || 0,
                'preemption-active': config.enabled
            }
        };
        
        return await this.coap.put(oid, data);
    }

    /**
     * Get system statistics
     */
    async getStatistics() {
        const stats = {
            ports: [],
            system: {}
        };
        
        // Get per-port statistics
        for (let i = 0; i < this.getPortCount(); i++) {
            const oid = `/ietf-interfaces:interfaces/interface[name='eth${i}']/statistics`;
            const portStats = await this.coap.get(oid);
            stats.ports.push({
                index: i,
                ...portStats
            });
        }
        
        // Get system statistics
        const sysOid = '/ietf-system:system-state';
        stats.system = await this.coap.get(sysOid);
        
        return stats;
    }

    /**
     * Save configuration
     */
    async saveConfiguration() {
        const frame = this.protocol.createSystemRequest('save-config');
        await this.connection.sendBytes(frame);
        
        return new Promise((resolve) => {
            this.once('system-response', (data) => {
                resolve(data.includes('success'));
            });
        });
    }

    /**
     * Factory reset
     */
    async factoryReset() {
        const frame = this.protocol.createSystemRequest('factory-reset');
        await this.connection.sendBytes(frame);
        
        return new Promise((resolve) => {
            this.once('system-response', (data) => {
                resolve(data.includes('success'));
            });
        });
    }

    /**
     * Reboot device
     */
    async reboot() {
        const frame = this.protocol.createSystemRequest('reboot');
        await this.connection.sendBytes(frame);
        return true;
    }

    /**
     * Handle incoming frame
     */
    handleFrame(frame) {
        try {
            const decoded = this.protocol.decodeFrame(frame);
            
            switch (decoded.type) {
                case 'P':
                    this.emit('pong', decoded.data);
                    break;
                case 'A':
                    this.emit('announcement', decoded.data);
                    break;
                case 'C':
                    this.coap.handleResponse(decoded.data);
                    break;
                case 'S':
                    this.emit('system-response', decoded.data);
                    break;
                case 'T':
                    this.emit('trace', decoded.data);
                    break;
            }
        } catch (error) {
            console.error('Frame handling error:', error);
        }
    }

    /**
     * Event emitter functionality
     */
    on(event, callback) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, []);
        }
        this.callbacks.get(event).push(callback);
    }

    once(event, callback) {
        const wrapper = (...args) => {
            callback(...args);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    }

    off(event, callback) {
        const callbacks = this.callbacks.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    emit(event, ...args) {
        const callbacks = this.callbacks.get(event);
        if (callbacks) {
            callbacks.forEach(cb => cb(...args));
        }
    }
}

export default LAN966xController;
