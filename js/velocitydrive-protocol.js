/**
 * MUP1 (Microchip UART Protocol #1) Implementation
 * Based on VelocityDRIVE-SP platform
 */

export class MUP1Protocol {
    constructor() {
        this.SOF = 0x3E; // '>'
        this.EOF = 0x3C; // '<'
        this.ESCAPE = 0x5C; // '\\'
        
        // Command types
        this.COMMANDS = {
            ANNOUNCEMENT: 0x41, // 'A'
            COAP: 0x43,        // 'C'
            PING: 0x50,        // 'P'
            TRACE: 0x54,       // 'T'
            SYSTEM: 0x53       // 'S'
        };
        
        // Escape sequences
        this.ESCAPE_MAP = {
            0x00: 0x30, // '\\0'
            0xFF: 0x46, // '\\F'
            0x3E: 0x3E, // '\\>'
            0x3C: 0x3C, // '\\<'
            0x5C: 0x5C  // '\\\\'
        };
    }

    /**
     * Encode a MUP1 frame
     * @param {number} type - Command type byte
     * @param {Uint8Array} data - Payload data
     * @returns {Uint8Array} - Encoded frame
     */
    encodeFrame(type, data = new Uint8Array()) {
        const frame = [];
        
        // Start of frame
        frame.push(this.SOF);
        
        // Command type
        frame.push(type);
        
        // Encode data with escape sequences
        for (const byte of data) {
            if (this.needsEscape(byte)) {
                frame.push(this.ESCAPE);
                frame.push(this.ESCAPE_MAP[byte]);
            } else {
                frame.push(byte);
            }
        }
        
        // End of frame (single or double based on message size)
        frame.push(this.EOF);
        if (frame.length % 2 === 0) {
            frame.push(this.EOF); // Add padding for even-sized messages
        }
        
        // Calculate and add checksum
        const checksum = this.calculateChecksum(frame);
        const checksumStr = checksum.toString(16).toUpperCase().padStart(4, '0');
        for (const char of checksumStr) {
            frame.push(char.charCodeAt(0));
        }
        
        return new Uint8Array(frame);
    }

    /**
     * Decode a MUP1 frame
     * @param {Uint8Array} buffer - Raw frame data
     * @returns {Object} - Decoded frame with type and data
     */
    decodeFrame(buffer) {
        if (buffer.length < 8) {
            throw new Error('Frame too short');
        }
        
        if (buffer[0] !== this.SOF) {
            throw new Error('Invalid start of frame');
        }
        
        const type = buffer[1];
        const data = [];
        let i = 2;
        let escaping = false;
        
        // Decode data until EOF
        while (i < buffer.length - 4) {
            const byte = buffer[i];
            
            if (byte === this.EOF) {
                break;
            }
            
            if (escaping) {
                data.push(this.unescapeByte(byte));
                escaping = false;
            } else if (byte === this.ESCAPE) {
                escaping = true;
            } else {
                data.push(byte);
            }
            
            i++;
        }
        
        // Verify checksum
        const frameEnd = buffer.indexOf(this.EOF, 2);
        const checksumStart = buffer[frameEnd + 1] === this.EOF ? frameEnd + 2 : frameEnd + 1;
        const providedChecksum = String.fromCharCode(
            buffer[checksumStart],
            buffer[checksumStart + 1],
            buffer[checksumStart + 2],
            buffer[checksumStart + 3]
        );
        
        const frameForChecksum = buffer.slice(0, frameEnd + 1);
        const calculatedChecksum = this.calculateChecksum(frameForChecksum).toString(16).toUpperCase().padStart(4, '0');
        
        if (providedChecksum !== calculatedChecksum) {
            console.warn('Checksum mismatch:', providedChecksum, 'vs', calculatedChecksum);
        }
        
        return {
            type: String.fromCharCode(type),
            data: new Uint8Array(data),
            checksum: providedChecksum
        };
    }

    /**
     * Check if byte needs escaping
     */
    needsEscape(byte) {
        return byte === 0x00 || byte === 0xFF || 
               byte === 0x3E || byte === 0x3C || byte === 0x5C;
    }

    /**
     * Unescape a byte
     */
    unescapeByte(escapedByte) {
        const reverseMap = {
            0x30: 0x00, // '0' -> 0x00
            0x46: 0xFF, // 'F' -> 0xFF
            0x3E: 0x3E, // '>' -> 0x3E
            0x3C: 0x3C, // '<' -> 0x3C
            0x5C: 0x5C  // '\\' -> 0x5C
        };
        return reverseMap[escapedByte] || escapedByte;
    }

    /**
     * Calculate 16-bit one's complement checksum
     */
    calculateChecksum(data) {
        let sum = 0;
        
        // Sum all bytes as 16-bit values
        for (let i = 0; i < data.length; i += 2) {
            const value = i + 1 < data.length ? 
                (data[i] << 8) | data[i + 1] : 
                data[i] << 8;
            sum += value;
        }
        
        // Add carry bits twice
        while (sum >> 16) {
            sum = (sum & 0xFFFF) + (sum >> 16);
        }
        
        // One's complement
        return (~sum) & 0xFFFF;
    }

    /**
     * Create a ping frame
     */
    createPing() {
        return this.encodeFrame(this.COMMANDS.PING);
    }

    /**
     * Create a system request frame
     */
    createSystemRequest(command) {
        const encoder = new TextEncoder();
        const data = encoder.encode(command);
        return this.encodeFrame(this.COMMANDS.SYSTEM, data);
    }

    /**
     * Create a CoAP frame
     */
    createCoapFrame(coapMessage) {
        return this.encodeFrame(this.COMMANDS.COAP, coapMessage);
    }

    /**
     * Parse announcement data
     */
    parseAnnouncement(data) {
        const decoder = new TextDecoder();
        const text = decoder.decode(data).trim();
        // Expected: "VelocitySP-v2025.06-LAN9662-ung8291 326 300 2"
        const info = { deviceType: 'Unknown', firmwareVersion: 'Unknown', serialNumber: 'Unknown' };
        if (text.startsWith('VelocitySP-v')) {
            const [front, p1, p2, p3] = text.split(/\s+/);
            // front = VelocitySP-v2025.06-LAN9662-ung8291
            const parts = front.split('-');
            // parts: [ 'VelocitySP', 'v2025.06', 'LAN9662', 'ung8291' ]
            if (parts.length >= 4) {
                info.firmwareVersion = parts[1].replace(/^v/, '');
                info.deviceType = parts[2];
                info.serialNumber = parts[3];
            } else {
                info.deviceType = front;
            }
        } else {
            info.deviceType = text;
        }
        return info;
    }
}

export default MUP1Protocol;
