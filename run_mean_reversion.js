const fs = require('fs');
const path = require('path');
const Strategy = require('./strategies/mean_reversion');
const Execution = require('./trading/mean_reversion_execution');
const Simulator = require('./trading/simulator');

// DATA FILE (1H Main Timeframe)
const FILE_1H = "./data/BTC_USDT_USDT-1h-futures.json";

function loadData(filePath) {
    const fullPath = path.join(__dirname, filePath);
    if (!fs.existsSync(fullPath)) {
        console.error(`File not found: ${fullPath}`);
        return [];
    }
    const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    return raw.sort((a, b) => a[0] - b[0]);
}

function run() {
    console.log("==========================================");
    console.log("   MEAN REVERSION STRATEGY BACKTEST       ");
    console.log("==========================================");

    const candles = loadData(FILE_1H);
    if (candles.length === 0) {
        console.error("No data found.");
        return;
    }

    console.log(`Loaded ${candles.length} candles (1H).`);

    const trades = [];
    const settings = Strategy.Settings;

    let tradeIdCounter = 1;
    for (let i = 0; i < candles.length - settings.CLUSTER_N; i++) {

        const signal = Strategy.checkSignal(i, candles);
        if (!signal) continue;

        // --- STEP 1: PREPARE ENTRY ---
        const entryIndex = i + settings.CLUSTER_N;
        const entryCandle = candles[entryIndex];
        const trade = Execution.prepareEntry(signal, entryCandle);

        // --- STEP 2: SETUP TP/SL ---
        const levels = Execution.setupTPSL(trade, settings);
        Object.assign(trade, levels); // Add sl, tp1, tp2 to trade object

        // --- STEP 3: SIMULATE EXIT ---
        // Evaluation starts from candle AFTER entry (entryIndex + 1)
        const exitData = Simulator.simulateTradeExit(trade, candles, entryIndex + 1, settings);

        if (exitData.exitTime !== 0) {
            // --- STEP 4: CALCULATE RESULTS ---
            const result = Simulator.calculateResults(trade, exitData, settings);

            trades.push({
                trade_index: tradeIdCounter++,
                direction: signal,
                entry_time: new Date(trade.entryTime).toISOString(),
                entry_price: trade.entryPrice,
                exit_time: new Date(exitData.exitTime).toISOString(),
                exit_price: result.avgExitPrice,
                final_result: exitData.finalResult,
                roi_total: result.roiTotal,
                pnl_usdt: result.pnlUSDT,
                max_drawdown_during_trade: exitData.minEquity
            });
        }
    }

    printStats(trades);
}


function printStats(trades) {
    const totalTrades = trades.length;
    const longTrades = trades.filter(t => t.direction === 'LONG');
    const shortTrades = trades.filter(t => t.direction === 'SHORT');

    const countSL = trades.filter(t => t.final_result === 'SL_FULL').length;
    const countTP1BE = trades.filter(t => t.final_result === 'TP1_BE').length;
    const countTP2 = trades.filter(t => t.final_result === 'TP2_FULL').length;

    const wins = countTP1BE + countTP2;
    const losses = countSL;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    const totalROI = trades.reduce((sum, t) => sum + t.roi_total, 0);
    const avgROI = totalTrades > 0 ? totalROI / totalTrades : 0;

    const totalPnL = trades.reduce((sum, t) => sum + t.pnl_usdt, 0);

    // Max Consec Losses
    let maxConsLoss = 0;
    let currConsLoss = 0;
    trades.sort((a, b) => new Date(a.entry_time) - new Date(b.entry_time)); // Ensure chronological
    trades.forEach(t => {
        if (t.final_result === 'SL_FULL') {
            currConsLoss++;
            if (currConsLoss > maxConsLoss) maxConsLoss = currConsLoss;
        } else {
            currConsLoss = 0;
        }
    });

    console.log("\n================ SUMMARY STATISTICS ================");
    console.log(`Total Trades:       ${totalTrades}`);
    console.log(`Long Trades:        ${longTrades.length}`);
    console.log(`Short Trades:       ${shortTrades.length}`);
    console.log(`--------------------------------------------------`);
    console.log(`[Outcome Distribution]`);
    console.log(`SL_FULL (Loss):     ${countSL} (${((countSL / totalTrades) * 100).toFixed(1)}%)`);
    console.log(`TP1_BE (Win Small): ${countTP1BE} (${((countTP1BE / totalTrades) * 100).toFixed(1)}%)`);
    console.log(`TP2_FULL (Big Win): ${countTP2} (${((countTP2 / totalTrades) * 100).toFixed(1)}%)`);
    console.log(`--------------------------------------------------`);
    console.log(`Win Rate:           ${winRate.toFixed(2)}%`);
    console.log(`Total ROI:          ${totalROI.toFixed(2)}%`);
    console.log(`Total PnL (USDT):   ${totalPnL.toFixed(2)} USDT`);
    console.log(`Avg ROI / Trade:    ${avgROI.toFixed(2)}%`);
    console.log(`Max Consec Losses:  ${maxConsLoss}`);


    // Export
    const exportPath = path.join(__dirname, 'mean_reversion_results.json');
    fs.writeFileSync(exportPath, JSON.stringify(trades, null, 2));
    console.log(`\nDetailed logs saved to ${exportPath}`);
}

run();
