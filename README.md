# MicroBit Pressure Sensor Library

A comprehensive library for interfacing with foot pressure sensors via serial communication on the BBC micro:bit platform.

## Overview

The PressureSensorLib provides an easy-to-use interface for collecting and analyzing data from foot pressure sensors. The library supports both left and right foot sensors, with each sensor containing 18 pressure points distributed across the foot surface.

## Features

- Real-time pressure data acquisition from 18 pressure points
- Support for both left and right foot sensors
- Center of Pressure (CoP) calculation
- Region-based analysis (toe, forefoot, midfoot, arch, heel)
- Configurable sampling rate and communication parameters
- Debug mode for troubleshooting

## Hardware Setup

Connect your pressure sensor to the micro:bit using the following default configuration:
- TX: P1
- RX: P2
- Baud Rate: 115200

## Basic Usage

```typescript
// Initialize the pressure sensor
PressureSensorLib.init(
    SerialPin.P1,  // TX pin
    SerialPin.P2,  // RX pin
    BaudRate.BaudRate115200,  // Baud rate
    1000  // Sampling interval (ms)
);

// Handle incoming data
PressureSensorLib.onDataReceived(function() {
    // Check which foot the data is for
    if (PressureSensorLib.isLeftFoot()) {
        basic.showString("L");
    } else if (PressureSensorLib.isRightFoot()) {
        basic.showString("R");
    }
    
    // Get the Center of Pressure
    let cop = PressureSensorLib.getCenterOfPressure();
    
    // Display pressure data
    serial.writeLine(PressureSensorLib.getCenterOfPressureString());
});
```

## Understanding the Center of Pressure (CoP)

### What is Center of Pressure?

The Center of Pressure (CoP) represents the point where the total sum of pressure acts on the foot. It's a crucial measurement in gait analysis, balance assessment, and biomechanical studies. The CoP provides insights into:

- Weight distribution across the foot
- Balance and stability
- Gait patterns and abnormalities
- Potential musculoskeletal issues

### Sensor Point Layout

The pressure sensor contains 18 points distributed across the foot surface. Each point has a specific location on a normalized coordinate system:
Left Foot Layout (Top View) Coordinate System

17 13 7 1 (0,0) ------> (1,0) X-axis | | | | | | | | | | 18 14 8 2 | | | | | | | | | | v 15 11 5 3 (0,1) | | | | Y-axis | | | | 16 12 6 4

The points are positioned at these normalized coordinates:
- Point 1: (0.2, 0.8)
- Point 2: (0.1, 0.9)
- Point 3: (0.1, 0.3)
- Point 4: (0.1, 0.2)
- Point 5: (0.1, 0.5)
- Point 6: (0.1, 0.7)
- Point 7: (0.3, 0.8)
- Point 8: (0.3, 0.9)
- Point 9: (0.3, 0.3)
- Point 10: (0.3, 0.2)
- Point 11: (0.3, 0.5)
- Point 12: (0.3, 0.7)
- Point 13: (0.5, 0.8)
- Point 14: (0.5, 0.9)
- Point 15: (0.5, 0.5)
- Point 16: (0.5, 0.7)
- Point 17: (0.7, 0.8)
- Point 18: (0.7, 0.9)

For the right foot, the X-coordinates are mirrored to maintain consistent representation.

### How CoP is Calculated

The library calculates the CoP using a weighted average of all pressure points:

1. Each pressure point has a defined (x,y) coordinate on a normalized foot map (0-1 range)
2. The pressure value at each point is used as a weight
3. The weighted average of all coordinates gives the CoP position

CoP_x = Σ(pressure_i * x_i) / Σ(pressure_i) CoP_y = Σ(pressure_i * y_i) / Σ(pressure_i)


The resulting CoP coordinates are normalized values where:
- X-axis: 0 (medial/inner side) to 1 (lateral/outer side)
- Y-axis: 0 (heel) to 1 (toe)

### Interpreting CoP Data

- **Anterior-Posterior (Y-axis)**: Values closer to 1 indicate pressure toward the toes, while values closer to 0 indicate pressure toward the heel.
- **Medial-Lateral (X-axis)**: Values closer to 0 indicate pressure toward the inner edge of the foot, while values closer to 1 indicate pressure toward the outer edge.

