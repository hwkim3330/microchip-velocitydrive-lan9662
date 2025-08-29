/**
 * Page Templates and Handlers
 */

export function initPages(app) {
    // Add page containers to main content
    const mainContent = document.getElementById('main-content');
    
    // Port Configuration Page
    const portsPage = createPortsPage();
    mainContent.appendChild(portsPage);
    
    // VLAN Management Page
    const vlanPage = createVlanPage();
    mainContent.appendChild(vlanPage);
    
    // TSN/PTP Page
    const tsnPage = createTsnPage();
    mainContent.appendChild(tsnPage);
    
    // YANG Browser Page
    const yangPage = createYangPage();
    mainContent.appendChild(yangPage);
    
    // CoAP Console Page
    const coapPage = createCoapPage();
    mainContent.appendChild(coapPage);
    
    // Diagnostics Page
    const diagPage = createDiagnosticsPage();
    mainContent.appendChild(diagPage);
    
    // Logs Page
    const logsPage = createLogsPage();
    mainContent.appendChild(logsPage);
    
    // Initialize page handlers
    initPageHandlers(app);
}

function createPortsPage() {
    const page = document.createElement('div');
    page.id = 'ports-page';
    page.className = 'page-content';
    page.innerHTML = `
        <h2>Port Configuration</h2>
        <div class="card">
            <div id="ports-list"></div>
        </div>
    `;
    return page;
}

function createVlanPage() {
    const page = document.createElement('div');
    page.id = 'vlan-page';
    page.className = 'page-content';
    page.innerHTML = `
        <h2>VLAN Management</h2>
        <div class="card">
            <h3 class="card-title">Create VLAN</h3>
            <div class="form-group">
                <label class="form-label">VLAN ID</label>
                <input type="number" class="form-control" id="vlan-id" min="1" max="4094">
            </div>
            <div class="form-group">
                <label class="form-label">VLAN Name</label>
                <input type="text" class="form-control" id="vlan-name">
            </div>
            <div class="form-group">
                <label class="form-label">Member Ports</label>
                <div id="vlan-ports-select"></div>
            </div>
            <button class="action-btn" onclick="createVlan()">Create VLAN</button>
        </div>
        <div class="card" style="margin-top: 20px;">
            <h3 class="card-title">Existing VLANs</h3>
            <div id="vlan-list"></div>
        </div>
    `;
    return page;
}

function createTsnPage() {
    const page = document.createElement('div');
    page.id = 'tsn-page';
    page.className = 'page-content';
    page.innerHTML = `
        <h2>TSN & PTP Configuration</h2>
        <div class="dashboard-grid">
            <div class="card">
                <h3 class="card-title">PTP Configuration</h3>
                <div class="form-group">
                    <label class="form-label">PTP Profile</label>
                    <select class="form-control" id="ptp-profile">
                        <option value="default">Default</option>
                        <option value="automotive">Automotive (gPTP)</option>
                        <option value="industrial">Industrial</option>
                        <option value="telecom">Telecom</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Clock Mode</label>
                    <select class="form-control" id="ptp-mode">
                        <option value="auto">Auto</option>
                        <option value="master">Master</option>
                        <option value="slave">Slave</option>
                        <option value="boundary">Boundary Clock</option>
                    </select>
                </div>
                <button class="action-btn" onclick="configurePTP()">Apply PTP Settings</button>
            </div>
            
            <div class="card">
                <h3 class="card-title">Time-Aware Scheduler</h3>
                <div class="form-group">
                    <label class="form-label">Port</label>
                    <select class="form-control" id="tas-port"></select>
                </div>
                <div class="form-group">
                    <label class="form-label">Cycle Time (μs)</label>
                    <input type="number" class="form-control" id="tas-cycle" value="1000000">
                </div>
                <div id="tas-schedule">
                    <h4>Gate Control List</h4>
                    <button onclick="addTasEntry()">Add Entry</button>
                    <div id="tas-entries"></div>
                </div>
                <button class="action-btn" onclick="configureTAS()">Apply TAS</button>
            </div>
            
            <div class="card">
                <h3 class="card-title">Frame Preemption</h3>
                <div class="form-group">
                    <label class="form-label">Port</label>
                    <select class="form-control" id="preempt-port"></select>
                </div>
                <div class="form-group">
                    <label class="form-label">
                        <input type="checkbox" id="preempt-enable"> Enable Frame Preemption
                    </label>
                </div>
                <div class="form-group">
                    <label class="form-label">Express Queues</label>
                    <input type="text" class="form-control" id="express-queues" placeholder="e.g., 0,1,2,3">
                </div>
                <button class="action-btn" onclick="configurePreemption()">Apply Preemption</button>
            </div>
        </div>
    `;
    return page;
}

