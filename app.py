from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import sqlite3
import json
import time
import os
import hashlib

app = Flask(__name__)
CORS(app)

RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "")
RAPIDAPI_HOST = "unofficial-zillow-api2.p.rapidapi.com"

HEADERS = {
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": RAPIDAPI_HOST
}

FAVORITES_PIN = hashlib.sha256("lovemom".encode()).hexdigest()

def check_pin(pin):
    if not pin:
        return False
    return hashlib.sha256(str(pin).encode()).hexdigest() == FAVORITES_PIN

# ─────────────────────────────────────────────────────────────
# Property Tax Rates
# City-level rates for top investment markets.
# Falls back to state average if city not found.
# All rates are effective annual rates (% of home value).
# Sources: county assessor offices, Tax Foundation 2023-2024.
# Key: "City, ST" lowercase
# ─────────────────────────────────────────────────────────────
CITY_TAX_RATES = {
    # Florida
    "miami, fl": 0.0097, "orlando, fl": 0.0085, "tampa, fl": 0.0093,
    "jacksonville, fl": 0.0089, "fort lauderdale, fl": 0.0101,
    "st. petersburg, fl": 0.0088, "hialeah, fl": 0.0097,
    "tallahassee, fl": 0.0078, "cape coral, fl": 0.0091,
    "fort myers, fl": 0.0094, "sarasota, fl": 0.0090,
    "gainesville, fl": 0.0082, "boca raton, fl": 0.0098,
    # Texas
    "houston, tx": 0.0203, "austin, tx": 0.0181, "dallas, tx": 0.0197,
    "san antonio, tx": 0.0189, "fort worth, tx": 0.0192,
    "el paso, tx": 0.0165, "arlington, tx": 0.0195,
    "corpus christi, tx": 0.0173, "plano, tx": 0.0183,
    "lubbock, tx": 0.0168, "laredo, tx": 0.0157,
    "irving, tx": 0.0190, "frisco, tx": 0.0185,
    # California
    "los angeles, ca": 0.0072, "san diego, ca": 0.0074,
    "san jose, ca": 0.0071, "san francisco, ca": 0.0065,
    "fresno, ca": 0.0081, "sacramento, ca": 0.0079,
    "long beach, ca": 0.0073, "oakland, ca": 0.0076,
    "bakersfield, ca": 0.0083, "anaheim, ca": 0.0070,
    "santa ana, ca": 0.0072, "riverside, ca": 0.0086,
    "irvine, ca": 0.0068,
    # New York
    "new york, ny": 0.0088, "buffalo, ny": 0.0281,
    "yonkers, ny": 0.0163, "rochester, ny": 0.0295,
    "syracuse, ny": 0.0312,
    # Illinois
    "chicago, il": 0.0233, "aurora, il": 0.0251,
    "rockford, il": 0.0263, "joliet, il": 0.0248,
    "naperville, il": 0.0218,
    # Georgia
    "atlanta, ga": 0.0102, "columbus, ga": 0.0088,
    "savannah, ga": 0.0094, "athens, ga": 0.0091,
    "augusta, ga": 0.0086,
    # North Carolina
    "charlotte, nc": 0.0082, "raleigh, nc": 0.0078,
    "greensboro, nc": 0.0085, "durham, nc": 0.0094,
    "winston-salem, nc": 0.0081,
    # Arizona
    "phoenix, az": 0.0060, "tucson, az": 0.0064,
    "scottsdale, az": 0.0055, "chandler, az": 0.0058,
    "tempe, az": 0.0061, "mesa, az": 0.0059,
    "gilbert, az": 0.0057, "glendale, az": 0.0062,
    # Nevada
    "las vegas, nv": 0.0059, "henderson, nv": 0.0057,
    "reno, nv": 0.0064, "north las vegas, nv": 0.0061,
    # Colorado
    "denver, co": 0.0057, "colorado springs, co": 0.0059,
    "aurora, co": 0.0062, "fort collins, co": 0.0055,
    "boulder, co": 0.0052,
    # Washington
    "seattle, wa": 0.0093, "spokane, wa": 0.0108,
    "tacoma, wa": 0.0101, "bellevue, wa": 0.0089,
    "kent, wa": 0.0097,
    # Ohio
    "columbus, oh": 0.0148, "cleveland, oh": 0.0193,
    "cincinnati, oh": 0.0162, "toledo, oh": 0.0188,
    "akron, oh": 0.0177,
    # Michigan
    "detroit, mi": 0.0220, "grand rapids, mi": 0.0168,
    "warren, mi": 0.0175, "sterling heights, mi": 0.0159,
    "ann arbor, mi": 0.0148,
    # Pennsylvania
    "philadelphia, pa": 0.0131, "pittsburgh, pa": 0.0143,
    "allentown, pa": 0.0165, "erie, pa": 0.0181,
    # Tennessee
    "nashville, tn": 0.0064, "memphis, tn": 0.0088,
    "knoxville, tn": 0.0058, "chattanooga, tn": 0.0072,
    "clarksville, tn": 0.0061,
    # Indiana
    "indianapolis, in": 0.0092, "fort wayne, in": 0.0085,
    "evansville, in": 0.0079, "south bend, in": 0.0094,
    # Missouri
    "kansas city, mo": 0.0101, "st. louis, mo": 0.0127,
    "springfield, mo": 0.0089, "columbia, mo": 0.0083,
    # Minnesota
    "minneapolis, mn": 0.0108, "st. paul, mn": 0.0113,
    "rochester, mn": 0.0097, "duluth, mn": 0.0121,
    # Wisconsin
    "milwaukee, wi": 0.0222, "madison, wi": 0.0192,
    "green bay, wi": 0.0185, "kenosha, wi": 0.0207,
    # Oregon
    "portland, or": 0.0099, "eugene, or": 0.0092,
    "salem, or": 0.0088, "gresham, or": 0.0096,
    # Maryland
    "baltimore, md": 0.0147, "frederick, md": 0.0102,
    "gaithersburg, md": 0.0091, "rockville, md": 0.0088,
    # Virginia
    "virginia beach, va": 0.0089, "norfolk, va": 0.0093,
    "chesapeake, va": 0.0087, "richmond, va": 0.0097,
    "arlington, va": 0.0083,
    # Massachusetts
    "boston, ma": 0.0098, "worcester, ma": 0.0123,
    "springfield, ma": 0.0161, "lowell, ma": 0.0118,
    "cambridge, ma": 0.0095,
    # South Carolina
    "columbia, sc": 0.0059, "charleston, sc": 0.0054,
    "north charleston, sc": 0.0058, "greenville, sc": 0.0056,
    # Alabama
    "birmingham, al": 0.0049, "montgomery, al": 0.0044,
    "huntsville, al": 0.0042, "mobile, al": 0.0040,
    # Louisiana
    "new orleans, la": 0.0063, "baton rouge, la": 0.0055,
    "shreveport, la": 0.0061, "lafayette, la": 0.0050,
    # Kentucky
    "louisville, ky": 0.0089, "lexington, ky": 0.0081,
    "bowling green, ky": 0.0076,
    # Oklahoma
    "oklahoma city, ok": 0.0095, "tulsa, ok": 0.0092,
    "norman, ok": 0.0088, "broken arrow, ok": 0.0086,
    # Utah
    "salt lake city, ut": 0.0059, "west valley city, ut": 0.0062,
    "provo, ut": 0.0055, "st. george, ut": 0.0050,
    # New Mexico
    "albuquerque, nm": 0.0082, "las cruces, nm": 0.0074,
    "rio rancho, nm": 0.0079,
    # Kansas
    "wichita, ks": 0.0139, "overland park, ks": 0.0132,
    "kansas city, ks": 0.0148, "olathe, ks": 0.0128,
    # Nebraska
    "omaha, ne": 0.0163, "lincoln, ne": 0.0158,
    # Iowa
    "des moines, ia": 0.0161, "cedar rapids, ia": 0.0153,
    "davenport, ia": 0.0171,
    # Arkansas
    "little rock, ar": 0.0066, "fort smith, ar": 0.0060,
    "fayetteville, ar": 0.0058,
    # Mississippi
    "jackson, ms": 0.0071, "gulfport, ms": 0.0063,
    "hattiesburg, ms": 0.0059,
    # Idaho
    "boise, id": 0.0063, "nampa, id": 0.0071,
    "meridian, id": 0.0065,
    # Hawaii
    "honolulu, hi": 0.0028, "pearl city, hi": 0.0027,
    "hilo, hi": 0.0031,
    # Connecticut
    "bridgeport, ct": 0.0193, "new haven, ct": 0.0198,
    "hartford, ct": 0.0228, "stamford, ct": 0.0168,
    # New Jersey
    "newark, nj": 0.0281, "jersey city, nj": 0.0237,
    "paterson, nj": 0.0312, "elizabeth, nj": 0.0294,
    "trenton, nj": 0.0341,
    # New Hampshire
    "manchester, nh": 0.0208, "nashua, nh": 0.0197,
    "concord, nh": 0.0191,
    # Rhode Island
    "providence, ri": 0.0177, "warwick, ri": 0.0161,
    "cranston, ri": 0.0158,
    # Delaware
    "wilmington, de": 0.0061, "dover, de": 0.0055,
    # West Virginia
    "charleston, wv": 0.0058, "huntington, wv": 0.0062,
    # Montana
    "billings, mt": 0.0089, "missoula, mt": 0.0082,
    # Wyoming
    "cheyenne, wy": 0.0063, "casper, wy": 0.0058,
    # North Dakota
    "fargo, nd": 0.0103, "bismarck, nd": 0.0094,
    # South Dakota
    "sioux falls, sd": 0.0119, "rapid city, sd": 0.0110,
    # Alaska
    "anchorage, ak": 0.0121, "fairbanks, ak": 0.0112,
    # Washington DC
    "washington, dc": 0.0085,
}

