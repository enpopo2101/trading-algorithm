const fs = require('fs');
const path = require('path');

// Configuration
const FILE_PATH = path.join(__dirname, 'data/BTC_USDT_USDT-1h-futures.json');
const PERIOD_MA = 14;
const PERIOD_EMA = 14;
const PERIOD_RSI = 14;

// Helper function to read data
function loadData(filePath) {
    try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(rawData);
        // Extract Close prices (Index 4 based on standard OHLCV format: [Timestamp, Open, High, Low, Close, Volume])
        return data.map(candle => ({
            timestamp: candle[0],
            close: candle[4]
        }));
    } catch (error) {
        console.error('Error reading file:', error);
        process.exit(1);
    }
}

// Simple Moving Average (SMA)
function calculateSMA(data, period) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(null); // Not enough data
            continue;
        }
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        sma.push(sum / period);
    }
    return sma;
}

// Exponential Moving Average (EMA)
function calculateEMA(data, period) {
    const ema = [];
    const multiplier = 2 / (period + 1);

    // Initial SMA for the first EMA point
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += data[i].close;
    }
    let prevEma = sum / period;

    // Fill initial nulls
    for (let i = 0; i < period - 1; i++) {
        ema.push(null);
    }
    // Push first EMA (which is SMA) at index (period - 1)
    ema.push(prevEma);

    // Calculate rest
    for (let i = period; i < data.length; i++) {
        const currentClose = data[i].close;
        const currentEma = (currentClose - prevEma) * multiplier + prevEma;
        ema.push(currentEma);
        prevEma = currentEma;
    }
    return ema;
}

// Relative Strength Index (RSI)
function calculateRSI(data, period) {
    const rsi = [];
    const gains = [];
    const losses = [];

    // Calculate changes
    for (let i = 1; i < data.length; i++) {
        const change = data[i].close - data[i - 1].close;
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? Math.abs(change) : 0);
    }

    // First RSI calculation (Simple Average)
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 0; i < period; i++) {
        avgGain += gains[i];
        avgLoss += losses[i];
    }
    avgGain /= period;
    avgLoss /= period;

    // First 'period' points are null (0 to period-1 in original data means period points, calculation uses 1 to period so we have 'period' changes. 
    // Wait, typical RSI needs 'period' changes, so 'period'+1 data points?
    // Let's stick to standard array alignment.

    // Fill initial nulls
    for (let i = 0; i < period; i++) {
        rsi.push(null);
    }

    // Calculate first RSI
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    let firstRSI = 100 - (100 / (1 + rs));
    rsi.push(firstRSI); // This corresponds to index 'period' (the 15th candle for period 14)

    // Wilder's Smoothing Method for subsequent steps
    for (let i = period; i < gains.length; i++) {
        const currentGain = gains[i];
        const currentLoss = losses[i];

        avgGain = ((avgGain * (period - 1)) + currentGain) / period;
        avgLoss = ((avgLoss * (period - 1)) + currentLoss) / period;

        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const currentRSI = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
        rsi.push(currentRSI);
    }

    return rsi;
}

// Main execution
function main() {
    console.log(`Processing file: ${FILE_PATH}`);
    const data = loadData(FILE_PATH);

    console.log(`Total data points: ${data.length}`);

    const sma = calculateSMA(data, PERIOD_MA);
    const ema = calculateEMA(data, PERIOD_EMA);
    const rsi = calculateRSI(data, PERIOD_RSI);

    // Output last 5 results
    console.log('\nLast 5 calculations:');
    console.log('Timestamp       | Close      | SMA(14)    | EMA(14)    | RSI(14)');
    console.log('---------------------------------------------------------------');

    const startIndex = Math.max(0, data.length - 5);
    for (let i = startIndex; i < data.length; i++) {
        const ts = new Date(data[i].timestamp).toISOString();
        const price = data[i].close.toFixed(2);
        const smaVal = sma[i] ? sma[i].toFixed(2) : 'N/A';
        const emaVal = ema[i] ? ema[i].toFixed(2) : 'N/A';
        const rsiVal = rsi[i] ? rsi[i].toFixed(2) : 'N/A';

        console.log(`${ts} | ${price}   | ${smaVal}   | ${emaVal}   | ${rsiVal}`);
    }
}

main();
