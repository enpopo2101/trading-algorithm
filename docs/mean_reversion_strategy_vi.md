# Tài Liệu Kỹ Thuật: Mean Reversion Strategy & Backtest

## 1. Tổng Quan Chiến Thuật
Chiến thuật **Mean Reversion** (Đảo chiều về giá trị trung bình) này dựa trên giả thuyết rằng khi giá biến động quá mạnh trong một khoảng thời gian ngắn (Pump hoặc Dump), nó có xu hướng sẽ điều chỉnh phục hồi ngược lại.

Thuật toán quét các biến động giá lớn (Volatility Clusters) trong `N` cây nến gần nhất để tìm điểm vào lệnh đảo chiều.

## 2. Logic Thuật Toán (Strategy Logic)
*Nguồn file: `analysis/strategies/mean_reversion.js`*

### Các Tham Số Chính (Parameters)
*   **`CLUSTER_N`**: `4` (Số lượng nến để xét biến động).
*   **`VOLATILITY_THRESHOLD`**: `0.015` (Tương đương 1.5%). Đây là ngưỡng biến động tối thiểu để kích hoạt tín hiệu.

### Công Thức Xác Định Tín Hiệu (Signal Detection)
Thuật toán so sánh giá đóng cửa (`Close`) của cây nến hiện tại so với cây nến cách đây `N` phiên.

Công thức tính tỷ lệ thay đổi (`change`):
$$
\text{change} = \frac{\text{Close}_{i+N} - \text{Close}_{i}}{\text{Close}_{i}}
$$

**Điều Kiện Vào Lệnh:**

1.  **Tín hiệu LONG (Bắt đáy sau khi giá Dump):**
    *   Nếu `change` $\le$ `-VOLATILITY_THRESHOLD` (-1.5%).
    *   Tức là giá đã giảm mạnh hơn 1.5% trong 4 cây nến.

2.  **Tín hiệu SHORT (Bắt đỉnh sau khi giá Pump):**
    *   Nếu `change` $\ge$ `VOLATILITY_THRESHOLD` (+1.5%).
    *   Tức là giá đã tăng mạnh hơn 1.5% trong 4 cây nến.

---

## 3. Logic Backtest & Công Thức Tính Toán
*Nguồn file chính: `analysis/run_mean_reversion.js`*
*Module thực thi (Execution): `analysis/trading/mean_reversion_execution.js`*
*Module mô phỏng (Simulator): `analysis/trading/simulator.js`*

Hệ thống Backtest hiện đã được tách module để dễ dàng tích hợp với Bot Trading (Bybit) trong tương lai. Logic được chia thành:
1.  **Strategy**: Phát hiện tín hiệu (`strategies/mean_reversion.js`).
2.  **Execution**: Tính toán Entry/TP/SL và setup lệnh (`trading/mean_reversion_execution.js`).
3.  **Simulator**: Mô phỏng khớp lệnh, dời SL và tính PnL (`trading/simulator.js`).

Hệ thống vẫn quản lý vị thế theo cơ chế chia lệnh làm 2 phần (Part A và Part B) để tối ưu lợi nhuận.

### 3.1. Thiết Lập Vào Lệnh (Entry Setup)
*   **Điểm vào lệnh (`Entry Price`)**: Là giá đóng cửa (`Close`) của cây nến cuối cùng trong chuỗi biến động (nến thứ `i+N`).
*   **Đòn bẩy (`Leverage`)**: `50x`.
*   **Vốn cho mỗi lệnh (`Position Size`)**: Giả định `6000 USDT`.

### 3.2. Tính Toán Stop Loss (SL) & Take Profit (TP)
Hệ thống sử dụng mục tiêu lợi nhuận trên vốn (ROI %) để tính ra khoảng cách giá (Distance).

*   **Mục tiêu ROI:**
    *   **Stop Loss (SL)**: -27.5% ROI.
    *   **Take Profit 1 (TP1)**: +60% ROI (Tính từ Entry).
    *   **Take Profit 2 (TP2)**: +140% ROI (Tính tổng từ Entry). 
        *   *Lưu ý: Mức giá TP2 được tính toán dựa trên mức TP1 cộng thêm một khoảng chênh lệch sao cho tổng quãng đường từ Entry đến TP2 tương ứng với 140% ROI.*
        *   Công thức thực tế: `Giá TP2 = TP1 + (Distance_140% - Distance_60%)`.

