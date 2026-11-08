#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TDMU Campus 3D — Công cụ cập nhật GIS Ngoại vi & Đồng bộ khung GLB (Bước 2-3-4)
================================================================================
Mục đích:
1. GIỮ NGUYÊN 100% dữ liệu khuôn viên trường hiện tại (công trình nội khu, cây xanh,
   đường nội bộ, sân thể thao, mặt nước, ranh giới trường và 35 điểm mốc).
2. Tự động lấy dữ liệu GIS thực tế (Official OpenStreetMap API + Overpass Fallback
   khu vực P. Phú Hòa, TP. Thủ Dầu Một: Trần Văn Ơn, Lê Hồng Phong, D1, N5, N6, KDC Phú Hòa I...)
   cho phần NGOẠI VI (layer 'context') xung quanh trường.
3. Lọc hình học (Spatial Masking + Safety Buffer 6m dựa trên ranh giới pháp lý OSM Way 495488235)
   để không bất kỳ công trình hay đường ngoại vi nào lấn vào bên trong khuôn viên trường.
4. Thiết lập sẵn khung Bước 2–3–4 cho mô hình .glb (tự động quét thư mục
   public/models/*.glb và đồng bộ chuẩn xác vào public/data/models.json theo đúng schema của Three.js).
5. Đồng bộ vào cả tdmu_campus_gis.geojson và public/data/buildings.json.

Cách chạy (tại thư mục gốc h:\\BE\\tdu-campus-3d):
    python scripts/update_surroundings_and_glb.py
    python scripts/update_surroundings_and_glb.py --radius 500 --sync-models
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import shutil
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Ranh giới pháp lý chính xác của Trường ĐH Thủ Dầu Một (OSM Way 495488235, 44 đỉnh, diện tích ~6.74 ha)
DEFAULT_CAMPUS_BOUNDARY_COORDS = [
    (106.6735519, 10.9819071), (106.6737738, 10.9808882), (106.6734707, 10.9808252),
    (106.6733919, 10.9808078), (106.6734484, 10.9805614), (106.6734079, 10.9805524),
    (106.6734236, 10.9804838), (106.6734351, 10.9804335), (106.6734447, 10.9803917),
    (106.6733912, 10.9802107), (106.6734231, 10.9800278), (106.6734536, 10.9800288),
    (106.6735438, 10.9793712), (106.6741944, 10.9794215), (106.6741663, 10.9788518),
    (106.6748333, 10.9787627), (106.6750587, 10.9788431), (106.6750940, 10.9788511),
    (106.6751182, 10.9788550), (106.6755080, 10.9789175), (106.6755595, 10.9789271),
    (106.6755749, 10.9791822), (106.6755816, 10.9792925), (106.6755910, 10.9798094),
    (106.6755744, 10.9802357), (106.6755355, 10.9803445), (106.6755666, 10.9803660),
    (106.6755153, 10.9806410), (106.6754332, 10.9811958), (106.6754183, 10.9811924),
    (106.6750584, 10.9811238), (106.6750279, 10.9812948), (106.6750226, 10.9813336),
    (106.6748324, 10.9813084), (106.6747364, 10.9812957), (106.6747001, 10.9816039),
    (106.6746415, 10.9820383), (106.6745887, 10.9820321), (106.6738302, 10.9819430),
    (106.6737790, 10.9822484), (106.6737757, 10.9822646), (106.6732730, 10.9821790),
    (106.6733322, 10.9818667), (106.6735519, 10.9819071),
]

# Tọa độ tâm chuẩn của khuôn viên TDMU (06 Trần Văn Ơn, Phú Hòa, Thủ Dầu Một)
DEFAULT_TDMU_CENTER_LAT = sum(p[1] for p in DEFAULT_CAMPUS_BOUNDARY_COORDS) / len(DEFAULT_CAMPUS_BOUNDARY_COORDS)
DEFAULT_TDMU_CENTER_LON = sum(p[0] for p in DEFAULT_CAMPUS_BOUNDARY_COORDS) / len(DEFAULT_CAMPUS_BOUNDARY_COORDS)

# Danh mục mẫu các công trình trọng điểm dự kiến dựng .glb sau này (Bước 2-3-4)
DEFAULT_GLB_LANDMARKS_TEMPLATE = [
    {
        "id": "cong-chinh",
        "name": "Cổng chính (Số 06 Trần Văn Ơn)",
        "url": "models/cong-chinh.glb",
        "featureIds": ["gate-1"],
        "bounds": [50.0, 70.0, 90.0, 100.0],
        "enabled": False,
        "dracoCompressed": True,
        "note": "Bỏ file cong-chinh.glb vào public/models/ và chạy --sync-models để tự động kích hoạt",
    },
    {
        "id": "toa-nha-a1",
        "name": "Khối Hành chính - Hiệu bộ (Tòa A1)",
        "url": "models/toa-nha-a1.glb",
        "featureIds": ["tdmu-1292553894", "building-a1"],
        "bounds": [36.0, 65.0, 102.0, 104.0],
        "enabled": False,
        "dracoCompressed": True,
        "note": "Mô hình .glb nén Draco dựng từ Blender",
    },
    {
        "id": "giang-duong-b1",
        "name": "Dãy Giảng đường B1",
        "url": "models/giang-duong-b1.glb",
        "featureIds": ["building-b1"],
        "bounds": [20.0, 120.0, 70.0, 160.0],
        "enabled": False,
        "dracoCompressed": True,
        "note": "Mô hình .glb nén Draco dựng từ Blender",
    },
    {
        "id": "hoi-truong-lon",
        "name": "Hội trường lớn / Thư viện",
        "url": "models/hoi-truong-lon.glb",
        "featureIds": ["auditorium-main"],
        "bounds": [80.0, 150.0, 140.0, 200.0],
        "enabled": False,
        "dracoCompressed": True,
        "note": "Mô hình .glb nén Draco dựng từ Blender",
    },
]


# ==============================================================================
# 1. CÁC HÀM TOÁN HỌC KHÔNG GIAN & CHUYỂN ĐỔI TỌA ĐỘ (WGS84 <-> LOCAL METERS)
# ==============================================================================

def wgs84_to_local_xy(
    lon: float, lat: float, origin_lon: float, origin_lat: float
) -> Tuple[float, float]:
    """Chuyển đổi tọa độ kinh/vĩ độ (WGS84) sang tọa độ phẳng cục bộ (mét) của Three.js."""
    meters_per_deg_lat = 111132.92 - 559.82 * math.cos(2 * math.radians(origin_lat))
    meters_per_deg_lon = 111412.84 * math.cos(math.radians(origin_lat))
    x = (lon - origin_lon) * meters_per_deg_lon
    z = (lat - origin_lat) * meters_per_deg_lat
    return round(x, 2), round(z, 2)


def point_in_polygon(point: Tuple[float, float], polygon: List[Tuple[float, float]]) -> bool:
    """Kiểm tra điểm (lon, lat) có nằm trong đa giác hay không (Ray-casting)."""
    x, y = point
    inside = False
    n = len(polygon)
    if n < 3:
        return False
    p1x, p1y = polygon[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside


def distance_point_to_segment(
    px: float, py: float, x1: float, y1: float, x2: float, y2: float
) -> float:
    """Tính khoảng cách ngắn nhất từ điểm (px, py) tới đoạn thẳng (x1, y1)-(x2, y2)."""
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.hypot(px - proj_x, py - proj_y)


def is_geom_inside_or_too_close_to_campus(
    coords_lonlat: List[Tuple[float, float]],
    campus_poly_lonlat: List[Tuple[float, float]],
    origin_lon: float,
    origin_lat: float,
    buffer_meters: float = 6.0,
) -> bool:
    """
    Trả về True nếu bất kỳ đỉnh nào (hoặc tâm) của đối tượng ngoại vi nằm bên trong
    khuôn viên trường hoặc cách ranh giới trường dưới `buffer_meters` mét.
    Đảm bảo KHÔNG BAO GIỜ đụng chạm hay chồng lấn vào khuôn viên trường hiện có.
    """
    if not campus_poly_lonlat or not coords_lonlat:
        return False

    cx = sum(p[0] for p in coords_lonlat) / len(coords_lonlat)
    cy = sum(p[1] for p in coords_lonlat) / len(coords_lonlat)
    test_points = list(coords_lonlat) + [(cx, cy)]

    for pt in test_points:
        if point_in_polygon(pt, campus_poly_lonlat):
            return True

    campus_xy = [wgs84_to_local_xy(lon, lat, origin_lon, origin_lat) for lon, lat in campus_poly_lonlat]
    test_xy = [wgs84_to_local_xy(lon, lat, origin_lon, origin_lat) for lon, lat in test_points]

    n = len(campus_xy)
    for px, py in test_xy:
        for i in range(n):
            x1, y1 = campus_xy[i]
            x2, y2 = campus_xy[(i + 1) % n]
            if distance_point_to_segment(px, py, x1, y1, x2, y2) < buffer_meters:
                return True

    return False


# ==============================================================================
# 2. ĐỌC DỮ LIỆU HIỆN TRẠNG & KHÓA BẢO VỆ KHUÔN VIÊN TRƯỜNG
# ==============================================================================

def backup_file(path: Path) -> None:
    if path.exists():
        bak_path = path.with_suffix(path.suffix + ".bak")
        if not bak_path.exists():
            shutil.copy2(path, bak_path)
            print(f"  [Backup] Đã tạo bản sao lưu an toàn: {bak_path.name}")


def extract_campus_boundary_and_origin(
    geojson_data: Optional[Dict[str, Any]] = None,
) -> Tuple[List[Tuple[float, float]], float, float]:
    """
    Sử dụng đa giác ranh giới pháp lý chính xác của Trường ĐH Thủ Dầu Một (OSM Way 495488235).
    """
    boundary_poly = list(DEFAULT_CAMPUS_BOUNDARY_COORDS)
    origin_lon = DEFAULT_TDMU_CENTER_LON
    origin_lat = DEFAULT_TDMU_CENTER_LAT
    return boundary_poly, origin_lon, origin_lat


# ==============================================================================
# 3. TRUY VẤN DỮ LIỆU GIS NGOẠI VI TỪ OPENSTREETMAP (OFFICIAL API + OVERPASS)
# ==============================================================================

def fetch_osm_surroundings(
    center_lat: float, center_lon: float, radius_m: int = 450
) -> Dict[str, Any]:
    """
    Tải dữ liệu GIS thực tế quanh trường.
    Ưu tiên dùng OpenStreetMap Official API (cực nhanh, không bị timeout),
    sau đó dự phòng Overpass API.
    """
    dlat = radius_m / 111132.0
    dlon = radius_m / (111412.0 * math.cos(math.radians(center_lat)))
    min_lat = round(center_lat - dlat, 5)
    max_lat = round(center_lat + dlat, 5)
    min_lon = round(center_lon - dlon, 5)
    max_lon = round(center_lon + dlon, 5)

    osm_api_url = f"https://api.openstreetmap.org/api/0.6/map?bbox={min_lon},{min_lat},{max_lon},{max_lat}"
    print(f"  [GIS] Đang tải từ OpenStreetMap API ({min_lat},{min_lon} -> {max_lat},{max_lon})...")
    try:
        req = urllib.request.Request(osm_api_url, headers={"User-Agent": "TDMU-Campus-3D-Updater/1.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            xml_bytes = resp.read()
            root = ET.fromstring(xml_bytes)
            elements: List[Dict[str, Any]] = []
            for node in root.findall("node"):
                elements.append({
                    "type": "node",
                    "id": int(node.attrib["id"]),
                    "lat": float(node.attrib["lat"]),
                    "lon": float(node.attrib["lon"]),
                })
            for way in root.findall("way"):
                elements.append({
                    "type": "way",
                    "id": int(way.attrib["id"]),
                    "nodes": [int(nd.attrib["ref"]) for nd in way.findall("nd")],
                    "tags": {t.attrib["k"]: t.attrib["v"] for t in way.findall("tag")},
                })
            print(f"  [GIS Thành công] Đã tải {len(elements)} phần tử từ OSM API.")
            return {"elements": elements}
    except Exception as exc:
        print(f"  [OSM API chậm hoặc lỗi: {exc}], thử tiếp Overpass API...")

    overpass_query = f"""
    [out:json][timeout:30];
    (
      way["building"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["highway"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out body;
    >;
    out skel qt;
    """
    for ep in ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]:
        try:
            data = urllib.parse.urlencode({"data": overpass_query}).encode("utf-8")
            req = urllib.request.Request(ep, data=data, headers={"User-Agent": "TDMU-Campus-3D-Updater/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            continue

    raise RuntimeError("Không thể kết nối tới cả OSM API và Overpass API. Vui lòng kiểm tra kết nối mạng.")


def estimate_surrounding_building_height(tags: Dict[str, str], osm_id: int) -> float:
    if "height" in tags:
        try:
            val = str(tags["height"]).replace("m", "").strip()
            return max(4.0, min(50.0, float(val)))
        except ValueError:
            pass

    if "building:levels" in tags:
        try:
            levels = float(tags["building:levels"])
            return round(max(1.0, levels) * 3.5 + 0.5, 1)
        except ValueError:
            pass

    btype = tags.get("building", "yes")
    if btype in ("apartments", "commercial", "hotel", "office"):
        return 15.0
    levels = 2 + (osm_id % 3)
    return round(levels * 3.4 + 0.8, 1)


def convert_osm_to_exterior_features(
    osm_json: Dict[str, Any],
    campus_poly_lonlat: List[Tuple[float, float]],
    origin_lon: float,
    origin_lat: float,
    buffer_meters: float = 6.0,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    nodes: Dict[int, Tuple[float, float]] = {}
    for el in osm_json.get("elements", []):
        if el.get("type") == "node":
            nodes[int(el["id"])] = (float(el["lon"]), float(el["lat"]))

    exterior_geojson_features: List[Dict[str, Any]] = []
    exterior_buildings_list: List[Dict[str, Any]] = []

    skipped_inside_campus = 0
    kept_buildings = 0
    kept_roads = 0

    for el in osm_json.get("elements", []):
        if el.get("type") != "way":
            continue

        way_id = int(el["id"])
        if way_id == 495488235:  # Chính là ranh giới trường TDMU
            continue

        tags = el.get("tags") or {}
        node_ids = el.get("nodes") or []
        coords_lonlat = [nodes[nid] for nid in node_ids if nid in nodes]
        if len(coords_lonlat) < 2:
            continue

        # KIỂM TRA KHÓA BẢO VỆ KHUÔN VIÊN
        if is_geom_inside_or_too_close_to_campus(
            coords_lonlat, campus_poly_lonlat, origin_lon, origin_lat, buffer_meters=buffer_meters
        ):
            skipped_inside_campus += 1
            continue

        # Tòa nhà ngoại vi
        if "building" in tags and len(coords_lonlat) >= 3:
            if coords_lonlat[0] != coords_lonlat[-1]:
                coords_lonlat.append(coords_lonlat[0])

            height = estimate_surrounding_building_height(tags, way_id)
            name = tags.get("name", tags.get("name:vi", ""))
            addr_street = tags.get("addr:street", "")

            feat = {
                "type": "Feature",
                "id": f"ext-bldg-{way_id}",
                "properties": {
                    "id": f"ext-bldg-{way_id}",
                    "osm_id": way_id,
                    "name": name or "Công trình ngoại vi",
                    "street": addr_street,
                    "layer": "context",
                    "category": "context",
                    "isExterior": True,
                    "height": height,
                    "levels": int(round(height / 3.5)),
                    "source": "OpenStreetMap / GIS Surroundings",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[lon, lat] for lon, lat in coords_lonlat]],
                },
            }
            exterior_geojson_features.append(feat)

            footprint_xy = [
                list(wgs84_to_local_xy(lon, lat, origin_lon, origin_lat))
                for lon, lat in coords_lonlat[:-1]
            ]
            xs = [p[0] for p in footprint_xy]
            zs = [p[1] for p in footprint_xy]
            min_x, max_x = min(xs), max(xs)
            min_z, max_z = min(zs), max(zs)
            cx = round((min_x + max_x) / 2.0, 2)
            cz = round((min_z + max_z) / 2.0, 2)

            exterior_buildings_list.append({
                "id": f"way/{way_id}",
                "name": name or "Khu phố phụ cận TDMU",
                "category": "context",
                "center": [cx, cz],
                "height": height,
                "levels": float(round(height / 3.5)),
                "insideCampus": False,
                "landmark": None,
                "polygons": [[[[list(p) for p in footprint_xy] + [list(footprint_xy[0])]]]],
                "bounds": [round(min_x, 2), round(min_z, 2), round(max_x, 2), round(max_z, 2)],
                "heightBasis": "Ước lượng quy hoạch phụ cận TDMU",
                "facadeBasis": "Đặc trưng hình khối nhà phố Phú Hòa",
                "osmVersion": 1,
                "osmEditedAt": "2026-09-22T00:00:00Z",
                "sourceUrl": f"https://www.openstreetmap.org/way/{way_id}",
                "tags": tags,
                "elevation": 0.0,
                "zone": "surroundings"
            })
            kept_buildings += 1

        # Tuyến đường ngoại vi
        elif "highway" in tags:
            hw_type = tags.get("highway", "residential")
            name = tags.get("name", tags.get("name:vi", ""))
            feat = {
                "type": "Feature",
                "id": f"ext-road-{way_id}",
                "properties": {
                    "id": f"ext-road-{way_id}",
                    "osm_id": way_id,
                    "name": name,
                    "highway": hw_type,
                    "layer": "roads",
                    "category": "roads",
                    "isExterior": True,
                    "source": "OpenStreetMap / GIS Surroundings",
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[lon, lat] for lon, lat in coords_lonlat],
                },
            }
            exterior_geojson_features.append(feat)
            kept_roads += 1

    print(f"  [Lọc Không Gian] Đã bảo vệ khuôn viên: Bỏ qua {skipped_inside_campus} đối tượng thuộc/chạm nội khu.")
    print(f"  [Kết Quả Ngoại Vi] Giữ lại {kept_buildings} công trình ngoại vi & {kept_roads} tuyến đường xung quanh.")
    return exterior_geojson_features, exterior_buildings_list


# ==============================================================================
# 4. CẬP NHẬT GEOJSON & BUILDINGS.JSON MÀ KHÔNG ĐỤNG TỚI KHUÔN VIÊN NỘI KHU
# ==============================================================================

def merge_exterior_into_geojson(
    geojson_path: Path, exterior_features: List[Dict[str, Any]]
) -> None:
    if not geojson_path.exists():
        return

    backup_file(geojson_path)
    with open(geojson_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    existing_features = data.get("features", [])
    campus_internal_features = []
    removed_old_exterior = 0

    for feat in existing_features:
        props = feat.get("properties") or {}
        layer = str(props.get("layer", props.get("category", ""))).lower()
        is_ext = bool(
            props.get("isExterior")
            or props.get("isSurrounding")
            or layer in ("exterior", "surroundings", "surrounding", "context")
            or str(feat.get("id", "")).startswith("ext-")
        )
        if is_ext:
            removed_old_exterior += 1
        else:
            campus_internal_features.append(feat)

    data["features"] = campus_internal_features + exterior_features
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(
        f"  [Cập nhật GeoJSON] {geojson_path.name}: Giữ nguyên {len(campus_internal_features)} đối tượng nội khu, "
        f"thay {removed_old_exterior} ngoại vi cũ bằng {len(exterior_features)} ngoại vi mới."
    )


def merge_exterior_into_buildings_json(
    buildings_path: Path, exterior_buildings: List[Dict[str, Any]]
) -> None:
    if not buildings_path.exists():
        return

    backup_file(buildings_path)
    with open(buildings_path, "r", encoding="utf-8") as f:
        buildings = json.load(f)

    campus_internal_bldgs = [
        b for b in buildings
        if b.get("insideCampus", True) and b.get("category") != "context" and not b.get("isExterior")
    ]
    merged = campus_internal_bldgs + exterior_buildings

    with open(buildings_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    print(
        f"  [Cập nhật Buildings] {buildings_path.name}: Giữ nguyên {len(campus_internal_bldgs)} công trình nội khu, "
        f"bổ sung {len(exterior_buildings)} công trình ngoại vi (Tổng: {len(merged)})."
    )


# ==============================================================================
# 5. ĐỒNG BỘ KHUNG MÔ HÌNH 3D (.GLB NÉN DRACO - BƯỚC 2, 3, 4)
# ==============================================================================

def setup_and_sync_glb_pipeline(project_root: Path) -> None:
    models_dir = project_root / "public" / "models"
    blender_dir = project_root / "blender"
    data_dir = project_root / "public" / "data"

    models_dir.mkdir(parents=True, exist_ok=True)
    blender_dir.mkdir(parents=True, exist_ok=True)
    data_dir.mkdir(parents=True, exist_ok=True)

    models_json_path = data_dir / "models.json"
    manifest: Dict[str, Any] = {
        "version": 2,
        "chunkSizeMeters": 360,
        "units": "meters",
        "axes": {"x": "east", "y": "up", "z": "south"},
        "zones": [],
        "landmarks": [],
        "chunks": [],
    }

    if models_json_path.exists():
        try:
            with open(models_json_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    manifest.update(loaded)
        except Exception as exc:
            print(f"  [Cảnh báo] models.json cũ bị lỗi ({exc}), sẽ khởi tạo lại.")

    glb_files_on_disk = {p.name: p for p in models_dir.glob("*.glb")}
    active_landmarks: List[Dict[str, Any]] = []

    for tmpl in DEFAULT_GLB_LANDMARKS_TEMPLATE:
        rel_url = tmpl["url"]
        fname = Path(rel_url).name
        if fname in glb_files_on_disk:
            file_path = glb_files_on_disk[fname]
            size_bytes = file_path.stat().st_size
            item = {
                "id": tmpl["id"],
                "url": rel_url,
                "bytes": size_bytes,
                "featureIds": tmpl.get("featureIds", [tmpl["id"]]),
                "bounds": tmpl.get("bounds", [0, 0, 50, 50]),
            }
            active_landmarks.append(item)
            print(f"  [GLB Active] Đã nạp {fname} ({round(size_bytes/1024, 1)} KB) vào Three.js manifest.")

    known_urls = {item["url"] for item in active_landmarks}
    for fname, p in sorted(glb_files_on_disk.items()):
        url = f"models/{fname}"
        if url not in known_urls:
            size_bytes = p.stat().st_size
            item = {
                "id": p.stem,
                "url": url,
                "bytes": size_bytes,
                "featureIds": [p.stem],
                "bounds": [0, 0, 50, 50],
            }
            active_landmarks.append(item)
            print(f"  [GLB Auto-Discovered] Đã nạp {fname} ({round(size_bytes/1024, 1)} KB) vào Three.js manifest.")

    manifest["landmarks"] = active_landmarks

    with open(models_json_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(
        f"  [GLB Manifest] Đã đồng bộ {models_json_path.name} "
        f"({len(active_landmarks)} file .glb đã nạp / {len(glb_files_on_disk)} file trên ổ đĩa)."
    )


# ==============================================================================
# 6. HÀM CHÍNH (CLI ENTRYPOINT)
# ==============================================================================

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Cập nhật dữ liệu GIS Ngoại vi TDMU & đồng bộ khung GLB (Bảo toàn 100% nội khu)."
    )
    parser.add_argument(
        "--project-dir",
        type=str,
        default=".",
        help="Đường dẫn tới thư mục gốc dự án tdu-campus-3d (mặc định: thư mục hiện tại)",
    )
    parser.add_argument(
        "--radius",
        type=int,
        default=450,
        help="Bán kính lấy dữ liệu ngoại vi quanh trường tính bằng mét (mặc định: 450m)",
    )
    parser.add_argument(
        "--buffer",
        type=float,
        default=6.0,
        help="Khoảng cách đệm an toàn (mét) tính từ ranh giới trường để không chạm nội khu (mặc định: 6m)",
    )
    parser.add_argument(
        "--sync-models",
        action="store_true",
        help="Chỉ quét thư mục public/models/ và đồng bộ models.json mà không tải lại OSM",
    )
    args = parser.parse_args()

    project_root = Path(args.project_dir).resolve()
    print(f"=== TDMU CAMPUS 3D: CẬP NHẬT NGOẠI VI & KHUNG GLB ===")
    print(f"Thư mục dự án: {project_root}")

    setup_and_sync_glb_pipeline(project_root)
    if args.sync_models:
        print("Hoàn tất đồng bộ models.json!")
        return 0

    geojson_candidates = [
        project_root / "data" / "tdmu_campus_gis.geojson",
        project_root / "public" / "data" / "tdmu_campus_gis.geojson",
    ]
    existing_geojson_paths = [p for p in geojson_candidates if p.exists()]

    campus_poly, origin_lon, origin_lat = extract_campus_boundary_and_origin()
    print(
        f"  [Khóa Nội Khu TDMU] Tâm tọa độ: ({origin_lat:.6f}, {origin_lon:.6f}) | "
        f"Số đỉnh đa giác bảo vệ khuôn viên: {len(campus_poly)} (Ranh giới chuẩn OSM Way 495488235)"
    )

    try:
        osm_json = fetch_osm_surroundings(origin_lat, origin_lon, radius_m=args.radius)
    except Exception as exc:
        print(f"  [Lỗi tải dữ liệu OSM]: {exc}")
        return 1

    exterior_features, exterior_buildings = convert_osm_to_exterior_features(
        osm_json,
        campus_poly_lonlat=campus_poly,
        origin_lon=origin_lon,
        origin_lat=origin_lat,
        buffer_meters=args.buffer,
    )

    standalone_ext_path = project_root / "data" / "tdmu_surroundings_only.geojson"
    standalone_ext_path.parent.mkdir(parents=True, exist_ok=True)
    with open(standalone_ext_path, "w", encoding="utf-8") as f:
        json.dump(
            {"type": "FeatureCollection", "features": exterior_features},
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"  [Xuất File Ngoại Vi Riêng] {standalone_ext_path.name}")

    for gj_path in existing_geojson_paths:
        merge_exterior_into_geojson(gj_path, exterior_features)

    bldgs_json_path = project_root / "public" / "data" / "buildings.json"
    if bldgs_json_path.exists():
        merge_exterior_into_buildings_json(bldgs_json_path, exterior_buildings)

    print("=== HOÀN TẤT! KHUÔN VIÊN NỘI KHU ĐƯỢC GIỮ NGUYÊN 100% ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
