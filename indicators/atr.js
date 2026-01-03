/**
 * Average True Range (ATR)
 * @param {number[]} highs 
 * @param {number[]} lows 
 * @param {number[]} closes 
 * @param {number} period 
 * @returns {number[]} Array of ATR values
 */
function calculateATR(highs, lows, closes, period) {
    const output = new Array(highs.length).fill(null);
    if (highs.length < period + 1) return output;

    const trs = [];
    // TR for index 0 is H[0] - L[0] (approx, since no prev close)
    trs.push(highs[0] - lows[0]);

    for (let i = 1; i < highs.length; i++) {
        const h = highs[i];
        const l = lows[i];
        const cp = closes[i - 1]; // Previous close
        const val1 = h - l;
        const val2 = Math.abs(h - cp);
        const val3 = Math.abs(l - cp);
        trs.push(Math.max(val1, val2, val3));
    }

    // First ATR is SMA of TRs
    let sumTR = 0;
    for (let i = 0; i < period; i++) {
        sumTR += trs[i];
    }
    let prevATR = sumTR / period;

    // ATR is usually valid at index (period), or (period-1) if we count from 0-based TRs.
    // If we have 'period' TR values (0 to period-1), we have one ATR value.
    // Let's align it such that output[period-1] has the first value.
    output[period - 1] = prevATR;

    // Wilder's Smoothing for subsequent
    for (let i = period; i < trs.length; i++) {
        const currentTR = trs[i];
        const atr = ((prevATR * (period - 1)) + currentTR) / period;
        output[i] = atr;
        prevATR = atr;
    }
    return output;
}

module.exports = calculateATR;
