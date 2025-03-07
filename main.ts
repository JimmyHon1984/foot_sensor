/**
 * PressureSensorLib - MicroBit 压力传感器库
 * 用于通过串口读取压力传感器数据
 */
//% color="#ff6800" weight=100 icon="\uf192" block="压力传感器"
namespace PressureSensorLib {
    // 常量定义
    export const FRAME_HEADER = 0xAA;
    export const BUFFER_SIZE = 40;  // 完整数据包的缓冲区大小
    export const DEFAULT_SAMPLE_INTERVAL = 1000;  // 默认采样间隔（毫秒）
    export const DEFAULT_BAUD_RATE = BaudRate.BaudRate115200;  // 默认波特率

    // 全局变量
    let dataBuffer: number[] = [];
    let bufferIndex = 0;
    let frameStarted = false;
    let lastSampleTime = 0;
    let receivedBuffer = pins.createBuffer(1);
    let sampleInterval = DEFAULT_SAMPLE_INTERVAL;
    let isInitialized = false;
    let debugMode = false;

    // 数据类型定义
    export enum FootType {
        //% block="左脚"
        Left = 0x01,
        //% block="右脚"
        Right = 0x02,
        //% block="未知"
        Unknown = 0xFF
    }

    export class PressureData {
        footType: FootType;
        points: number[];
        timestamp: number;
        rawData: number[];

        constructor() {
            this.footType = FootType.Unknown;
            this.points = [];
            this.timestamp = 0;
            this.rawData = [];
        }
    }

    // 事件处理
    export const EVENT_DATA_RECEIVED = 1;
    export const EVENT_CHECKSUM_ERROR = 2;

    // 初始化函数
    /**
     * 初始化压力传感器库
     * @param txPin 发送引脚
     * @param rxPin 接收引脚
     * @param baudRate 波特率
     * @param interval 采样间隔（毫秒）
     */
    //% blockId=pressuresensor_init
    //% block="初始化压力传感器 TX %txPin RX %rxPin 波特率 %baudRate 采样间隔 %interval"
    //% txPin.defl=SerialPin.P1 rxPin.defl=SerialPin.P2
    //% baudRate.defl=BaudRate.BaudRate115200
    //% interval.defl=1000
    //% weight=100
    export function init(
        txPin: SerialPin = SerialPin.P1,
        rxPin: SerialPin = SerialPin.P2,
        baudRate: BaudRate = DEFAULT_BAUD_RATE,
        interval: number = DEFAULT_SAMPLE_INTERVAL
    ): void {
        if (isInitialized) return;
        
        // 初始化串口通信
        serial.redirect(txPin, rxPin, baudRate);
        serial.setRxBufferSize(128);
        
        // 设置采样间隔
        sampleInterval = interval;
        
        // 初始化缓冲区
        dataBuffer = [];
        for (let i = 0; i < BUFFER_SIZE; i++) {
            dataBuffer.push(0);
        }
        
        // 启动后台处理
        control.inBackground(processInBackground);
        
        if (debugMode) {
            serial.writeLine("PressureSensor库已初始化");
            serial.writeLine(`波特率: ${baudRate}, 采样间隔: ${interval}ms`);
        }
        
        isInitialized = true;
        basic.showIcon(IconNames.Yes);
    }

    /**
     * 设置是否启用调试输出
     * @param debug 是否启用调试
     */
    //% blockId=pressuresensor_set_debug
    //% block="设置调试模式 %debug"
    //% debug.defl=false
    //% weight=90
    export function setDebugMode(debug: boolean): void {
        debugMode = debug;
    }

    /**
     * 当收到压力数据时
     */
    //% blockId=pressuresensor_on_data
    //% block="当收到压力数据"
    //% weight=95
    export function onDataReceived(handler: () => void) {
        control.onEvent(EVENT_DATA_RECEIVED, 0, handler);
    }

    /**
     * 当校验和错误时
     */
    //% blockId=pressuresensor_on_checksum_error
    //% block="当校验和错误"
    //% weight=85
    export function onChecksumError(handler: () => void) {
        control.onEvent(EVENT_CHECKSUM_ERROR, 0, handler);
    }

    /**
     * 获取最新的压力数据
     */
    //% blockId=pressuresensor_get_data
    //% block="获取压力数据"
    //% weight=80
    export function getData(): PressureData {
        const data = new PressureData();
        
        if (dataBuffer.length < 39) return data;
        
        data.footType = dataBuffer[1] == 0x01 ? FootType.Left : 
                        dataBuffer[1] == 0x02 ? FootType.Right : 
                        FootType.Unknown;
        
        // 复制原始数据
        for (let i = 0; i < 39; i++) {
            data.rawData.push(dataBuffer[i]);
        }
        
        // 解析点数据
        for (let i = 0; i < 18; i++) {
            let highByte = dataBuffer[2 + i * 2];
            let lowByte = dataBuffer[3 + i * 2];
            let value = highByte * 256 + lowByte;
            data.points.push(value);
        }
        
        data.timestamp = control.millis();
        return data;
    }

