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

    // Exposed data variables that can be accessed directly
    export let currentFootType = 0;  // 1=Left, 2=Right, 255=Unknown
    export let currentTimestamp = 0;
    export let pointValues: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    export let dataUpdated = false;  // Flag to indicate new data is available

    // Data type definitions
    export enum FootType {
        //% block="Left Foot"
        Left = 0x01,
        //% block="Right Foot"
        Right = 0x02,
        //% block="Unknown"
        Unknown = 0xFF
    }

    // Data options for getData function
    export enum DataOptions {
        //% block="All Data"
        All = 0,
        //% block="Foot Type Only"
        FootTypeOnly = 1,
        //% block="Pressure Points Only"
        PointsOnly = 2,
        //% block="Timestamp Only"
        TimestampOnly = 3,
        //% block="Foot Type and Points"
        FootTypeAndPoints = 4,
        //% block="Foot Type and Timestamp"
        FootTypeAndTimestamp = 5,
        //% block="Points and Timestamp"
        PointsAndTimestamp = 6
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
    //% blockId=pressure_sensor_init
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
        
        // Initialize point values
        for (let i = 0; i < 18; i++) {
            pointValues[i] = 0;
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
    //% blockId=pressure_sensor_set_debug
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
    //% blockId=pressure_sensor_on_data
    //% block="On pressure data received"
    //% weight=95
    export function onDataReceived(handler: () => void) {
        control.onEvent(EVENT_DATA_RECEIVED, 0, handler);
    }

    /**
     * When checksum error occurs
     */
    //% blockId=pressure_sensor_on_checksum_error
    //% block="On checksum error"
    //% weight=85
    export function onChecksumError(handler: () => void) {
        control.onEvent(EVENT_CHECKSUM_ERROR, 0, handler);
    }

    /**
     * Test connection and data reception
     */
    //% blockId=pressure_sensor_test
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
     * Get the latest pressure data with options to select which data to include
     * @param options Select which data to include in the result
     */
    //% blockId=pressure_sensor_get_data
    //% block="Get pressure data %options"
    //% options.defl=DataOptions.All
    //% weight=80
    export function getData(options: DataOptions = DataOptions.All): string {
        // Create the result object based on selected options
        let result: any = {};
        
        if (options === DataOptions.All || 
            options === DataOptions.FootTypeOnly || 
            options === DataOptions.FootTypeAndPoints || 
            options === DataOptions.FootTypeAndTimestamp) {
            
            result.footType = currentFootType === FootType.Left ? "Left" : 
                              currentFootType === FootType.Right ? "Right" : "Unknown";
        }
        
        if (options === DataOptions.All || 
            options === DataOptions.PointsOnly || 
            options === DataOptions.FootTypeAndPoints || 
            options === DataOptions.PointsAndTimestamp) {
            
            result.points = pointValues;
        }
        
        if (options === DataOptions.All || 
            options === DataOptions.TimestampOnly || 
            options === DataOptions.FootTypeAndTimestamp || 
            options === DataOptions.PointsAndTimestamp) {
            
            result.timestamp = currentTimestamp;
        }
        
        // Convert to string and return
        return JSON.stringify(result);
    }

    /**
     * Get current foot type as number (1=Left, 2=Right, 255=Unknown)
     */
    //% blockId=pressure_sensor_get_foot_type_number
    //% block="Get foot type as number"
    //% weight=72
    export function getFootTypeNumber(): number {
        return currentFootType;
    }

    /**
     * Get pressure value for a specific point
     * @param pointIndex Point index (1-18)
     */
    //% blockId=pressure_sensor_get_point
    //% block="Get pressure value for point %pointIndex"
    //% pointIndex.min=1 pointIndex.max=18
    //% weight=75
    export function getPointValue(pointIndex: number): number {
        if (pointIndex < 1 || pointIndex > 18) return 0;
        return pointValues[pointIndex - 1];
    }

    /**
     * Get foot type (Left/Right)
     */
    //% blockId=pressure_sensor_get_foot_type
    //% block="Get foot type"
    //% weight=70
    export function getFootType(): FootType {
        return currentFootType;
    }

    /**
     * Check if data is for left foot
     */
    //% blockId=pressure_sensor_is_left_foot
    //% block="Is left foot data"
    //% weight=65
    export function isLeftFoot(): boolean {
        return currentFootType === FootType.Left;
    }

    /**
     * Check if data is for right foot
     */
    //% blockId=pressure_sensor_is_right_foot
    //% block="Is right foot data"
    //% weight=64
    export function isRightFoot(): boolean {
        return currentFootType === FootType.Right;
    }

    /**
     * Get current timestamp
     */
    //% blockId=pressure_sensor_get_timestamp
    //% block="Get timestamp"
    //% weight=63
    export function getTimestamp(): number {
        return currentTimestamp;
    }

    /**
     * Check if data has been updated since last check
     */
    //% blockId=pressure_sensor_is_data_updated
    //% block="Is data updated"
    //% weight=62
    export function isDataUpdated(): boolean {
        if (dataUpdated) {
            dataUpdated = false;  // Reset flag after checking
            return true;
        }
        return false;
    }

    /**
     * Manually request new data
     */
    //% blockId=pressure_sensor_request_data
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
                                // Update the global variables when valid data is received
                                updateGlobalVariables();
                                
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
    
    // Update global variables with the latest data
    function updateGlobalVariables(): void {
        // Update foot type
        currentFootType = dataBuffer[1];
        
        // Update timestamp
        currentTimestamp = control.millis();
        
        // Update point values
        for (let i = 0; i < 18; i++) {
            let highByte = dataBuffer[2 + i * 2];
            let lowByte = dataBuffer[3 + i * 2];
            pointValues[i] = highByte * 256 + lowByte;
        }
        
        // Set the updated flag
        dataUpdated = true;
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

        serial.writeLine("Timestamp: " + currentTimestamp + " ms");
        serial.writeLine("------------------------------");
    }
}