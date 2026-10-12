-- 노트북이 가져가기 전까지 이벤트를 보관하는 표.
-- delivery_id가 UNIQUE라서 GitHub의 중복 전송은 INSERT OR IGNORE로 걸러진다.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE INDEX events_received_at ON events (received_at);