function createYangPage() {
    const page = document.createElement('div');
    page.id = 'yang-page';
    page.className = 'page-content';
    page.innerHTML = `
        <h2>YANG Browser</h2>
        <div class="dashboard-grid">
            <div class="card" style="grid-column: span 1;">
                <h3 class="card-title">YANG Tree</h3>
                <div id="yang-tree" style="height: 500px; overflow-y: auto;"></div>
            </div>
            <div class="card" style="grid-column: span 1;">
                <h3 class="card-title">Node Details</h3>
                <div id="yang-details">
                    <p>Select a node from the tree to view details</p>
                </div>
                <div style="margin-top: 20px;">
                    <h4>Current Value</h4>
                    <div id="yang-value" class="code-editor">
                        <pre>No value</pre>
                    </div>
                </div>
                <div style="margin-top: 20px;">
                    <button class="action-btn" onclick="yangGet()">Get Value</button>
                    <button class="action-btn" onclick="yangSet()">Set Value</button>
                </div>
            </div>
        </div>
    `;
    return page;
}

function createCoapPage() {
    const page = document.createElement('div');
    page.id = 'coap-page';
    page.className = 'page-content';
    page.innerHTML = `
        <h2>CoAP Console</h2>
        <div class="card">
            <div class="form-group">
                <label class="form-label">Method</label>
                <select class="form-control" id="coap-method">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                    <option value="FETCH">FETCH</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">URI Path</label>
                <input type="text" class="form-control" id="coap-uri" placeholder="/ietf-interfaces:interfaces">
            </div>
            <div class="form-group">
                <label class="form-label">Payload (JSON)</label>
                <textarea class="form-control" id="coap-payload" rows="5" placeholder='{"key": "value"}'></textarea>
            </div>
            <button class="action-btn" onclick="sendCoap()">Send Request</button>
        </div>
        <div class="card" style="margin-top: 20px;">
            <h3 class="card-title">Recent Requests</h3>
            <div id="coap-history" class="code-editor" style="max-height: 220px; overflow-y: auto;">
                <pre>No history</pre>
            </div>
        </div>
        <div class="card" style="margin-top: 20px;">
            <h3 class="card-title">Response</h3>
            <div id="coap-response" class="code-editor">
                <pre>No response yet</pre>
            </div>
        </div>
    `;
    return page;
}

function createDiagnosticsPage() {
    const page = document.createElement('div');
    page.id = 'diagnostics-page';
    page.className = 'page-content';
    page.innerHTML = `
        <h2>Diagnostics</h2>
        <div class="dashboard-grid">
            <div class="card">
                <h3 class="card-title">Port Statistics</h3>
                <div id="port-stats"></div>
            </div>
            <div class="card">
                <h3 class="card-title">MAC Address Table</h3>
                <div id="mac-table"></div>
            </div>
            <div class="card">
                <h3 class="card-title">System Information</h3>
                <div id="system-info"></div>
            </div>
            <div class="card">
                <h3 class="card-title">Cable Diagnostics</h3>
                <select class="form-control" id="cable-test-port">
                    <option>Select Port</option>
                </select>
                <button class="action-btn" style="margin-top: 10px;" onclick="runCableTest()">Run Cable Test</button>
                <div id="cable-test-result"></div>
            </div>
        </div>
    `;
    return page;
}

