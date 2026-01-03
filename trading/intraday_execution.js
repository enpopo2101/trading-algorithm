/**
 * Logic for calculating trade levels for the Quick Intraday strategy.
 */

/**
 * Prepares the trade entry parameters based on the signal from the strategy.
 * In this strategy, the signal already contains some level information.
 */
function prepareEntry(signal) {
    return {
        signal: signal.type,
        entryPrice: signal.entryPrice,
        entryTime: signal.time,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        reason: signal.reason
    };
}

/**
 * For this strategy, TP/SL are calculated within the strategy signal generation.
 * This function is here for consistency in the execution flow.
 */
function setupTPSL(trade) {
    return {
        sl: trade.stopLoss,
        tp: trade.takeProfit
    };
}

module.exports = {
    prepareEntry,
    setupTPSL
};