STATE_TAX_RATES = {
    "AL": 0.0041, "AK": 0.0119, "AZ": 0.0063, "AR": 0.0062,
    "CA": 0.0075, "CO": 0.0060, "CT": 0.0198, "DE": 0.0057,
    "FL": 0.0089, "GA": 0.0092, "HI": 0.0028, "ID": 0.0069,
    "IL": 0.0227, "IN": 0.0085, "IA": 0.0153, "KS": 0.0138,
    "KY": 0.0086, "LA": 0.0055, "ME": 0.0136, "MD": 0.0099,
    "MA": 0.0114, "MI": 0.0154, "MN": 0.0108, "MS": 0.0065,
    "MO": 0.0093, "MT": 0.0084, "NE": 0.0157, "NV": 0.0060,
    "NH": 0.0204, "NJ": 0.0247, "NM": 0.0080, "NY": 0.0172,
    "NC": 0.0080, "ND": 0.0098, "OH": 0.0153, "OK": 0.0090,
    "OR": 0.0093, "PA": 0.0153, "RI": 0.0153, "SC": 0.0057,
    "SD": 0.0117, "TN": 0.0068, "TX": 0.0160, "UT": 0.0058,
    "VT": 0.0183, "VA": 0.0082, "WA": 0.0098, "WV": 0.0059,
    "WI": 0.0185, "WY": 0.0061, "DC": 0.0085,
}

