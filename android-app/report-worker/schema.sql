CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  model TEXT,
  question TEXT,
  answer TEXT,
  version TEXT,
  install_id TEXT
);
