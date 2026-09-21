import type { Building, Category, Landmark } from './types';

export const LANDMARK_ALIASES: Record<string, string[]> = {
  'gate-1': ['Cổng chính', 'Cổng 1', 'Đường Trần Văn Ơn'],
  'gate-2': ['Cổng 2', 'Cổng phụ', 'Lê Thị Trung'],
  'building-b1': ['Nhà B1', 'Khu B1', 'Giảng đường B1'],
  'building-a1': ['Nhà A1', 'Giảng đường A1'],
  'building-a2': ['Nhà A2', 'Giảng đường A2'],
  'building-c': ['Nhà C', 'Giảng đường C'],
  'building-d': ['Nhà D', 'Giảng đường D'],
  'building-e1': ['Nhà E1', 'Giảng đường E1'],
  'hall-1': ['Hội trường 1', 'Hội trường lớn'],
  'self-study': ['Khu tự học', 'Phòng tự học'],
  parking: ['Bãi xe', 'Nhà để xe', 'Bãi xe cổng 1'],
};

/** All navigation surfaces share the curated catalogue, never the footprint index. */
export function searchLandmarks(
  landmarks: Landmark[],
  query: string,
  category: Category | 'all' = 'all',
): Landmark[] {
  const term = query.trim().toLocaleLowerCase();
  return landmarks.filter(
    (place) =>
      (category === 'all' || place.category === category) &&
      [place.name, ...(LANDMARK_ALIASES[place.id] ?? [])].some((name) =>
        name.toLocaleLowerCase().includes(term),
      ),
  );
}

export function navigableBuildings(
  buildings: Building[],
  landmarks: Landmark[],
): Building[] {
  const ids = new Set(landmarks.map((place) => place.id));
  return buildings.filter(
    (building) => building.landmark !== null && ids.has(building.landmark),
  );
}

/** Independent landmark POIs have estimated pick bounds, never OSM building IDs. */
export function navigationFootprints(
  buildings: Building[],
  landmarks: Landmark[],
) {
  return [
    ...navigableBuildings(buildings, landmarks).map((b) => ({
      ...b,
      layer: 'buildings' as const,
    })),
    ...landmarks
      .filter((l) =>
        ['gate', 'bridge', 'sculpture'].includes(l.placeKind ?? ''),
      )
      .map((l) => {
        const [x0, y0, x1, y1] = l.bounds;
        return {
          id: l.id,
          landmark: l.id,
          insideCampus: true,
          layer:
            l.placeKind === 'bridge'
              ? ('roads' as const)
              : ('buildings' as const),
          height: l.height,
          elevation: l.elevation,
          polygons: [
            [
              l.pickPolygon ?? [
                [x0, y0],
                [x1, y0],
                [x1, y1],
                [x0, y1],
                [x0, y0],
              ],
            ],
          ],
        };
      }),
  ];
}
