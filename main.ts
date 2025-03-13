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

    // Foot region definitions (using 0-based index internally)
    export const TOE_REGION = [0, 6, 12, 16, 17];      // Points 1, 7, 13, 17, 18 (front-most points with y ≥ 0.8)
    export const FOREFOOT_REGION = [5, 11, 15];        // Points 6, 12, 16 (y = 0.7)
    export const MIDFOOT_REGION = [4, 10, 14];         // Points 5, 11, 15 (y = 0.5)
    export const ARCH_REGION = [2, 8];                 // Points 3, 9 (y = 0.3)
    export const HEEL_REGION = [3, 9];                 // Points 4, 10 (y = 0.2, back-most points)

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

    // Output format for getCenterOfPressure
    export enum CoPFormat {
        //% block="Coordinates Only"
        Coordinates = 0,
        //% block="With Pressure"
        WithPressure = 1,
        //% block="With Normalized Pressure"
        WithNormalizedPressure = 2,
        //% block="As String"
        AsString = 3,
        //% block="With Pressure As String"
        WithPressureAsString = 4
    }

    // Event handling
    export const EVENT_DATA_RECEIVED = 1;
    export const EVENT_CHECKSUM_ERROR = 2;

    // ==================== FREQUENTLY USED FUNCTIONS ====================
    
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
     * When pressure data is received
     */
    //% blockId=pressure_sensor_on_data
    //% block="On pressure data received"
    //% weight=98
    export function onDataReceived(handler: () => void) {
        control.onEvent(EVENT_DATA_RECEIVED, 0, handler);
    }

    /**
     * Get pressure value for a specific point (1-18)
     * @param pointIndex Point index (1-18)
     */
    //% blockId=pressure_sensor_get_point
    //% block="Get pressure value for point %pointIndex"
    //% pointIndex.min=1 pointIndex.max=18
    //% weight=96
    export function getPointValue(pointIndex: number): number {
        if (pointIndex < 1 || pointIndex > 18) return 0;
        return pointValues[pointIndex - 1];
    }

    /**
     * Get Center of Pressure (CoP) data in the requested format
     * @param format The format to return the CoP data in
     * @returns CoP data in the requested format (coordinates, with pressure, or as string)
     */
    //% blockId=pressure_sensor_get_cop
    //% block="Get Center of Pressure %format"
    //% format.defl=CoPFormat.Coordinates
    //% weight=95
    export function getCenterOfPressure(format: CoPFormat = CoPFormat.Coordinates): any {
        // Calculate the CoP coordinates
        const pointCoordinates = [
            [0.2, 0.8],  // Point 1
            [0.1, 0.9],  // Point 2
            [0.1, 0.3],  // Point 3
            [0.1, 0.2],  // Point 4
            [0.1, 0.5],  // Point 5
            [0.1, 0.7],  // Point 6
            [0.3, 0.8],  // Point 7
            [0.3, 0.9],  // Point 8
            [0.3, 0.3],  // Point 9
            [0.3, 0.2],  // Point 10
            [0.3, 0.5],  // Point 11
            [0.3, 0.7],  // Point 12
            [0.5, 0.8],  // Point 13
            [0.5, 0.9],  // Point 14
            [0.5, 0.5],  // Point 15
            [0.5, 0.7],  // Point 16
            [0.7, 0.8],  // Point 17
            [0.7, 0.9],  // Point 18
        ];

        // Mirror the x-coordinates if this is a right foot
        if (currentFootType === FootType.Right) {
            for (let i = 0; i < pointCoordinates.length; i++) {
                pointCoordinates[i][0] = 1 - pointCoordinates[i][0];
            }
        }

        let totalPressure = 0;
        let weightedSumX = 0;
        let weightedSumY = 0;
        
        // Find maximum pressure for normalization
        let maxPressure = 0;
        for (let i = 0; i < 18; i++) {
            if (pointValues[i] > maxPressure) {
                maxPressure = pointValues[i];
            }
        }

        // Calculate weighted average of coordinates based on pressure values
        for (let i = 0; i < 18; i++) {
            const pressure = pointValues[i];
            totalPressure += pressure;
            weightedSumX += pressure * pointCoordinates[i][0];
            weightedSumY += pressure * pointCoordinates[i][1];
        }

        // Calculate normalized pressure (0.0 to 1.0)
        // If no pressure or max is 0, normalized value is 0
        let normalizedPressure = 0;
        if (maxPressure > 0) {
            normalizedPressure = totalPressure / (maxPressure * 18);
        }

        // Avoid division by zero
        if (totalPressure === 0) {
            // Return appropriate format with default values
            switch (format) {
                case CoPFormat.Coordinates:
                    return [0, 0]; // Center point in -10 to 10 range
                case CoPFormat.WithPressure:
                    return [0, 0, 0]; // Center point with zero pressure
                case CoPFormat.WithNormalizedPressure:
                    return [0, 0, 0]; // Center point with zero normalized pressure
                case CoPFormat.AsString:
                    return "CoP: (0.00, 0.00)";
                case CoPFormat.WithPressureAsString:
                    return "CoP: (0.00, 0.00) Pressure: 0%";
            }
        }

        // Calculate center of pressure
        const copX = weightedSumX / totalPressure;
        const copY = weightedSumY / totalPressure;
        
        // Convert 0-1 range to -10 to 10 range
        // For X: 0->-10, 0.5->0, 1->10
        // For Y: 0->-10, 0.5->0, 1->10
        const scaledX = (copX - 0.5) * 20;
        const scaledY = (copY - 0.5) * 20;
        
        // Format to 2 decimal places for display
        const formattedX = Math.round(scaledX * 100) / 100;
        const formattedY = Math.round(scaledY * 100) / 100;
        
        // Format normalized pressure as percentage with 1 decimal place
        const pressurePercentage = Math.round(normalizedPressure * 1000) / 10;

        // Return the appropriate format
        switch (format) {
            case CoPFormat.Coordinates:
                return [scaledX, scaledY];
            case CoPFormat.WithPressure:
                // Use normalized pressure scaled to 0-100 range
                return [scaledX, scaledY, Math.round(normalizedPressure * 100)];
            case CoPFormat.WithNormalizedPressure:
                return [scaledX, scaledY, normalizedPressure];
            case CoPFormat.AsString:
                return `CoP: (${formattedX}, ${formattedY})`;
            case CoPFormat.WithPressureAsString:
                return `CoP: (${formattedX}, ${formattedY}) Pressure: ${pressurePercentage}%`;
            default:
                return [scaledX, scaledY];
        }
    }

    /**
     * Check if data has been updated since last check
     */
    //% blockId=pressure_sensor_is_data_updated
    //% block="Is data updated"
    //% weight=91
    export function isDataUpdated(): boolean {
        if (dataUpdated) {
            dataUpdated = false;  // Reset flag after checking
            return true;
        }
        return false;
    }

    /**
     * Check if data is for left foot
     */
    //% blockId=pressure_sensor_is_left_foot
    //% block="Is left foot data"
    //% weight=90
    export function isLeftFoot(): boolean {
        return currentFootType === FootType.Left;
    }

    /**
     * Check if data is for right foot
     */
    //% blockId=pressure_sensor_is_right_foot
    //% block="Is right foot data"
    //% weight=89
    export function isRightFoot(): boolean {
        return currentFootType === FootType.Right;
    }

    /**
     * Get current foot type as number (1=Left, 2=Right, 255=Unknown)
     */
    //% blockId=pressure_sensor_get_foot_type_number
    //% block="Get foot type as number"
    //% weight=88
    export function getFootTypeNumber(): number {
        return currentFootType;
    }

    /**
     * Manually request new data
     */
    //% blockId=pressure_sensor_request_data
    //% block="Request new data"
    //% weight=87
    export function requestData(): void {
        if (debugMode) {
            serial.writeLine("Requesting new data...");
        }
        // If you need to send request command, add it here
        // serial.writeBuffer(pins.createBuffer(1).fill(requestCommand))
    }

    /**
     * Get all pressure points as a formatted string for display
     * @param group Select which group of points to display
     */
    //% blockId=pressure_sensor_get_all_points
    //% block="Show all pressure points %group"
    //% group.defl=PointGroup.All
    //% weight=85
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
     * Get normalized pressure values for all points (0-100%)
     * @param group Select which group of points to display
     */
    //% blockId=pressure_sensor_get_normalized_points
    //% block="Show normalized pressure points %group"
    //% group.defl=PointGroup.All
    //% weight=84
    export function getNormalizedPoints(group: PointGroup = PointGroup.All): string {
        const range = getPointRange(group);
        let result = "Normalized Points: \n";
        
        // Find maximum value for normalization
        let maxValue = 0;
        for (let i = 0; i < 18; i++) {
            if (pointValues[i] > maxValue) {
                maxValue = pointValues[i];
            }
        }
        
        // If no pressure detected, return zeros
        if (maxValue === 0) {
            for (let i = range.start; i <= range.end; i += range.step) {
                result += "P" + (i + 1) + ": 0%";
                if (i < range.end) {
                    if ((i - range.start + 1) % 3 === 0) {
                        result += "\n";
                    } else {
                        result += " | ";
                    }
                }
            }
            return result;
        }
        
        // Create normalized output
        for (let i = range.start; i <= range.end; i += range.step) {
            // Calculate percentage with 1 decimal place
            const percentage = Math.round((pointValues[i] / maxValue) * 1000) / 10;
            result += "P" + (i + 1) + ": " + percentage + "%";
            
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

    // ==================== LESS FREQUENTLY USED FUNCTIONS ====================

    /**
     * Get the sum of all pressure points
     * @param group Select which group of points to sum
     */
    //% blockId=pressure_sensor_get_points_sum
    //% block="Sum of pressure points %group"
    //% group.defl=PointGroup.All
    //% weight=60
    export function getPointsSum(group: PointGroup = PointGroup.All): number {
        const range = getPointRange(group);
        let sum = 0;
        
        for (let i = range.start; i <= range.end; i += range.step) {
            sum += pointValues[i];
        }
        
        return sum;
    }

    /**
     * Get the normalized sum of pressure points (0.0 to 1.0)
     * @param group Select which group of points to sum
     */
    //% blockId=pressure_sensor_get_normalized_sum
    //% block="Normalized sum of pressure points %group"
    //% group.defl=PointGroup.All
    //% weight=59
    export function getNormalizedSum(group: PointGroup = PointGroup.All): number {
        const range = getPointRange(group);
        let sum = 0;
        let count = 0;
        
        // Find max pressure value
        let maxValue = 0;
        for (let i = 0; i < 18; i++) {
            if (pointValues[i] > maxValue) {
                maxValue = pointValues[i];
            }
        }
        
        // If no pressure, return 0
        if (maxValue === 0) {
            return 0;
        }
        
        // Calculate sum of selected points
        for (let i = range.start; i <= range.end; i += range.step) {
            sum += pointValues[i];
            count++;
        }
        
        // Normalize by max possible value (max * number of points)
        return sum / (maxValue * count);
    }

    /**
     * Get the average of all pressure points
     * @param group Select which group of points to average
     */
    //% blockId=pressure_sensor_get_points_average
    //% block="Average of pressure points %group"
    //% group.defl=PointGroup.All
    //% weight=58
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
    //% weight=57
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
     * Get foot type (Left/Right)
     */
    //% blockId=pressure_sensor_get_foot_type
    //% block="Get foot type"
    //% weight=50
    export function getFootType(): FootType {
        return currentFootType;
    }

    /**
     * Get current timestamp
     */
    //% blockId=pressure_sensor_get_timestamp
    //% block="Get timestamp"
    //% weight=45
    export function getTimestamp(): number {
        return currentTimestamp;
    }

    /**
     * Set debug mode
     * @param debug Enable debug mode
     */
    //% blockId=pressure_sensor_set_debug
    //% block="Set debug mode %debug"
    //% debug.defl=false
    //% weight=40
    export function setDebugMode(debug: boolean): void {
        debugMode = debug;
        if (debug) {
            serial.writeLine("Debug mode enabled");
        }
    }
    
    /**
     * When checksum error occurs
     */
    //% blockId=pressure_sensor_on_checksum_error
    //% block="On checksum error"
    //% weight=35
    export function onChecksumError(handler: () => void) {
        control.onEvent(EVENT_CHECKSUM_ERROR, 0, handler);
    }

    /**
     * Test connection and data reception
     */
    //% blockId=pressure_sensor_test
    //% block="Test sensor connection"
    //% weight=30
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

    // ==================== HELPER FUNCTIONS ====================

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

    // ==================== BACKGROUND PROCESSING FUNCTIONS ====================

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

        // Print CoP information
        const copInfo = getCenterOfPressure(CoPFormat.WithPressureAsString);
        serial.writeLine(copInfo);

        serial.writeLine("Timestamp: " + currentTimestamp + " ms");
        serial.writeLine("------------------------------");
    }
}