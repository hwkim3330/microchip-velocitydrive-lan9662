/**
 * TAS Gate Visualizer
 * 게이트가 열리고 닫히는 것을 실시간으로 시각화
 */

class GateVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        
        // 설정
        this.cycleTimeMs = 200;
        this.numTCs = 8;
        this.currentTime = 0;
        this.animationSpeed = 1; // 1x speed
        this.isRunning = false;
        
        // GCL (Gate Control List)
        this.gcl = [
            { tc: 0, start: 0,   duration: 50, color: '#FF6B6B' },
            { tc: 1, start: 50,  duration: 30, color: '#4ECDC4' },
            { tc: 2, start: 80,  duration: 20, color: '#45B7D1' },
            { tc: 3, start: 100, duration: 20, color: '#96CEB4' },
            { tc: 4, start: 120, duration: 20, color: '#FECA57' },
            { tc: 5, start: 140, duration: 20, color: '#48C9B0' },
            { tc: 6, start: 160, duration: 20, color: '#9B59B6' },
            { tc: 7, start: 180, duration: 20, color: '#3498DB' }
        ];
        
        // 애니메이션
        this.animationId = null;
        this.lastTimestamp = 0;
        
        // 게이트 상태
        this.gateStates = new Array(8).fill(false);
        this.gateHistory = [];
        
        // 메트릭
        this.metrics = {
            cycleCount: 0,
            gateTransitions: 0,
            violations: 0
        };
        
        this.init();
    }
    
    init() {
        if (!this.canvas || !this.ctx) return;
        
        // Canvas 크기 설정
        this.canvas.width = 1200;
        this.canvas.height = 600;
        
        // 초기 그리기
        this.draw();
    }
    
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.lastTimestamp = performance.now();
        this.animate();
    }
    
    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
    
    reset() {
        this.stop();
        this.currentTime = 0;
        this.metrics.cycleCount = 0;
        this.metrics.gateTransitions = 0;
        this.metrics.violations = 0;
        this.gateHistory = [];
        this.draw();
    }
    
    animate(timestamp) {
        if (!this.isRunning) return;
        
        // 시간 업데이트
        const deltaTime = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;
        
        // 현재 시간 업데이트 (애니메이션 속도 적용)
        this.currentTime += (deltaTime * this.animationSpeed) % this.cycleTimeMs;
        
        if (this.currentTime >= this.cycleTimeMs) {
            this.currentTime = 0;
            this.metrics.cycleCount++;
        }
        
        // 게이트 상태 업데이트
        this.updateGateStates();
        
        // 그리기
        this.draw();
        
        // 다음 프레임
        this.animationId = requestAnimationFrame((t) => this.animate(t));
    }
    
    updateGateStates() {
        const newStates = new Array(8).fill(false);
        
        // 현재 시간에 어떤 게이트가 열려야 하는지 확인
        for (const entry of this.gcl) {
            const endTime = entry.start + entry.duration;
            
            if (this.currentTime >= entry.start && this.currentTime < endTime) {
                newStates[entry.tc] = true;
            }
        }
        
        // 상태 변화 감지
        for (let i = 0; i < 8; i++) {
            if (newStates[i] !== this.gateStates[i]) {
                this.metrics.gateTransitions++;
                
                // 이력 추가
                this.gateHistory.push({
                    time: this.currentTime,
                    cycle: this.metrics.cycleCount,
                    tc: i,
                    state: newStates[i] ? 'open' : 'close'
                });
            }
        }
        
        this.gateStates = newStates;
    }
    
    draw() {
        if (!this.ctx) return;
        
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // 배경 지우기
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, width, height);
        
        // 제목
        ctx.fillStyle = '#333';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('TAS Gate Control Visualization', 20, 30);
        
        // 현재 시간 표시
        ctx.font = '16px Arial';
        ctx.fillText(`Cycle: ${this.metrics.cycleCount} | Time: ${this.currentTime.toFixed(1)}ms / ${this.cycleTimeMs}ms`, 20, 55);
        
        // 타임라인 그리기
        this.drawTimeline(ctx, 50, 80, width - 100, 60);
        
        // 게이트 상태 그리기
        this.drawGates(ctx, 50, 180, width - 100, 300);
        
        // 메트릭 표시
        this.drawMetrics(ctx, width - 250, 80, 200, 150);
        
        // 범례
        this.drawLegend(ctx, 50, height - 80, width - 100, 60);
    }
    
    drawTimeline(ctx, x, y, width, height) {
        // 타임라인 배경
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = '#ddd';
        ctx.strokeRect(x, y, width, height);
        
        // 현재 시간 위치
        const currentX = x + (this.currentTime / this.cycleTimeMs) * width;
        
        // GCL 시간 슬롯 표시
        for (const entry of this.gcl) {
            const slotX = x + (entry.start / this.cycleTimeMs) * width;
            const slotWidth = (entry.duration / this.cycleTimeMs) * width;
            
            // 슬롯 배경
            ctx.fillStyle = entry.color + '40'; // 40% 투명도
            ctx.fillRect(slotX, y, slotWidth, height);
            
            // 슬롯 경계
            ctx.strokeStyle = entry.color;
            ctx.strokeRect(slotX, y, slotWidth, height);
            
            // TC 번호
            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.fillText(`TC${entry.tc}`, slotX + 5, y + 15);
            
            // 시간 표시
            ctx.font = '10px Arial';
            ctx.fillText(`${entry.start}ms`, slotX + 5, y + height - 5);
        }
        
        // 현재 시간 마커
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(currentX, y);
        ctx.lineTo(currentX, y + height);
        ctx.stroke();
        ctx.lineWidth = 1;
        
        // 타임라인 라벨
        ctx.fillStyle = '#666';
        ctx.font = '12px Arial';
        ctx.fillText('Timeline', x, y - 5);
    }
    
    drawGates(ctx, x, y, width, height) {
        const gateHeight = height / this.numTCs;
        const gateWidth = width;
        
        // 배경
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = '#ddd';
        ctx.strokeRect(x, y, width, height);
        
        // 각 TC의 게이트 상태
        for (let tc = 0; tc < this.numTCs; tc++) {
            const gateY = y + tc * gateHeight;
            const entry = this.gcl[tc];
            
            // TC 라벨
            ctx.fillStyle = '#333';
            ctx.font = '14px Arial';
            ctx.fillText(`TC${tc}`, x - 35, gateY + gateHeight / 2 + 5);
            
            // 게이트 박스
            const gateBoxX = x + 10;
            const gateBoxY = gateY + 10;
            const gateBoxWidth = gateWidth - 20;
            const gateBoxHeight = gateHeight - 20;
            
            // 게이트 상태에 따른 색상
            if (this.gateStates[tc]) {
                // 게이트 열림
                ctx.fillStyle = entry.color;
                ctx.fillRect(gateBoxX, gateBoxY, gateBoxWidth, gateBoxHeight);
                
                // "OPEN" 텍스트
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 16px Arial';
                ctx.fillText('OPEN', gateBoxX + gateBoxWidth / 2 - 25, gateBoxY + gateBoxHeight / 2 + 5);
                
                // 애니메이션 효과
                const pulseSize = Math.sin(Date.now() / 200) * 2;
                ctx.strokeStyle = entry.color;
                ctx.lineWidth = 2 + pulseSize;
                ctx.strokeRect(gateBoxX - pulseSize, gateBoxY - pulseSize, 
                             gateBoxWidth + pulseSize * 2, gateBoxHeight + pulseSize * 2);
                ctx.lineWidth = 1;
            } else {
                // 게이트 닫힘
                ctx.fillStyle = '#e0e0e0';
                ctx.fillRect(gateBoxX, gateBoxY, gateBoxWidth, gateBoxHeight);
                
                // "CLOSED" 텍스트
                ctx.fillStyle = '#999';
                ctx.font = '14px Arial';
                ctx.fillText('CLOSED', gateBoxX + gateBoxWidth / 2 - 28, gateBoxY + gateBoxHeight / 2 + 5);
                
                // 경계선
                ctx.strokeStyle = '#ccc';
                ctx.strokeRect(gateBoxX, gateBoxY, gateBoxWidth, gateBoxHeight);
            }
            
            // 게이트 시간 정보
            ctx.fillStyle = '#666';
            ctx.font = '10px Arial';
            ctx.fillText(`${entry.start}-${entry.start + entry.duration}ms (${entry.duration}ms)`, 
                        gateBoxX + 5, gateBoxY + gateBoxHeight - 5);
        }
        
        // 게이트 섹션 라벨
        ctx.fillStyle = '#666';
        ctx.font = '12px Arial';
        ctx.fillText('Gate States', x, y - 5);
    }
    
    drawMetrics(ctx, x, y, width, height) {
        // 메트릭 박스
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = '#ddd';
        ctx.strokeRect(x, y, width, height);
        
        // 제목
        ctx.fillStyle = '#333';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('Metrics', x + 10, y + 20);
        
        // 메트릭 값들
        ctx.font = '12px Arial';
        ctx.fillStyle = '#666';
        
        const metrics = [
            { label: 'Cycles:', value: this.metrics.cycleCount },
            { label: 'Transitions:', value: this.metrics.gateTransitions },
            { label: 'Violations:', value: this.metrics.violations },
            { label: 'Speed:', value: `${this.animationSpeed}x` }
        ];
        
        metrics.forEach((metric, i) => {
            const metricY = y + 40 + i * 25;
            ctx.fillText(metric.label, x + 10, metricY);
            ctx.fillStyle = '#333';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(metric.value.toString(), x + 100, metricY);
            ctx.font = '12px Arial';
            ctx.fillStyle = '#666';
        });
    }
    
    drawLegend(ctx, x, y, width, height) {
        // 범례 배경
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = '#ddd';
        ctx.strokeRect(x, y, width, height);
        
        // 범례 제목
        ctx.fillStyle = '#666';
        ctx.font = '12px Arial';
        ctx.fillText('Legend:', x + 10, y + 20);
        
        // TC 색상 범례
        const legendItemWidth = 100;
        for (let i = 0; i < this.numTCs; i++) {
            const legendX = x + 80 + (i * legendItemWidth);
            const legendY = y + 10;
            
            // 색상 박스
            ctx.fillStyle = this.gcl[i].color;
            ctx.fillRect(legendX, legendY, 15, 15);
            
            // TC 라벨
            ctx.fillStyle = '#333';
            ctx.font = '11px Arial';
            ctx.fillText(`TC${i}`, legendX + 20, legendY + 12);
        }
        
        // 상태 설명
        ctx.fillStyle = '#666';
        ctx.font = '11px Arial';
        ctx.fillText('OPEN = Transmitting | CLOSED = Blocked', x + 10, y + 45);
    }
    
    // 속도 제어
    setSpeed(speed) {
        this.animationSpeed = speed;
    }
    
    // 사이클 업데이트 (외부에서 호출)
    updateCycle(cycleCount) {
        this.metrics.cycleCount = cycleCount;
        this.draw();
    }
    
    // 위반 추가
    addViolation(tc, time) {
        this.metrics.violations++;
        this.gateHistory.push({
            time,
            cycle: this.metrics.cycleCount,
            tc,
            state: 'violation'
        });
    }
    
    // 이력 내보내기
    exportHistory() {
        return {
            metrics: this.metrics,
            history: this.gateHistory,
            gcl: this.gcl
        };
    }
}

// 전역 인스턴스 생성
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('gate-canvas')) {
        window.gateVisualizer = new GateVisualizer('gate-canvas');
        
        // 컨트롤 버튼 연결
        const startBtn = document.getElementById('gate-start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                window.gateVisualizer.start();
            });
        }
        
        const stopBtn = document.getElementById('gate-stop-btn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                window.gateVisualizer.stop();
            });
        }
        
        const resetBtn = document.getElementById('gate-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                window.gateVisualizer.reset();
            });
        }
        
        // 속도 컨트롤
        const speedSlider = document.getElementById('speed-slider');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                window.gateVisualizer.setSpeed(parseFloat(e.target.value));
            });
        }
    }
});

console.log('Gate Visualizer loaded');