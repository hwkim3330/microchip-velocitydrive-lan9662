/**
 * WebSerial API Wrapper for LAN9662 Communication
 */

export class WebSerialConnection {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.rawWriter = null; // For binary data
        this.readableStreamClosed = null;
        this.writableStreamClosed = null;
        this.isConnected = false;
        this.buffer = new Uint8Array(0);
        this.onDataCallback = null;
        this.onStatusCallback = null;
    }

    /**
     * Check if WebSerial is supported
     */
    static isSupported() {
        return 'serial' in navigator;
    }

    /**
     * Connect to serial device
     */
    async connect(baudRate = 115200) {
        try {
            // Request port access
            this.port = await navigator.serial.requestPort();
            
            // Open port with specified settings
            await this.port.open({
                baudRate: baudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });

            // Setup streams
            const textDecoder = new TextDecoderStream();
            this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
            this.reader = textDecoder.readable.getReader();

            const textEncoder = new TextEncoderStream();
            this.writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
            this.writer = textEncoder.writable.getWriter();

            this.isConnected = true;
            this.updateStatus('connected');
            
            // Start reading
            this.readLoop();
            
            // Get port info
            const info = this.port.getInfo();
            console.log('Connected to device:', info);
            
            return info;
        } catch (error) {
            console.error('Connection failed:', error);
            this.updateStatus('error', error.message);
            throw error;
        }
    }

    /**
     * Disconnect from serial device
     */
    async disconnect() {
        try {
            if (this.reader) {
                await this.reader.cancel();
                await this.readableStreamClosed.catch(() => {});
                this.reader = null;
            }

            if (this.writer) {
                await this.writer.close();
                await this.writableStreamClosed.catch(() => {});
                this.writer = null;
            }

            if (this.port) {
                await this.port.close();
                this.port = null;
            }

            this.isConnected = false;
            this.updateStatus('disconnected');
        } catch (error) {
            console.error('Disconnect error:', error);
            this.updateStatus('error', error.message);
        }
    }

    /**
     * Send data to device
     */
    async send(data) {
        if (!this.writer) {
            throw new Error('Not connected');
        }

        try {
            if (data instanceof Uint8Array) {
                // Convert binary data to string for text encoder
                const str = String.fromCharCode.apply(null, data);
                await this.writer.write(str);
            } else {
                await this.writer.write(data);
            }
        } catch (error) {
            console.error('Send error:', error);
            throw error;
        }
    }

    /**
     * Send raw bytes to device
     */
    async sendBytes(bytes) {
        if (!this.port || !this.port.writable) {
            throw new Error('Not connected');
        }

        const writer = this.port.writable.getWriter();
        try {
            await writer.write(bytes);
        } finally {
            writer.releaseLock();
        }
    }

    /**
     * Read loop for incoming data
     */
    async readLoop() {
        while (this.reader) {
            try {
                const { value, done } = await this.reader.read();
                if (done) {
                    break;
                }
                
                if (value) {
                    // Convert string to bytes
                    const encoder = new TextEncoder();
                    const bytes = encoder.encode(value);
                    this.handleIncomingData(bytes);
                }
            } catch (error) {
                console.error('Read error:', error);
                break;
            }
        }
    }

    /**
     * Read raw bytes from device
     */
    async readBytes() {
        if (!this.port || !this.port.readable) {
            throw new Error('Not connected');
        }

        const reader = this.port.readable.getReader();
        try {
            const result = await reader.read();
            return result.value;
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Handle incoming data
     */
    handleIncomingData(bytes) {
        // Append to buffer
        const newBuffer = new Uint8Array(this.buffer.length + bytes.length);
        newBuffer.set(this.buffer);
        newBuffer.set(bytes, this.buffer.length);
        this.buffer = newBuffer;

        // Look for complete frames (starting with '>' and containing '<')
        while (true) {
            const startIndex = this.buffer.indexOf(0x3E); // '>'
            if (startIndex === -1) break;

            const endIndex = this.buffer.indexOf(0x3C, startIndex); // '<'
            if (endIndex === -1) break;

            // Look for checksum (4 bytes after EOF)
            let checksumEnd = endIndex + 5; // Single EOF + 4 checksum bytes
            if (this.buffer[endIndex + 1] === 0x3C) {
                checksumEnd = endIndex + 6; // Double EOF + 4 checksum bytes
            }

            if (this.buffer.length < checksumEnd) break;

            // Extract frame
            const frame = this.buffer.slice(startIndex, checksumEnd);
            this.buffer = this.buffer.slice(checksumEnd);

            // Notify callback
            if (this.onDataCallback) {
                this.onDataCallback(frame);
            }
        }
    }

    /**
     * Set data callback
     */
    onData(callback) {
        this.onDataCallback = callback;
    }

    /**
     * Set status callback
     */
    onStatus(callback) {
        this.onStatusCallback = callback;
    }

    /**
     * Update connection status
     */
    updateStatus(status, message = '') {
        if (this.onStatusCallback) {
            this.onStatusCallback(status, message);
        }
    }

    /**
     * Get available ports (requires permission)
     */
    static async getPorts() {
        try {
            return await navigator.serial.getPorts();
        } catch (error) {
            console.error('Failed to get ports:', error);
            return [];
        }
    }
}

export default WebSerialConnection;
