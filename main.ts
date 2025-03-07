/**
 * PressureSensorLib - MicroBit 壓力感測器庫
 * 用於通過串口讀取壓力感測器數據
 */
//% color="#ff6800" weight=100 icon="\uf192" block="壓力感測器"
namespace PressureSensorLib {
    // 常量定義
    export const FRAME_HEADER = 0xAA;
    export const BUFFER_SIZE = 40;  // 完整數據包的緩衝區大小
    export const DEFAULT_SAMPLE_INTERVAL = 1000;  // 默認採樣間隔（毫秒）
    export const DEFAULT_BAUD_RATE = BaudRate.BaudRate115200;  // 默認波特率

    // 全局變量
    let dataBuffer: number[] = [];
    let bufferIndex = 0;
    let frameStarted = false;
    let lastSampleTime = 0;
    let receivedBuffer = pins.createBuffer(1);
    let sampleInterval = DEFAULT_SAMPLE_INTERVAL;
    let isInitialized = false;
    let debugMode = false;

    // 數據類型定義
    export enum FootType {
        //% block="左腳"
        Left = 0x01,
        //% block="右腳"
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

    // 事件處理
    export const EVENT_DATA_RECEIVED = 1;
    export const EVENT_CHECKSUM_ERROR = 2;

    // 初始化函數
    /**
     * 初始化壓力感測器庫
     * @param txPin 發送引腳
     * @param rxPin 接收引腳
     * @param baudRate 波特率
     * @param interval 採樣間隔（毫秒）
     */
    //% blockId=pressuresensor_init
    //% block="初始化壓力感測器 TX %txPin RX %rxPin 波特率 %baudRate 採樣間隔 %interval"
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
        
        // 設置採樣間隔
        sampleInterval = interval;
        
        // 初始化緩衝區
        dataBuffer = [];
        for (let i = 0; i < BUFFER_SIZE; i++) {
            dataBuffer.push(0);
        }
        
        // 啟動後台處理
        control.inBackground(processInBackground);
        
        if (debugMode) {
            serial.writeLine("PressureSensor庫已初始化");
            serial.writeLine(`波特率: ${baudRate}, 採樣間隔: ${interval}ms`);
        }
        
        isInitialized = true;
        basic.showIcon(IconNames.Yes);
    }

    /**
     * 設置是否啟用調試輸出
     * @param debug 是否啟用調試
     */
    //% blockId=pressuresensor_set_debug
    //% block="設置調試模式 %debug"
    //% debug.defl=false
    //% weight=90
    export function setDebugMode(debug: boolean): void {
        debugMode = debug;
        if (debug) {
            serial.writeLine("調試模式已啟用");
        }
    }
    

    /**
     * 當收到壓力數據時
     */
    //% blockId=pressuresensor_on_data
    //% block="當收到壓力數據"
    //% weight=95
    export function onDataReceived(handler: () => void) {
        control.onEvent(EVENT_DATA_RECEIVED, 0, handler);
    }

    /**
     * 當校驗和錯誤時
     */
    //% blockId=pressuresensor_on_checksum_error
    //% block="當校驗和錯誤"
    //% weight=85
    export function onChecksumError(handler: () => void) {
        control.onEvent(EVENT_CHECKSUM_ERROR, 0, handler);
    }

    /**
     * 測試連接和數據接收
     */
    //% blockId=pressuresensor_test
    //% block="測試感測器連接"
    //% weight=55
    export function testConnection(): void {
        if (!isInitialized) {
            serial.writeLine("請先初始化感測器!");
            return;
        }
        
        serial.writeLine("開始測試感測器連接...");
        serial.writeLine("等待數據...");
        
        // 顯示等待動畫
        basic.showLeds(`
            . . . . .
            . . . . .
            . . # . .
            . . . . .
            . . . . .
        `);
        basic.pause(200);
        basic.showLeds(`
            . . . . .
            . . # . .
            . # . # .
            . . # . .
            . . . . .
        `);
        basic.pause(200);
        basic.showLeds(`
            . . # . .
            . # . # .
            # . . . #
            . # . # .
            . . # . .
        `);
        
        // 請求數據
        requestData();
        
        // 等待5秒看是否有數據接收
        let startTime = control.millis();
        let received = false;
        
        while (control.millis() - startTime < 5000) {
            if (receivedBuffer.length > 0) {
                received = true;
                break;
            }
            basic.pause(100);
        }
        
        if (received) {
            serial.writeLine("測試成功: 接收到數據!");
            basic.showIcon(IconNames.Yes);
        } else {
            serial.writeLine("測試失敗: 未接收到數據");
            basic.showIcon(IconNames.No);
        }
        
        basic.pause(1000);
    }


