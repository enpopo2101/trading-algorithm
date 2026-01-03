/**
 * Relative Strength Index (RSI)
 * @param {number[]} values - Array of closing prices (or other values)
 * @param {number} period - RSI period
 * @returns {number[]} Array of RSI values
 */
function calculateRSI(values, period) {
    const output = new Array(values.length).fill(null);
    if (values.length < period + 1) return output;

    let gains = 0;
    let losses = 0;

    // First period calculation (SMA method for initial gain/loss)
    for (let i = 1; i <= period; i++) {
        const change = values[i] - values[i - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    output[period] = 100 - (100 / (1 + rs));

    // Subsequent calculations (Wilder's Smoothing)
    for (let i = period + 1; i < values.length; i++) {
        const change = values[i] - values[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;

        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;

        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        output[i] = 100 - (100 / (1 + rs));
    }
    return output;
}

module.exports = calculateRSI;
