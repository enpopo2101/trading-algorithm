const fs = require('fs');
const path = require('path');
const Strategy = require('./strategies/very_quick_intraday');

// DATA FILES
const FILE_5M = "./data/BTC_USDT_USDT-5m-futures.json";
const FILE_15M = "./data/BTC_USDT_USDT-15m-futures.json"; // Bias filter

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

    // Helper to find 15m candle index for a given time
    // We need the latest CLOSED 15m candle relative to 5m time.
    // If 5m time is T (open time), we want the 15m candle that covers [T, T+15m)? 
    // Wait, Bias is checked at the moment of Entry Decision (Close of 5m candle).
    // Let's say we are processing 5m candle [10:00, 10:05). Close time 10:05.
    // We need the Bias state at 10:05.
    // The 15m candle [10:00, 10:15) is OPEN. Using its Close is repainting.
    // The 15m candle [09:45, 10:00) is CLOSED. We should use this one.

    // So for 5m candle opening at T, we look for 15m candle starting at (T - 15m)? 
    // No. T=10:00. Previous 15m started at 09:45.
    // So target 15m start time = floor(T / 15m) * 15m - 15m ?
    // Let's simplify: 
    // At T=10:00 (5m open). We decide at 10:05. At 10:05, the 15m candle [09:45, 10:00) is definitely closed.
    // The 15m candle [10:00, 10:15) is active (only 5m old).
    // Safe Bias = Logic applied to 15m candle [09:45, 10:00).
    // 5m Candle [10:00] -> Use 15m [09:45].
    // 5m Candle [10:05] -> Use 15m [09:45] (Still the last closed).
    // 5m Candle [10:10] -> Use 15m [09:45] (Still the last closed).
    // 5m Candle [10:15] -> Use 15m [10:00] (Just closed).

    // Map 15m data by timestamp for O(1) lookup
    const map15m = new Map();
    data15m.forEach((c, i) => {
        map15m.set(c[0], i);
    });

    // 3. Backtest Loop
    const trades = [];
    let inTrade = false;

    // Start index (warmup for indicators)
    const startIdx = 100;

    for (let i = startIdx; i < data5m.length - 1; i++) {
        if (inTrade) continue;

        const cTime = data5m[i][0];

        // Find relevant 15m candle
        // 5m periods: 0, 5, 10.
        // If min < 15 (0, 5, 10), we use the candle starting at (Hour:00 - 15m) = Hour-1:45?
        // Wait.
        // 10:00 -> 09:45
        // 10:05 -> 09:45
        // 10:10 -> 09:45
        // 10:15 -> 10:00

        // Algorithm:
        // Round down T to nearest 15m. Then subtract 15m.
        const remainder = cTime % (15 * 60 * 1000); // relative to epoch, but usually aligned
        // Better: Date object logic or assume standard alignment.
        // 15m = 900000 ms.
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
                // LONG Bias: EMA20 >= EMA50, Close > EMA20, RSI >= 50
                if (ema20_15 >= ema50_15 && close_15 > ema20_15 && rsi_15 >= 50) {
                    bias = 'LONG';
                }
                // SHORT Bias: EMA20 <= EMA50, Close < EMA20, RSI <= 50
                else if (ema20_15 <= ema50_15 && close_15 < ema20_15 && rsi_15 <= 50) {
                    bias = 'SHORT';
                }
            }
        }

        if (bias === 'NEUTRAL') continue;

        // Check Entry
        const signal = Strategy.checkEntry(i, data5m, ind5m, bias);

        if (signal) {
            // EXECUTE TRADE SIMULATION
            const { stopLoss, takeProfit, type, entryPrice, time } = signal;

            // Loop future candles
            let result = 'OPEN';
            let exitPrice = 0;
            let exitTime = 0;
            let exitIndex = -1;

            for (let j = i + 1; j < data5m.length; j++) {
                const row = data5m[j];
                const fTime = row[0];
                const fHigh = row[2];
                const fLow = row[3];

                if (type === 'LONG') {
                    // Check SL first
                    if (fLow <= stopLoss) {
                        result = 'LOSS';
                        exitPrice = stopLoss;
                        exitTime = fTime;
                        exitIndex = j;
                        break;
                    }
                    if (fHigh >= takeProfit) {
                        result = 'WIN';
                        exitPrice = takeProfit;
                        exitTime = fTime;
                        exitIndex = j;
                        break;
                    }
                } else {
                    // SHORT
                    if (fHigh >= stopLoss) {
                        result = 'LOSS';
                        exitPrice = stopLoss;
                        exitTime = fTime;
                        exitIndex = j;
                        break;
                    }
                    if (fLow <= takeProfit) {
                        result = 'WIN';
                        exitPrice = takeProfit;
                        exitTime = fTime;
                        exitIndex = j;
                        break;
                    }
                }
            }

            if (result !== 'OPEN') {
                // Calculate PnL
                let pnlSpot = 0;
                if (type === 'LONG') {
                    pnlSpot = (exitPrice - entryPrice) / entryPrice;
                } else {
                    pnlSpot = (entryPrice - exitPrice) / entryPrice;
                }
                const pnlFutures = pnlSpot * Strategy.Settings.LEVERAGE * 100; // in Percent

                trades.push({
                    direction: type,
                    entry_time: new Date(time).toISOString(),
                    entry_price: entryPrice,
                    stop_loss: stopLoss,
                    take_profit: takeProfit,
                    exit_time: new Date(exitTime).toISOString(),
                    exit_price: exitPrice,
                    result,
                    pnl_percent_spot: pnlSpot * 100,
                    pnl_percent_futures: pnlFutures,
                    reason: signal.reason
                });

                // Advance i
                i = exitIndex;
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

    // Avg RR
    // We can infer RR from TP/SL or actual PnL
    // The strategy aims for 1:3. Actual execution hits SL or TP. 
    // PnL of Win vs PnL of Loss.
    const avgWinPnl = wins.reduce((a, b) => a + b.pnl_percent_futures, 0) / (wins.length || 1);
    const avgLossPnl = losses.reduce((a, b) => a + b.pnl_percent_futures, 0) / (losses.length || 1);

    const totalPnl = trades.reduce((a, b) => a + b.pnl_percent_futures, 0);

    // DD
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
    console.log(`Long Trades:        ${trades.filter(t => t.direction === 'LONG').length}`);
    console.log(`Short Trades:       ${trades.filter(t => t.direction === 'SHORT').length}`);
    console.log(`Wins:               ${wins.length}`);
    console.log(`Losses:             ${losses.length}`);
    console.log(`Win Rate:           ${winRate.toFixed(2)}%`);
    console.log(`Avg Win (Future%):  ${avgWinPnl.toFixed(2)}%`);
    console.log(`Avg Loss (Future%): ${avgLossPnl.toFixed(2)}%`);
    console.log(`Total PnL (Future%):${totalPnl.toFixed(2)}%`);
    console.log(`Max Drawdown:       ${maxDD.toFixed(2)}%`);
    console.log(`Max Consec. Losses: ${maxLossStreak}`);

    // LOGS
    if (trades.length > 0) {
        // Find one LONG and one SHORT example
        const longEx = trades.find(t => t.direction === 'LONG' && t.result === 'WIN');
        const shortEx = trades.find(t => t.direction === 'SHORT' && t.result === 'WIN');

        console.log("\n--- EXAMPLES ---");
        if (longEx) console.log("LONG EXAMPLE:", JSON.stringify(longEx, null, 2));
        if (shortEx) console.log("SHORT EXAMPLE:", JSON.stringify(shortEx, null, 2));
    }

    // Export log
    const exportPath = path.join(__dirname, 'quick_intraday_results.json');
    fs.writeFileSync(exportPath, JSON.stringify(trades, null, 2));
    console.log(`\nDetailed logs saved to ${exportPath}`);
}

run();
