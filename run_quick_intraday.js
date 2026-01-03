const fs = require('fs');
const path = require('path');
const Strategy = require('./strategies/very_quick_intraday');
const Execution = require('./trading/intraday_execution');
const Simulator = require('./trading/simulator');

// DATA FILES
const FILE_5M = "./data/BTC_USDT_USDT-5m-futures.json";
const FILE_15M = "./data/BTC_USDT_USDT-15m-futures.json";

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
    console.log("   VERY QUICK INTRADAY STRATEGY BACKTEST  ");
    console.log("==========================================");

    // 1. Load Data
    const data5m = loadData(FILE_5M);
    const data15m = loadData(FILE_15M);

    if (data5m.length === 0 || data15m.length === 0) {
        console.error("Insufficient data.");
        return;
    }

    // 2. Prepare Indicators
    console.log(`Calculating Indicators (5m: ${data5m.length} candles, 15m: ${data15m.length} candles)...`);
    const ind5m = Strategy.prepareIndicators(data5m);
    const ind15m = Strategy.prepare15mIndicators(data15m);

    const map15m = new Map();
    data15m.forEach((c, i) => {
        map15m.set(c[0], i);
    });

    // 3. Backtest Loop
    const trades = [];
    const settings = Strategy.Settings;
    const startIdx = 100;

    for (let i = startIdx; i < data5m.length - 1; i++) {
        const cTime = data5m[i][0];
        const currentBlockStart = Math.floor(cTime / 900000) * 900000;
        const prevBlockStart = currentBlockStart - 900000;
        const idx15m = map15m.get(prevBlockStart);

        let bias = 'NEUTRAL';
        if (idx15m != null) {
            const i15 = idx15m;
            const ema20_15 = ind15m.ema20[i15];
            const ema50_15 = ind15m.ema50[i15];
            const rsi_15 = ind15m.rsi[i15];
            const close_15 = data15m[i15][4];

            if (ema20_15 != null && ema50_15 != null && rsi_15 != null) {
                if (ema20_15 >= ema50_15 && close_15 > ema20_15 && rsi_15 >= 50) bias = 'LONG';
                else if (ema20_15 <= ema50_15 && close_15 < ema20_15 && rsi_15 <= 50) bias = 'SHORT';
            }
        }

        if (bias === 'NEUTRAL') continue;

        const signal = Strategy.checkEntry(i, data5m, ind5m, bias);

        if (signal) {
            // --- STEP 1: PREPARE ENTRY ---
            const trade = Execution.prepareEntry(signal);

            // --- STEP 2: SETUP TP/SL ---
            const levels = Execution.setupTPSL(trade);
            Object.assign(trade, levels);

            // --- STEP 3: SIMULATE EXIT ---
            const exitData = Simulator.simulateTradeExit(trade, data5m, i + 1, settings);

            if (exitData.exitTime !== 0) {
                // --- STEP 4: CALCULATE RESULTS ---
                const result = Simulator.calculateResults(trade, exitData, settings);

                trades.push({
                    direction: trade.signal,
                    entry_time: new Date(trade.entryTime).toISOString(),
                    entry_price: trade.entryPrice,
                    stop_loss: trade.sl,
                    take_profit: trade.tp,
                    exit_time: new Date(exitData.exitTime).toISOString(),
                    exit_price: result.avgExitPrice,
                    result: exitData.finalResult,
                    pnl_percent_futures: result.roiTotal,
                    reason: trade.reason
                });

                // Advance i but subtract 1 because loop adds 1
                // Wait, the original script does i = exitIndex.
                // Find exitIndex in candles
                let exitIndex = data5m.findIndex(c => c[0] === exitData.exitTime);
                if (exitIndex !== -1) i = exitIndex;
            }
        }
    }

    printStats(trades);
}

function printStats(trades) {
    const totalTrades = trades.length;
    const wins = trades.filter(t => t.result === 'WIN');
    const losses = trades.filter(t => t.result === 'LOSS');
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;

    const avgWinPnl = wins.reduce((a, b) => a + b.pnl_percent_futures, 0) / (wins.length || 1);
    const avgLossPnl = losses.reduce((a, b) => a + b.pnl_percent_futures, 0) / (losses.length || 1);
    const totalPnl = trades.reduce((a, b) => a + b.pnl_percent_futures, 0);

    let cumulative = 0;
    let maxCum = 0;
    let maxDD = 0;
    let currentLossStreak = 0;
    let maxLossStreak = 0;

    trades.forEach(t => {
        cumulative += t.pnl_percent_futures;
        if (cumulative > maxCum) maxCum = cumulative;
        const dd = maxCum - cumulative;
        if (dd > maxDD) maxDD = dd;

        if (t.result === 'LOSS') {
            currentLossStreak++;
            if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
        } else {
            currentLossStreak = 0;
        }
    });

    console.log("\n================ SUMMARY STATISTICS ================");
    console.log(`Total Trades:       ${totalTrades}`);
    console.log(`Wins:               ${wins.length}`);
    console.log(`Losses:             ${losses.length}`);
    console.log(`Win Rate:           ${winRate.toFixed(2)}%`);
    console.log(`Avg Win (Future%):  ${avgWinPnl.toFixed(2)}%`);
    console.log(`Avg Loss (Future%): ${avgLossPnl.toFixed(2)}%`);
    console.log(`Total PnL (Future%):${totalPnl.toFixed(2)}%`);
    console.log(`Max Drawdown:       ${maxDD.toFixed(2)}%`);
    console.log(`Max Consec. Losses: ${maxLossStreak}`);

    const exportPath = path.join(__dirname, 'quick_intraday_results.json');
    fs.writeFileSync(exportPath, JSON.stringify(trades, null, 2));
    console.log(`\nDetailed logs saved to ${exportPath}`);
}

run();
