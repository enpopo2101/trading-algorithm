/**
 * Simple Moving Average (SMA)
 * @param {number[]} values - Array of numeric values
 * @param {number} period - SMA period
 * @returns {number[]} Array of SMA values (same length as input, null padded)
 */
function calculateSMA(values, period) {
    const output = new Array(values.length).fill(null);
    for (let i = period - 1; i < values.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += values[i - j];
        }
        output[i] = sum / period;
    }
    return output;
}

module.exports = calculateSMA;
