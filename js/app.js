/**
 * Main Application Controller
 */

import WebSerialConnection from './webserial.js';
import LAN966xController from './lan966x-controller.js';
import { initPages } from './pages.js';
import { YANGBrowser } from './yang-browser.js';

// Global application state
const app = {
    connection: null,
    controller: null,
    yangBrowser: null,
    currentPage: 'dashboard',
    charts: {},
    updateInterval: null
};

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    if (!WebSerialConnection.isSupported()) {
        showError('WebSerial API is not supported in this browser. Please use Chrome or Edge 89+.');
        return;
    }
    
    initializeUI();
    initPages(app);
});

/**
 * Initialize UI components
 */
function initializeUI() {
    // Connect button
    const connectBtn = document.getElementById('connect-btn');
    connectBtn.addEventListener('click', toggleConnection);
    
    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            switchPage(e.target.dataset.page);
        });
    });
    
    // Modal close button
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    
    // Quick action buttons
    document.getElementById('save-config')?.addEventListener('click', saveConfiguration);
    document.getElementById('restore-config')?.addEventListener('click', restoreConfiguration);
    document.getElementById('factory-reset')?.addEventListener('click', factoryReset);
    document.getElementById('reboot-device')?.addEventListener('click', rebootDevice);
}

/**
 * Toggle connection
 */
async function toggleConnection() {
    if (app.connection?.isConnected) {
        await disconnect();
    } else {
        await connect();
    }
}

/**
 * Connect to device
 */
async function connect() {
    try {
        // Create connection
        app.connection = new WebSerialConnection();
        
        // Set up callbacks
        app.connection.onData((frame) => {
            if (app.controller) {
                app.controller.handleFrame(frame);
            }
        });
        
        app.connection.onStatus((status, message) => {
            updateConnectionStatus(status, message);
        });
        
        // Connect to serial port
        const portInfo = await app.connection.connect();
        console.log('Connected to port:', portInfo);
        
        // Create controller
        app.controller = new LAN966xController(app.connection);
        
        // Initialize device
        const deviceInfo = await app.controller.initialize();
        updateDeviceInfo(deviceInfo);
        
        // Start monitoring
        startMonitoring();
        
        // Update UI
        document.getElementById('connect-btn').innerHTML = '🔌 Disconnect';
        document.getElementById('connect-btn').classList.add('connected');
        
    } catch (error) {
        console.error('Connection failed:', error);
        showError('Failed to connect: ' + error.message);
    }
}

/**
 * Disconnect from device
 */
async function disconnect() {
    try {
        stopMonitoring();
        
        if (app.connection) {
            await app.connection.disconnect();
        }
        
        app.connection = null;
        app.controller = null;
        
        // Update UI
        document.getElementById('connect-btn').innerHTML = '🔌 Connect';
        document.getElementById('connect-btn').classList.remove('connected');
        updateDeviceInfo(null);
        
    } catch (error) {
        console.error('Disconnect error:', error);
    }
}

/**
 * Update connection status
 */
function updateConnectionStatus(status, message) {
    const statusElement = document.querySelector('.device-status');
    const statusText = document.getElementById('connection-status');
    
    statusElement.className = 'device-status ' + status;
    
    switch (status) {
        case 'connected':
            statusElement.textContent = '● Connected';
            statusText.textContent = 'Connected';
            break;
        case 'disconnected':
            statusElement.textContent = '● Disconnected';
            statusText.textContent = 'Disconnected';
            break;
        case 'error':
            statusElement.textContent = '● Error';
            statusText.textContent = 'Error: ' + message;
            break;
    }
}

/**
 * Update device information
 */
function updateDeviceInfo(info) {
    const modelElement = document.querySelector('.device-model');
    const versionElement = document.querySelector('.firmware-version');
    const typeElement = document.getElementById('device-type');
    const portElement = document.getElementById('serial-port');
    
    if (info) {
        modelElement.textContent = info.deviceType || 'Unknown';
        versionElement.textContent = 'FW: ' + (info.firmwareVersion || 'Unknown');
        typeElement.textContent = info.deviceType || '-';
        portElement.textContent = '/dev/ttyACM0';
    } else {
        modelElement.textContent = 'No Device';
        versionElement.textContent = '';
        typeElement.textContent = '-';
        portElement.textContent = '-';
    }
}

/**
 * Start monitoring
 */
function startMonitoring() {
    updatePortStatus();
    updateStatistics();
    
    // Update every 2 seconds
    app.updateInterval = setInterval(() => {
        updatePortStatus();
        updateStatistics();
    }, 2000);
}

/**
 * Stop monitoring
 */
function stopMonitoring() {
    if (app.updateInterval) {
        clearInterval(app.updateInterval);
        app.updateInterval = null;
    }
}

/**
 * Update port status display
 */
