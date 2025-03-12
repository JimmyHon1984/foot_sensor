/**
 * PressureSensorLib - MicroBit Pressure Sensor Library
 * Used for reading pressure sensor data via serial port
 */
//% color="#ff6800" weight=100 icon="\uf192" block="Pressure Sensor"
namespace PressureSensorLib {
    // Constants definition
    export const FRAME_HEADER = 0xAA;
    export const BUFFER_SIZE = 40;  // Complete data packet buffer size
    export const DEFAULT_SAMPLE_INTERVAL = 1000;  // Default sampling interval (milliseconds)
    export const DEFAULT_BAUD_RATE = BaudRate.BaudRate115200;  // Default baud rate
    

    // Global variables
    let dataBuffer: number[] = [];
    let bufferIndex = 0;
    let frameStarted = false;
    let lastSampleTime = 0;
    let receivedBuffer = pins.createBuffer(1);
    let sampleInterval = DEFAULT_SAMPLE_INTERVAL;
    let isInitialized = false;
    let debugMode = false;

    // Data type definitions
    export enum FootType {
        //% block="Left Foot"
        Left = 0x01,
        //% block="Right Foot"
        Right = 0x02,
        //% block="Unknown"
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
        
        // Add toString method to display data properly
        toString(): string {
            return JSON.stringify({
                footType: this.footType === FootType.Left ? "Left" : 
                          this.footType === FootType.Right ? "Right" : "Unknown",
                points: this.points,
                timestamp: this.timestamp
            });
        }
    }

    // Event handling
    export const EVENT_DATA_RECEIVED = 1;
    export const EVENT_CHECKSUM_ERROR = 2;

    // Initialization function
    /**
     * Initialize pressure sensor library
     * @param txPin TX pin
     * @param rxPin RX pin
     * @param baudRate Baud rate
     * @param interval Sampling interval (milliseconds)
     */
    //% blockId=pressuresensor_init
    //% block="Initialize pressure sensor TX %txPin RX %rxPin baud rate %baudRate sampling interval %interval"
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
        
        // Initialize serial communication
        serial.redirect(txPin, rxPin, baudRate);
        serial.setRxBufferSize(128);
        
        // Set sampling interval
        sampleInterval = interval;
        
        // Initialize buffer
        dataBuffer = [];
        for (let i = 0; i < BUFFER_SIZE; i++) {
            dataBuffer.push(0);
        }
        
        // Start background processing
        control.inBackground(processInBackground);
        
        if (debugMode) {
            serial.writeLine("PressureSensor library initialized");
            serial.writeLine(`Baud rate: ${baudRate}, Sampling interval: ${interval}ms`);
        }
        
