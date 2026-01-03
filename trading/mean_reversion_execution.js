/**
 * Logic for calculating trade levels and preparing order parameters.
 * This can be used for both backtesting and future live execution (Bybit integration).
 */

/**
 * Prepares the trade entry parameters.
 * @param {string} signal - 'LONG' or 'SHORT'
 * @param {Object} candle - The candle at which the signal was confirmed
 * @returns {Object} Entry details
 */
function prepareEntry(signal, candle) {
    return {
        signal,
        entryPrice: candle[4], // Close of the candle
        entryTime: candle[0],
    };
}

/**
 * Calculates TP and SL levels for the Mean Reversion strategy.
 * This implementation follows the 50/50 split rule with specific ROI targets.
 * 
 * @param {Object} trade - Trade object with signal and entryPrice
 * @param {Object} settings - Strategy settings (leverage, ROI targets)
 * @returns {Object} Object containing sl, tp1, tp2
 */
function setupTPSL(trade, settings) {
    const { signal, entryPrice } = trade;
    const { LEVERAGE, SL_ROI_PERCENT, TP1_ROI_PERCENT, TP2_ROI_PERCENT } = settings;

    // ROI = (Delta / Entry) * Leverage * 100
    // Delta = (ROI / 100 / Leverage) * Entry
    const slDist = (SL_ROI_PERCENT / 100 / LEVERAGE) * entryPrice;
    const tp1Dist = (TP1_ROI_PERCENT / 100 / LEVERAGE) * entryPrice;
    const tp2Dist = (TP2_ROI_PERCENT / 100 / LEVERAGE) * entryPrice;

    let sl = 0;
    let tp1 = 0;
    let tp2 = 0;

    if (signal === 'LONG') {
        sl = entryPrice - slDist;
        tp1 = entryPrice + tp1Dist;
        // User Requirement: TP2 is calculated such that Part B ROI = 140% from entry.
        // Formula: tp2 = tp1 + (tp2Dist - tp1Dist)
        tp2 = tp1 + (tp2Dist - tp1Dist);
    } else {
        sl = entryPrice + slDist;
        tp1 = entryPrice - tp1Dist;
        tp2 = tp1 - (tp2Dist - tp1Dist);
    }

    return { sl, tp1, tp2 };
}

module.exports = {
    prepareEntry,
    setupTPSL
};
