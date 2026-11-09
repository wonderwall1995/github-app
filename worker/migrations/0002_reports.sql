-- Hermes가 만든 HTML 보고서를 잠깐 보관하는 표. 주소의 token(난수)을 아는 사람만 받을 수 있고, expires_at 이 지나면 지운다.
CREATE TABLE reports (
  token TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX reports_expires_at ON reports (expires_at);
