import os
import json
import requests
import pymysql
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

load_dotenv()

BUDGET_SHEET_ID = "1Hj3JeJEKB43aYYWv8gk2UhdU6BWuEQfCg5pBlTdBMNA"
API_KEY = "AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk"
CUTTING_RANGE = "Cutting!A1:ZZ500000"

def get_db_connection():
    db_host = os.getenv("DB_HOST", "127.0.0.1")
    db_port = int(os.getenv("DB_PORT", 3306))
    db_user = os.getenv("DB_USER", "root")
    db_password = os.getenv("DB_PASSWORD", "")
    db_name = os.getenv("DB_NAME", "twms_db")

    return pymysql.connect(
        host=db_host,
        port=db_port,
        user=db_user,
        password=db_password,
        database=db_name,
        ssl={"reject_unauthorized": False},
        autocommit=False
    )

def fetch_cutting_sheet():
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{BUDGET_SHEET_ID}/values/{CUTTING_RANGE}?key={API_KEY}"
    res = requests.get(url)
    res.raise_for_status()
    return res.json().get("values", [])

def fast_import_cutting_matrix():
    print("[Python Fast Importer] Connecting to Aiven MySQL...")
    conn = get_db_connection()
    cursor = conn.cursor()

    # Ensure CuttingMatrixRecords table exists with proper indexes
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS `CuttingMatrixRecords` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `lotNumber` VARCHAR(50) NOT NULL,
            `cuttingTable` VARCHAR(50) DEFAULT 'Table 1',
            `fabric` VARCHAR(100) NULL,
            `style` VARCHAR(100) NULL,
            `garmentType` VARCHAR(100) NULL,
            `color` VARCHAR(100) NOT NULL,
            `sizeBreakdown` TEXT NULL,
            `totalPcs` INT DEFAULT 0,
            `rawRowJson` TEXT NULL,
            `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_cmr_lot (`lotNumber`),
            INDEX idx_cmr_table (`cuttingTable`),
            INDEX idx_cmr_color (`color`),
            INDEX idx_cmr_lot_table (`lotNumber`, `cuttingTable`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)
    conn.commit()

    print("[Python Fast Importer] Fetching Cutting Matrix sheet from Google Sheets...")
    rows = fetch_cutting_sheet()
    print(f"Downloaded {len(rows)} raw matrix rows.")

    current_lot = None
    current_style = ""
    current_fabric = ""
    current_garment_type = ""
    size_headers = []
    
    batch_records = []

    for row in rows:
        if not row:
            continue

        first_cell = str(row[0]).strip() if len(row) > 0 else ""

        if first_cell.startswith("Cutting Matrix — Lot") or first_cell.startswith("Lot Number:"):
            if first_cell.startswith("Cutting Matrix — Lot"):
                current_lot = first_cell.replace("Cutting Matrix — Lot", "").strip()
            continue

        row_str = " ".join([str(c).strip() for c in row])
        if "Lot Number:" in row_str:
            for idx, cell in enumerate(row):
                if "Lot Number:" in str(cell) and idx + 1 < len(row):
                    current_lot = str(row[idx + 1]).strip()
                if "Style:" in str(cell) and idx + 1 < len(row):
                    current_style = str(row[idx + 1]).strip()
            continue

        if "Fabric:" in row_str:
            for idx, cell in enumerate(row):
                if "Fabric:" in str(cell) and idx + 1 < len(row):
                    current_fabric = str(row[idx + 1]).strip()
                if "Garment Type:" in str(cell) and idx + 1 < len(row):
                    current_garment_type = str(row[idx + 1]).strip()
            continue

        if first_cell == "Color" and len(row) > 2:
            size_headers = [str(c).strip() for c in row]
            continue

        if current_lot and first_cell and first_cell not in ("Color", "Total") and len(size_headers) > 0:
            color = first_cell
            cutting_table_val = str(row[1]).strip() if len(row) > 1 else "Table 1"
            
            try:
                total_pcs_val = int(str(row[-1]).replace(",", "").strip())
            except Exception:
                total_pcs_val = 0

            size_obj = {}
            for s_idx in range(2, len(size_headers) - 1):
                if s_idx < len(row):
                    s_name = size_headers[s_idx]
                    try:
                        s_val = int(str(row[s_idx]).replace(",", "").strip())
                        if s_val > 0:
                            size_obj[s_name] = s_val
                    except Exception:
                        pass

            batch_records.append((
                current_lot,
                cutting_table_val,
                current_fabric,
                current_style,
                current_garment_type,
                color,
                json.dumps(size_obj),
                total_pcs_val,
                json.dumps(row)
            ))

    print(f"[Python Fast Importer] Bulk inserting {len(batch_records)} color/size matrix rows using Python batching...")

    insert_sql = """
        INSERT INTO CuttingMatrixRecords 
        (lotNumber, cuttingTable, fabric, style, garmentType, color, sizeBreakdown, totalPcs, rawRowJson)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    CHUNK_SIZE = 5000
    total_inserted = 0

    for i in range(0, len(batch_records), CHUNK_SIZE):
        chunk = batch_records[i:i + CHUNK_SIZE]
        cursor.executemany(insert_sql, chunk)
        conn.commit()
        total_inserted += len(chunk)
        print(f"   - Inserted chunk {total_inserted}/{len(batch_records)} rows...")

    print(f"SUCCESS: High-speed Python batch import completed! {total_inserted} rows inserted.")
    cursor.close()
    conn.close()

if __name__ == "__main__":
    fast_import_cutting_matrix()
