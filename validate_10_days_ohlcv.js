/**
 * Validate OHLCV data covers last 10 days
 */

const fs = require("fs");
const path = require("path");

// ===== CONFIG =====
const FILES_TO_CHECK = [
    { file: "./data/BTC_USDT_USDT-5m-futures.json", timeframe: "5m" },
    { file: "./data/BTC_USDT_USDT-15m-futures.json", timeframe: "15m" },
    { file: "./data/BTC_USDT_USDT-1h-futures.json", timeframe: "1h" }
];
const EXPECT_DAYS = 10;
const ALLOW_EXTRA_CANDLES_RATIO = 0.05; // allow 5% extra
// ==================

function timeframeToMs(tf) {
    const unit = tf.slice(-1);
    const val = parseInt(tf, 10);
    if (unit === 'm') return val * 60 * 1000;
    if (unit === 'h') return val * 60 * 60 * 1000;
    if (unit === 'd') return val * 24 * 60 * 60 * 1000;
    return 0;
}

function validateFile(config) {
    const filePath = path.join(__dirname, config.file);
    const tfStr = config.timeframe;

    console.log(`\nChecking file: ${config.file} (${tfStr})...`);

    if (!fs.existsSync(filePath)) {
        console.log(`⚠️ File not found: ${filePath}`);
        return true; // Skip missing files but don't fail entire script if just one is missing, user might only have one
    }

    let data;
    try {
        data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
        console.log(`❌ Error reading JSON: ${err.message}`);
        return false;
    }

    if (!Array.isArray(data) || data.length === 0) {
        console.log("❌ Invalid or empty OHLCV file");
        return false;
    }

    // sort by timestamp just in case
    data.sort((a, b) => a[0] - b[0]);

    const firstTs = data[0][0];
    const lastTs = data[data.length - 1][0];
    const firstDate = new Date(firstTs);
    const lastDate = new Date(lastTs);

    const msPerCandle = timeframeToMs(tfStr);
    const MS_1D = 24 * 60 * 60 * 1000;

    if (msPerCandle === 0) {
        console.log(`❌ Unknown timeframe format: ${tfStr}`);
        return false;
    }

    // ===== Validate candle spacing =====
    let invalidSpacing = 0;
    for (let i = 1; i < data.length; i++) {
        const diff = data[i][0] - data[i - 1][0];
        if (diff !== msPerCandle) {
            // Allow some minor jitter or missing candles, but report it
            // console.log(`Gap at ${new Date(data[i][0]).toISOString()}: ${diff}ms`);
            invalidSpacing++;
        }
    }

    // ===== Expected candles =====
    const candlesPerDay = MS_1D / msPerCandle;
    const expectedCandles = EXPECT_DAYS * candlesPerDay;

    // ===== Actual range =====
    const actualRangeMs = lastTs - firstTs;
    const actualRangeDays = actualRangeMs / MS_1D;

    // ===== Validate time coverage =====
    const now = Date.now();
    const tenDaysAgo = now - EXPECT_DAYS * MS_1D;

    // We check if the data covers roughly the expected duration
    const coversDuration = actualRangeDays >= (EXPECT_DAYS * 0.9); // 90% of expected days

    // ===== Report =====
    console.log("===== REPORT =====");
    console.log("Total candles:", data.length);
    console.log(`Expected (min ~${EXPECT_DAYS}d):`, expectedCandles);
    console.log("First candle:", firstDate.toISOString());
    console.log("Last candle :", lastDate.toISOString());
    console.log("Actual range:", actualRangeDays.toFixed(2), "days");

    let ok = true;

    if (invalidSpacing > 0) {
        console.log(`⚠️ Found ${invalidSpacing} gaps in candles`);
    }

    if (data.length < expectedCandles * 0.9) {
        console.log("❌ NOT ENOUGH candles (less than 90% of expected count)");
        ok = false;
    }

    if (!coversDuration) {
        console.log("❌ Data range is significantly less than 10 days");
        ok = false;
    }

    console.log("Result:", ok ? "✅ VALID" : "❌ INVALID");
    return ok;
}

// execute
let allValid = true;
FILES_TO_CHECK.forEach(conf => {
    if (!validateFile(conf)) {
        allValid = false;
    }
});

if (!allValid) {
    process.exit(1);
}
