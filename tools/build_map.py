#!/usr/bin/env python3
"""Regenerate data/map.js from boundary data and tools/areas.json.

Usage (from the repo root):
    npm install --prefix tools          # fetches cn-atlas and taiwan-atlas
    pip install shapely
    python3 tools/build_map.py

Mainland areas are built by merging prefectures (see tools/areas.json).
Taiwan areas are built from townships. Everything is projected with an
Albers equal-area conic centred on China, simplified, and written as SVG
path strings.
"""
import json
import math
import os
from shapely.geometry import shape, MultiPolygon, Polygon
from shapely.ops import unary_union, transform

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, 'tools')
CN_PREFECTURES = os.path.join(TOOLS, 'node_modules', 'cn-atlas', 'prefectures.json')
TW_TOWNS = os.path.join(TOOLS, 'node_modules', 'taiwan-atlas', 'towns-10t.json')
OUT = os.path.join(ROOT, 'data', 'map.js')

MAP_WIDTH = 800       # SVG units
MAP_PAD = 12
TW_HEIGHT = 300       # Taiwan inset viewBox height
TW_PAD = 10
SIMPLIFY = 0.35       # px tolerance, mainland
TW_SIMPLIFY = 0.25
MIN_AREA = 0.8        # drop slivers/islets smaller than this (px²)
TW_MIN_AREA = 0.3

# --- projection: Albers equal-area conic (sphere) ---
R = math.radians
LAM0, PHI1, PHI2, PHI0 = R(105), R(25), R(47), R(35)
N = (math.sin(PHI1) + math.sin(PHI2)) / 2
C = math.cos(PHI1) ** 2 + 2 * N * math.sin(PHI1)
RHO0 = math.sqrt(C - 2 * N * math.sin(PHI0)) / N


def albers(lon, lat):
    rho = math.sqrt(C - 2 * N * math.sin(R(lat))) / N
    theta = N * (R(lon) - LAM0)
    return rho * math.sin(theta), -(RHO0 - rho * math.cos(theta))  # y flipped for SVG


def project(geom):
    def f(xs, ys, zs=None):
        pts = [albers(x, y) for x, y in zip(xs, ys)]
        return [p[0] for p in pts], [p[1] for p in pts]
    return transform(f, geom)


def fit(geom_bounds, width=None, height=None, pad=0):
    minx, miny, maxx, maxy = geom_bounds
    s = (width - 2 * pad) / (maxx - minx) if width else (height - 2 * pad) / (maxy - miny)
    w = width or round((maxx - minx) * s + 2 * pad)
    h = height or round((maxy - miny) * s + 2 * pad)
    def tf(g):
        return transform(lambda xs, ys, zs=None: ([(x - minx) * s + pad for x in xs],
                                                   [(y - miny) * s + pad for y in ys]), g)
    return tf, w, h


def polys(g):
    return list(g.geoms) if isinstance(g, MultiPolygon) else [g]


def drop_small(g, min_area):
    return MultiPolygon([p for p in polys(g) if isinstance(p, Polygon) and p.area >= min_area])


def to_path(g):
    out = []
    for p in polys(g):
        for ring in [p.exterior, *p.interiors]:
            cs = list(ring.coords)[:-1]
            if len(cs) >= 3:
                out.append('M' + ' '.join(f'{x:.1f},{y:.1f}' for x, y in cs) + 'Z')
    return ''.join(out)


# --- minimal TopoJSON decoder (for taiwan-atlas) ---
def topo_features(topo, obj_name):
    tr = topo.get('transform')
    arcs = []
    for arc in topo['arcs']:
        x = y = 0
        pts = []
        for p in arc:
            if tr:
                x, y = x + p[0], y + p[1]
                pts.append((x * tr['scale'][0] + tr['translate'][0], y * tr['scale'][1] + tr['translate'][1]))
            else:
                pts.append(tuple(p))
        arcs.append(pts)

    def ring(idx):
        pts = []
        for i in idx:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            pts.extend(a if not pts else a[1:])
        return pts

    for geom in topo['objects'][obj_name]['geometries']:
        t, a = geom['type'], geom.get('arcs', [])
        if t == 'Polygon':
            coords = [ring(r) for r in a]
            g = {'type': 'Polygon', 'coordinates': coords}
        elif t == 'MultiPolygon':
            g = {'type': 'MultiPolygon', 'coordinates': [[ring(r) for r in poly] for poly in a]}
        else:
            continue
        yield geom.get('properties', {}), shape(g).buffer(0)


def main():
    areas = json.load(open(os.path.join(TOOLS, 'areas.json'), encoding='utf-8'))

    # Mainland
    code_to_lang = {}
    for lang, codes in areas['mainland'].items():
        for c in codes:
            code_to_lang[c] = lang
    exclude = set(areas['mainland_exclude'])
    groups = {lang: [] for lang in areas['mainland']}
    groups['_other'] = []
    for f in json.load(open(CN_PREFECTURES, encoding='utf-8'))['features']:
        code = f['properties']['id']
        if code in exclude:
            continue
        groups[code_to_lang.get(code, '_other')].append(project(shape(f['geometry']).buffer(0)))
    merged = {k: unary_union(v).buffer(1e-5).buffer(-1e-5) for k, v in groups.items() if v}
    tf, w, h = fit(unary_union(list(merged.values())).bounds, width=MAP_WIDTH, pad=MAP_PAD)
    zones = {}
    for k, g in merged.items():
        zones[k] = to_path(drop_small(tf(g).simplify(SIMPLIFY, preserve_topology=True), MIN_AREA))

    # Taiwan
    tw = areas['taiwan']
    lookup = {}
    for lang in ('hakka', 'formosan'):
        for county, towns in tw[lang].items():
            for t in towns:
                lookup[(county, t)] = lang
    layers = {'min': [], 'hakka': [], 'formosan': []}
    topo = json.load(open(TW_TOWNS, encoding='utf-8'))
    for props, g in topo_features(topo, 'towns'):
        county = props['COUNTYNAME'].replace('臺', '台')
        if county in tw['exclude_counties']:
            continue
        layers[lookup.get((county, props['TOWNNAME'].replace('臺', '台')), tw['default'])].append(project(g))
    layers = {k: unary_union(v) for k, v in layers.items()}
    ttf, tw_w, tw_h = fit(unary_union(list(layers.values())).bounds, height=TW_HEIGHT, pad=TW_PAD)
    tw_paths = {k: to_path(drop_small(ttf(g).simplify(TW_SIMPLIFY, preserve_topology=True), TW_MIN_AREA))
                for k, g in layers.items()}

    out = {
        'viewBox': [0, 0, w, h],
        'background': zones.pop('_other'),
        'zones': zones,
        'taiwan': {'viewBox': [0, 0, tw_w, tw_h], 'hokkien': tw_paths['min'],
                   'hakka': tw_paths['hakka'], 'indigenous': tw_paths['formosan']},
    }
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('// Generated by tools/build_map.py — do not edit by hand.\n'
                 '// Albers projection, simplified. Keys in `zones` match language ids in languages.js.\n')
        fh.write('export const MAP = ' + json.dumps(out) + ';\n')
    print(f'Wrote {OUT}: {len(zones)} zones, map {w}x{h}, Taiwan {tw_w}x{tw_h}')


if __name__ == '__main__':
    main()
