const fs = require('fs');
const path = require('path');
const Strategy = require('./strategies/mean_reversion');

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
    const { LEVERAGE, SL_ROI_PERCENT, TP1_ROI_PERCENT, TP2_ROI_PERCENT } = Strategy.Settings;

    // We can iterate, but since we assume 'simulated entry' at i-1, 
    // it's possible multiple signals overlap.
    // The instructions say "Evaluate each next candle sequentially".
    // It doesn't strictly say "Only one trade at a time".
    // But usually for volatility pattern mining, we evaluate every pattern.
    // We'll treat each signal as a separate independent simulation (Backtest Labeling).

    // Loop until length - 5 (need i+4)
    let tradeIdCounter = 1;
    for (let i = 0; i < candles.length - Strategy.Settings.CLUSTER_N; i++) {

        const signal = Strategy.checkSignal(i, candles);
        if (!signal) continue;

        // ... [Existing setup code] ...

        // --- SETUP TRADE ---
        // CORRECT LOGIC: Entry is at the END of the move (i+4)
        const entryIndex = i + Strategy.Settings.CLUSTER_N;
        const entryCandle = candles[entryIndex];
        const entryPrice = entryCandle[4]; // Close of i+4
        const entryTime = entryCandle[0];

        // Targets (Price Distance)
        // ROI = (Delta / Entry) * Leverage * 100
        // Delta = (ROI / 100 / Leverage) * Entry
        const slDist = (SL_ROI_PERCENT / 100 / LEVERAGE) * entryPrice;
        const tp1Dist = (TP1_ROI_PERCENT / 100 / LEVERAGE) * entryPrice;
        const tp2Dist = (TP2_ROI_PERCENT / 100 / LEVERAGE) * entryPrice;

        let curSL = 0;
        let curTP1 = 0;
        let curTP2 = 0;

        if (signal === 'LONG') {
            curSL = entryPrice - slDist; // Price below entry
            curTP1 = entryPrice + tp1Dist;

            // User Requirement: TP2 calculated from TP1.
            // User Requirement: Total ROI = 100%. This implies Part B ROI = 140% (Total from Entry).
            // So TP2 Price must be Entry + Dist(140%).
            // Since curTP1 = Entry + Dist(60%).
            // curTP2 = curTP1 + (Dist(140%) - Dist(60%)).
            curTP2 = curTP1 + (tp2Dist - tp1Dist);
        } else {
            curSL = entryPrice + slDist; // Price above entry
            curTP1 = entryPrice - tp1Dist;
            curTP2 = curTP1 - (tp2Dist - tp1Dist);
        }

        // POSITION STATE
        let posA_Open = true; // 50%
        let posB_Open = true; // 50%
        let posB_SL_Is_BE = false; // Has SL moved to BE?

        let exitTime = 0;
        let finalResult = 'UNKNOWN'; // SL_FULL, TP1_BE, TP2_FULL
        let minEquity = 0; // Tracking Drawdown ROI

        // --- SIMULATE EXIT ---
        // Start evaluating from candle AFTER entry (entryIndex + 1)
        let j = entryIndex + 1;
        for (; j < candles.length; j++) {
            const c = candles[j];
            const low = c[3];
            const high = c[2];

            // 1. CHECK STOP LOSS (Both A and B)
            // Priority: SL hits first in candle? (Instructions: SL has priority if both hit)
            // We monitor if price touch SL level.
            let slHit = false;
            if (signal === 'LONG') {
                // If Low <= SL
                // Note: Position B SL might be at BE (EntryPrice)
                const effectiveSL_A = curSL;
                const effectiveSL_B = posB_SL_Is_BE ? entryPrice : curSL;

                // Check Full Stop first (Common SL)
                // If we haven't hit TP1 yet, both SL are at curSL.
                if (posA_Open && low <= curSL) {
                    slHit = true;
                    finalResult = 'SL_FULL'; // Both died
                } else if (!posA_Open && posB_Open) {
                    // A is closed (TP1 hit). B is at BE.
                    if (low <= effectiveSL_B) {
                        slHit = true;
                        finalResult = 'TP1_BE'; // B stopped at BE
                    }
                }
            } else {
                // SHORT
                const effectiveSL_A = curSL;
                const effectiveSL_B = posB_SL_Is_BE ? entryPrice : curSL;

                if (posA_Open && high >= curSL) {
                    slHit = true;
                    finalResult = 'SL_FULL';
                } else if (!posA_Open && posB_Open) {
                    if (high >= effectiveSL_B) {
                        slHit = true;
                        finalResult = 'TP1_BE';
                    }
                }
            }

            if (slHit) {
                exitTime = c[0];
                posA_Open = false;
                posB_Open = false;
                break;
            }

            // 2. CHECK TP1 (Only if A is open)
            if (posA_Open) {
                let tp1Hit = false;
                if (signal === 'LONG' && high >= curTP1) tp1Hit = true;
                if (signal === 'SHORT' && low <= curTP1) tp1Hit = true;

                if (tp1Hit) {
                    // Close A
                    posA_Open = false;
                    // Move B SL to BE
                    posB_SL_Is_BE = true;
                    // Continue checking TP2 in THIS same candle?
                    // Instructions: "If TP and SL are both hit in the same candle: Stop Loss has priority".
                    // We checked SL above.
                    // Could TP2 be hit in same candle as TP1? Yes.
                }
            }

            // 3. CHECK TP2 (If B is open)
            if (posB_Open) {
                let tp2Hit = false;
                if (signal === 'LONG' && high >= curTP2) tp2Hit = true;
                if (signal === 'SHORT' && low <= curTP2) tp2Hit = true;

                if (tp2Hit) {
                    posB_Open = false;
                    finalResult = 'TP2_FULL';
                    exitTime = c[0];
                    break;
                }
            }

            // Drawdown Tracking (Max adverse excursion relative to entry)
            // For Long: Min(Low - Entry)
            // ROI% = (Price - Entry)/Entry * Leverage
            if (signal === 'LONG') {
                const ddROI = ((low - entryPrice) / entryPrice) * LEVERAGE * 100;
                if (ddROI < minEquity) minEquity = ddROI;
            } else {
                const ddROI = ((entryPrice - high) / entryPrice) * LEVERAGE * 100;
                if (ddROI < minEquity) minEquity = ddROI;
            }
        }

        // --- CALCULATE TOTAL ROI ---
        // Based on result
        // --- CALCULATE PnL & ROI ---
        let roiTotal = 0;
        let avgExitPrice = 0;
        let pnlUSDT = 0;
        const POSITION_SIZE = 6000; // USDT (Notional)

        if (finalResult === 'SL_FULL') {
            // Both lost -27.5%
            roiTotal = -SL_ROI_PERCENT;
            avgExitPrice = curSL;

            // PnL = Delta * Size * Dir
            const dir = signal === 'LONG' ? 1 : -1;
            const diff = (avgExitPrice - entryPrice) / entryPrice;
            pnlUSDT = diff * POSITION_SIZE * dir;

        } else if (finalResult === 'TP1_BE') {
            // A closed at TP1 (+60%). B closed at BE (0%).
            // Total ROI = (60 * 0.5) + (0 * 0.5) = 30%.
            roiTotal = (TP1_ROI_PERCENT * 0.5);

            // Avg Exit Price = (TP1 + Entry) / 2
            avgExitPrice = (curTP1 + entryPrice) / 2;

            // PnL for Part A Only (Part B is 0)
            const dir = signal === 'LONG' ? 1 : -1;
            const diffA = (curTP1 - entryPrice) / entryPrice;
            pnlUSDT = (diffA * (POSITION_SIZE / 2) * dir);

        } else if (finalResult === 'TP2_FULL') {
            // A closed at TP1 (+60%). B closed at TP2 (+140%).
            // User Requirement: Total ROI = (0.5 * 60) + (0.5 * 140) = 100%.
            roiTotal = (TP1_ROI_PERCENT * 0.5) + (TP2_ROI_PERCENT * 0.5);

            avgExitPrice = (curTP1 + curTP2) / 2;

            const dir = signal === 'LONG' ? 1 : -1;
            const diffA = (curTP1 - entryPrice) / entryPrice;

            // diffB: From Entry to TP2
            const diffB = (curTP2 - entryPrice) / entryPrice;

            pnlUSDT = (diffA * (POSITION_SIZE / 2) * dir) + (diffB * (POSITION_SIZE / 2) * dir);

        } else {
            // Unknown
            roiTotal = 0;
            avgExitPrice = entryPrice;
            pnlUSDT = 0;
        }

        if (exitTime !== 0) { // Only record finished trades
            trades.push({
                trade_index: tradeIdCounter++,
                direction: signal,
                entry_time: new Date(entryTime).toISOString(),
                entry_price: entryPrice,
                exit_time: new Date(exitTime).toISOString(),
                exit_price: Number(avgExitPrice.toFixed(2)),
                final_result: finalResult,
                roi_total: roiTotal,
                pnl_usdt: Number(pnlUSDT.toFixed(2)),
                max_drawdown_during_trade: minEquity.toFixed(2)
            });

            // Skip i forward?
            // "Evaluate each next candle sequentially". Does NOT imply skipping the loop over detection.
            // Pattern overlap: If Dump starts at i, and Dump starts at i+1...
            // Usually we shouldn't take another trade if we are "in" one?
            // User did not specify "Max 1 open position".
            // AND "Entry is placed at candle i-1".
            // Since this is a "What if" study, we record ALL patterns.
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

    // EXAMPLES
    const exLong = longTrades.find(t => t.final_result === 'TP2_FULL') || longTrades[0];
    const exShort = shortTrades.find(t => t.final_result === 'TP2_FULL') || shortTrades[0];

    console.log("\n--- EXAMPLES ---");
    if (exLong) console.log("LONG EXAMPLE:", JSON.stringify(exLong, null, 2));
    if (exShort) console.log("SHORT EXAMPLE:", JSON.stringify(exShort, null, 2));

    // Export
    const exportPath = path.join(__dirname, 'mean_reversion_results.json');
    fs.writeFileSync(exportPath, JSON.stringify(trades, null, 2));
    console.log(`\nDetailed logs saved to ${exportPath}`);
}

run();
