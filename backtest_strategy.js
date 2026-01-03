/**
 * Backtest Runner
 * 
 * Target Files:
 *  - analysis/data/BTC_USDT_USDT-1h-futures.json
 *  - analysis/data/BTC_USDT_USDT-15m-futures.json
 *  - analysis/data/BTC_USDT_USDT-5m-futures.json
 */

const fs = require('fs');
const path = require('path');

// Import Strategy
const Strategy = require('./strategies/trend_momentum');

// ===== CONFIGURATION =====
const FILES = [
    { path: "./data/BTC_USDT_USDT-1h-futures.json", timeframe: "1h" },
    { path: "./data/BTC_USDT_USDT-15m-futures.json", timeframe: "15m" },
    { path: "./data/BTC_USDT_USDT-5m-futures.json", timeframe: "5m" }
];

// --------------------------------------------------------------------------
// BACKTEST ENGINE
// --------------------------------------------------------------------------
const Backtest = {
    loadData: function (filePath) {
        const fullPath = path.join(__dirname, filePath);
        if (!fs.existsSync(fullPath)) {
            console.error(`File not found: ${fullPath}`);
            return [];
        }
        const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        // data: [timestamp, open, high, low, close, volume]
        // sort by timestamp
        return raw.sort((a, b) => a[0] - b[0]);
    },

    run: function (fileConfig) {
        console.log(`\n\n==================================================`);
        console.log(`RUNNING BACKTEST on ${fileConfig.path} [${fileConfig.timeframe}]`);
        console.log(`==================================================`);

        const candles = this.loadData(fileConfig.path);
        if (candles.length === 0) return [];

        // 1. Prepare Indicators via Strategy
        const indicators = Strategy.prepareIndicators(candles);

        const trades = [];
        let inTrade = false;

        // Start index
        const startIdx = Strategy.getMinLookback();

        // 2. Iterate
        for (let i = startIdx; i < candles.length - 1; i++) {
            if (inTrade) continue;

            const entrySignal = Strategy.checkEntry(i, candles, indicators);

            if (entrySignal) {
                // ENTER TRADE
                const { entryPrice, stopLoss, takeProfit, type } = entrySignal;

                let exitPrice = 0;
                let exitTime = 0;
                let result = '';
                let exitIndex = -1;

                // Loop future candles for exit
                for (let j = i + 1; j < candles.length; j++) {
                    const fLow = candles[j][3];
                    const fHigh = candles[j][2];
                    const fTime = candles[j][0];

                    if (type === 'LONG') {
                        // LONG: SL below, TP above
                        if (fLow <= stopLoss) {
                            exitPrice = stopLoss;
                            exitTime = fTime;
                            result = 'LOSS';
                            exitIndex = j;
                            break;
                        }
                        if (fHigh >= takeProfit) {
                            exitPrice = takeProfit;
                            exitTime = fTime;
                            result = 'WIN';
                            exitIndex = j;
                            break;
                        }
                    } else {
                        // SHORT: SL above, TP below
                        if (fHigh >= stopLoss) {
                            exitPrice = stopLoss; // Hit SL (Higher price)
                            exitTime = fTime;
                            result = 'LOSS';
                            exitIndex = j;
                            break;
                        }
                        if (fLow <= takeProfit) {
                            exitPrice = takeProfit; // Hit TP (Lower price)
                            exitTime = fTime;
                            result = 'WIN';
                            exitIndex = j;
                            break;
                        }
                    }
                }

                if (exitIndex !== -1) {
                    let pnl = 0;
                    if (type === 'LONG') {
                        pnl = ((exitPrice - entryPrice) / entryPrice) * 100;
                    } else {
                        // Short PnL: (Entry - Exit) / Entry
                        pnl = ((entryPrice - exitPrice) / entryPrice) * 100;
                    }

                    trades.push({
                        symbol: "BTCUSDT",
                        timeframe: fileConfig.timeframe,
                        type: type === 'SHORT' ? "SHORT SIGNAL" : "LONG SIGNAL",

                        entryTime: new Date(candles[i][0]).toISOString(),
                        entryIndex: i,
                        entryPrice,
                        stopLoss,
                        takeProfit,

                        // New fields from strategy
                        tp1: entrySignal.tp1,
                        tp2: entrySignal.tp2,
                        tp3: entrySignal.tp3,
                        rr: entrySignal.rr,
                        reason: entrySignal.reason,

                        exitTime: new Date(exitTime).toISOString(),
                        exitIndex,
                        exitPrice,
                        result,
                        pnl,
                        atr: entrySignal.atr,
                        rsi: entrySignal.rsi
                    });

                    i = exitIndex; // Skip to exit
                }
            }
        }

        this.printStats(trades);
        return trades;
    },

    printStats: function (trades) {
        const totalTrades = trades.length;
        const wins = trades.filter(t => t.result === 'WIN');
        const losses = trades.filter(t => t.result === 'LOSS');
        const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
        const totalPnL = trades.reduce((acc, t) => acc + t.pnl, 0);
        const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;

        let cumulative = 0;
        let maxCum = 0;
        let maxDD = 0;
        for (const t of trades) {
            cumulative += t.pnl;
            if (cumulative > maxCum) maxCum = cumulative;
            const dd = maxCum - cumulative;
            if (dd > maxDD) maxDD = dd;
        }

        console.log(`Total Trades: ${totalTrades}`);
        console.log(`Wins: ${wins.length} | Losses: ${losses.length}`);
        console.log(`Win Rate: ${winRate.toFixed(2)}%`);
        console.log(`Total PnL: ${totalPnL.toFixed(2)}%`);
        console.log(`Avg PnL: ${avgPnL.toFixed(2)}%`);
        console.log(`Max Drawdown: ${maxDD.toFixed(2)}%`);
    },

    exportResults: function (allTrades, outputFile) {
        const exportData = allTrades.map(t => ({
            headline: `🚀 ${t.type} – ${t.symbol} (${t.timeframe})`,
            entry: t.entryPrice,
            stopLoss: t.stopLoss,
            targets: {
                tp1: t.tp1,
                tp2: t.tp2,
                tp3: t.tp3
            },
            indicators: t.reason,
            rr: `1 : ${t.rr}`,
            result: {
                status: t.result,
                exitPrice: t.exitPrice,
                pnlPercent: t.pnl.toFixed(2) + "%",
                exitTime: t.exitTime
            }
        }));

        const finalPath = path.join(__dirname, outputFile);
        fs.writeFileSync(finalPath, JSON.stringify(exportData, null, 2));
        console.log(`\n[EXPORT] Results exported to ${finalPath}`);
    }
};

// ==========================================================================
// EXECUTION
// ==========================================================================
const allTrades = [];
FILES.forEach(f => {
    const trades = Backtest.run(f);
    allTrades.push(...trades);
});

// Export to analysis/backtest_results.json
Backtest.exportResults(allTrades, 'backtest_results.json');
