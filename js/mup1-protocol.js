/**
 * MUP1 Protocol Implementation
 * Microchip Unified Protocol v1 for VelocityDRIVE communication
 * 
 * Based on reverse engineering of mvdct CLI logs:
 * - MUP1 wraps CoAP messages over serial
 * - Uses checksums and packet framing
 * - Handles ping/pong for device detection
 */

class MUP1Protocol {
    constructor() {
        this.messageId = 1;
        this.frameBuffer = new Uint8Array(0);
        this.callbacks = new Map();
    }

    // Calculate checksum (appears to be simple sum)
    calculateChecksum(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum = (sum + data[i]) & 0xFFFF;
        }
        return sum;
    }

    // Pack data into MUP1 frame
    packFrame(payload, messageType = 'c') {
        // MUP1 frame structure (from logs):
        // [Header][Length][MsgID][Checksum][Payload][Footer]
        
        const header = new Uint8Array([0x40, 0x05]); // Based on log: "40 05"
        const msgId = new Uint8Array([(this.messageId >> 8) & 0xFF, this.messageId & 0xFF]);
        
        // Build frame
        const frameData = new Uint8Array(header.length + 2 + 2 + payload.length + 4);
        let offset = 0;
        
        // Header
        frameData.set(header, offset);
        offset += header.length;
        
        // Message ID
        frameData.set(msgId, offset);
        offset += 2;
        
        // Frame type and length markers (from logs)
        frameData.set([0xB1, 0x63], offset);
        offset += 2;
        
        // Checksum placeholder
        const checksumPos = offset;
        frameData.set([0x11, 0x8D], offset); // Will be calculated
        offset += 2;
        
        // Separator
        frameData.set([0x33, 0x64, 0x3D, 0x61], offset);
        offset += 4;
        
        // Another separator
        frameData.set([0x21, 0x8E, 0xFF], offset);
        offset += 3;
        
        // Payload
        frameData.set(payload, offset);
        offset += payload.length;
        
        // Calculate actual checksum
        const checksum = this.calculateChecksum(payload);
        frameData[checksumPos] = (checksum >> 8) & 0xFF;
        frameData[checksumPos + 1] = checksum & 0xFF;
        
        this.messageId++;
        return frameData;
    }

    // Unpack MUP1 frame
    unpackFrame(data) {
        // Look for CoAP payload after MUP1 headers
        // From logs, CoAP starts after the FF marker
        
        for (let i = 0; i < data.length - 1; i++) {
            if (data[i] === 0xFF) {
                // Found payload start
                return data.slice(i + 1);
            }
        }
        return null;
    }

    // Create ping message (from log: ">p<<8553")
    createPingMessage() {
        const pingText = "p";
        const suffix = "<<8553"; // Appears to be checksum/identifier
        return new TextEncoder().encode(pingText + suffix);
    }

    // Parse ping response (from log: ">PVelocitySP-v2025.06...")
    parsePingResponse(data) {
        const text = new TextDecoder().decode(data);
        if (text.startsWith('VelocitySP-v')) {
            // Extract version and device info
            const parts = text.split(' ');
            return {
                version: parts[0], // VelocitySP-v2025.06-LAN9662-ung8291
                param1: parts[1], // 326
                param2: parts[2], // 300  
                param3: parts[3]  // 2
            };
        }
        return null;
    }

    // Create CoAP message wrapped in MUP1
    createCoAPMessage(method, uri, payload = null) {
        const coap = new CoAPMessage(method, uri, payload);
        const coapBytes = coap.encode();
        return this.packFrame(coapBytes);
    }

    // Process received data
    processData(data) {
        // Add to buffer
        const newBuffer = new Uint8Array(this.frameBuffer.length + data.length);
        newBuffer.set(this.frameBuffer);
        newBuffer.set(data, this.frameBuffer.length);
        this.frameBuffer = newBuffer;

        // Try to extract complete frames
        return this.extractFrames();
    }

    extractFrames() {
        const frames = [];
        
        // Look for frame boundaries and extract CoAP payloads
        for (let i = 0; i < this.frameBuffer.length - 1; i++) {
            if (this.frameBuffer[i] === 0x60 && this.frameBuffer[i + 1] === 0x45) {
                // Found response frame start
                const payload = this.unpackFrame(this.frameBuffer.slice(i));
                if (payload) {
                    frames.push(payload);
                    // Remove processed data
                    this.frameBuffer = this.frameBuffer.slice(i + 32); // Approximate frame length
                    break;
                }
            }
        }
        
        return frames;
    }
}

/**
 * CoAP Message Implementation
 * Constrained Application Protocol for YANG/CBOR communication
 */
class CoAPMessage {
    constructor(method = 'GET', uri = '', payload = null) {
        this.version = 1;
        this.type = 0; // CON
        this.code = this.getMethodCode(method);
        this.messageId = Math.floor(Math.random() * 65536);
        this.token = new Uint8Array([Math.floor(Math.random() * 256)]);
        this.options = [];
        this.payload = payload;
        
        // Add URI path option
        if (uri) {
            this.addUriPath(uri);
        }
        
        // Add content format for YANG+CBOR
        if (method === 'FETCH') {
            this.addOption(12, new TextEncoder().encode('application/yang-identifiers+cbor-seq'));
        }
    }