    /**
     * 獲取最新的壓力數據
     */
    //% blockId=pressuresensor_get_data
    //% block="獲取壓力數據"
    //% weight=80
    export function getData(): PressureData {
        const data = new PressureData();
        
        if (dataBuffer.length < 39) return data;
        
        data.footType = dataBuffer[1] == 0x01 ? FootType.Left : 
                        dataBuffer[1] == 0x02 ? FootType.Right : 
                        FootType.Unknown;
        
        // 複製原始數據
        for (let i = 0; i < 39; i++) {
            data.rawData.push(dataBuffer[i]);
        }
        
        // 解析點數據
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
     * 獲取指定點的壓力值
     * @param pointIndex 點索引 (1-18)
     */
    //% blockId=pressuresensor_get_point
    //% block="獲取點 %pointIndex 的壓力值"
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
     * 獲取腳類型 (左/右)
     */
    //% blockId=pressuresensor_get_foot_type
    //% block="獲取腳類型"
    //% weight=70
    export function getFootType(): FootType {
        if (dataBuffer.length < 39) return FootType.Unknown;
        
        return dataBuffer[1] == 0x01 ? FootType.Left : 
               dataBuffer[1] == 0x02 ? FootType.Right : 
               FootType.Unknown;
    }

    /**
     * 是否為左腳數據
     */
    //% blockId=pressuresensor_is_left_foot
    //% block="是左腳數據"
    //% weight=65
    export function isLeftFoot(): boolean {
        return getFootType() === FootType.Left;
    }

    /**
     * 是否為右腳數據
     */
    //% blockId=pressuresensor_is_right_foot
    //% block="是右腳數據"
    //% weight=64
    export function isRightFoot(): boolean {
        return getFootType() === FootType.Right;
    }

    /**
     * 手動請求新數據
     */
    //% blockId=pressuresensor_request_data
    //% block="請求新數據"
    //% weight=60
    export function requestData(): void {
        if (debugMode) {
            serial.writeLine("請求新數據...");
        }
        // 如果需要發送請求命令，可以在這裡添加
        // serial.writeBuffer(pins.createBuffer(1).fill(requestCommand))
    }

    function processInBackground(): void {
        while (true) {
            if (!isInitialized) {
                basic.pause(100);
                continue;
            }
    
            // 主循環邏輯
            let currentTime = control.millis();
    
            // 定時採樣
            if (currentTime - lastSampleTime >= sampleInterval) {
                lastSampleTime = currentTime;
                requestData();
            }
    
            // 檢查新數據 - 修改這部分以匹配原始代碼的處理方式
            receivedBuffer = serial.readBuffer(39);
    
            if (receivedBuffer.length > 0) {
                if (debugMode) {
                    serial.writeLine("readBuffer");
                    serial.writeNumber(receivedBuffer.length);
                    serial.writeLine("//");
                }
                
                // 重置幀狀態，確保每次新的讀取都從頭開始解析
                frameStarted = false;
                
                for (let i = 0; i < receivedBuffer.length && i < BUFFER_SIZE; i++) {
                    let incomingByte = receivedBuffer[i];
                    
                    // 檢測幀頭
                    if (incomingByte == FRAME_HEADER && !frameStarted) {
                        frameStarted = true;
                        bufferIndex = 0;
                        dataBuffer[bufferIndex++] = incomingByte;
                    }
                    // 如果找到幀頭，繼續收集數據
                    else if (frameStarted) {
                        dataBuffer[bufferIndex++] = incomingByte;
    
                        // 如果收集了足夠的數據 (39字節，根據協議)
                        if (bufferIndex >= 39) {
                            // 驗證校驗和
                            if (validateChecksum()) {
                                control.raiseEvent(EVENT_DATA_RECEIVED, 0);
                                if (debugMode) {
                                    printDebugInfo();
                                }
                            } else {
                                control.raiseEvent(EVENT_CHECKSUM_ERROR, 0);
                                if (debugMode) {
                                    serial.writeLine("校驗和錯誤!");
                                }
                            }
    
                            // 重置狀態，準備下一幀
                            frameStarted = false;
                            bufferIndex = 0;
                        }
                    }
                }
            }
    
            // 小延遲以防止CPU過度佔用
            basic.pause(10);
        }
    }
    

    function validateChecksum(): boolean {
        let sum = 0;
        // 計算前38個字節的和
        for (let i = 0; i < 38; i++) {
            sum += dataBuffer[i];
            if (debugMode) {
                serial.writeNumber(dataBuffer[i]);
                serial.writeLine("");
            }
        }
        
        if (debugMode) {
            serial.writeNumber(sum);
        }
        
        // 取低8位
        let calculatedChecksum = sum & 0xFF;
    
        // 比較計算的校驗和與接收的校驗和
        return (calculatedChecksum == dataBuffer[38]);
    }
    

    // 打印調試信息
    function printDebugInfo(): void {
        let packageType = dataBuffer[1]; // 01-左腳, 02-右腳

        serial.writeLine("接收到數據包: " +
            (packageType == 0x01 ? "左腳" : "右腳"));

        // 打印原始數據（十六進制）
        let rawDataStr = "原始數據: ";
        for (let i = 0; i < 39; i++) {
            if (dataBuffer[i] < 0x10) {
                rawDataStr += "0";
            }
            rawDataStr += dataBuffer[i].toString(16) + " ";
        }
        serial.writeLine(rawDataStr);

        // 解析點數據
        serial.writeLine("解析的點數據:");

        // 18個點
        for (let i = 0; i < 18; i++) {
            let highByte = dataBuffer[2 + i * 2];
            let lowByte = dataBuffer[3 + i * 2];
            let value = highByte * 256 + lowByte;

            serial.writeLine("點" + (i + 1) + ": " +
                highByte + "*256+" +
                lowByte + "=" +
                value);
        }

        serial.writeLine("時間戳: " + control.millis() + " ms");
        serial.writeLine("------------------------------");
    }
}
