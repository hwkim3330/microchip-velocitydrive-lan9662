/**
 * mvdct Command Builder and Parser
 * LAN9662 VelocityDRIVE 명령어 생성 및 파싱
 */

class MvdctCommands {
    constructor(devicePath = '/dev/ttyACM0') {
        this.devicePath = devicePath;
        this.yangPaths = {
            // System
            system: {
                state: '/ietf-system:system-state',
                platform: '/ietf-system:system-state/platform',
                version: '/ietf-system:system-state/version'
            },
            
            // Interfaces
            interfaces: {
                all: '/ietf-interfaces:interfaces',
                eth0: "/ietf-interfaces:interfaces/interface[name='eth0']",
                eth1: "/ietf-interfaces:interfaces/interface[name='eth1']",
                stats: "/ietf-interfaces:interfaces-state/interface[name='eth0']/statistics"
            },
            
            // Bridge
            bridge: {
                all: '/ieee802-dot1q-bridge:bridges',
                br0: "/ieee802-dot1q-bridge:bridges/bridge[name='br0']",
                component: "/ieee802-dot1q-bridge:bridges/bridge[name='br0']/component[name='br0']",
                vlan: "/ieee802-dot1q-bridge:bridges/bridge[name='br0']/component[name='br0']/filtering-database"
            },
            
            // Scheduler (CBS/TAS)
            scheduler: {
                all: '/ieee802-dot1q-sched:interfaces',
                eth0: "/ieee802-dot1q-sched:interfaces/interface[name='eth0']",
                cbs: (tc) => `/ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler/traffic-class[index='${tc}']/credit-based-shaper`,
                tas: "/ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler",
                gcl: (index) => `/ieee802-dot1q-sched:interfaces/interface[name='eth0']/scheduler/admin-control-list[index='${index}']`
            },
            
            // PTP
            ptp: {
                all: '/ieee1588-ptp:instances',
                instance: "/ieee1588-ptp:instances/instance[instance-number='0']",
                currentDS: "/ieee1588-ptp:instances/instance[instance-number='0']/current-ds",
                parentDS: "/ieee1588-ptp:instances/instance[instance-number='0']/parent-ds",
                timePropertiesDS: "/ieee1588-ptp:instances/instance[instance-number='0']/time-properties-ds"
            }
        };
    }

    // GET 명령어 생성
    buildGetCommand(yangPath) {
        return `get ${yangPath}`;
    }

    // SET 명령어 생성
    buildSetCommand(yangPath, value) {
        // value가 boolean인 경우 문자열로 변환
        const val = typeof value === 'boolean' ? value.toString() : value;
        return `set ${yangPath} ${val}`;
    }

    // DELETE 명령어 생성
    buildDeleteCommand(yangPath) {
        return `delete ${yangPath}`;
    }

    // CBS 설정 명령어
    buildCBSCommands(trafficClass, idleSlope) {
        const cbsPath = this.yangPaths.scheduler.cbs(trafficClass);
        return [
            this.buildSetCommand(`${cbsPath}/idle-slope`, idleSlope),
            this.buildSetCommand(`${cbsPath}/send-slope`, -idleSlope),
            this.buildSetCommand(`${cbsPath}/admin-idleslope-enabled`, true)
        ];
    }

    // TAS Gate Control List 설정 명령어
    buildTASCommands(gateControlList, cycleTime, baseTime) {
        const commands = [];
        const tasPath = this.yangPaths.scheduler.tas;
        
        // Admin 설정
        commands.push(this.buildSetCommand(`${tasPath}/admin-base-time`, baseTime));
        commands.push(this.buildSetCommand(`${tasPath}/admin-cycle-time`, cycleTime));
        commands.push(this.buildSetCommand(`${tasPath}/admin-control-list-length`, gateControlList.length));
        
        // Gate Control List 설정
        gateControlList.forEach((entry, index) => {
            const gclPath = this.yangPaths.scheduler.gcl(index);
            commands.push(this.buildSetCommand(`${gclPath}/gate-states-value`, entry.gateStates));
            commands.push(this.buildSetCommand(`${gclPath}/time-interval-value`, entry.timeInterval));
        });
        
        // TAS 활성화
        commands.push(this.buildSetCommand(`${tasPath}/gate-enabled`, true));
        
        return commands;
    }

    // Priority to Traffic Class 매핑 명령어
    buildPriorityMappingCommands(mappings) {
        const commands = [];
        const bridgePath = this.yangPaths.bridge.component;
        
        mappings.forEach(({ pcp, priority, trafficClass }) => {
            // PCP to Priority
            if (pcp !== undefined && priority !== undefined) {
                commands.push(this.buildSetCommand(
                    `${bridgePath}/traffic-class-table/traffic-class-map[priority-code-point='${pcp}']/priority`,
                    priority
                ));
            }
            
            // Priority to Traffic Class
            if (priority !== undefined && trafficClass !== undefined) {
                commands.push(this.buildSetCommand(
                    `${bridgePath}/traffic-class-table/traffic-class-map[priority='${priority}']/traffic-class`,
                    trafficClass
                ));
            }
        });
        
        return commands;
    }

    // VLAN 설정 명령어
    buildVLANCommands(vlanId, ports) {
        const commands = [];
        const vlanPath = `${this.yangPaths.bridge.component}/filtering-database/vlan-registration-entry[vlan-id='${vlanId}']`;
        
        commands.push(this.buildSetCommand(`${vlanPath}/vids`, vlanId));
        
        ports.forEach(port => {
            commands.push(this.buildSetCommand(
                `${vlanPath}/port-map[port-ref='${port}']/static-vlan-registration-entries`,
                'fixed-new-ignored'
            ));
        });
        
        return commands;
    }

    // PTP 설정 명령어
    buildPTPCommands(config) {
        const commands = [];
        const ptpPath = this.yangPaths.ptp.instance;
        
        if (config.domainNumber !== undefined) {
            commands.push(this.buildSetCommand(`${ptpPath}/default-ds/domain-number`, config.domainNumber));
        }
        
        if (config.priority1 !== undefined) {
            commands.push(this.buildSetCommand(`${ptpPath}/default-ds/priority1`, config.priority1));
        }
        
        if (config.priority2 !== undefined) {
            commands.push(this.buildSetCommand(`${ptpPath}/default-ds/priority2`, config.priority2));
        }
        
        if (config.slaveOnly !== undefined) {
            commands.push(this.buildSetCommand(`${ptpPath}/default-ds/slave-only`, config.slaveOnly));
        }
        
        return commands;
    }

    // 응답 파싱
    parseResponse(response) {
        try {
            // JSON 응답 체크
            if (response.startsWith('{') || response.startsWith('[')) {
                return JSON.parse(response);
            }
            
            // 에러 체크
            if (response.includes('ERROR') || response.includes('Failed')) {
                return {
                    error: true,
                    message: response
                };
            }
            
            // 성공 응답
            return {
                success: true,
                data: response
            };
            
        } catch (error) {
            return {
                error: true,
                message: response,
                parseError: error.message
            };
        }
    }

    // 통계 파싱
    parseStatistics(response) {
        const stats = {};
        const lines = response.split('\n');
        
        lines.forEach(line => {
            const match = line.match(/(\w+):\s*([\d,]+)/);
            if (match) {
                const [_, key, value] = match;
                stats[key] = parseInt(value.replace(/,/g, ''), 10);
            }
        });
        
        return stats;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MvdctCommands;
}