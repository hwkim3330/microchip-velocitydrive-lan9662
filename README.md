# LAN9662 VelocityDRIVE Control Interface

🌐 **Live Demo: [https://hwkim3330.github.io/microchip-velocitydrive-lan9662/](https://hwkim3330.github.io/microchip-velocitydrive-lan9662/)**

Web-based control interface for Microchip LAN9662 Ethernet switch using the VelocityDRIVE-SP platform.

## ✨ Features

### Core Functionality
- ✅ WebSerial API integration for browser-based serial communication
- ✅ MUP1 protocol implementation with proper framing and checksums
- ✅ CoAP/CORECONF support for device configuration
- ✅ YANG data model browser with CBOR encoding
- ✅ Real-time device monitoring and statistics

### Network Configuration
- Port configuration (speed, duplex, auto-negotiation)
- VLAN management (creation, port assignment, tagging)
- Bridge configuration
- MAC address table management

### TSN (Time-Sensitive Networking)
- IEEE 1588 PTP (Precision Time Protocol)
- IEEE 802.1Qbv TAS (Time Aware Scheduler)
- IEEE 802.1Qav CBS (Credit Based Shaper)
- IEEE 802.1CB FRER (Frame Replication and Elimination)
- Frame Preemption (802.1Qbu)

## 🚀 Quick Start

### Requirements
- Chrome or Edge browser (v89+) with WebSerial API support
- LAN9662 device connected via USB/Serial
- Device running VelocityDRIVE-SP firmware

### Usage

1. **Open the interface:** https://hwkim3330.github.io/microchip-velocitydrive-lan9662/
2. **Connect device:** Click "Connect" and select your serial port
3. **Configure:** Use the intuitive web interface to manage your device

## 🔧 Protocol Implementation

### MUP1 (Microchip UART Protocol #1)

```
>TYPE[DATA]<[<]CHECKSUM
```

- **SOF:** `>` (0x3E)
- **TYPE:** Command byte (A/C/P/T/S)
- **DATA:** Escaped payload
- **EOF:** `<` (0x3C, double for even-sized)
- **CHECKSUM:** 16-bit one's complement

### CoAP/CORECONF

Full RFC 7252 CoAP implementation with:
- GET/POST/PUT/DELETE/FETCH methods
- CBOR encoding (RFC 7049)
- SID-based YANG addressing

## 📁 Project Structure

```
microchip-velocitydrive-lan9662/
├── index.html              # Main interface
├── styles.css              # UI styling
├── js/
│   ├── app.js              # Main application
│   ├── velocitydrive-protocol.js  # MUP1 protocol
│   ├── webserial.js        # WebSerial wrapper
│   ├── lan966x-controller.js      # Device controller
│   ├── coap-client.js     # CoAP client
│   ├── cbor.js            # CBOR encoder/decoder
│   ├── yang-browser.js    # YANG tree browser
│   └── pages.js           # Page handlers
└── .github/
    └── workflows/
        └── deploy.yml      # GitHub Pages deployment
```

## 💻 Development

### Local Development

```bash
# Clone repository
git clone https://github.com/hwkim3330/microchip-velocitydrive-lan9662.git
cd microchip-velocitydrive-lan9662

# Serve locally
python3 -m http.server 8000
# or
npx http-server

# Open browser
http://localhost:8000
```

### API Usage Example

```javascript
// Connect to device
const connection = new WebSerialConnection();
await connection.connect();

// Initialize controller
const controller = new LAN966xController(connection);
await controller.initialize();

// Configure port
await controller.configurePort(0, {
    speed: '1000',
    duplex: 'full',
    enabled: true
});

// Create VLAN
await controller.createVlan(100, 'Production', [0, 1, 2, 3]);

// Configure PTP
await controller.configurePTP({
    profile: 'automotive',
    domain: 0,
    priority1: 128
});
```

## 📚 Documentation

### Supported Devices
- **LAN9662**: 2-port Gigabit Ethernet switch
- **LAN9668**: 8-port Gigabit Ethernet switch
- **LAN9692**: 12-port Multi-Gigabit Ethernet switch

### YANG Models
- ietf-interfaces
- ieee802-dot1q-bridge
- ieee1588-ptp
- ieee802-dot1q-sched
- ieee802-dot1q-preemption
- And more...

## 🔗 References

- [LAN9662 Product Page](https://www.microchip.com/en-us/product/lan9662)
- [VelocityDRIVE-SP Platform](https://www.microchip.com/en-us/products/ethernet-solutions/ethernet-switches/velocitydrive)
- [RFC 7252 - CoAP](https://datatracker.ietf.org/doc/html/rfc7252)
- [RFC 9254 - YANG to CBOR](https://datatracker.ietf.org/doc/html/rfc9254)

## 📄 License

MIT License - See [LICENSE](LICENSE) file

## 🤝 Contributing

Contributions welcome! Please submit PRs or open issues.

## 🙏 Acknowledgments

- Based on Microchip VelocityDRIVE-SP platform
- WebSerial API for browser-based serial communication
- CoAP/CORECONF community for protocol specifications

---

**Developed with ❤️ for the Microchip LAN966x community**
