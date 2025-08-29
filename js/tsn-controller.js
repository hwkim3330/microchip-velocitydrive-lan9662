/**
 * TSN Controller Module for LAN9662
 * Handles CBS, TAS, FRER configuration and monitoring
 */

class TSNController {
    constructor() {
        this.apiUrl = 'http://localhost:8080/api';
        this.wsUrl = 'ws://localhost:8080/ws';
        this.websocket = null;
        this.monitoring = false;
        this.charts = {};
        this.testResults = [];
        
        this.initializeCharts();
        this.connectWebSocket();
    }
    
    // WebSocket connection for real-time monitoring
    connectWebSocket() {
        this.websocket = new WebSocket(this.wsUrl);
        
        this.websocket.onopen = () => {
            console.log('WebSocket connected');
            this.updateConnectionStatus('connected');
        };
        
        this.websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleRealtimeData(data);
        };
        
        this.websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateConnectionStatus('error');
        };
        
        this.websocket.onclose = () => {
            console.log('WebSocket disconnected');
            this.updateConnectionStatus('disconnected');
            // Reconnect after 5 seconds
            setTimeout(() => this.connectWebSocket(), 5000);
        };
    }
    
    // Initialize Chart.js charts
    initializeCharts() {
        // Throughput chart
        const throughputCtx = document.getElementById('throughputChart');
        if (throughputCtx) {
            this.charts.throughput = new Chart(throughputCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: this.createDatasets('Throughput', 'Mbps')
                },
                options: this.getChartOptions('Throughput (Mbps)', 0, 1000)
            });
        }
        
        // Latency chart
        const latencyCtx = document.getElementById('latencyChart');
        if (latencyCtx) {
            this.charts.latency = new Chart(latencyCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: this.createDatasets('Latency', 'ms')
                },
                options: this.getChartOptions('Latency (ms)', 0, 10)
            });
        }
        
        // Packet loss chart
        const lossCtx = document.getElementById('lossChart');
        if (lossCtx) {
            this.charts.loss = new Chart(lossCtx, {
                type: 'bar',
                data: {
                    labels: ['TC0', 'TC1', 'TC2', 'TC3', 'TC4', 'TC5', 'TC6', 'TC7'],
                    datasets: [{
                        label: 'Packet Loss (%)',
                        data: [0, 0, 0, 0, 0, 0, 0, 0],
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }]
                },
                options: this.getChartOptions('Packet Loss (%)', 0, 5)
            });
        }
        
        // Jitter chart
        const jitterCtx = document.getElementById('jitterChart');
        if (jitterCtx) {
            this.charts.jitter = new Chart(jitterCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: this.createDatasets('Jitter', 'ms')
                },
                options: this.getChartOptions('Jitter (ms)', 0, 5)
            });
        }
        
        // Gate schedule visualization
        const gateCtx = document.getElementById('gateChart');
        if (gateCtx) {
            this.charts.gate = new Chart(gateCtx, {
                type: 'bar',
                data: {
                    labels: ['Slot 0', 'Slot 1', 'Slot 2', 'Slot 3', 'Slot 4', 'Slot 5', 'Slot 6', 'Slot 7'],
                    datasets: this.createGateDatasets()
                },
                options: {
                    responsive: true,
                    scales: {
                        x: { stacked: true },
                        y: { 
                            stacked: true,
                            max: 100,
                            title: {
                                display: true,
                                text: 'Gate Open Duration (%)'
                            }
                        }
                    },
                    plugins: {
                        legend: { position: 'right' }
                    }
                }
            });
        }
    }
    
    createDatasets(label, unit) {
        const colors = [
            'rgb(255, 99, 132)',   // TC0 - Red
            'rgb(255, 159, 64)',   // TC1 - Orange
            'rgb(255, 205, 86)',   // TC2 - Yellow
            'rgb(75, 192, 192)',   // TC3 - Teal
            'rgb(54, 162, 235)',   // TC4 - Blue
            'rgb(153, 102, 255)',  // TC5 - Purple
            'rgb(201, 203, 207)',  // TC6 - Grey
            'rgb(100, 100, 100)'   // TC7 - Dark Grey
        ];
        
        return Array.from({length: 8}, (_, i) => ({
            label: `TC${i}`,
            data: [],
            borderColor: colors[i],
            backgroundColor: colors[i] + '33',
            tension: 0.1,
            fill: false
        }));
    }
    
    createGateDatasets() {
        const colors = [
            'rgba(255, 99, 132, 0.8)',
            'rgba(255, 159, 64, 0.8)',
            'rgba(255, 205, 86, 0.8)',
            'rgba(75, 192, 192, 0.8)',
            'rgba(54, 162, 235, 0.8)',
            'rgba(153, 102, 255, 0.8)',
            'rgba(201, 203, 207, 0.8)',
            'rgba(100, 100, 100, 0.8)'
        ];
        
        return Array.from({length: 8}, (_, i) => ({
            label: `TC${i}`,
            data: [0, 0, 0, 0, 0, 0, 0, 0],
            backgroundColor: colors[i],
            borderColor: colors[i],
            borderWidth: 1
        }));
    }
    
    getChartOptions(title, min, max) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    min: min,
                    max: max,
                    title: {
                        display: true,
                        text: title
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            }
        };
    }
    
    // Handle real-time data from WebSocket
    handleRealtimeData(data) {
        if (!this.monitoring) return;
        
        // Update throughput chart
        if (data.throughput && this.charts.throughput) {
            this.updateChart(this.charts.throughput, data.throughput, data.timestamp);
        }
        
        // Update latency chart
        if (data.latency && this.charts.latency) {
            this.updateChart(this.charts.latency, data.latency, data.timestamp);
        }
        
        // Update packet loss
        if (data.loss && this.charts.loss) {
            this.charts.loss.data.datasets[0].data = data.loss;
            this.charts.loss.update();
        }
        
        // Update jitter chart
        if (data.jitter && this.charts.jitter) {
            this.updateChart(this.charts.jitter, data.jitter, data.timestamp);
        }
        
        // Update statistics table
        this.updateStatsTable(data);
    }
    
    updateChart(chart, data, timestamp) {
        const maxPoints = 50;
        
        // Add timestamp label
        if (chart.data.labels.length >= maxPoints) {
            chart.data.labels.shift();
        }
        chart.data.labels.push(new Date(timestamp).toLocaleTimeString());
        
        // Update each TC dataset
        data.forEach((value, tc) => {
            if (chart.data.datasets[tc]) {
                if (chart.data.datasets[tc].data.length >= maxPoints) {
                    chart.data.datasets[tc].data.shift();
                }
                chart.data.datasets[tc].data.push(value);
            }
        });
        
        chart.update('none');  // Update without animation for performance
    }
    
    updateStatsTable(data) {
        const tbody = document.querySelector('#statsTable tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        for (let tc = 0; tc < 8; tc++) {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>TC${tc}</td>
                <td>${data.throughput ? data.throughput[tc].toFixed(2) : '-'}</td>
                <td>${data.latency ? data.latency[tc].toFixed(3) : '-'}</td>
                <td>${data.jitter ? data.jitter[tc].toFixed(3) : '-'}</td>
                <td>${data.loss ? data.loss[tc].toFixed(2) : '-'}</td>
            `;
        }
    }
    
    // CBS Configuration
    async configureCBS(tc) {
        const idleSlope = document.getElementById(`cbs-tc${tc}-idle`).value;
        
        try {
            const response = await fetch(`${this.apiUrl}/cbs/configure`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    traffic_class: tc,
                    idle_slope_mbps: parseInt(idleSlope)
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.updateStatus(`cbs-tc${tc}-status`, 'success');
                this.showNotification(`CBS configured for TC${tc}`, 'success');
            } else {
                this.updateStatus(`cbs-tc${tc}-status`, 'error');
                this.showNotification(`Failed to configure CBS for TC${tc}`, 'error');
            }
        } catch (error) {
            console.error('CBS configuration error:', error);
            this.showNotification('CBS configuration failed', 'error');
        }
    }
    
    async configureAllCBS() {
        for (let tc = 0; tc < 8; tc++) {
            await this.configureCBS(tc);
            await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between configs
        }
        this.showNotification('All CBS configurations applied', 'success');
    }
    
    // TAS Configuration
    async configureTAS() {
        const cycleTime = document.getElementById('tas-cycle-time').value;
        
        try {
            const response = await fetch(`${this.apiUrl}/tas/configure`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cycle_time_us: parseInt(cycleTime)
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showNotification('TAS configured successfully', 'success');
                this.updateGateVisualization(cycleTime);
            } else {
                this.showNotification('Failed to configure TAS', 'error');
            }
        } catch (error) {
            console.error('TAS configuration error:', error);
            this.showNotification('TAS configuration failed', 'error');
        }
    }
    
    async disableTAS() {
        try {
            const response = await fetch(`${this.apiUrl}/tas/disable`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showNotification('TAS disabled', 'success');
            } else {
                this.showNotification('Failed to disable TAS', 'error');
            }
        } catch (error) {
            console.error('TAS disable error:', error);
            this.showNotification('Failed to disable TAS', 'error');
        }
    }
    
    updateGateVisualization(cycleTime) {
        if (!this.charts.gate) return;
        
        const slotDuration = cycleTime / 8;
        
        // Update gate schedule chart to show which TC has access in each slot
        for (let slot = 0; slot < 8; slot++) {
            for (let tc = 0; tc < 8; tc++) {
                this.charts.gate.data.datasets[tc].data[slot] = (tc === slot) ? 100 : 0;
            }
        }
        
        this.charts.gate.update();
    }
    
    // FRER Configuration
    async configureFRER() {
        const streamHandle = document.getElementById('frer-stream-handle').value;
        const resetTime = document.getElementById('frer-reset-time').value;
        const historyLength = document.getElementById('frer-history').value;
        
        try {
            const response = await fetch(`${this.apiUrl}/frer/configure`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stream_handle: parseInt(streamHandle),
                    reset_time_ms: parseInt(resetTime),
                    history_length: parseInt(historyLength)
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showNotification('FRER configured successfully', 'success');
                this.updateFRERStats(result.stats);
            } else {
                this.showNotification('Failed to configure FRER', 'error');
            }
        } catch (error) {
            console.error('FRER configuration error:', error);
            this.showNotification('FRER configuration failed', 'error');
        }
    }
    
    updateFRERStats(stats) {
        if (stats) {
            document.getElementById('frer-sent').textContent = stats.frames_sent || 0;
            document.getElementById('frer-eliminated').textContent = stats.frames_eliminated || 0;
            document.getElementById('frer-lost').textContent = stats.frames_lost || 0;
        }
    }
    
    // PTP Configuration
    async configurePTP() {
        try {
            const response = await fetch(`${this.apiUrl}/ptp/configure`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                document.getElementById('ptpStatus').textContent = 'Configured';
                this.showNotification('PTP configured successfully', 'success');
            } else {
                this.showNotification('Failed to configure PTP', 'error');
            }
        } catch (error) {
            console.error('PTP configuration error:', error);
            this.showNotification('PTP configuration failed', 'error');
        }
    }
    
    // Monitoring controls
    async startMonitoring() {
        this.monitoring = true;
        
        // Send start monitoring command
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({ command: 'start_monitoring' }));
        }
        
        this.showNotification('Monitoring started', 'success');
    }
    
    async stopMonitoring() {
        this.monitoring = false;
        
        // Send stop monitoring command
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({ command: 'stop_monitoring' }));
        }
        
        this.showNotification('Monitoring stopped', 'info');
    }
    
    // Test execution
    async runCBSTest() {
        this.showTestOutput('Starting CBS performance test...');
        
        try {
            const response = await fetch(`${this.apiUrl}/test/cbs`, {
                method: 'POST'
            });
            
            const result = await response.json();
            this.displayTestResults('CBS Test', result);
        } catch (error) {
            this.showTestOutput(`CBS test error: ${error.message}`, 'error');
        }
    }
    
    async runTASTest() {
        this.showTestOutput('Starting TAS scheduling test...');
        
        try {
            const response = await fetch(`${this.apiUrl}/test/tas`, {
                method: 'POST'
            });
            
            const result = await response.json();
            this.displayTestResults('TAS Test', result);
        } catch (error) {
            this.showTestOutput(`TAS test error: ${error.message}`, 'error');
        }
    }
    
    async runFRERTest() {
        this.showTestOutput('Starting FRER redundancy test...');
        
        try {
            const response = await fetch(`${this.apiUrl}/test/frer`, {
                method: 'POST'
            });
            
            const result = await response.json();
            this.displayTestResults('FRER Test', result);
        } catch (error) {
            this.showTestOutput(`FRER test error: ${error.message}`, 'error');
        }
    }
    
    async runCompleteTest() {
        this.showTestOutput('Starting complete TSN test suite...');
        
        try {
            const response = await fetch(`${this.apiUrl}/test/complete`, {
                method: 'POST'
            });
            
            const result = await response.json();
            this.displayTestResults('Complete TSN Test', result);
            this.testResults = result;
        } catch (error) {
            this.showTestOutput(`Complete test error: ${error.message}`, 'error');
        }
    }
    
    displayTestResults(testName, results) {
        let output = `\n========== ${testName} Results ==========\n`;
        output += JSON.stringify(results, null, 2);
        output += '\n=====================================\n';
        
        this.showTestOutput(output);
        
        // Store results
        this.testResults.push({
            test: testName,
            timestamp: new Date().toISOString(),
            results: results
        });
    }
    
    showTestOutput(message, type = 'info') {
        const outputDiv = document.getElementById('testOutput');
        if (outputDiv) {
            const timestamp = new Date().toLocaleTimeString();
            const className = type === 'error' ? 'error-output' : 'info-output';
            outputDiv.innerHTML += `<div class="${className}">[${timestamp}] ${message}</div>`;
            outputDiv.scrollTop = outputDiv.scrollHeight;
        }
    }
    
    clearOutput() {
        const outputDiv = document.getElementById('testOutput');
        if (outputDiv) {
            outputDiv.innerHTML = '<p>Test output will appear here...</p>';
        }
    }
    
    // Export data
    async exportData() {
        const data = {
            timestamp: new Date().toISOString(),
            testResults: this.testResults,
            configuration: {
                cbs: this.getCBSConfig(),
                tas: this.getTASConfig(),
                frer: this.getFRERConfig()
            }
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tsn_data_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showNotification('Data exported successfully', 'success');
    }
    
    async downloadReport() {
        if (this.testResults.length === 0) {
            this.showNotification('No test results to download', 'warning');
            return;
        }
        
        try {
            const response = await fetch(`${this.apiUrl}/report/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ results: this.testResults })
            });
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tsn_report_${Date.now()}.html`;
            a.click();
            URL.revokeObjectURL(url);
            
            this.showNotification('Report downloaded successfully', 'success');
        } catch (error) {
            this.showNotification('Failed to download report', 'error');
        }
    }
    
    getCBSConfig() {
        const config = {};
        for (let tc = 0; tc < 8; tc++) {
            const input = document.getElementById(`cbs-tc${tc}-idle`);
            if (input) {
                config[`tc${tc}`] = parseInt(input.value);
            }
        }
        return config;
    }
    
    getTASConfig() {
        const cycleTime = document.getElementById('tas-cycle-time');
        return cycleTime ? { cycle_time_us: parseInt(cycleTime.value) } : {};
    }
    
    getFRERConfig() {
        return {
            stream_handle: parseInt(document.getElementById('frer-stream-handle')?.value || 1),
            reset_time_ms: parseInt(document.getElementById('frer-reset-time')?.value || 100),
            history_length: parseInt(document.getElementById('frer-history')?.value || 10)
        };
    }
    
    // UI helpers
    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            switch (status) {
                case 'connected':
                    statusElement.textContent = '● Connected';
                    statusElement.className = 'status-indicator connected';
                    break;
                case 'disconnected':
                    statusElement.textContent = '● Disconnected';
                    statusElement.className = 'status-indicator disconnected';
                    break;
                case 'error':
                    statusElement.textContent = '● Error';
                    statusElement.className = 'status-indicator error';
                    break;
            }
        }
    }
    
    updateStatus(elementId, status) {
        const element = document.getElementById(elementId);
        if (element) {
            element.className = `status ${status}`;
        }
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Initialize TSN controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.tsnController = new TSNController();
});

// Export for use in other modules
export default TSNController;