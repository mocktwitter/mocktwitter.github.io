CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room TEXT NOT NULL,
  ts INTEGER NOT NULL,
  author TEXT,
  text TEXT NOT NULL
);
CREATE INDEX idx_room_ts ON messages(room, ts DESC);
