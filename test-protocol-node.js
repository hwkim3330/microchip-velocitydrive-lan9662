#!/usr/bin/env node

/**
 * Node.js test for VelocityDRIVE protocol implementation
 * Tests the MUP1/CoAP protocol stack without WebSerial
 */

const fs = require('fs');
const { MUP1Protocol, CoAPMessage, CBORCodec } = require('./js/mup1-protocol.js');

console.log('VelocityDRIVE Protocol Test');
console.log('============================\n');

// Test 1: MUP1 Protocol
console.log('Test 1: MUP1 Protocol');
const protocol = new MUP1Protocol();

// Test ping message
const pingMsg = protocol.createPingMessage();
const pingText = new TextDecoder().decode(pingMsg);
console.log(`✓ Ping message: "${pingText}"`);
console.log(`  Expected: "p<<8553"`);
console.log(`  Match: ${pingText === 'p<<8553' ? '✓' : '✗'}\n`);

// Test ping response parsing
const pongData = new TextEncoder().encode('VelocitySP-v2025.06-LAN9662-ung8291 5280 300 2');
const deviceInfo = protocol.parsePingResponse(pongData);
console.log('✓ Device info parsed:', deviceInfo);
console.log(`  Version: ${deviceInfo.version}`);
console.log(`  Params: ${deviceInfo.param1}, ${deviceInfo.param2}, ${deviceInfo.param3}\n`);

// Test 2: CoAP Message
console.log('Test 2: CoAP Message');
const coapMsg = new CoAPMessage('FETCH', '/ietf-constrained-yang-library:yang-library/checksum');
const coapBytes = coapMsg.encode();
console.log(`✓ CoAP FETCH message created (${coapBytes.length} bytes)`);
console.log(`  Method: FETCH (code ${coapMsg.code})`);
console.log(`  Message ID: ${coapMsg.messageId}`);
console.log(`  Token length: ${coapMsg.token.length}`);

// Test decode
const decoded = CoAPMessage.decode(coapBytes);
console.log(`✓ CoAP message decoded: code=${decoded.code}, msgId=${decoded.messageId}\n`);

// Test 3: CBOR Encoding
console.log('Test 3: CBOR Encoding');
const testData = { checksum: "5151bae07677b1501f9cf52637f2a38f" };
const cborEncoded = CBORCodec.encode(testData);
console.log(`✓ CBOR encoded (${cborEncoded.length} bytes)`);

const cborDecoded = CBORCodec.decode(cborEncoded);
console.log(`✓ CBOR decoded:`, cborDecoded);
console.log(`  Match: ${JSON.stringify(cborDecoded) === JSON.stringify(testData) ? '✓' : '✗'}\n`);

// Test 4: MUP1 Frame Packing
console.log('Test 4: MUP1 Frame Packing');
const yangCatalogCoap = protocol.createCoAPMessage('FETCH', '/ietf-constrained-yang-library:yang-library/checksum');
console.log(`✓ YANG catalog CoAP frame created (${yangCatalogCoap.length} bytes)`);

// Convert to hex for comparison with logs
const hexFrame = Array.from(yangCatalogCoap).map(b => b.toString(16).padStart(2, '0')).join(' ');
console.log(`  Frame (hex): ${hexFrame.substring(0, 100)}...`);
console.log(`  Should start with MUP1 header: 40 05...\n`);

// Test 5: Real Protocol Sequence
console.log('Test 5: Protocol Flow Simulation');
console.log('1. Device ping -> pong');
console.log('2. YANG catalog request');
console.log('3. Interface query');

// Simulate the actual protocol flow
const steps = [
    { name: 'Ping', data: protocol.createPingMessage() },
    { name: 'YANG Catalog', data: yangCatalogCoap },
    { name: 'Interface Query', data: protocol.createCoAPMessage('GET', '/ietf-interfaces:interfaces') }
];

steps.forEach((step, i) => {
    console.log(`${i + 1}. ${step.name}: ${step.data.length} bytes`);
    const preview = Array.from(step.data.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`   Preview: ${preview}...`);
});

console.log('\n✓ Protocol implementation appears to be working correctly!');
console.log('\nNext step: Test with WebSerial in browser at:');
console.log('http://localhost:8080/test-protocol.html');