async function updatePortStatus() {
    if (!app.controller) return;
    
    try {
        const ports = await app.controller.getPortStatus();
        const grid = document.getElementById('port-status-grid');
        
        if (grid) {
            grid.innerHTML = ports.map(port => `
                <div class="port-status ${port.linkStatus}">
                    <div class="port-name">Port ${port.index}</div>
                    <div class="port-state">${port.linkStatus === 'up' ? '🔗' : '🔴'} ${port.linkStatus}</div>
                    <div class="port-speed">${port.speed}</div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to update port status:', error);
    }
}

/**
 * Update statistics
 */
async function updateStatistics() {
    if (!app.controller) return;
    
    try {
        const stats = await app.controller.getStatistics();
        
        // Update uptime
        const uptimeElement = document.getElementById('uptime');
        if (uptimeElement && stats.system?.uptime) {
            const hours = Math.floor(stats.system.uptime / 3600);
            const minutes = Math.floor((stats.system.uptime % 3600) / 60);
            uptimeElement.textContent = `${hours}h ${minutes}m`;
        }
        
        // Update temperature
        const tempElement = document.getElementById('temperature');
        if (tempElement && stats.system?.temperature) {
            tempElement.textContent = stats.system.temperature + '°C';
        }
        
        // Update chart
        updateChart(stats);
        
    } catch (error) {
        console.error('Failed to update statistics:', error);
    }
}

/**
 * Update statistics chart
 */
function updateChart(stats) {
    const canvas = document.getElementById('stats-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw simple bar chart for port statistics
    const barWidth = width / (stats.ports.length * 2);
    const maxValue = Math.max(...stats.ports.map(p => p['in-octets'] || 0));
    
    stats.ports.forEach((port, i) => {
        const x = i * barWidth * 2 + barWidth / 2;
        const rxHeight = (port['in-octets'] || 0) / maxValue * (height - 20);
        const txHeight = (port['out-octets'] || 0) / maxValue * (height - 20);
        
        // RX bar
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(x, height - rxHeight, barWidth * 0.8, rxHeight);
        
        // TX bar
        ctx.fillStyle = '#2196F3';
        ctx.fillRect(x + barWidth, height - txHeight, barWidth * 0.8, txHeight);
        
        // Label
        ctx.fillStyle = '#666';
        ctx.font = '10px sans-serif';
        ctx.fillText(`P${i}`, x + barWidth / 2, height - 5);
    });
}

/**
 * Switch page
 */
function switchPage(pageName) {
    // Update active tab
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.page === pageName);
    });
    
    // Update active page
    document.querySelectorAll('.page-content').forEach(page => {
        page.classList.toggle('active', page.id === `${pageName}-page`);
    });
    
    app.currentPage = pageName;
    
    // Load page-specific content
    if (window.pageHandlers && window.pageHandlers[pageName]) {
        window.pageHandlers[pageName].load(app);
    }
}

/**
 * Quick Actions
 */
async function saveConfiguration() {
    if (!app.controller) {
        showError('Not connected to device');
        return;
    }
    
    try {
        const success = await app.controller.saveConfiguration();
        if (success) {
            showSuccess('Configuration saved successfully');
        } else {
            showError('Failed to save configuration');
        }
    } catch (error) {
        showError('Save failed: ' + error.message);
    }
}

async function restoreConfiguration() {
    // TODO: Implement file upload and restore
    showInfo('Restore configuration feature coming soon');
}

async function factoryReset() {
    if (!app.controller) {
        showError('Not connected to device');
        return;
    }
    
    if (!confirm('Are you sure you want to factory reset the device? This will erase all configuration.')) {
        return;
    }
    
    try {
        const success = await app.controller.factoryReset();
        if (success) {
            showSuccess('Factory reset initiated');
            setTimeout(() => disconnect(), 2000);
        } else {
            showError('Factory reset failed');
        }
    } catch (error) {
        showError('Reset failed: ' + error.message);
    }
}

async function rebootDevice() {
    if (!app.controller) {
        showError('Not connected to device');
        return;
    }
    
    if (!confirm('Are you sure you want to reboot the device?')) {
        return;
    }
    
    try {
        await app.controller.reboot();
        showSuccess('Reboot command sent');
        setTimeout(() => disconnect(), 1000);
    } catch (error) {
        showError('Reboot failed: ' + error.message);
    }
}

/**
 * UI Helpers
 */
function showModal(content) {
    const modal = document.getElementById('modal');
    const body = document.getElementById('modal-body');
    body.innerHTML = content;
    modal.classList.remove('hidden');
}

function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.add('hidden');
}

function showError(message) {
    showNotification(message, 'error');
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showInfo(message) {
    showNotification(message, 'info');
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Export for use in other modules
window.app = app;
window.showModal = showModal;
window.closeModal = closeModal;
window.showError = showError;
window.showSuccess = showSuccess;
window.showInfo = showInfo;

// === Debug bindings (YANG/CoAP/UI) ===
window.yangGet = async () => {
  try { if (!app.yangBrowser) throw new Error('Not connected'); await app.yangBrowser.getValue(); }
  catch(e){ showError(e.message); }
};
window.yangSet = async () => {
  try { if (!app.yangBrowser) throw new Error('Not connected'); await app.yangBrowser.setValue(); }
  catch(e){ showError(e.message); }
};
window.sendCoap = async () => {
  try {
    if (!app.controller) throw new Error('Not connected');
    const method = document.getElementById('coap-method')?.value;
    const uri = (document.getElementById('coap-uri')?.value||'').trim();
    const payloadText = (document.getElementById('coap-payload')?.value||'').trim();
    let payload = null; if (payloadText) { try { payload = JSON.parse(payloadText);} catch{ payload = payloadText; } }
    let resp; switch(method){
      case 'GET': resp = await app.controller.coap.get(uri); break;
      case 'POST': resp = await app.controller.coap.post(uri,payload); break;
      case 'PUT': resp = await app.controller.coap.put(uri,payload); break;
      case 'DELETE': resp = await app.controller.coap.delete(uri); break;
      case 'FETCH': resp = await app.controller.coap.fetch(uri,payload); break;
    }
    const out = document.getElementById('coap-response'); if (out) out.innerHTML = `<pre>${typeof resp==='object'?JSON.stringify(resp,null,2):String(resp)}</pre>`;
  } catch(e){ showError('CoAP error: '+e.message); }
};
window.configurePort = async (index) => {
  try{ if(!app.controller) throw new Error('Not connected');
    const speed = document.getElementById(`port-${index}-speed`).value;
    const duplex = document.getElementById(`port-${index}-duplex`).value;
    await app.controller.configurePort(index,{speed,duplex}); showSuccess(`Port ${index} updated`);
  } catch(e){ showError(e.message); }
};
window.createVlan = async () => {
  try{ if(!app.controller) throw new Error('Not connected');
    const id=parseInt(document.getElementById('vlan-id').value,10);
    const name=document.getElementById('vlan-name').value;
    const ports=Array.from(document.querySelectorAll('#vlan-ports-select input[type="checkbox"]')).filter(c=>c.checked).map(c=>parseInt(c.value,10));
    await app.controller.createVlan(id,name,ports); showSuccess('VLAN created'); if(window.pageHandlers?.vlan) window.pageHandlers.vlan.load(app);
  } catch(e){ showError(e.message); }
};
window.deleteVlan = async (id) => {
  try{ if(!app.controller) throw new Error('Not connected'); await app.controller.deleteVlan(id); showSuccess('VLAN deleted'); if(window.pageHandlers?.vlan) window.pageHandlers.vlan.load(app);} catch(e){ showError(e.message); }
};
window.configurePTP = async () => {
  try{ if(!app.controller) throw new Error('Not connected'); await app.controller.configurePTP({}); showSuccess('PTP configured'); } catch(e){ showError(e.message); }
};
window.addTasEntry = () => {
  const c=document.getElementById('tas-entries'); if(!c) return; const i=c.children.length; const d=document.createElement('div'); d.className='tas-entry'; d.style.margin='6px 0'; d.innerHTML=`Gate(0x mask): <input id="tas-gate-${i}" value="0xFF" size="6"> Duration(ns): <input id="tas-dur-${i}" value="100000" size="10">`; c.appendChild(d);
};
window.configureTAS = async () => {
  try{ if(!app.controller) throw new Error('Not connected');
    const port=parseInt(document.getElementById('tas-port').value||'0',10);
    const cycle=parseInt(document.getElementById('tas-cycle').value||'1000000',10);
    const entries=[]; const c=document.getElementById('tas-entries'); Array.from(c?.children||[]).forEach((row,i)=>{ const g=document.getElementById(`tas-gate-${i}`).value; const d=parseInt(document.getElementById(`tas-dur-${i}`).value,10)||0; entries.push({gateStates:Number(g), timeInterval:d}); });
    await app.controller.configureTAS(port,{entries,cycleTime:cycle}); showSuccess('TAS configured');
  } catch(e){ showError(e.message); }
};
window.configurePreemption = async () => {
  try{ if(!app.controller) throw new Error('Not connected'); const port=parseInt(document.getElementById('preempt-port').value||'0',10); const enabled=document.getElementById('preempt-enable').checked; await app.controller.configureFramePreemption(port,{enabled}); showSuccess('Frame preemption updated'); } catch(e){ showError(e.message); }
};
window.clearLogs = () => { const el=document.getElementById('log-container'); if(el) el.innerHTML=''; };
window.exportLogs = () => { const el=document.getElementById('log-container'); const blob=new Blob([el?.innerText||''],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='logs.txt'; a.click(); };

// Hook YANG render when switching to YANG page
(function(){
  const origSwitch = window.switchPage;
})();
