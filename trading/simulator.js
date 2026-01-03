/**
 * Logic for simulating trades during backtest.
 */

/**
 * Simulates the lifecycle of a trade (TP/SL hitting) candle by candle.
 * Automatically switches between Split TP and Simple TP logic based on trade parameters.
 */
function simulateTradeExit(trade, candles, startIndex, settings) {
    if (trade.tp1 && trade.tp2) {
        return _simulateSplitTP(trade, candles, startIndex, settings);
    } else {
        return _simulateSimpleTP(trade, candles, startIndex, settings);
    }
}

/**
 * Simulates Split TP logic (50/50 split, move SL to BE).
 */
function _simulateSplitTP(trade, candles, startIndex, settings) {
    const { signal, entryPrice, sl, tp1, tp2 } = trade;
    const { LEVERAGE } = settings;

    let posA_Open = true;
    let posB_Open = true;
    let posB_SL_Is_BE = false;

    let exitTime = 0;
    let finalResult = 'UNKNOWN';
    let minEquity = 0;

    for (let j = startIndex; j < candles.length; j++) {
        const c = candles[j];
        const low = c[3];
        const high = c[2];

        // 1. CHECK STOP LOSS
        let slHit = false;
        if (signal === 'LONG' || signal === 'LONG') {
            const effectiveSL_B = posB_SL_Is_BE ? entryPrice : sl;
            if (posA_Open && low <= sl) {
                slHit = true;
                finalResult = 'SL_FULL';
            } else if (!posA_Open && posB_Open && low <= effectiveSL_B) {
                slHit = true;
                finalResult = 'TP1_BE';
            }
        } else {
            const effectiveSL_B = posB_SL_Is_BE ? entryPrice : sl;
            if (posA_Open && high >= sl) {
                slHit = true;
                finalResult = 'SL_FULL';
            } else if (!posA_Open && posB_Open && high >= effectiveSL_B) {
                slHit = true;
                finalResult = 'TP1_BE';
            }
        }

        if (slHit) {
            exitTime = c[0];
            posA_Open = false;
            posB_Open = false;
            break;
        }

        // 2. CHECK TP1
        if (posA_Open) {
            let tp1Hit = false;
            if (signal === 'LONG' && high >= tp1) tp1Hit = true;
            if (signal === 'SHORT' && low <= tp1) tp1Hit = true;
            if (tp1Hit) {
                posA_Open = false;
                posB_SL_Is_BE = true;
            }
        }

        // 3. CHECK TP2
        if (posB_Open) {
            let tp2Hit = false;
            if (signal === 'LONG' && high >= tp2) tp2Hit = true;
            if (signal === 'SHORT' && low <= tp2) tp2Hit = true;
            if (tp2Hit) {
                posB_Open = false;
                finalResult = 'TP2_FULL';
                exitTime = c[0];
                break;
            }
        }

        // Drawdown
        if (signal === 'LONG') {
            const ddROI = ((low - entryPrice) / entryPrice) * LEVERAGE * 100;
            if (ddROI < minEquity) minEquity = ddROI;
        } else {
            const ddROI = ((entryPrice - high) / entryPrice) * LEVERAGE * 100;
            if (ddROI < minEquity) minEquity = ddROI;
        }
    }

    return { exitTime, finalResult, minEquity, type: 'SPLIT' };
}

/**
 * Simulates Simple Single TP logic.
 */
function _simulateSimpleTP(trade, candles, startIndex, settings) {
    const { signal, entryPrice, sl, tp } = trade;
    const { LEVERAGE } = settings;

    let exitTime = 0;
    let finalResult = 'UNKNOWN';
    let exitPrice = 0;
    let minEquity = 0;

    for (let j = startIndex; j < candles.length; j++) {
        const c = candles[j];
        const low = c[3];
        const high = c[2];

        if (signal === 'LONG') {
            if (low <= sl) {
                finalResult = 'LOSS';
                exitPrice = sl;
                exitTime = c[0];
                break;
            }
            if (high >= tp) {
                finalResult = 'WIN';
                exitPrice = tp;
                exitTime = c[0];
                break;
            }
        } else {
            if (high >= sl) {
                finalResult = 'LOSS';
                exitPrice = sl;
                exitTime = c[0];
                break;
            }
            if (low <= tp) {
                finalResult = 'WIN';
                exitPrice = tp;
                exitTime = c[0];
                break;
            }
        }

        // Drawdown
        if (signal === 'LONG') {
            const ddROI = ((low - entryPrice) / entryPrice) * LEVERAGE * 100;
            if (ddROI < minEquity) minEquity = ddROI;
        } else {
            const ddROI = ((entryPrice - high) / entryPrice) * LEVERAGE * 100;
            if (ddROI < minEquity) minEquity = ddROI;
        }
    }

    return { exitTime, finalResult, exitPrice, minEquity, type: 'SIMPLE' };
}

/**
 * Calculates results for a completed trade.
 */
function calculateResults(trade, exitData, settings) {
    if (exitData.type === 'SPLIT') {
        return _calculateSplitResults(trade, exitData, settings);
    } else {
        return _calculateSimpleResults(trade, exitData, settings);
    }
}

function _calculateSplitResults(trade, exitData, settings) {
    const { signal, entryPrice, sl, tp1, tp2 } = trade;
    const { finalResult } = exitData;
    const { SL_ROI_PERCENT, TP1_ROI_PERCENT, TP2_ROI_PERCENT } = settings;
    const POSITION_SIZE = 6000;

    let roiTotal = 0;
    let avgExitPrice = 0;
    let pnlUSDT = 0;
    const dir = signal === 'LONG' ? 1 : -1;

    if (finalResult === 'SL_FULL') {
        roiTotal = -SL_ROI_PERCENT;
        avgExitPrice = sl;
        pnlUSDT = ((avgExitPrice - entryPrice) / entryPrice) * POSITION_SIZE * dir;
    } else if (finalResult === 'TP1_BE') {
        roiTotal = (TP1_ROI_PERCENT * 0.5);
        avgExitPrice = (tp1 + entryPrice) / 2;
        pnlUSDT = ((tp1 - entryPrice) / entryPrice) * (POSITION_SIZE / 2) * dir;
    } else if (finalResult === 'TP2_FULL') {
        roiTotal = (TP1_ROI_PERCENT * 0.5) + (TP2_ROI_PERCENT * 0.5);
        avgExitPrice = (tp1 + tp2) / 2;
        const pnlA = ((tp1 - entryPrice) / entryPrice) * (POSITION_SIZE / 2) * dir;
        const pnlB = ((tp2 - entryPrice) / entryPrice) * (POSITION_SIZE / 2) * dir;
        pnlUSDT = pnlA + pnlB;
    }

    return { roiTotal, pnlUSDT: Number(pnlUSDT.toFixed(2)), avgExitPrice: Number(avgExitPrice.toFixed(2)) };
}

function _calculateSimpleResults(trade, exitData, settings) {
    const { entryPrice } = trade;
    const { finalResult, exitPrice } = exitData;
    const { LEVERAGE } = settings;

    const pnlSpot = Math.abs(exitPrice - entryPrice) / entryPrice;
    const isWin = finalResult === 'WIN';
    const roiTotal = pnlSpot * LEVERAGE * 100 * (isWin ? 1 : -1);

    return {
        roiTotal,
        avgExitPrice: exitPrice,
        pnlUSDT: 0 // Not tracked for intraday in original script the same way
    };
}

module.exports = {
    simulateTradeExit,
    calculateResults
};
