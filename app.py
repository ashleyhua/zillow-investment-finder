from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import sqlite3
import json
import time
import os

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from the React frontend

# ─────────────────────────────────────────────────────────────
# API Configuration
# The API key is stored as an environment variable on Render
# (not hardcoded) so it stays secret even in a public repo.
# ─────────────────────────────────────────────────────────────
RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "")
RAPIDAPI_HOST = "unofficial-zillow-api2.p.rapidapi.com"

# These headers are sent with every request to the Zillow API
HEADERS = {
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": RAPIDAPI_HOST
}

# ─────────────────────────────────────────────────────────────
# Cache Configuration
# Results are cached in a local SQLite database for 24 hours.
# This means repeat searches don't use up API calls.
# ─────────────────────────────────────────────────────────────
CACHE_DB = "cache.db"
CACHE_TTL = 60 * 60 * 24  # 24 hours in seconds


# ─────────────────────────────────────────────────────────────
# Database Setup
# Creates the cache table if it doesn't already exist.
# Runs once automatically when the server starts.
# ─────────────────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(CACHE_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cache (
            key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
    """)
    conn.commit()
    conn.close()

init_db()


# ─────────────────────────────────────────────────────────────
# Cache Read
# Looks up a search in the database by its cache key.
# Returns the saved result if it's less than 24 hours old,
# deletes it and returns None if it's expired.
# ─────────────────────────────────────────────────────────────
def cache_get(key):
    conn = sqlite3.connect(CACHE_DB)
    row = conn.execute("SELECT data, created_at FROM cache WHERE key=?", (key,)).fetchone()
    conn.close()
    if row:
        data, created_at = row
        if time.time() - created_at < CACHE_TTL:
            return json.loads(data)
        # Expired — delete it so it gets refreshed next time
        conn = sqlite3.connect(CACHE_DB)
        conn.execute("DELETE FROM cache WHERE key=?", (key,))
        conn.commit()
        conn.close()
    return None


# ─────────────────────────────────────────────────────────────
# Cache Write
# Saves a search result to the database with the current
# timestamp so we know when it expires.
# ─────────────────────────────────────────────────────────────
def cache_set(key, data):
    conn = sqlite3.connect(CACHE_DB)
    conn.execute(
        "INSERT OR REPLACE INTO cache (key, data, created_at) VALUES (?, ?, ?)",
        (key, json.dumps(data), int(time.time()))
    )
    conn.commit()
    conn.close()


# ─────────────────────────────────────────────────────────────
# Ratio Calculator
# Divides the monthly rent estimate by the purchase price
# and returns a percentage. For example, $2,000 rent on a
# $200,000 home = 1.0%. Returns None if either value is missing.
# ─────────────────────────────────────────────────────────────
def calculate_ratio(price, rent):
    if price and rent and price > 0:
        return round((rent / price) * 100, 4)
    return None


# ─────────────────────────────────────────────────────────────
# Score Labeler
# Converts a ratio number into a score label used for
# color-coding cards in the frontend:
#   Excellent = 1%+ (great investment)
#   Good      = 0.8–1%
#   Fair      = 0.6–0.8%
#   Poor      = under 0.6%
#   Unknown   = no rent data available
# ─────────────────────────────────────────────────────────────
def score_label(ratio):
    if ratio is None:   return "unknown"
    if ratio >= 1.0:    return "excellent"
    if ratio >= 0.8:    return "good"
    if ratio >= 0.6:    return "fair"
    return "poor"


# ─────────────────────────────────────────────────────────────
# Listing Processor
# Takes the raw list of listings from the Zillow API and
# cleans them up — skips auctions, fixes URLs, calculates
# the ratio and score, and returns only the fields the
# frontend actually needs.
# ─────────────────────────────────────────────────────────────
def process_listings(raw_listings):
    processed = []
    for home in raw_listings:
        price  = home.get("price")
        rent   = home.get("rentZestimate")

        # Skip auctions — they show up with a price of $5
        if price and price < 1000:
            continue

        ratio  = calculate_ratio(price, rent)
        street = home.get("streetAddress", "")
        city   = home.get("city", "")
        state  = home.get("state", "")
        zipcode= home.get("zipcode", "")
        address= home.get("address") or f"{street}, {city}, {state} {zipcode}".strip(", ")

        # This API already returns full URLs, but add the domain
        # as a fallback in case a relative URL slips through
        detail_url = home.get("detailUrl", "")
        if detail_url and not detail_url.startswith("http"):
            detail_url = f"https://www.zillow.com{detail_url}"

        status_text = home.get("statusText", "")

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


# ─────────────────────────────────────────────────────────────
# Bool Helper
# The API accepts true/false booleans. This converts any
# string "true"/"false" values from the request into actual
# Python booleans before sending them to the Zillow API.
# ─────────────────────────────────────────────────────────────
def bool_param(val):
    if val is None or val == "": return None
    if isinstance(val, bool): return val  # already a boolean, return as-is
    return str(val).lower() == "true"    # handle string "true"/"false"


# ─────────────────────────────────────────────────────────────
# Main Search Endpoint
# The frontend sends a POST request here with the location
# and any active filters. This endpoint:
#   1. Checks the cache — if found, returns instantly
#   2. Builds the request payload with all active filters
#   3. Calls the Zillow API
#   4. Processes and scores the listings
#   5. Saves the result to cache
#   6. Returns the results to the frontend as JSON
# ─────────────────────────────────────────────────────────────
@app.route("/search", methods=["POST"])
def search():
    body = request.get_json(force=True, silent=True) or {}
    location = (body.get("location") or "").strip()
    if not location:
        return jsonify({"error": "Location is required"}), 400

    page = int(body.get("page", 1))

    # Always search for homes for sale (not rentals or sold)
    payload = {"location": location, "page": page, "status": "for_sale"}

    # Add any numeric filters the user set (price, beds, sqft, etc.)
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

    # Add any boolean filters (pool, garage, waterfront, etc.)
    # Only sent to the API if the user turned them on
    bool_fields = [
        "has_pool", "has_garage", "has_basement", "has_ac",
        "is_waterfront", "single_story",
        "is_new_construction", "is_coming_soon", "is_foreclosure",
        "is_fsbo", "is_55_plus", "has_open_house", "has_3d_tour",
        "only_price_reduction",
    ]
    for f in bool_fields:
        v = bool_param(body.get(f))
        if v is True:
            payload[f] = True

    # Add string filters (days on market, keywords, property type)
    str_fields = ["days_on_zillow", "keywords", "home_type"]
    for f in str_fields:
        v = body.get(f)
        if v: payload[f] = v

    # Use the full payload as the cache key so different
    # filter combinations are cached separately
    cache_key = json.dumps(payload, sort_keys=True)
    cached = cache_get(cache_key)
    if cached:
        cached["from_cache"] = True
        return jsonify(cached)

    # Call the Zillow API
    try:
        response = requests.post(
            f"https://{RAPIDAPI_HOST}/search/address",
            headers={**HEADERS, "Content-Type": "application/json"},
            json=payload,
            timeout=20
        )
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Failed to fetch data: {str(e)}"}), 502

    # Process and score the listings, then cache and return
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


# ─────────────────────────────────────────────────────────────
# Cache Utility Endpoints
# /cache/clear — wipes all cached searches
# /cache/stats — returns how many searches are cached and
#                the size of the database file
# ─────────────────────────────────────────────────────────────
@app.route("/cache/clear", methods=["POST"])
def clear_cache():
    conn = sqlite3.connect(CACHE_DB)
    conn.execute("DELETE FROM cache")
    conn.commit()
    conn.close()
    return jsonify({"message": "Cache cleared"})

@app.route("/cache/stats", methods=["GET"])
def cache_stats():
    conn = sqlite3.connect(CACHE_DB)
    total = conn.execute("SELECT COUNT(*) FROM cache").fetchone()[0]
    size  = os.path.getsize(CACHE_DB) if os.path.exists(CACHE_DB) else 0
    conn.close()
    return jsonify({"cached_queries": total, "db_size_kb": round(size / 1024, 1)})


# ─────────────────────────────────────────────────────────────
# Local Development Server
# This only runs when you execute `python app.py` directly.
# On Render, Gunicorn starts the app instead using the Procfile.
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True, port=5001)