Typical CoP path during normal gait:
1. Initial contact: Posterior-lateral (low Y, high X)
2. Mid-stance: Central (medium Y, medium X)
3. Push-off: Anterior-medial (high Y, low X)

Deviations from normal CoP patterns may indicate biomechanical issues such as overpronation, supination, or other gait abnormalities.

## Advanced Usage

### Region-Based Analysis

The library defines foot regions for more targeted analysis based on the Y-coordinate values:

- TOE_REGION: Points 1, 7, 13, 17, 18 (front-most points with y ≥ 0.8)
- FOREFOOT_REGION: Points 6, 12, 16 (y = 0.7, ball of foot)
- MIDFOOT_REGION: Points 5, 11, 15 (y = 0.5, middle section)
- ARCH_REGION: Points 3, 9 (y = 0.3, arch area)
- HEEL_REGION: Points 4, 10 (y = 0.2, back-most points)

You can use these regions with the library's analysis functions:

```typescript
// Get average pressure in the heel region
let heelPressure = 0;
for (let i = 0; i < PressureSensorLib.HEEL_REGION.length; i++) {
    let pointIndex = PressureSensorLib.HEEL_REGION[i];
    heelPressure += PressureSensorLib.pointValues[pointIndex];
}
heelPressure = heelPressure / PressureSensorLib.HEEL_REGION.length;
```

### Comparing Left and Right Foot

For applications that analyze both feet, you can collect and compare CoP data:

```typescript
let leftCoP: number[] = [0, 0];
let rightCoP: number[] = [0, 0];

PressureSensorLib.onDataReceived(function() {
    if (PressureSensorLib.isLeftFoot()) {
        leftCoP = PressureSensorLib.getCenterOfPressure();
    } else if (PressureSensorLib.isRightFoot()) {
        rightCoP = PressureSensorLib.getCenterOfPressure();
    }
    
    // Calculate symmetry index (SI) for medial-lateral balance
    // SI = (right - left) / (0.5 * (right + left)) * 100
    let symmetryIndex = (rightCoP[0] - leftCoP[0]) / (0.5 * (rightCoP[0] + leftCoP[0])) * 100;
    
    if (Math.abs(symmetryIndex) > 10) {
        // Significant asymmetry detected
        serial.writeLine("Asymmetry detected: " + symmetryIndex);
    }
});
```

### Clinical Applications
The CoP data can be used for various clinical applications:

1. Balance Assessment: Track CoP movement during standing to assess postural stability
2. Gait Analysis: Monitor CoP path during walking to identify abnormal patterns
3. Rehabilitation Monitoring: Measure progress in patients recovering from lower limb injuries
4. Sports Performance: Analyze weight distribution for optimal athletic performance

### Visualizing Pressure Distribution

You can create a simple visualization of the pressure distribution:

```typescript
PressureSensorLib.onDataReceived(function() {
    // Get maximum pressure value for normalization
    let maxPressure = PressureSensorLib.getPointsMax();
    
    // Get pressure at toe and heel
    let toePressure = 0;
    let heelPressure = 0;
    
    for (let i = 0; i < PressureSensorLib.TOE_REGION.length; i++) {
        toePressure += PressureSensorLib.pointValues[PressureSensorLib.TOE_REGION[i]];
    }
    
    for (let i = 0; i < PressureSensorLib.HEEL_REGION.length; i++) {
        heelPressure += PressureSensorLib.pointValues[PressureSensorLib.HEEL_REGION[i]];
    }
    
    // Normalize values
    toePressure = Math.round((toePressure / PressureSensorLib.TOE_REGION.length) / maxPressure * 9);
    heelPressure = Math.round((heelPressure / PressureSensorLib.HEEL_REGION.length) / maxPressure * 9);
    
    // Display on LED matrix (brightness 0-9)
    led.plotBrightness(2, 0, toePressure * 25); // Toe area
    led.plotBrightness(2, 4, heelPressure * 25); // Heel area
});
```

## Troubleshooting

If you encounter issues with the sensor:

1. Enable debug mode: PressureSensorLib.setDebugMode(true)
2. Test the connection: PressureSensorLib.testConnection()
3. Check serial output for detailed diagnostic information
4. Verify the serial connection parameters match your sensor specifications
5. Ensure the checksum validation is working correctly by checking for EVENT_CHECKSUM_ERROR events

## License
This library is released under the MIT License.