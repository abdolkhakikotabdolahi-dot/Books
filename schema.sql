CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title_en TEXT NOT NULL,
    title_fa TEXT NOT NULL,
    authors TEXT,
    publish_year TEXT,
    serial TEXT,
    training_id INTEGER,
    pages INTEGER,
    price INTEGER NOT NULL,
    abbr TEXT,
    category TEXT,
    description TEXT,
    android_file TEXT,
    android_url TEXT,
    windows_file TEXT,
    windows_url TEXT,
    cover_file TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
CREATE INDEX IF NOT EXISTS idx_books_title_fa ON books(title_fa);