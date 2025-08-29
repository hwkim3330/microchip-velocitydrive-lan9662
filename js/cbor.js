/**
 * Simple CBOR encoder/decoder for CoAP
 * Implements subset of RFC 7049
 */

export function encode(value) {
    const buffer = [];
    encodeItem(value, buffer);
    return new Uint8Array(buffer);
}

export function decode(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const result = decodeItem(view, 0);
    return result.value;
}

function encodeItem(value, buffer) {
    if (value === null) {
        buffer.push(0xF6);
    } else if (value === undefined) {
        buffer.push(0xF7);
    } else if (typeof value === 'boolean') {
        buffer.push(value ? 0xF5 : 0xF4);
    } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
            if (value >= 0) {
                encodeUnsigned(value, 0, buffer);
            } else {
                encodeUnsigned(-value - 1, 1, buffer);
            }
        } else {
            // Float
            buffer.push(0xFB);
            const view = new DataView(new ArrayBuffer(8));
            view.setFloat64(0, value);
            for (let i = 0; i < 8; i++) {
                buffer.push(view.getUint8(i));
            }
        }
    } else if (typeof value === 'string') {
        const encoded = new TextEncoder().encode(value);
        encodeUnsigned(encoded.length, 3, buffer);
        buffer.push(...encoded);
    } else if (value instanceof Uint8Array) {
        encodeUnsigned(value.length, 2, buffer);
        buffer.push(...value);
    } else if (Array.isArray(value)) {
        encodeUnsigned(value.length, 4, buffer);
        for (const item of value) {
            encodeItem(item, buffer);
        }
    } else if (typeof value === 'object') {
        const keys = Object.keys(value);
        encodeUnsigned(keys.length, 5, buffer);
        for (const key of keys) {
            encodeItem(key, buffer);
            encodeItem(value[key], buffer);
        }
    }
}

function encodeUnsigned(value, majorType, buffer) {
    const type = majorType << 5;
    if (value < 24) {
        buffer.push(type | value);
    } else if (value < 256) {
        buffer.push(type | 24);
        buffer.push(value);
    } else if (value < 65536) {
        buffer.push(type | 25);
        buffer.push(value >> 8);
        buffer.push(value & 0xFF);
    } else if (value < 4294967296) {
        buffer.push(type | 26);
        buffer.push(value >> 24);
        buffer.push((value >> 16) & 0xFF);
        buffer.push((value >> 8) & 0xFF);
        buffer.push(value & 0xFF);
    }
}

function decodeItem(view, offset) {
    const byte = view.getUint8(offset);
    const majorType = byte >> 5;
    const info = byte & 0x1F;
    
    let value;
    let bytesUsed = 1;
    
    if (info < 24) {
        value = info;
    } else if (info === 24) {
        value = view.getUint8(offset + 1);
        bytesUsed = 2;
    } else if (info === 25) {
        value = view.getUint16(offset + 1);
        bytesUsed = 3;
    } else if (info === 26) {
        value = view.getUint32(offset + 1);
        bytesUsed = 5;
    } else if (info === 0xF4) {
        return { value: false, bytesUsed: 1 };
    } else if (info === 0xF5) {
        return { value: true, bytesUsed: 1 };
    } else if (info === 0xF6) {
        return { value: null, bytesUsed: 1 };
    } else if (info === 0xF7) {
        return { value: undefined, bytesUsed: 1 };
    }
    
    switch (majorType) {
        case 0: // Unsigned integer
            return { value, bytesUsed };
            
        case 1: // Negative integer
            return { value: -1 - value, bytesUsed };
            
        case 2: // Byte string
            const bytes = new Uint8Array(view.buffer, view.byteOffset + offset + bytesUsed, value);
            return { value: bytes, bytesUsed: bytesUsed + value };
            
        case 3: // Text string
            const text = new TextDecoder().decode(
                new Uint8Array(view.buffer, view.byteOffset + offset + bytesUsed, value)
            );
            return { value: text, bytesUsed: bytesUsed + value };
            
        case 4: // Array
            const array = [];
            let arrayOffset = offset + bytesUsed;
            for (let i = 0; i < value; i++) {
                const item = decodeItem(view, arrayOffset);
                array.push(item.value);
                arrayOffset += item.bytesUsed;
            }
            return { value: array, bytesUsed: arrayOffset - offset };
            
        case 5: // Map
            const map = {};
            let mapOffset = offset + bytesUsed;
            for (let i = 0; i < value; i++) {
                const key = decodeItem(view, mapOffset);
                mapOffset += key.bytesUsed;
                const val = decodeItem(view, mapOffset);
                mapOffset += val.bytesUsed;
                map[key.value] = val.value;
            }
            return { value: map, bytesUsed: mapOffset - offset };
            
        case 7: // Simple values and floats
            if (info === 27) {
                const float = view.getFloat64(offset + 1);
                return { value: float, bytesUsed: 9 };
            }
            break;
    }
    
    throw new Error(`Unsupported CBOR type: ${majorType}`);
}

export default { encode, decode };
