# Giai đoạn 2 — Hệ cũ đang yếu ở đâu (số đo thật)

> Cách đo: tạo 2 tài liệu mẫu có sẵn "đáp án", cho hệ cũ đọc, rồi chấm điểm tự động.
> - 📄 **Tiếng Việt** (DOCX): "Nhập môn Học máy", có chương/mục 3 cấp, 1 bảng.
> - 📄 **Tiếng Anh** (PDF, 4 trang): có mục lục, tiêu đề đầu trang, 1 trang chia 2 cột, 1 bảng.
>
> Chạy lại: `.venv\Scripts\python.exe -m evaluation.run_baseline --pipeline legacy`
> Số liệu đầy đủ: [legacy_metrics.json](baseline/legacy_metrics.json)

## Kết quả tóm tắt

| Điều cần làm được | Tiếng Việt | Tiếng Anh | Đánh giá |
|---|---|---|---|
| Giữ được chữ của tiêu đề | 100% | 100% | ✅ Tốt |
| **Nhận ra đâu là tiêu đề, cấp mấy** | 0% | 0% | ❌ Mất hết cấu trúc |
| **Biết mỗi đoạn nằm ở trang nào** | 0% | 0% | ❌ Không trích được nguồn |
| **Đoạn bị cắt lẫn nhiều mục** | 100% | 100% | ❌ Trộn lẫn nội dung |
| Đọc đúng thứ tự trang 2 cột | — | Đúng | ✅ Tốt |
| Dòng đầu trang lọt vào nội dung | — | 4 lần | ⚠️ Rác lọt vào, còn bị coi là khái niệm ("lecture notes") |
| **Khái niệm đúng trong top 10** | 20% | 60% | ❌ Tiếng Việt rất kém |
| **Từ ghép tiếng Việt còn nguyên** | 12,5% | — | ❌ Gần như vỡ hết |
| Khái niệm bị "vỡ" trong top 20 | 45% | — | ❌ |
| **Quan hệ trong đồ thị chỉ là "liên quan" chung chung** | 97% | 100% | ❌ Không có ý nghĩa |
| Quan hệ có dẫn chứng (trang + câu) | 0% | 0% | ❌ |

## Ví dụ cụ thể (tiếng Việt, top 10 khái niệm hệ cũ đưa ra)

`giám sát` · `học máy` · `thuật toán` · **`hồi quy tuyến`** · **`quy tuyến tính`** · `bài toán` ·
`huấn luyện` · `học sâu` · **`hình học`** · **`toán phân loại`**

- "hồi quy tuyến tính" bị cắt thành **"hồi quy tuyến"** và **"quy tuyến tính"**.
- "bài toán phân loại" thành **"toán phân loại"**.
- **"hình học"** không hề có trong tài liệu: nó ghép bừa từ "nhận dạng **hình** ảnh" và "**học** sâu".

→ Đây chính là lý do cần **tách từ tiếng Việt đúng** (Underthesea) và **chọn cụm danh từ**.

## Mục tiêu cho hệ mới (giai đoạn 4 phải đạt)

| Chỉ số | Hệ cũ | Mục tiêu |
|---|---|---|
| Nhận ra tiêu đề + cấp | 0% | ≥ 90% |
| Đoạn có số trang (PDF) | 0% | 100% |
| Đoạn trộn nhiều mục | 100% | ≤ 10% |
| Khái niệm đúng top 10 (VI) | 20% | ≥ 60% |
| Từ ghép còn nguyên (VI) | 12,5% | ≥ 80% |
| Quan hệ chung chung | ~100% | ≤ 30% |
| Quan hệ có dẫn chứng | 0% | ≥ 90% |
| Rác đầu/cuối trang | 4 | 0 |

> ⚠️ Lưu ý: tài liệu mẫu còn ngắn. Khi bạn gửi tài liệu thật, mình sẽ đo lại trên đó cho chắc.