    getMethodCode(method) {
        const codes = {
            'GET': 1,
            'POST': 2,
            'PUT': 3,
            'DELETE': 4,
            'FETCH': 5 // RFC 8132
        };
        return codes[method] || 1;
    }

    addOption(number, value) {
        this.options.push({ number, value });
    }

    addUriPath(uri) {
        // Split URI into path segments
        const segments = uri.split('/').filter(s => s.length > 0);
        segments.forEach(segment => {
            this.addOption(11, new TextEncoder().encode(segment)); // Uri-Path = 11
        });
    }

    encode() {
        // CoAP header: Ver(2) + T(2) + TKL(4) + Code(8) + Message ID(16)
        const header = new Uint8Array(4);
        header[0] = (this.version << 6) | (this.type << 4) | this.token.length;
        header[1] = this.code;
        header[2] = (this.messageId >> 8) & 0xFF;
        header[3] = this.messageId & 0xFF;

        // Calculate total size
        let totalSize = header.length + this.token.length;
        let optionsSize = 0;
        
        // Calculate options size
        this.options.forEach(opt => {
            optionsSize += 1 + opt.value.length; // Simplified
        });
        
        totalSize += optionsSize;
        if (this.payload) {
            totalSize += 1 + this.payload.length; // 0xFF marker + payload
        }

        // Build message
        const message = new Uint8Array(totalSize);
        let offset = 0;

        // Header
        message.set(header, offset);
        offset += header.length;

        // Token
        message.set(this.token, offset);
        offset += this.token.length;

        // Options (simplified encoding)
        this.options.forEach(opt => {
            message[offset] = opt.number; // Simplified option encoding
            offset++;
            message.set(opt.value, offset);
            offset += opt.value.length;
        });

        // Payload
        if (this.payload) {
            message[offset] = 0xFF; // Payload marker
            offset++;
            message.set(this.payload, offset);
        }

        return message;
    }

    static decode(data) {
        // Basic CoAP decoding
        if (data.length < 4) return null;

        const version = (data[0] >> 6) & 0x3;
        const type = (data[0] >> 4) & 0x3;
        const tokenLength = data[0] & 0xF;
        const code = data[1];
        const messageId = (data[2] << 8) | data[3];

        let offset = 4;
        const token = data.slice(offset, offset + tokenLength);
        offset += tokenLength;

        // Find payload (after 0xFF marker)
        let payload = null;
        for (let i = offset; i < data.length; i++) {
            if (data[i] === 0xFF && i < data.length - 1) {
                payload = data.slice(i + 1);
                break;
            }
        }

        return {
            version,
            type,
            code,
            messageId,
            token,
            payload
        };
    }
}

/**
 * CBOR (Concise Binary Object Representation) Implementation
 * For encoding/decoding YANG data
 */
class CBORCodec {
    static encode(data) {
        // Simplified CBOR encoding
        if (typeof data === 'string') {
            const bytes = new TextEncoder().encode(data);
            const result = new Uint8Array(1 + bytes.length);
            result[0] = 0x60 | Math.min(bytes.length, 23); // Text string
            result.set(bytes, 1);
            return result;
        } else if (typeof data === 'number') {
            // Positive integer
            if (data < 24) {
                return new Uint8Array([data]);
            } else {
                const result = new Uint8Array(2);
                result[0] = 0x18;
                result[1] = data;
                return result;
            }
        } else if (Array.isArray(data)) {
            // Array encoding
            const parts = [new Uint8Array([0x80 | Math.min(data.length, 23)])];
            data.forEach(item => {
                parts.push(this.encode(item));
            });
            return this.concatArrays(parts);
        }
        return new Uint8Array([0xF7]); // null/undefined
    }

    static decode(data) {
        // Simplified CBOR decoding
        if (data.length === 0) return null;

        const majorType = (data[0] >> 5) & 0x7;
        const additionalInfo = data[0] & 0x1F;

        switch (majorType) {
            case 0: // Positive integer
                return additionalInfo;
            case 3: // Text string
                if (additionalInfo < 24) {
                    return new TextDecoder().decode(data.slice(1, 1 + additionalInfo));
                }
                break;
            case 4: // Array
                const arrayLength = additionalInfo;
                const result = [];
                let offset = 1;
                for (let i = 0; i < arrayLength && offset < data.length; i++) {
                    const item = this.decode(data.slice(offset));
                    result.push(item);
                    offset += 2; // Simplified
                }
                return result;
        }
        return null;
    }

    static concatArrays(arrays) {
        const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        arrays.forEach(arr => {
            result.set(arr, offset);
            offset += arr.length;
        });
        return result;
    }
}

// Export classes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MUP1Protocol, CoAPMessage, CBORCodec };
}