const calculateSMA = require('../indicators/sma');
const calculateEMA = require('../indicators/ema');
const calculateRSI = require('../indicators/rsi');

const Settings = {
    // 5m indicators
    EMA_ENTRY_PERIOD: 20,
    EMA_FILTER_PERIOD: 50, // Not used in 5m entry logic directly but mentioned in Bias? No, Bias uses 15m. 
    // Wait, Risk Management uses EMA50 for SL on 5m?
    // "SL = min(Low of trigger candle, EMA50) - 0.05%" -> This refers to EMA50 on the ENTRY timeframe (5m).

    RSI_PERIOD: 7,
    RSI_MA_PERIOD: 7,

    // 15m Bias indicators
    BIAS_EMA_SHORT: 20,
    BIAS_EMA_LONG: 50,
    BIAS_RSI_PERIOD: 7,

    LEVERAGE: 30
};

function prepareIndicators(candles) {
    const closes = candles.map(c => c[4]);

    const ema20 = calculateEMA(closes, Settings.EMA_ENTRY_PERIOD);
    const ema50 = calculateEMA(closes, Settings.EMA_FILTER_PERIOD);
    const rsi = calculateRSI(closes, Settings.RSI_PERIOD);
    const rsi_ma = calculateSMA(rsi, Settings.RSI_MA_PERIOD);

    return { ema20, ema50, rsi, rsi_ma };
}

function prepare15mIndicators(candles15m) {
    const closes = candles15m.map(c => c[4]);

    const ema20 = calculateEMA(closes, Settings.BIAS_EMA_SHORT);
    const ema50 = calculateEMA(closes, Settings.BIAS_EMA_LONG);
    const rsi = calculateRSI(closes, Settings.BIAS_RSI_PERIOD);

    return { ema20, ema50, rsi };
}

/**
 * Check Bias on 15m timeframe.
 * We need to look at the 'last completed' 15m candle relative to the current 5m time.
 * @param {number} timestamp5m - Current 5m candle timestamp (open time)
 * @param {Object[]} candles15m - 15m data
 * @param {Object} ind15m - 15m indicators
 */
function getBias(timestamp5m, candles15m, ind15m) {
    // 5m candle at 10:05. We can assume we know the state of 15m candle at 10:00 (closed?). 
    // Actually, "Bias Filter (15m)" usually checks the *current* context. 
    // If we want no lookahead, we should use the 15m candle that *completed* before timestamp5m.
    // E.g. 5m Candle [10:05, 10:10). The last completed 15m candle is [09:45, 10:00).
    // If we use the [10:00, 10:15) candle, it's not finished, so "Close" is moving.
    // However, usually "Market Bias" implies the higher TF trend.
    // Let's use the most recently closed 15m candle.

    // Find 15m candle index where (timestamp + 15m) <= timestamp5m? 
    // No, standard mapping:
    // If 5m is at T. The previous 15m close was at floor(T/15m)*15m.
    // Let's iterate backwards or use binary search if needed, but linear search might be fine if aligned.
    // Optimization: The runner can pass the relevant 15m index.
    return null; // Logic will be extracted to runner or passed in
}

function checkEntry(i, candles, ind5m, bias) {
    if (!bias || bias === 'NEUTRAL') return null;

    const c = candles[i];
    const cOpen = c[1];
    const cHigh = c[2];
    const cLow = c[3];
    const cClose = c[4];
    const cTime = c[0];

    const { ema20, ema50, rsi, rsi_ma } = ind5m;

    // Safety
    if (ema20[i] == null || ema50[i] == null || rsi[i] == null || rsi_ma[i] == null) return null;
    if (i < 3) return null;

    // Candle Body %
    // |close - open| / open >= 0.15% (0.0015)
    const bodySize = Math.abs(cClose - cOpen) / cOpen;
    const isMomentumCandle = bodySize >= 0.0015;

    // --- LONG ENTRY ---
    if (bias === 'LONG') {
        /*
        1. RSI impulse:
           - RSI7 crosses ABOVE RSI_MA
           - RSI7 moves from < 40 to > 45 within the last 3 candles
        2. EMA snapback:
           - Low <= EMA20
           - Close > EMA20
           - Close > Open (Bullish)
        3. Momentum candle
        */

        const rsiCross = (rsi[i] > rsi_ma[i]) && (rsi[i - 1] <= rsi_ma[i - 1]);

        // "moves from < 40 to > 45 within last 3 candles":
        // This acts as a confirmation of 'impulse'.
        // Check current > 45 AND (prev1 < 40 OR prev2 < 40)
        const rsiImpulse = (rsi[i] > 45) && (rsi[i - 1] < 40 || rsi[i - 2] < 40);

        const emaSnapback = (cLow <= ema20[i]) && (cClose > ema20[i]) && (cClose > cOpen);

        if (rsiCross && rsiImpulse && emaSnapback && isMomentumCandle) {
            // Check SL logic
            // SL = min(Low, EMA50) - 0.05%
            const slBase = Math.min(cLow, ema50[i]);
            const stopLoss = slBase * (1 - 0.0005);
            const entryPrice = cClose;

            // TP = Entry + 3 * (Entry - SL)
            const risk = entryPrice - stopLoss;
            const takeProfit = entryPrice + (3 * risk);

            return {
                type: 'LONG',
                entryPrice,
                stopLoss,
                takeProfit,
                risk,
                index: i,
                time: cTime,
                reason: `RSI Cross & Impulse, Snapback EMA20, MomCandle`
            };
        }
    }

    // --- SHORT ENTRY ---
    if (bias === 'SHORT') {
        /*
        1. RSI impulse:
           - RSI7 crosses BELOW RSI_MA
           - RSI7 moves from > 60 to < 55 within the last 3 candles
        2. EMA snapback:
           - High >= EMA20
           - Close < EMA20
           - Close < Open (Bearish)
        3. Momentum candle
        */

        const rsiCross = (rsi[i] < rsi_ma[i]) && (rsi[i - 1] >= rsi_ma[i - 1]);

        // "moves from > 60 to < 55"
        const rsiImpulse = (rsi[i] < 55) && (rsi[i - 1] > 60 || rsi[i - 2] > 60);

        const emaSnapback = (cHigh >= ema20[i]) && (cClose < ema20[i]) && (cClose < cOpen);

        if (rsiCross && rsiImpulse && emaSnapback && isMomentumCandle) {
            // SL = max(High, EMA50) + 0.05%
            const slBase = Math.max(cHigh, ema50[i]);
            const stopLoss = slBase * (1 + 0.0005);
            const entryPrice = cClose;

            // TP = Entry - 3 * (SL - Entry)
            const risk = stopLoss - entryPrice;
            const takeProfit = entryPrice - (3 * risk);

            return {
                type: 'SHORT',
                entryPrice,
                stopLoss,
                takeProfit,
                risk,
                index: i,
                time: cTime,
                reason: `RSI Cross & Impulse, Snapback EMA20, MomCandle`
            };
        }
    }

    return null;
}

module.exports = {
    Settings,
    prepareIndicators,
    prepare15mIndicators,
    checkEntry
};
