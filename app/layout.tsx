import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'TDMU Campus 3D',
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/favicon.svg` },
  description:
    'Hệ thống WebGIS Đại học Thủ Dầu Một, hỗ trợ tìm kiếm địa danh và xem mô hình 3D.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
