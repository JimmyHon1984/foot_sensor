# PressureSensorLib

这个库用于 MicroBit 开发板与压力传感器的通信，可以读取和处理来自左右脚压力传感器的数据。

## 基本信息

- 通过串口 (P1/P2) 读取数据包
- 默认采样时间: 1000ms (1秒)
- 默认波特率: 115200
- 支持18个压力点的数据读取
- 可区分左脚和右脚数据

## 使用方法

### 初始化库

```blocks
// 使用默认设置初始化
PressureSensorLib.init()

// 或者自定义参数
PressureSensorLib.init(
    SerialPin.P1,  // TX引脚
    SerialPin.P2,  // RX引脚
    BaudRate.BaudRate115200,  // 波特率
    1000  // 采样间隔(毫秒)
)

// 可选：启用调试模式
PressureSensorLib.setDebugMode(true)
```

### 接收数据

```blocks
// 当收到压力数据时
PressureSensorLib.onDataReceived(function() {
    // 获取所有数据
    let data = PressureSensorLib.getData()
    
    // 或者获取特定点的压力值
    let point1 = PressureSensorLib.getPointValue(1)
    
    // 判断是左脚还是右脚
    if (PressureSensorLib.isLeftFoot()) {
        basic.showString("L")
    } else {
        basic.showString("R")
    }
})

// 处理校验和错误
PressureSensorLib.onChecksumError(function() {
    basic.showIcon(IconNames.No)
})
```

### 手动请求数据

```blocks
// 手动请求新数据
PressureSensorLib.requestData()
```

## 数据格式

每个数据包包含以下信息：
- 帧头 (0xAA)
- 脚类型 (0x01=左脚, 0x02=右脚)
- 18个压力点数据 (每点2字节)
- 校验和 (1字节)

## 示例项目

### 基本示例

```blocks
// 初始化库
PressureSensorLib.init()

// 当收到数据时
PressureSensorLib.onDataReceived(function() {
    // 显示脚类型
    if (PressureSensorLib.isLeftFoot()) {
        basic.showString("L")
    } else {
        basic.showString("R")
    }
})
```

### 压力热力图

```blocks
// 初始化库
PressureSensorLib.init()

// 当收到数据时
PressureSensorLib.onDataReceived(function() {
    // 找出压力最大的点
    let maxValue = 0
    let maxPoint = 0
    
    for (let i = 1; i <= 18; i++) {
        let value = PressureSensorLib.getPointValue(i)
        if (value > maxValue) {
            maxValue = value
            maxPoint = i
        }
    }
    
    // 显示压力最大的点
    basic.showNumber(maxPoint)
})
```

## 高级使用

### 获取完整数据对象

```typescript
PressureSensorLib.onDataReceived(function() {
    let data = PressureSensorLib.getData()
    
    // data.footType - 脚类型
    // data.points - 所有点的压力值数组
    // data.timestamp - 时间戳
    // data.rawData - 原始数据字节
    
    // 示例：计算平均压力
    let sum = 0
    for (let i = 0; i < data.points.length; i++) {
        sum += data.points[i]
    }
    let average = sum / data.points.length
})
```

## 故障排除

1. 如果没有收到数据，请检查:
   - 串口连接是否正确
   - 波特率设置是否匹配
   - 传感器是否正常工作

2. 如果频繁出现校验和错误:
   - 检查传感器连接是否稳定
   - 降低采样频率
   - 确保电源稳定

## 支持与反馈

如有问题或建议，请联系开发者。

## 许可证

MIT

---

> 打开 [https://github.com/yourusername/pressuresensorlib](https://github.com/yourusername/pressuresensorlib) 查看更多信息