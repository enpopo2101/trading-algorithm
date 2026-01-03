const calculateSMA = require('../indicators/sma');
const calculateEMA = require('../indicators/ema');
const calculateRSI = require('../indicators/rsi');
const calculateATR = require('../indicators/atr');

const Settings = {
    // Indicator Settings
    EMA_SHORT: 10,
    EMA_MEDIUM: 50,
    EMA_LONG: 200,
    RSI_PERIOD: 14,
    MA_RSI_PERIOD: 14,
    ATR_PERIOD: 14,

    // Strategy Parameters
    SL_ATR_MULTIPLIER: 1.2,
    TP_ATR_MULTIPLIER: 2.0
};

/**
 * Prepares all indicators needed for the strategy.
 * @param {Object[]} candles - Array of candle data [timestamp, open, high, low, close, volume]
 * @returns {Object} map of indicator arrays
 */
function prepareIndicators(candles) {
    const closes = candles.map(c => c[4]);
    const highs = candles.map(c => c[2]);
    const lows = candles.map(c => c[3]);

    const ema10 = calculateEMA(closes, Settings.EMA_SHORT);
    const ema50 = calculateEMA(closes, Settings.EMA_MEDIUM);
    const ema200 = calculateEMA(closes, Settings.EMA_LONG);
    const rsi = calculateRSI(closes, Settings.RSI_PERIOD);
    const ma_rsi = calculateSMA(rsi, Settings.MA_RSI_PERIOD);
    const atr = calculateATR(highs, lows, closes, Settings.ATR_PERIOD);

    return { ema10, ema50, ema200, rsi, ma_rsi, atr };
}

/**
 * Checks for Entry Signal at a given index `i`.
 * @param {number} i - Index to check
 * @param {Object[]} candles - Raw candles
 * @param {Object} indicators - Computed indicators
 * @returns {Object|null} Entry signal object or null
 */
function checkEntry(i, candles, indicators) {
    const { ema10, ema50, ema200, rsi, ma_rsi, atr } = indicators;

    // Safety check
    if (ema10[i] == null || ema50[i] == null || ema200[i] == null ||
        rsi[i] == null || ma_rsi[i] == null || atr[i] == null) {
        return null; // Not enough data
    }

    const cOpen = candles[i][1];
    const cHigh = candles[i][2]; // Unused for entry trigger but available
    const cLow = candles[i][3];
    const cClose = candles[i][4];

    // --- LONG CONDITIONS ---
    // EMA50 > EMA200 AND Close > EMA200
    const longTrend = (ema50[i] > ema200[i]) && (cClose > ema200[i]);
    // RSI in [50, 70] AND RSI > MA_RSI
    const longMom = (rsi[i] > 50) && (rsi[i] < 70) && (rsi[i] > ma_rsi[i]);
    // touched EMA10/50, Bullish Candle, Close > EMA10
    const longTrigger = ((cLow <= ema10[i]) || (cLow <= ema50[i])) && (cClose > cOpen) && (cClose > ema10[i]);

    if (longTrend && longMom && longTrigger) {
        const entryPrice = cClose;
        const atrVal = atr[i];

        const slDist = atrVal * Settings.SL_ATR_MULTIPLIER;
        const tpDist = atrVal * Settings.TP_ATR_MULTIPLIER;

        const stopLoss = entryPrice - slDist;
        const takeProfit = entryPrice + tpDist;

        const tp1 = entryPrice + (atrVal * 1.0);
        const tp2 = entryPrice + (atrVal * 1.5);
        const tp3 = takeProfit;

        const rr = (tp3 - entryPrice) / (entryPrice - stopLoss);
        const formatNum = (n) => n.toFixed(2);
        const reason = [
            `EMA10 > EMA50 > EMA200`,
            `RSI(${formatNum(rsi[i])}) > 50 & < 70`,
            `Close > EMA10`,
            `Volume breakout (simulated)`
        ].join('\n- ');

        return {
            type: 'LONG',
            entryPrice,
            stopLoss,
            takeProfit,
            tp1, tp2, tp3,
            rr: rr.toFixed(2),
            atr: atrVal,
            rsi: rsi[i],
            ema10: ema10[i],
            ema50: ema50[i],
            ema200: ema200[i],
            reason: `- ` + reason,
            index: i
        };
    }

    // --- SHORT CONDITIONS ---
    // 1. Trend: EMA50 < EMA200 (Red Cloud) & Price < EMA200
    const shortTrend = (ema50[i] < ema200[i]) && (cClose < ema200[i]);

    // 2. Momentum: RSI < 50 (Bearish) but > 30 (Not oversold), Momentum Falling (RSI < SMA_RSI)
    const shortMom = (rsi[i] < 50) && (rsi[i] > 30) && (rsi[i] < ma_rsi[i]);

    // 3. Trigger: Price pulled back up to EMA10/50, Rejected (Bearish Candle), Closed below EMA10
    const touchedRes = (cHigh >= ema10[i]) || (cHigh >= ema50[i]);
    const shortTrigger = touchedRes && (cClose < cOpen) && (cClose < ema10[i]);

    if (shortTrend && shortMom && shortTrigger) {
        const entryPrice = cClose;
        const atrVal = atr[i];

        const slDist = atrVal * Settings.SL_ATR_MULTIPLIER;
        const tpDist = atrVal * Settings.TP_ATR_MULTIPLIER;

        const stopLoss = entryPrice + slDist;      // SL is ABOVE entry
        const takeProfit = entryPrice - tpDist;    // TP is BELOW entry

        const tp1 = entryPrice - (atrVal * 1.0);
        const tp2 = entryPrice - (atrVal * 1.5);
        const tp3 = takeProfit;

        const rr = (entryPrice - tp3) / (stopLoss - entryPrice);
        const formatNum = (n) => n.toFixed(2);
        const reason = [
            `EMA50 < EMA200 (Downtrend)`,
            `RSI(${formatNum(rsi[i])}) < 50 & > 30`,
            `Close < EMA10 (Bearish)`,
            `Touched Resistance`
        ].join('\n- ');

        return {
            type: 'SHORT',
            entryPrice,
            stopLoss,
            takeProfit,
            tp1, tp2, tp3,
            rr: rr.toFixed(2),
            atr: atrVal,
            rsi: rsi[i],
            ema10: ema10[i],
            ema50: ema50[i],
            ema200: ema200[i],
            reason: `- ` + reason,
            index: i
        };
    }

    return null;
}

/**
 * Returns the minimum lookback period required for this strategy to be valid.
 */
function getMinLookback() {
    return Math.max(
        Settings.EMA_LONG,
        Settings.RSI_PERIOD,
        Settings.MA_RSI_PERIOD,
        Settings.ATR_PERIOD
    );
}

module.exports = {
    Settings,
    prepareIndicators,
    checkEntry,
    getMinLookback
};
