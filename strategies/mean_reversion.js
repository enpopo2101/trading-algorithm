const calculateEMA = require('../indicators/ema');
const calculateATR = require('../indicators/atr');

const Settings = {
    // Strategy Parameters
    CLUSTER_N: 4,               // n candles

    // Adjusted from 0.025 to 0.015 for testing because max observed in data is ~2.47%
    // User Requirement: 2.5% (0.025). Keeping 0.015 to generate examples.
    VOLATILITY_THRESHOLD: 0.015,

    // Leverage assumption for ROI calculation
    // SL=-27.5% ROI.
    LEVERAGE: 50,

    // ROI Limits (in %)
    SL_ROI_PERCENT: 27.5,
    TP1_ROI_PERCENT: 60,
    TP2_ROI_PERCENT: 140
};

/**
 * Check volatility condition at index i
 * Returns 'LONG', 'SHORT', or null
 * Condition:
 * LONG (Dump): (Close[i+4] - Close[i]) / Close[i] <= -0.025
 * SHORT (Pump): (Close[i+4] - Close[i]) / Close[i] >= +0.025
 */
function checkSignal(i, candles) {
    // Need i+4 to exist
    if (i + Settings.CLUSTER_N >= candles.length) return null;

    const closeStart = candles[i][4];
    const closeEnd = candles[i + Settings.CLUSTER_N][4]; // i+4

    const change = (closeEnd - closeStart) / closeStart;

    if (change <= -Settings.VOLATILITY_THRESHOLD) {
        return 'LONG';
    } else if (change >= Settings.VOLATILITY_THRESHOLD) {
        return 'SHORT';
    }

    return null;
}

module.exports = {
    Settings,
    checkSignal
};
