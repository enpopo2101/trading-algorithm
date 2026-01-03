/**
 * Exponential Moving Average (EMA)
 * @param {number[]} values - Array of numeric values
 * @param {number} period - EMA period
 * @returns {number[]} Array of EMA values
 */
function calculateEMA(values, period) {
    const output = new Array(values.length).fill(null);
    const k = 2 / (period + 1);

    if (values.length < period) return output; // Not enough data

    // Start with SMA for the first valid point
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += values[i];
    }
    let prevEMA = sum / period;
    output[period - 1] = prevEMA;

    for (let i = period; i < values.length; i++) {
        const val = values[i];
        const ema = (val - prevEMA) * k + prevEMA;
        output[i] = ema;
        prevEMA = ema;
    }
    return output;
}

module.exports = calculateEMA;
