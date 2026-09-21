# 🏛️ Bản đồ 3D & WebGIS Trường Đại học Thủ Dầu Một (TDMU)

Dự án Hệ thống thông tin địa lý 3D (3D WebGIS Campus) tương tác trực quan dành cho **Trường Đại học Thủ Dầu Một (TDMU)**. Được phát triển dựa trên **Three.js**, **React**, **TypeScript** và dữ liệu địa lý quy hoạch của TDMU.

[🌐 Xem Trực Tuyến GitHub Pages](https://ducquang65.github.io/tdmu-campus-3d/) · [📊 Dữ liệu GIS TDMU](public/data/)

---

## ✨ Tính năng chính

- **Khuôn viên 3D TDMU**: Mô phỏng toàn bộ các tòa nhà chính (A1 - A9, B1 - B5, C1 - C4, Trung tâm CNTT, Thư viện, Nhà thi đấu,...).
- **Tìm kiếm & Định vị**: Tìm kiếm nhanh các giảng đường, phòng ban, khu chức năng và địa danh tiêu biểu của TDMU.
- **Tương tác 3D linh hoạt**: Xoay, thu phóng, di chuyển góc nhìn (Góc nhìn toàn cảnh, góc nhìn nghiêng, góc chim bay).
- **Hệ thống Lớp bản đồ (Layers)**: Tùy chỉnh bật/tắt các lớp Tòa nhà, Cây xanh, Đường đi, Mặt nước, Ranh giới trường và Nhãn tên.
- **Chế độ Môi trường & Thời gian**: Chuyển đổi khung cảnh Sáng (Day), Chiều (Dusk), Đêm (Night) và Bình minh (Dawn) với ánh sáng động.
- **Thông tin chi tiết tòa nhà**: Hiển thị mô tả chức năng, số tầng và tọa độ GIS chuẩn hóa của từng công trình.
- **Chia sẻ & Chụp ảnh**: Chia sẻ liên kết đến từng vị trí cụ thể hoặc xuất ảnh snapshot 3D.

---

## 🛠️ Công nghệ sử dụng

- **Frontend Core**: React 19, TypeScript, Next.js / Vinext, Vite 8
- **Graphics Engine**: Three.js (WebGL rendering, Draco Compression, Shadow Maps)
- **Data & GIS**: GeoJSON, OpenStreetMap data, TDMU Campus Master Plan 2026
- **UI & Styling**: Modern Glassmorphism UI, CSS Tailored Palette

---

## 💻 Hướng dẫn Chạy Cục bộ (Local Development)

### Yêu cầu hệ thống
- Node.js >= 20.x
- npm >= 10.x

### Các bước cài đặt

```bash
# Clone repository
git clone https://github.com/DucQuang65/tdu-campus-3d.git
cd tdu-campus-3d

# Cài đặt thư viện
npm install

# Chạy dev server
npm run dev
```

Truy cập đường dẫn `http://127.0.0.1:3000` trên trình duyệt.

### Kiểm tra & Build sản phẩm

```bash
# Kiểm tra TypeScript
npm run typecheck

# Build tĩnh cho GitHub Pages
npm run build:pages
```

---

## 📜 Giấy phép & Bản quyền (License)

- Mã nguồn dự án được phát hành theo giấy phép **MIT License**.
- Dữ liệu quy hoạch và thông tin công trình thuộc **Trường Đại học Thủ Dầu Một (TDMU)**.
