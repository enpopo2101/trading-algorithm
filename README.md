# Analysis & Backtest Framework

This directory contains a modular framework for backtesting trading strategies using JavaScript. It allows for easy addition of new indicators and strategies.

## Rules
Always update the README.md file after adding a new indicator or strategy.

## 📂 Project Structure

```text
analysis/
├── backtest_strategy.js        # Main Entry Point: Runs the backtest loop and exports results
├── backtest_results.json       # Output: JSON file containing detailed trade logs
├── run_mean_reversion.js       # Mean Reversion Strategy Runner
├── run_quick_intraday.js       # Quick Intraday Strategy Runner
├── trading/                    # Trade Execution & Simulation Logic
│   ├── mean_reversion_execution.js
│   ├── intraday_execution.js
│   └── simulator.js            # Shared Backtest Simulator
├── indicators/                 # Reusable Indicator functions
│   ├── ema.js                  # Exponential Moving Average
│   ├── sma.js                  # Simple Moving Average
│   ├── rsi.js                  # Relative Strength Index
│   └── atr.js                  # Average True Range
├── strategies/                 # Strategy Logic Definitions
│   ├── mean_reversion.js
│   ├── very_quick_intraday.js
│   └── trend_momentum.js       # Current Strategy: Trend + Momentum
└── data/                       # Historical Data (JSON form)
    └── BTC_USDT_USDT-*.json
```

## ⚙️ Trading Architecture
We have separated the Strategy Logic (Signal Generation) from Trade Execution (TP/SL Setup) and Simulation (Backtest Loop) to allow easier integration with Live Trading bots (e.g., Bybit).

*   **Strategies (`strategies/`)**: Pure logic to detect Entry Signals.
*   **Execution (`trading/*_execution.js`)**: Calculates specific TP/SL prices and Order parameters.
*   **Simulator (`trading/simulator.js`)**: Shared logic to simulate trade lifecycle (SL/TP hits) for backtesting.


## 🚀 How to Run

1.  **Prepare Data**: Ensure you have JSON data files in `analysis/data/` (Format: Array of candles `[timestamp, open, high, low, close, volume]`).
2.  **Run Backtest**:
    ```bash
    node analysis/backtest_strategy.js
    ```
3.  **Check Results**:
    *   Console output shows summary statistics (Win Rate, PnL, Drawdown).
    *   `analysis/backtest_results.json` contains detailed logs for every trade.

---

## 🏗 Architecture & Logic

### 1. Indicators (`analysis/indicators/`)
Each indicator is a standalone module exporting a single calculation function.
*   **Input**: Arrays of values (Close, High, Low, etc.) and a period.
*   **Output**: An array of calculated values matching the input length (padded with `null` for initial periods).

**How to add a new indicator:**
1.  Create `analysis/indicators/my_indicator.js`.
2.  Implement the calculation (handle `null` or insufficient data).
3.  Export the function: `module.exports = calculateMyInd;`.

### 2. Strategies (`analysis/strategies/`)
A Strategy module encapsulates the trading logic. It **must** export the following interface:

*   `Settings`: Object containing adjustable parameters (e.g., periods, multipliers).
*   `prepareIndicators(candles)`: Function to compute all necessary indicators before the loop starts. Returns a map of indicator arrays.
*   `checkEntry(i, candles, indicators)`: Function called at every candle `i`.
    *   **Returns**: `null` (no trade) OR an Object (Trade Signal).
    *   **Signal Object Structure**:
        ```javascript
        {
            type: 'LONG' | 'SHORT',
            entryPrice: number,
            stopLoss: number,
            takeProfit: number, // Main TP for backtest exit
            tp1, tp2, tp3: number, // Optional display targets
            rr: number, // Reward:Risk ratio
            reason: string, // Text explanation of the setup
            // ...any other metadata for logging
        }
        ```
*   `getMinLookback()`: Returns the number of initial candles to skip (to ensure indicators are valid).

**Current Strategy Logic (Trend Momentum):**

*   **LONG Signal:**
    *   **Trend**: EMA50 > EMA200 AND Close > EMA200.
    *   **Momentum**: RSI in [50, 70] AND RSI > SMA(RSI).
    *   **Trigger**: Price touched EMA10/50 and closed bullish above EMA10.

*   **SHORT Signal:**
    *   **Trend**: EMA50 < EMA200 (Downtrend) AND Close < EMA200.
    *   **Momentum**: RSI in [30, 50] AND RSI < SMA(RSI).
    *   **Trigger**: Price pulled back to EMA10/50, formed Bearish Candle, and closed below EMA10.

### 3. Backtest Runner (`analysis/backtest_strategy.js`)
This is the execution engine.
*   **Configuration**: Defines which files/timeframes to run.
*   **Process**:
    1.  Loads JSON data.
    2.  Calls `Strategy.prepareIndicators()`.
    3.  Iterates through candles starting from `getMinLookback()`.
    4.  Calls `Strategy.checkEntry()` at each step (Support LONG/SHORT).
    5.  If a signal is found, it simulates the trade:
        *   **LONG**: Loss inside candle Low <= SL; Win if High >= TP.
        *   **SHORT**: Loss inside candle High >= SL; Win if Low <= TP.
        *   Records the Result (WIN/LOSS), PnL, and Exit Time.
    6.  Aggregates statistics and writes detailed logs to JSON.

---

## 📝 Output Format (`backtest_results.json`)

The output is formatted for easy integration with signal channels or frontend displays.

```json
[
  {
    "headline": "🚀 LONG SIGNAL – BTCUSDT (15m)",
    "entry": 42850,
    "stopLoss": 42580,
    "targets": {
      "tp1": 43120,
      "tp2": 43450,
      "tp3": 43800
    },
    "indicators": "- EMA10 > EMA50 > EMA200\n- RSI(61) > 50 & < 70...",
    "rr": "1 : 2.10",
    "result": {
      "status": "WIN",
      "exitPrice": 43800,
      "pnlPercent": "2.22%",
      "exitTime": "2023-..."
    }
  }
]
```

## 🔮 Future Development

*   **Multi-Strategy Support**: Modify `backtest_strategy.js` to loop through an array of importable strategies.
*   **Dynamic sizing**: Add position sizing logic based on account balance.