        isInitialized = true;
        basic.showIcon(IconNames.Yes);
    }

    /**
     * Set debug mode
     * @param debug Enable debug mode
     */
    //% blockId=pressuresensor_set_debug
    //% block="Set debug mode %debug"
    //% debug.defl=false
    //% weight=90
    export function setDebugMode(debug: boolean): void {
        debugMode = debug;
        if (debug) {
            serial.writeLine("Debug mode enabled");
        }
    }
    

    /**
     * When pressure data is received
     */
    //% blockId=pressuresensor_on_data
    //% block="On pressure data received"
    //% weight=95
    export function onDataReceived(handler: () => void) {
        control.onEvent(EVENT_DATA_RECEIVED, 0, handler);
    }

    /**
     * When checksum error occurs
     */
    //% blockId=pressuresensor_on_checksum_error
    //% block="On checksum error"
    //% weight=85
    export function onChecksumError(handler: () => void) {
        control.onEvent(EVENT_CHECKSUM_ERROR, 0, handler);
    }

    /**
     * Test connection and data reception
     */
    //% blockId=pressuresensor_test
    //% block="Test sensor connection"
    //% weight=55
    export function testConnection(): void {
        if (!isInitialized) {
            serial.writeLine("Please initialize the sensor first!");
            return;
        }
        
        serial.writeLine("Testing sensor connection...");
        serial.writeLine("Waiting for data...");
        
        // Show waiting animation
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
        
        // Request data
        requestData();
        
        // Wait 5 seconds to see if data is received
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
            serial.writeLine("Test successful: Data received!");
            basic.showIcon(IconNames.Yes);
        } else {
            serial.writeLine("Test failed: No data received");
            basic.showIcon(IconNames.No);
        }
        
        basic.pause(1000);
    }


    /**
     * Get the latest pressure data
     */
    //% blockId=pressuresensor_get_data
    //% block="Get pressure data"
    //% weight=80
    export function getData(): PressureData {
        const data = new PressureData();
        
        // Ensure dataBuffer is initialized and has sufficient length
        if (!dataBuffer || dataBuffer.length < 39) return data;
        
        data.footType = dataBuffer[1] == 0x01 ? FootType.Left : 
                        dataBuffer[1] == 0x02 ? FootType.Right : 
                        FootType.Unknown;
        
        // Copy raw data
        for (let i = 0; i < 39; i++) {
            data.rawData.push(dataBuffer[i]);
        }
        
        // Parse point data
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
     * Get pressure value for a specific point
     * @param pointIndex Point index (1-18)
     */
    //% blockId=pressuresensor_get_point
    //% block="Get pressure value for point %pointIndex"
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
     * Get foot type (Left/Right)
     */
    //% blockId=pressuresensor_get_foot_type
    //% block="Get foot type"
    //% weight=70
    export function getFootType(): FootType {
        if (dataBuffer.length < 39) return FootType.Unknown;
        
        return dataBuffer[1] == 0x01 ? FootType.Left : 
               dataBuffer[1] == 0x02 ? FootType.Right : 
               FootType.Unknown;
    }

    /**
     * Check if data is for left foot
     */
    //% blockId=pressuresensor_is_left_foot
    //% block="Is left foot data"
    //% weight=65
    export function isLeftFoot(): boolean {
        return getFootType() === FootType.Left;
    }

    /**
     * Check if data is for right foot
     */
    //% blockId=pressuresensor_is_right_foot
    //% block="Is right foot data"
    //% weight=64
    export function isRightFoot(): boolean {
        return getFootType() === FootType.Right;
    }

    /**
     * Manually request new data
     */
    //% blockId=pressuresensor_request_data
    //% block="Request new data"
    //% weight=60
    export function requestData(): void {
        if (debugMode) {
            serial.writeLine("Requesting new data...");
        }
        // If you need to send request command, add it here
        // serial.writeBuffer(pins.createBuffer(1).fill(requestCommand))
    }

    function processInBackground(): void {
        while (true) {
            if (!isInitialized) {
                basic.pause(100);
                continue;
            }
    
            // Main loop logic
            let currentTime = control.millis();
    
            // Timed sampling
            if (currentTime - lastSampleTime >= sampleInterval) {
                lastSampleTime = currentTime;
                requestData();
            }
    
            // Check for new data - modify this part to match the original code's processing method
            receivedBuffer = serial.readBuffer(39);
    
            if (receivedBuffer.length > 0) {
                if (debugMode) {
                    serial.writeLine("readBuffer");
                    serial.writeNumber(receivedBuffer.length);
                    serial.writeLine("//");
                }
                
                // Reset frame status to ensure each new read starts parsing from the beginning
                frameStarted = false;
                
                for (let i = 0; i < receivedBuffer.length && i < BUFFER_SIZE; i++) {
                    let incomingByte = receivedBuffer[i];
                    
                    // Detect frame header
                    if (incomingByte == FRAME_HEADER && !frameStarted) {
                        frameStarted = true;
                        bufferIndex = 0;
                        dataBuffer[bufferIndex++] = incomingByte;
                    }
                    // If frame header is found, continue collecting data
                    else if (frameStarted) {
                        dataBuffer[bufferIndex++] = incomingByte;
    
                        // If enough data is collected (39 bytes, according to protocol)
                        if (bufferIndex >= 39) {
                            // Validate checksum
                            if (validateChecksum()) {
                                control.raiseEvent(EVENT_DATA_RECEIVED, 0);
                                if (debugMode) {
                                    printDebugInfo();
                                }
                            } else {
                                control.raiseEvent(EVENT_CHECKSUM_ERROR, 0);
                                if (debugMode) {
                                    serial.writeLine("Checksum error!");
                                }
                            }
    
                            // Reset status, prepare for next frame
                            frameStarted = false;
                            bufferIndex = 0;
                        }
                    }
                }
            }
    
            // Small delay to prevent CPU overuse
            basic.pause(10);
        }
    }
    

    function validateChecksum(): boolean {
        let sum = 0;
        // Calculate sum of first 38 bytes
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
        
        // Take lower 8 bits
        let calculatedChecksum = sum & 0xFF;
    
        // Compare calculated checksum with received checksum
        return (calculatedChecksum == dataBuffer[38]);
    }
    

    // Print debug information
    function printDebugInfo(): void {
        let packageType = dataBuffer[1]; // 01-left foot, 02-right foot

        serial.writeLine("Received data package: " +
            (packageType == 0x01 ? "Left foot" : "Right foot"));

        // Print raw data (hexadecimal)
        let rawDataStr = "Raw data: ";
        for (let i = 0; i < 39; i++) {
            if (dataBuffer[i] < 0x10) {
                rawDataStr += "0";
            }
            rawDataStr += dataBuffer[i].toString() + " ";
        }
        serial.writeLine(rawDataStr);

        // Parse point data
        serial.writeLine("Parsed point data:");

        // 18 points
        for (let i = 0; i < 18; i++) {
            let highByte = dataBuffer[2 + i * 2];
            let lowByte = dataBuffer[3 + i * 2];
            let value = highByte * 256 + lowByte;

            serial.writeLine("Point" + (i + 1) + ": " +
                highByte + "*256+" +
                lowByte + "=" +
                value);
        }

        serial.writeLine("Timestamp: " + control.millis() + " ms");
        serial.writeLine("------------------------------");
    }
}