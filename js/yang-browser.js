/**
 * YANG Browser for navigating and editing YANG data models
 */

export class YANGBrowser {
    constructor(controller) {
        this.controller = controller;
        this.yangModels = [];
        this.currentPath = '';
        this.treeData = {};
    }

    /**
     * Load YANG modules from device
     */
    async loadModules() {
        try {
            // Get YANG library
            const library = await this.controller.coap.get('/ietf-yang-library:yang-library');
            
            if (library && library['module-set']) {
                this.yangModels = library['module-set'][0]['module'] || [];
            }
            
            return this.yangModels;
        } catch (error) {
            console.error('Failed to load YANG modules:', error);
            return [];
        }
    }

    /**
     * Build tree structure from YANG models
     */
    buildTree() {
        const tree = {
            name: 'root',
            children: []
        };
        
        // Common YANG modules structure
        const modules = [
            {
                name: 'ietf-interfaces',
                namespace: 'ietf-interfaces:',
                children: [
                    {
                        name: 'interfaces',
                        type: 'container',
                        children: [
                            {
                                name: 'interface',
                                type: 'list',
                                key: 'name',
                                children: [
                                    { name: 'name', type: 'leaf', dataType: 'string' },
                                    { name: 'type', type: 'leaf', dataType: 'identityref' },
                                    { name: 'enabled', type: 'leaf', dataType: 'boolean' },
                                    { name: 'oper-status', type: 'leaf', dataType: 'enumeration' },
                                    { name: 'speed', type: 'leaf', dataType: 'gauge64' },
                                    { name: 'statistics', type: 'container' }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                name: 'ieee802-dot1q-bridge',
                namespace: 'ieee802-dot1q-bridge:',
                children: [
                    {
                        name: 'bridges',
                        type: 'container',
                        children: [
                            {
                                name: 'bridge',
                                type: 'list',
                                key: 'name',
                                children: [
                                    { name: 'name', type: 'leaf', dataType: 'string' },
                                    { name: 'address', type: 'leaf', dataType: 'mac-address' },
                                    {
                                        name: 'vlans',
                                        type: 'container',
                                        children: [
                                            {
                                                name: 'vlan',
                                                type: 'list',
                                                key: 'vid',
                                                children: [
                                                    { name: 'vid', type: 'leaf', dataType: 'vlan-id' },
                                                    { name: 'name', type: 'leaf', dataType: 'string' },
                                                    { name: 'member-ports', type: 'leaf-list', dataType: 'if:interface-ref' }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                name: 'ieee1588-ptp',
                namespace: 'ieee1588-ptp:',
                children: [
                    {
                        name: 'ptp',
                        type: 'container',
                        children: [
                            {
                                name: 'instance-list',
                                type: 'list',
                                key: 'instance-number',
                                children: [
                                    { name: 'instance-number', type: 'leaf', dataType: 'uint32' },
                                    {
                                        name: 'default-ds',
                                        type: 'container',
                                        children: [
                                            { name: 'priority1', type: 'leaf', dataType: 'uint8' },
                                            { name: 'priority2', type: 'leaf', dataType: 'uint8' },
                                            { name: 'domain-number', type: 'leaf', dataType: 'uint8' },
                                            { name: 'clock-quality', type: 'container' }
                                        ]
                                    },
                                    {
                                        name: 'port-ds-list',
                                        type: 'list',
                                        key: 'port-number',
                                        children: [
                                            { name: 'port-number', type: 'leaf', dataType: 'uint16' },
                                            { name: 'port-state', type: 'leaf', dataType: 'enumeration' },
                                            { name: 'log-min-delay-req-interval', type: 'leaf', dataType: 'int8' },
                                            { name: 'log-announce-interval', type: 'leaf', dataType: 'int8' }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                name: 'ieee802-dot1q-sched',
                namespace: 'ieee802-dot1q-sched:',
                children: [
                    {
                        name: 'interfaces',
                        type: 'container',
                        children: [
                            {
                                name: 'interface',
                                type: 'list',
                                key: 'name',
                                children: [
                                    { name: 'name', type: 'leaf', dataType: 'if:interface-ref' },
                                    {
                                        name: 'schedule',
                                        type: 'container',
                                        children: [
                                            { name: 'admin-cycle-time', type: 'leaf', dataType: 'uint32' },
                                            { name: 'admin-base-time', type: 'container' },
                                            {
                                                name: 'admin-control-list',
                                                type: 'list',
                                                key: 'index',
                                                children: [
                                                    { name: 'index', type: 'leaf', dataType: 'uint32' },
                                                    { name: 'operation-name', type: 'leaf', dataType: 'string' },
                                                    { name: 'gate-states-value', type: 'leaf', dataType: 'bits' },
                                                    { name: 'time-interval-value', type: 'leaf', dataType: 'uint32' }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ];
        
        tree.children = modules;
        this.treeData = tree;
        return tree;
    }

    /**
     * Render tree in HTML element
     */
    renderTree(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const tree = this.buildTree();
        element.innerHTML = this.renderNode(tree);
        
        // Add click handlers
        element.querySelectorAll('.yang-node').forEach(node => {
            node.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectNode(node.dataset.path);
            });
        });
    }

    /**
     * Render a tree node
     */
    renderNode(node, path = '', level = 0) {
        const nodePath = path ? `${path}/${node.name}` : node.name;
        const indent = level * 20;
        
        let html = '';
        
        if (node.name !== 'root') {
            const icon = this.getNodeIcon(node.type);
            const typeClass = node.type || 'module';
            
            html += `
                <div class="yang-node yang-${typeClass}" data-path="${nodePath}" style="padding-left: ${indent}px;">
                    <span class="yang-icon">${icon}</span>
                    <span class="yang-name">${node.name}</span>
                    ${node.type ? `<span class="yang-type">${node.type}</span>` : ''}
                    ${node.dataType ? `<span class="yang-datatype">${node.dataType}</span>` : ''}
                </div>
            `;
        }
        
        if (node.children) {
            node.children.forEach(child => {
                html += this.renderNode(child, nodePath, level + 1);
            });
        }
        
        return html;
    }

    /**
     * Get icon for node type
     */
    getNodeIcon(type) {
        const icons = {
            'module': '📁',
            'container': '📦',
            'list': '📋',
            'leaf': '🍃',
            'leaf-list': '🍂',
            'choice': '⚡',
            'case': '🔶',
            'rpc': '🔄',
            'notification': '🔔'
        };
        return icons[type] || '📄';
    }

    /**
     * Select a node in the tree
     */
    selectNode(path) {
        this.currentPath = path;
        
        // Highlight selected node
        document.querySelectorAll('.yang-node').forEach(node => {
            node.classList.toggle('selected', node.dataset.path === path);
        });
        
        // Show node details
        this.showNodeDetails(path);
    }

    /**
     * Show details for selected node
     */
    showNodeDetails(path) {
        const details = document.getElementById('yang-details');
        if (!details) return;
        
        // Parse path to get node info
        const parts = path.split('/');
        const nodeName = parts[parts.length - 1];
        
        details.innerHTML = `
            <h4>Node: ${nodeName}</h4>
            <p><strong>Path:</strong> ${path}</p>
            <p><strong>Type:</strong> Container/Leaf</p>
            <p><strong>Access:</strong> Read/Write</p>
            <div class="form-group" style="margin-top: 20px;">
                <label>Edit Value:</label>
                <textarea class="form-control" id="yang-edit-value" rows="5"></textarea>
            </div>
        `;
    }

    /**
     * Get value for current node
     */
    async getValue() {
        if (!this.currentPath || !this.controller) return;
        
        try {
            const value = await this.controller.coap.get(this.currentPath);
            
            const valueElement = document.getElementById('yang-value');
            if (valueElement) {
                valueElement.innerHTML = `<pre>${JSON.stringify(value, null, 2)}</pre>`;
            }
            
            const editElement = document.getElementById('yang-edit-value');
            if (editElement) {
                editElement.value = JSON.stringify(value, null, 2);
            }
            
            return value;
        } catch (error) {
            console.error('Failed to get value:', error);
            throw error;
        }
    }

    /**
     * Set value for current node
     */
    async setValue() {
        if (!this.currentPath || !this.controller) return;
        
        const editElement = document.getElementById('yang-edit-value');
        if (!editElement) return;
        
        try {
            const value = JSON.parse(editElement.value);
            await this.controller.coap.put(this.currentPath, value);
            
            window.showSuccess('Value updated successfully');
            await this.getValue(); // Refresh display
        } catch (error) {
            console.error('Failed to set value:', error);
            window.showError('Failed to set value: ' + error.message);
        }
    }
}

// Add styles for YANG browser
const style = document.createElement('style');
style.textContent = `
    .yang-node {
        padding: 5px;
        cursor: pointer;
        border-radius: 4px;
        margin: 2px 0;
        transition: background 0.2s;
        font-size: 13px;
    }
    
    .yang-node:hover {
        background: rgba(0,102,204,0.1);
    }
    
    .yang-node.selected {
        background: rgba(0,102,204,0.2);
        font-weight: 500;
    }
    
    .yang-icon {
        margin-right: 5px;
    }
    
    .yang-name {
        color: #333;
    }
    
    .yang-type {
        color: #666;
        font-size: 11px;
        margin-left: 10px;
        padding: 2px 6px;
        background: #f0f0f0;
        border-radius: 3px;
    }
    
    .yang-datatype {
        color: #0066cc;
        font-size: 11px;
        margin-left: 5px;
        font-style: italic;
    }
    
    .yang-module .yang-name {
        font-weight: 600;
        color: #0066cc;
    }
    
    .yang-container .yang-name {
        color: #00a651;
    }
    
    .yang-list .yang-name {
        color: #ff6600;
    }
    
    .yang-leaf .yang-name {
        color: #666;
    }
`;
document.head.appendChild(style);

export default YANGBrowser;