    /**
     * 获取指定点的压力值
     * @param pointIndex 点索引 (1-18)
     */
    //% blockId=pressuresensor_get_point
    //% block="获取点 %pointIndex 的压力值"
    //% pointIndex.min=1 pointIndex.max=18
    //% weight=75
    export function getPointValue(pointIndex: number): number {
        if (pointIndex < 1 || pointIndex > 18 || dataBuffer.length < 39) return 0;
        
        const i = pointIndex - 1;
        const highByte = dataBuffer[2 + i * 2];
        const lowByte = dataBuffer[3 + i * 2];
        return highByte * 256 + lowByte;
    }

    /**
     * 获取脚类型 (左/右)
     */
    //% blockId=pressuresensor_get_foot_type
    //% block="获取脚类型"
    //% weight=70
    export function getFootType(): FootType {
        if (dataBuffer.length < 39) return FootType.Unknown;
        
        return dataBuffer[1] == 0x01 ? FootType.Left : 
               dataBuffer[1] == 0x02 ? FootType.Right : 
               FootType.Unknown;
    }

    /**
     * 是否为左脚数据
     */
    //% blockId=pressuresensor_is_left_foot
    //% block="是左脚数据"
    //% weight=65
    export function isLeftFoot(): boolean {
        return getFootType() === FootType.Left;
    }

    /**
     * 是否为右脚数据
     */
    //% blockId=pressuresensor_is_right_foot
    //% block="是右脚数据"
    //% weight=64
    export function isRightFoot(): boolean {
        return getFootType() === FootType.Right;
    }

    /**
     * 手动请求新数据
     */
    //% blockId=pressuresensor_request_data
    //% block="请求新数据"
    //% weight=60
    export function requestData(): void {
        if (debugMode) {
            serial.writeLine("请求新数据...");
        }
        // 如果需要发送请求命令，可以在这里添加
        // serial.writeBuffer(pins.createBuffer(1).fill(requestCommand))
    }

    // 内部函数 - 后台处理
    function processInBackground(): void {
        while (true) {
            if (!isInitialized) {
                basic.pause(100);
                continue;
            }

            // 主循环逻辑
            let currentTime = control.millis();

            // 定时采样
            if (currentTime - lastSampleTime >= sampleInterval) {
                lastSampleTime = currentTime;
                requestData();
            }

            // 检查新数据
            receivedBuffer = serial.readBuffer(39);

            if (receivedBuffer.length > 0) {
                for (let i = 0; i < receivedBuffer.length && i < BUFFER_SIZE; i++) {
                    let incomingByte = receivedBuffer[i];
                    
                    // 检测帧头
                    if (incomingByte == FRAME_HEADER && !frameStarted) {
                        frameStarted = true;
                        bufferIndex = 0;
                        dataBuffer[bufferIndex++] = incomingByte;
                    }
                    // 如果找到帧头，继续收集数据
                    else if (frameStarted) {
                        dataBuffer[bufferIndex++] = incomingByte;

                        // 如果收集了足够的数据
                        if (bufferIndex >= 39) {
                            // 验证校验和
                            if (validateChecksum()) {
                                control.raiseEvent(EVENT_DATA_RECEIVED, 0);
                                if (debugMode) {
                                    printDebugInfo();
                                }
                            } else {
                                control.raiseEvent(EVENT_CHECKSUM_ERROR, 0);
                                if (debugMode) {
                                    serial.writeLine("校验和错误!");
                                }
                            }

                            // 重置状态，准备下一帧
                            frameStarted = false;
                            bufferIndex = 0;
                        }
                    }
                }
                frameStarted = false;
            }

            // 小延迟以防止CPU过度占用
            basic.pause(10);
        }
    }

    // 验证校验和
    function validateChecksum(): boolean {
        let sum = 0;
        // 计算前38个字节的和
        for (let i = 0; i < 38; i++) {
            sum += dataBuffer[i];
        }
        
        // 取低8位
        let calculatedChecksum = sum & 0xFF;

        // 比较计算的校验和与接收的校验和
        return (calculatedChecksum == dataBuffer[38]);
    }

    // 打印调试信息
    function printDebugInfo(): void {
        let packageType = dataBuffer[1]; // 01-左脚, 02-右脚

        serial.writeLine("接收到数据包: " +
            (packageType == 0x01 ? "左脚" : "右脚"));

        // 打印原始数据（十六进制）
        let rawDataStr = "原始数据: ";
        for (let i = 0; i < 39; i++) {
            if (dataBuffer[i] < 0x10) {
                rawDataStr += "0";
            }
            rawDataStr += dataBuffer[i].toString(16) + " ";
        }
        serial.writeLine(rawDataStr);

        // 解析点数据
        serial.writeLine("解析的点数据:");

        // 18个点
        for (let i = 0; i < 18; i++) {
            let highByte = dataBuffer[2 + i * 2];
            let lowByte = dataBuffer[3 + i * 2];
            let value = highByte * 256 + lowByte;

            serial.writeLine("点" + (i + 1) + ": " +
                highByte + "*256+" +
                lowByte + "=" +
                value);
        }

        serial.writeLine("时间戳: " + control.millis() + " ms");
        serial.writeLine("------------------------------");
    }
}