def get_tax_estimate(price, city, state):
    """Returns annual tax, monthly tax, rate used, and whether it was city-level."""
    if not price:
        return None, None, None, False
    city_key = f"{(city or '').lower().strip()}, {(state or '').lower().strip()}"
    city_rate = CITY_TAX_RATES.get(city_key)
    if city_rate:
        rate = city_rate
        is_city_level = True
    else:
        rate = STATE_TAX_RATES.get((state or "").upper())
        is_city_level = False
    if not rate:
        return None, None, None, False
    annual  = round(price * rate)
    monthly = round(annual / 12)
    return annual, monthly, rate, is_city_level

CACHE_TTL = 60 * 60 * 24
DATABASE_URL = os.environ.get("DATABASE_URL")

# ─────────────────────────────────────────────────────────────
# Database — PostgreSQL if DATABASE_URL is set, else SQLite
# PostgreSQL is used in production (Render), SQLite for local dev
# ─────────────────────────────────────────────────────────────
def get_db():
    if DATABASE_URL:
        import psycopg
        conn = psycopg.connect(DATABASE_URL)
        return conn
    else:
        conn = sqlite3.connect("cache.db")
        conn.row_factory = sqlite3.Row
        return conn

def is_pg():
    return DATABASE_URL is not None

def init_db():
    conn = get_db()
    cur = conn.cursor()
    if is_pg():
        cur.execute("""
            CREATE TABLE IF NOT EXISTS cache (
                key TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                created_at BIGINT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                zpid TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'saved',
                note TEXT,
                added_at BIGINT NOT NULL
            )
        """)
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS cache (
                key TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                zpid TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'saved',
                note TEXT,
                added_at INTEGER NOT NULL
            )
        """)
    conn.commit()
    conn.close()

init_db()

def ph():
    """Return the right placeholder — %s for postgres, ? for sqlite."""
    return "%s" if is_pg() else "?"

def cache_get(key):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(f"SELECT data, created_at FROM cache WHERE key={ph()}", (key,))
    row = cur.fetchone()
    conn.close()
    if row:
        data, created_at = row[0], row[1]
        if time.time() - created_at < CACHE_TTL:
            return json.loads(data)
        conn = get_db()
        cur = conn.cursor()
        cur.execute(f"DELETE FROM cache WHERE key={ph()}", (key,))
        conn.commit()
        conn.close()
    return None

def cache_set(key, data):
    conn = get_db()
    cur = conn.cursor()
    p = ph()
    if is_pg():
        cur.execute(
            f"INSERT INTO cache (key, data, created_at) VALUES ({p},{p},{p}) ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data, created_at=EXCLUDED.created_at",
            (key, json.dumps(data), int(time.time()))
        )
    else:
        cur.execute(
            f"INSERT OR REPLACE INTO cache (key, data, created_at) VALUES ({p},{p},{p})",
            (key, json.dumps(data), int(time.time()))
        )
    conn.commit()
    conn.close()

def calculate_ratio(price, rent):
    if price and rent and price > 0:
        return round((rent / price) * 100, 4)
    return None

def score_label(ratio):
    if ratio is None:   return "unknown"
    if ratio >= 1.0:    return "excellent"
    if ratio >= 0.8:    return "good"
    if ratio >= 0.6:    return "fair"
    return "poor"

def process_listings(raw_listings):
    processed = []
    for home in raw_listings:
        price  = home.get("price")
        rent   = home.get("rentZestimate")
        if price and price < 1000:
            continue
        ratio  = calculate_ratio(price, rent)
        street = home.get("streetAddress", "")
        city   = home.get("city", "")
        state  = home.get("state", "")
        zipcode= home.get("zipcode", "")
        address= home.get("address") or f"{street}, {city}, {state} {zipcode}".strip(", ")
        detail_url = home.get("detailUrl", "")
        if detail_url and not detail_url.startswith("http"):
            detail_url = f"https://www.zillow.com{detail_url}"
        status_text = home.get("statusText", "")
        annual_tax, monthly_tax, tax_rate, is_city_tax = get_tax_estimate(price, city, state)
        processed.append({
            "zpid":             home.get("zpid"),
            "address":          address,
            "streetAddress":    street,
            "city":             city,
            "state":            state,
            "zipcode":          zipcode,
            "price":            price,
            "zestimate":        home.get("zestimate"),
            "rentZestimate":    rent,
            "ratio":            ratio,
            "score":            score_label(ratio),
            "annualTax":        annual_tax,
            "monthlyTax":       monthly_tax,
            "taxRate":          tax_rate,
            "isCityTax":        is_city_tax,
            "bedrooms":         home.get("bedrooms"),
            "bathrooms":        home.get("bathrooms"),
            "livingArea":       home.get("livingArea"),
            "homeType":         home.get("homeType"),
            "homeStatus":       home.get("homeStatus"),
            "statusText":       status_text,
            "isAuction":        "auction" in (status_text or "").lower(),
            "imgSrc":           home.get("imgSrc"),
            "detailUrl":        detail_url,
            "daysOnZillow":     home.get("daysOnZillow"),
            "lotAreaValue":     home.get("lotAreaValue"),
            "lotAreaUnit":      home.get("lotAreaUnit"),
            "taxAssessedValue": home.get("taxAssessedValue"),
            "priceChange":      home.get("priceChange"),
            "brokerName":       home.get("brokerName"),
            "hasOpenHouse":     home.get("hasOpenHouse"),
            "openHouseStartDate": home.get("openHouseStartDate"),
            "latitude":         home.get("latitude"),
            "longitude":        home.get("longitude"),
            "yearBuilt":        home.get("yearBuilt"),
        })
    return processed

def bool_param(val):
    if val is None or val == "": return None
    if isinstance(val, bool): return val
    return str(val).lower() == "true"

@app.route("/search", methods=["POST"])
def search():
    body = request.get_json(force=True, silent=True) or {}
    location = (body.get("location") or "").strip()
    if not location:
        return jsonify({"error": "Location is required"}), 400
    page = int(body.get("page", 1))
    payload = {"location": location, "page": page, "status": "for_sale"}
    int_fields = [
        "min_price", "max_price", "min_beds", "min_baths",
        "min_sqft", "max_sqft", "min_lot_size",
        "year_built_min", "year_built_max", "max_hoa",
        "min_school_rating", "parking_spots",
    ]
    for f in int_fields:
        v = body.get(f)
        if v not in (None, "", 0):
            try: payload[f] = int(v)
            except: pass
    bool_fields = [
        "has_pool", "has_garage", "has_basement", "has_ac",
        "is_waterfront", "single_story", "is_new_construction",
        "is_coming_soon", "is_foreclosure", "is_fsbo", "is_55_plus",
        "has_open_house", "has_3d_tour", "only_price_reduction",
    ]
    for f in bool_fields:
        v = bool_param(body.get(f))
        if v is True:
            payload[f] = True
    str_fields = ["days_on_zillow", "keywords", "home_type"]
    for f in str_fields:
        v = body.get(f)
        if v: payload[f] = v
    cache_key = json.dumps(payload, sort_keys=True)
    cached = cache_get(cache_key)
    if cached:
        cached["from_cache"] = True
        return jsonify(cached)
    try:
        response = requests.post(
            f"https://{RAPIDAPI_HOST}/search/address",
            headers={**HEADERS, "Content-Type": "application/json"},
            json=payload, timeout=20
        )
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Failed to fetch data: {str(e)}"}), 502
    raw_listings = data.get("listings", data.get("results", []))
    processed = process_listings(raw_listings)
    result = {
        "results":    processed,
        "total":      data.get("total_results", len(processed)),
        "page":       page,
        "max_pages":  data.get("max_pages"),
        "has_more":   data.get("has_more", False),
        "location":   location,
        "from_cache": False,
    }
    cache_set(cache_key, result)
    return jsonify(result)

@app.route("/favorites", methods=["GET"])
def get_favorites():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT zpid, data, status, note, added_at FROM favorites ORDER BY added_at DESC")
    rows = cur.fetchall()
    conn.close()
    return jsonify([{
        "zpid": r[0], "data": json.loads(r[1]),
        "status": r[2], "note": r[3], "added_at": r[4]
    } for r in rows])

@app.route("/favorites", methods=["POST"])
def add_favorite():
    body = request.get_json(force=True, silent=True) or {}
    if not check_pin(body.get("pin")):
        return jsonify({"error": "Invalid PIN"}), 403
    prop = body.get("property")
    if not prop or not prop.get("zpid"):
        return jsonify({"error": "Property data required"}), 400
    conn = get_db()
    cur = conn.cursor()
    p = ph()
    if is_pg():
        cur.execute(
            f"INSERT INTO favorites (zpid, data, status, note, added_at) VALUES ({p},{p},'saved',{p},{p}) ON CONFLICT (zpid) DO UPDATE SET data=EXCLUDED.data, note=EXCLUDED.note",
            (str(prop["zpid"]), json.dumps(prop), body.get("note", ""), int(time.time()))
        )
    else:
        cur.execute(
            f"INSERT OR REPLACE INTO favorites (zpid, data, status, note, added_at) VALUES ({p},{p},'saved',{p},{p})",
            (str(prop["zpid"]), json.dumps(prop), body.get("note", ""), int(time.time()))
        )
    conn.commit()
    conn.close()
    return jsonify({"message": "Added to favorites"})

@app.route("/favorites/<zpid>", methods=["PATCH"])
def update_favorite(zpid):
    body = request.get_json(force=True, silent=True) or {}
    if not check_pin(body.get("pin")):
        return jsonify({"error": "Invalid PIN"}), 403
    status = body.get("status")
    note   = body.get("note")
    conn = get_db()
    cur = conn.cursor()
    p = ph()
    if status:
        cur.execute(f"UPDATE favorites SET status={p} WHERE zpid={p}", (status, zpid))
    if note is not None:
        cur.execute(f"UPDATE favorites SET note={p} WHERE zpid={p}", (note, zpid))
    conn.commit()
    conn.close()
    return jsonify({"message": "Updated"})

@app.route("/favorites/<zpid>", methods=["DELETE"])
def remove_favorite(zpid):
    body = request.get_json(force=True, silent=True) or {}
    if not check_pin(body.get("pin")):
        return jsonify({"error": "Invalid PIN"}), 403
    conn = get_db()
    cur = conn.cursor()
    cur.execute(f"DELETE FROM favorites WHERE zpid={ph()}", (zpid,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Removed"})

@app.route("/favorites/lookup", methods=["POST"])
def lookup_by_address():
    body = request.get_json(force=True, silent=True) or {}
    url_or_address = (body.get("address") or "").strip()
    if not url_or_address:
        return jsonify({"error": "URL or address required"}), 400

    import re

    # ── If a Zillow URL is given, extract zpid and use /property/all ──
    zpid = None
    if "zillow.com" in url_or_address:
        match = re.search(r"/(\d+)_zpid", url_or_address)
        if match:
            zpid = match.group(1)

    if zpid:
        try:
            resp = requests.get(
                f"https://{RAPIDAPI_HOST}/property/all",
                headers=HEADERS,
                params={"zpid": zpid},
                timeout=20
            )
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.RequestException as e:
            return jsonify({"error": str(e)}), 502

        if not data:
            return jsonify({"error": "Property not found"}), 404

        # Build address string — can be object or string
        raw_addr = data.get("address")
        if isinstance(raw_addr, dict):
            street  = raw_addr.get("streetAddress", "")
            city    = raw_addr.get("city", "")
            state   = raw_addr.get("state", "")
            zipcode = raw_addr.get("zipcode", "")
        else:
            street  = data.get("streetAddress", "")
            city    = data.get("city", "")
            state   = data.get("state", "")
            zipcode = data.get("zipcode", "")

        address = f"{street}, {city}, {state} {zipcode}".strip(", ")
        if not address or address == ", ,  ":
            address = raw_addr if isinstance(raw_addr, str) else "Unknown address"

        # Price — check multiple locations in response
        price = (data.get("price") or
                 data.get("unformattedPrice") or
                 (data.get("hdpData") or {}).get("homeInfo", {}).get("price") or
                 (data.get("listing") or {}).get("price"))

        # Rent zestimate — check multiple locations
        rent = (data.get("rentZestimate") or
                (data.get("hdpData") or {}).get("homeInfo", {}).get("rentZestimate") or
                (data.get("listing") or {}).get("rentZestimate") or
                (data.get("rentEstimate") or {}).get("rentZestimate"))

        # Zestimate
        zestimate = (data.get("zestimate") or
                     (data.get("hdpData") or {}).get("homeInfo", {}).get("zestimate") or
                     (data.get("listing") or {}).get("zestimate"))

        # Image — /property/all stores photos under rich_media or compsCarouselPropertyPhotos
        img_src = data.get("imgSrc")
        if not img_src:
            rich = data.get("rich_media") or {}
            photos = (rich.get("photos") or rich.get("images") or
                      data.get("compsCarouselPropertyPhotos") or
                      data.get("photos") or data.get("images") or [])
            if photos:
                first = photos[0]
                if isinstance(first, dict):
                    img_src = (first.get("url") or first.get("src") or
                               ((first.get("mixedSources") or {}).get("jpeg") or [{}])[0].get("url"))
                elif isinstance(first, str):
                    img_src = first
        if not img_src:
            # Fall back to street view image
            img_src = data.get("streetViewImageUrl")

        detail_url = url_or_address  # use the original Zillow URL

        ratio = calculate_ratio(price, rent)
        annual_tax, monthly_tax, tax_rate, is_city_tax = get_tax_estimate(price, city, state)

        return jsonify({
            "zpid":             zpid,
            "address":          address,
            "streetAddress":    street,
            "city":             city,
            "state":            state,
            "zipcode":          zipcode,
            "price":            price,
            "zestimate":        zestimate,
            "rentZestimate":    rent,
            "ratio":            ratio,
            "score":            score_label(ratio),
            "annualTax":        annual_tax,
            "monthlyTax":       monthly_tax,
            "taxRate":          tax_rate,
            "isCityTax":        is_city_tax,
            "bedrooms":         data.get("bedrooms"),
            "bathrooms":        data.get("bathrooms"),
            "livingArea":       data.get("livingArea") or data.get("floorSize"),
            "homeType":         data.get("homeType"),
            "homeStatus":       data.get("homeStatus"),
            "statusText":       data.get("statusText", ""),
            "isAuction":        False,
            "imgSrc":           img_src,
            "detailUrl":        detail_url,
            "daysOnZillow":     data.get("daysOnZillow"),
            "lotAreaValue":     data.get("lotAreaValue"),
            "lotAreaUnit":      data.get("lotAreaUnit"),
            "taxAssessedValue": data.get("taxAssessedValue"),
            "priceChange":      data.get("priceChange"),
            "brokerName":       data.get("brokerName"),
            "hasOpenHouse":     data.get("hasOpenHouse"),
            "openHouseStartDate": data.get("openHouseStartDate"),
            "latitude":         data.get("latitude"),
            "longitude":        data.get("longitude"),
            "yearBuilt":        data.get("yearBuilt"),
        })

    # ── No zpid — fall back to address search ──
    try:
        response = requests.post(
            f"https://{RAPIDAPI_HOST}/search/address",
            headers={**HEADERS, "Content-Type": "application/json"},
            json={"location": url_or_address, "page": 1, "status": "for_sale"},
            timeout=20
        )
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 502

    raw = data.get("listings", data.get("results", []))
    if not raw:
        return jsonify({"error": "No listing found. Try pasting the full Zillow URL instead."}), 404

    processed = process_listings(raw[:1])
    if not processed:
        return jsonify({"error": "Could not process listing"}), 404

    return jsonify(processed[0])


@app.route("/cache/clear", methods=["POST"])
def clear_cache():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM cache")
    conn.commit()
    conn.close()
    return jsonify({"message": "Cache cleared"})

@app.route("/cache/stats", methods=["GET"])
def cache_stats():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM cache")
    total = cur.fetchone()[0]
    conn.close()
    return jsonify({"cached_queries": total})

if __name__ == "__main__":
    app.run(debug=True, port=5001)