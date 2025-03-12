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

    // Point selection for getAllPoints function
    export enum PointGroup {
        //% block="All Points"
        All = 0,
        //% block="Front Points (1-6)"
        Front = 1,
        //% block="Middle Points (7-12)"
        Middle = 2,
        //% block="Heel Points (13-18)"
        Heel = 3,
        //% block="Left Side Points (odd numbers)"
        LeftSide = 4,
        //% block="Right Side Points (even numbers)"
        RightSide = 5
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
     * Helper function to get point range based on group
     */
    function getPointRange(group: PointGroup): { start: number, end: number, step: number } {
        let start = 0;
        let end = 17;
        let step = 1;
        
        switch (group) {
            case PointGroup.Front:
                start = 0;
                end = 5;
                break;
            case PointGroup.Middle:
                start = 6;
                end = 11;
                break;
            case PointGroup.Heel:
                start = 12;
                end = 17;
                break;
            case PointGroup.LeftSide:
                start = 0;
                end = 17;
                step = 2;
                break;
            case PointGroup.RightSide:
                start = 1;
                end = 17;
                step = 2;
                break;
        }
        
        return { start, end, step };
    }

    /**
     * Get all pressure points as a formatted string for display
     * @param group Select which group of points to display
     */
    //% blockId=pressure_sensor_get_all_points
    //% block="Show all pressure points %group"
    //% group.defl=PointGroup.All
    //% weight=79
    export function getAllPoints(group: PointGroup = PointGroup.All): string {
        const range = getPointRange(group);
        let result = "Points: \n";
        
        for (let i = range.start; i <= range.end; i += range.step) {
            result += "P" + (i + 1) + ": " + pointValues[i];
            if (i < range.end) {
                // Add a new line every 3 points for better readability
                if ((i - range.start + 1) % 3 === 0) {
                    result += "\n";
                } else {
                    result += " | ";
                }
            }
        }
        
        return result;
    }

    /**
     * Get the sum of all pressure points
     * @param group Select which group of points to sum
     */
    //% blockId=pressure_sensor_get_points_sum
    //% block="Sum of pressure points %group"
    //% group.defl=PointGroup.All
    //% weight=78
    export function getPointsSum(group: PointGroup = PointGroup.All): number {
        const range = getPointRange(group);
        let sum = 0;
        
        for (let i = range.start; i <= range.end; i += range.step) {
            sum += pointValues[i];
        }
        
        return sum;
    }

    /**
     * Get the average of all pressure points
     * @param group Select which group of points to average
     */
    //% blockId=pressure_sensor_get_points_average
    //% block="Average of pressure points %group"
    //% group.defl=PointGroup.All
    //% weight=77
    export function getPointsAverage(group: PointGroup = PointGroup.All): number {
        const range = getPointRange(group);
        let sum = 0;
        let count = 0;
        
        for (let i = range.start; i <= range.end; i += range.step) {
            sum += pointValues[i];
            count++;
        }
        
        return count > 0 ? Math.round(sum / count) : 0;
    }

    /**
     * Get the maximum pressure point value
     * @param group Select which group of points to check
     */
    //% blockId=pressure_sensor_get_points_max
    //% block="Maximum pressure in %group"
    //% group.defl=PointGroup.All
    //% weight=76
    export function getPointsMax(group: PointGroup = PointGroup.All): number {
        const range = getPointRange(group);
        let max = 0;
        
        for (let i = range.start; i <= range.end; i += range.step) {
            if (pointValues[i] > max) {
                max = pointValues[i];
            }
        }
        
        return max;
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
     * Get direct access to point value 1
     */
    //% blockId=pressure_sensor_point_1
    //% block="Pressure point 1"
    //% weight=59
    export function point1(): number {
        return pointValues[0];
    }

    /**
     * Get direct access to point value 2
     */
    //% blockId=pressure_sensor_point_2
    //% block="Pressure point 2"
    //% weight=58
    export function point2(): number {
        return pointValues[1];
    }

    /**
     * Get direct access to point value 3
     */
    //% blockId=pressure_sensor_point_3
    //% block="Pressure point 3"
    //% weight=57
    export function point3(): number {
        return pointValues[2];
    }

    /**
     * Get direct access to point value 4
     */
    //% blockId=pressure_sensor_point_4
    //% block="Pressure point 4"
    //% weight=56
    export function point4(): number {
        return pointValues[3];
    }

    /**
     * Get direct access to point value 5
     */
    //% blockId=pressure_sensor_point_5
    //% block="Pressure point 5"
    //% weight=55
    export function point5(): number {
        return pointValues[4];
    }

    /**
     * Get direct access to point value 6
     */
    //% blockId=pressure_sensor_point_6
    //% block="Pressure point 6"
    //% weight=54
    export function point6(): number {
        return pointValues[5];
    }

    /**
     * Get direct access to point value 7
     */
    //% blockId=pressure_sensor_point_7
    //% block="Pressure point 7"
    //% weight=53
    export function point7(): number {
        return pointValues[6];
    }

    /**
     * Get direct access to point value 8
     */
    //% blockId=pressure_sensor_point_8
    //% block="Pressure point 8"
    //% weight=52
    export function point8(): number {
        return pointValues[7];
    }

    /**
     * Get direct access to point value 9
     */
    //% blockId=pressure_sensor_point_9
    //% block="Pressure point 9"
    //% weight=51
    export function point9(): number {
        return pointValues[8];
    }

    /**
     * Get direct access to point value 10
     */
    //% blockId=pressure_sensor_point_10
    //% block="Pressure point 10"
    //% weight=50
    export function point10(): number {
        return pointValues[9];
    }

    /**
     * Get direct access to point value 11
     */
    //% blockId=pressure_sensor_point_11
    //% block="Pressure point 11"
    //% weight=49
    export function point11(): number {
        return pointValues[10];
    }

    /**
     * Get direct access to point value 12
     */
    //% blockId=pressure_sensor_point_12
    //% block="Pressure point 12"
    //% weight=48
    export function point12(): number {
        return pointValues[11];
    }

    /**
     * Get direct access to point value 13
     */
    //% blockId=pressure_sensor_point_13
    //% block="Pressure point 13"
    //% weight=47
    export function point13(): number {
        return pointValues[12];
    }

    /**
     * Get direct access to point value 14
     */
    //% blockId=pressure_sensor_point_14
    //% block="Pressure point 14"
    //% weight=46
    export function point14(): number {
        return pointValues[13];
    }

    /**
     * Get direct access to point value 15
     */
    //% blockId=pressure_sensor_point_15
    //% block="Pressure point 15"
    //% weight=45
    export function point15(): number {
        return pointValues[14];
    }

    /**
     * Get direct access to point value 16
     */
    //% blockId=pressure_sensor_point_16
    //% block="Pressure point 16"
    //% weight=44
    export function point16(): number {
        return pointValues[15];
    }

    /**
     * Get direct access to point value 17
     */
    //% blockId=pressure_sensor_point_17
    //% block="Pressure point 17"
    //% weight=43
    export function point17(): number {
        return pointValues[16];
    }

    /**
     * Get direct access to point value 18
     */
    //% blockId=pressure_sensor_point_18
    //% block="Pressure point 18"
    //% weight=42
    export function point18(): number {
        return pointValues[17];
    }

    /**
     * Get all pressure points as an array (for advanced users)
     */
    //% blockId=pressure_sensor_get_points_array
    //% block="Get all pressure points array"
    //% advanced=true
    //% weight=40
    export function getPointsArray(): number[] {
        return pointValues;
    }

    /**
     * Manually request new data
     */
    //% blockId=pressure_sensor_request_data
    //% block="Request new data"
    //% weight=41
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