*   **Công thức quy đổi từ ROI ra Giá (Price Distance):**
    $$
    \text{Distance}_{ROI} = \frac{\text{ROI Phần Trăm}}{100 \times \text{Leverage}} \times \text{Entry Price}
    $$
    
    *   Giá TP1 = Entry $\pm$ Distance(60%)
    *   Giá TP2 = TP1 $\pm$ (Distance(140%) - Distance(60%))

### 3.3. Cơ Chế Quản Lý Vị Thế (Position Management)
Vị thế được chia làm 2 phần bằng nhau (50/50):
*   **Phần A (50%)**: Mục tiêu chốt lời tại **TP1** (ROI 60%).
*   **Phần B (50%)**: Mục tiêu chốt lời tại **TP2** (ROI luỹ kế 140%).
    *   Tổng ROI của hệ thống nếu thắng toàn phần:
    $$
    \text{Total ROI} = (60\% \times 0.5) + (140\% \times 0.5) = 30\% + 70\% = 100\%
    $$

**Quy tắc Dời Stop Loss (Trailing SL):**
*   Khi giá chạm **TP1**, Phần A sẽ được chốt lời.
*   Ngay lập tức, Stop Loss cho Phần B còn lại sẽ được dời về **Entry Price (Break Even)** để bảo toàn vốn.

### 3.4. Logic Mô Phỏng Thoát Lệnh (Exit Simulation)
Hệ thống duyệt từng cây nến sau thời điểm vào lệnh (Candle `j > EntryIndex`) và kiểm tra các điều kiện theo thứ tự ưu tiên:

1.  **Kiểm tra Stop Loss (SL):** (Ưu tiên cao nhất)
    *   Nếu giá chạm mức SL của Phần A hoặc Phần B (tuỳ trạng thái hiện tại), lệnh bị đóng.
    *   **Lưu ý:** Nếu trong cùng 1 cây nến giá chạm cả TP và SL, thuật toán ưu tiên **SL** (giả định rủi ro xấu nhất).

2.  **Kiểm tra Take Profit 1 (TP1):**
    *   Nếu Phần A đang mở và giá chạm TP1 $\rightarrow$ Đóng Phần A, dời SL của Phần B về Entry.

3.  **Kiểm tra Take Profit 2 (TP2):**
    *   Nếu Phần B đang mở và giá chạm TP2 $\rightarrow$ Đóng Phần B. Hoàn tất lệnh thắng toàn phần (`Full Win`).

### 3.5. Phân Loại Kết Quả (Result Classification)
*   **SL_FULL**: Cả 2 phần vị thế đều chạm Stop Loss ban đầu (Âm 27.5%).
*   **TP1_BE**:
    *   Phần A chốt lời tại TP1 (+60%).
    *   Phần B bị đá ra tại Entry (0%).
    *   $\rightarrow$ Tổng ROI = $(60\% \times 0.5) + (0\% \times 0.5) = +30\%$.
*   **TP2_FULL**:
    *   Phần A chốt lời tại TP1 (+60%).
    *   Phần B chốt lời tại TP2 (+140%).
    *   $\rightarrow$ Tổng ROI = $(60\% \times 0.5) + (140\% \times 0.5) = +100\%$.

### 3.6. Công Thức Tính PnL (Lợi Nhuận USDT)
$$
\text{PnL} = \sum (\text{Phần trăm thay đổi giá} \times \text{Size từng phần} \times \text{Chiều hướng lệnh})
$$

Trong đó:
*   Chiều hướng (`dir`): 1 nếu LONG, -1 nếu SHORT.
*   Công thức tổng quát cho `TP2_FULL`:
    $$
    PnL = \left( \frac{TP1 - Entry}{Entry} \times \frac{Size}{2} \times dir \right) + \left( \frac{TP2 - Entry}{Entry} \times \frac{Size}{2} \times dir \right)
    $$

---

## 4. Tổng Kết File Chạy (`run_mean_reversion.js`)
File này thực hiện các bước sau:
1.  Load dữ liệu nến 1H từ file JSON.
2.  Chạy vòng lặp qua từng cây nến và gọi hàm `checkSignal`.
3.  Nếu có tín hiệu, thực hiện mô phỏng tương lai (Look-ahead simulation) để tìm điểm ra lệnh (Exit Time & Price).
4.  Tính toán PnL, ROI và Drawdown cho từng lệnh.
5.  In ra bảng thống kê tổng hợp (Win Rate, Total PnL, Max Consecutive Losses) và lưu chi tiết vào `mean_reversion_results.json`.
