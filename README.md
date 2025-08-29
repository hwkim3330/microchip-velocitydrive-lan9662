# LAN9662 VelocityDRIVE TSN Control & Testing Suite

🌐 **Live Demo: [https://hwkim3330.github.io/microchip-velocitydrive-lan9662/](https://hwkim3330.github.io/microchip-velocitydrive-lan9662/)**

Complete web-based control interface and TSN performance testing suite for Microchip LAN9662 VelocityDRIVE platform.

## 🎯 Quick Access Links

- 🎛️ **[Board Control Center](https://hwkim3330.github.io/microchip-velocitydrive-lan9662/lan9662-control.html)** - Full WebSerial control interface
- 🔧 **[TSN Configurator](https://hwkim3330.github.io/microchip-velocitydrive-lan9662/tsn-configurator.html)** - TSN-specific configuration tool
- 📊 **[Performance Monitor](https://hwkim3330.github.io/microchip-velocitydrive-lan9662/tsn-test-tools/monitoring_dashboard.html)** - Real-time monitoring
- 📚 **[TSN Guide (Korean)](https://github.com/hwkim3330/microchip-velocitydrive-lan9662/blob/main/tsn-test-tools/TSN_EXPLANATION.md)** - Complete TSN explanation
- 📖 **[Korean Documentation](https://github.com/hwkim3330/microchip-velocitydrive-lan9662/blob/main/tsn-test-tools/README_KR.md)** - 한국어 문서

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

## 🧪 TSN Performance Testing

Comprehensive TSN performance testing suite available in `tsn-test-tools/` directory:

- **CBS Test**: Priority mapping with bandwidth control (1.5/3.5 Mbps)
- **TAS Test**: 8-queue multi-TC with 200ms cycle time
- **Latency Test**: Priority-based latency analysis (0.5-2.0ms)
- **Real-time Monitor**: Live performance dashboard

See [TSN Test Tools Documentation](./tsn-test-tools/README.md) for details.

## 🚀 Quick Start

### Requirements
- Chrome or Edge browser (v89+) with WebSerial API support
- LAN9662 device connected via USB/Serial (typically `/dev/ttyACM0`)
- Device running VelocityDRIVE-SP firmware
- mvdct CLI tool (for command-line control)

### Browser-Based Control (No Server Required)

1. **Open Control Center:** https://hwkim3330.github.io/microchip-velocitydrive-lan9662/lan9662-control.html
2. **Connect Device:** Click "Connect" and select your serial port
3. **Configure:** Use tabs for CBS, TAS, Priority mapping, VLAN, PTP settings

### Command-Line Control (mvdct)

```bash
# Path to mvdct tool
cd /home/kim/Downloads/Microchip_VelocityDRIVE_CT-CLI-linux-2025.07.12/

# Example commands
./mvdct device /dev/ttyACM0 get /ietf-system:system-state/platform
./mvdct device /dev/ttyACM0 set /path/to/yang/node value
```

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