function createLogsPage() {
    const page = document.createElement('div');
    page.id = 'logs-page';
    page.className = 'page-content';
    page.innerHTML = `
        <h2>System Logs</h2>
        <div class="card">
            <div style="margin-bottom: 15px;">
                <button class="action-btn" onclick="clearLogs()">Clear Logs</button>
                <button class="action-btn" onclick="exportLogs()">Export Logs</button>
                <label style="margin-left: 20px;">
                    <input type="checkbox" id="auto-scroll" checked> Auto-scroll
                </label>
            </div>
            <div id="log-container" style="height: 500px; overflow-y: auto; background: #2d2d2d; color: #f8f8f2; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 12px;">
                <!-- Logs will be added here -->
            </div>
        </div>
    `;
    return page;
}

function initPageHandlers(app) {
    window.pageHandlers = {
        ports: {
            load: async () => {
                if (!app.controller) return;
                
                const portsList = document.getElementById('ports-list');
                const ports = await app.controller.getPortStatus();
                
                portsList.innerHTML = ports.map(port => `
                    <div class="port-config-item" style="border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; border-radius: 8px;">
                        <h4>Port ${port.index} (${port.name})</h4>
                        <div class="form-group">
                            <label>Status: ${port.linkStatus === 'up' ? '🔗 Up' : '🔴 Down'}</label>
                        </div>
                        <div class="form-group">
                            <label>Speed:</label>
                            <select class="form-control" id="port-${port.index}-speed">
                                <option value="auto" ${port.speed === 'auto' ? 'selected' : ''}>Auto</option>
                                <option value="10" ${port.speed === '10' ? 'selected' : ''}>10 Mbps</option>
                                <option value="100" ${port.speed === '100' ? 'selected' : ''}>100 Mbps</option>
                                <option value="1000" ${port.speed === '1000' ? 'selected' : ''}>1 Gbps</option>
                                <option value="10000" ${port.speed === '10000' ? 'selected' : ''}>10 Gbps</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Duplex:</label>
                            <select class="form-control" id="port-${port.index}-duplex">
                                <option value="auto" ${port.duplex === 'auto' ? 'selected' : ''}>Auto</option>
                                <option value="half" ${port.duplex === 'half' ? 'selected' : ''}>Half</option>
                                <option value="full" ${port.duplex === 'full' ? 'selected' : ''}>Full</option>
                            </select>
                        </div>
                        <button class="action-btn" onclick="configurePort(${port.index})">Apply</button>
                    </div>
                `).join('');
            }
        },
        
        vlan: {
            load: async () => {
                if (!app.controller) return;
                
                // Load existing VLANs
                const vlanList = document.getElementById('vlan-list');
                const vlans = await app.controller.getVlans();
                
                vlanList.innerHTML = '<table class="table">' +
                    '<thead><tr><th>VLAN ID</th><th>Name</th><th>Ports</th><th>Actions</th></tr></thead>' +
                    '<tbody>' +
                    vlans.map(vlan => `
                        <tr>
                            <td>${vlan.vid}</td>
                            <td>${vlan.name || '-'}</td>
                            <td>${vlan['member-ports']?.join(', ') || '-'}</td>
                            <td><button onclick="deleteVlan(${vlan.vid})">Delete</button></td>
                        </tr>
                    `).join('') +
                    '</tbody></table>';
                
                // Setup port selection
                const portSelect = document.getElementById('vlan-ports-select');
                const portCount = app.controller.getPortCount();
                portSelect.innerHTML = Array.from({length: portCount}, (_, i) => `
                    <label>
                        <input type="checkbox" value="${i}"> Port ${i}
                    </label>
                `).join(' ');
            }
        },
        
        diagnostics: {
            load: async () => {
                if (!app.controller) return;
                
                const stats = await app.controller.getStatistics();
                
                // Port statistics
                const portStats = document.getElementById('port-stats');
                portStats.innerHTML = '<table class="table">' +
                    '<thead><tr><th>Port</th><th>RX Bytes</th><th>TX Bytes</th><th>RX Errors</th><th>TX Errors</th></tr></thead>' +
                    '<tbody>' +
                    stats.ports.map(port => `
                        <tr>
                            <td>Port ${port.index}</td>
                            <td>${port['in-octets'] || 0}</td>
                            <td>${port['out-octets'] || 0}</td>
                            <td>${port['in-errors'] || 0}</td>
                            <td>${port['out-errors'] || 0}</td>
                        </tr>
                    `).join('') +
                    '</tbody></table>';
            }
        }
    };
}

export default { initPages };
