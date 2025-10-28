// server.js
// EcoPod prototype backend
// Node + Express + SQLite + Socket.IO
//
// Run: npm install (see package.json) then npm start

const express = require('express');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname))); // serve index.html and pod.html

// --- Database setup (sqlite) ---
const DBSOURCE = 'ecopod.db';
const db = new sqlite3.Database(DBSOURCE, (err) => {
  if (err) {
    console.error('Error opening DB', err);
    process.exit(1);
  }
  console.log('Connected to SQLite DB');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS pods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    lat REAL,
    lng REAL,
    cleanliness INTEGER,
    available INTEGER,
    last_cleaned TEXT,
    self_cleaning INTEGER
  )`);

  db.get('SELECT COUNT(*) as c FROM pods', (err, row) => {
    if (err) return console.error(err);
    if (row.c === 0) {
      const stmt = db.prepare(`INSERT INTO pods (name, lat, lng, cleanliness, available, last_cleaned, self_cleaning)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
      const now = new Date().toISOString();
      const sample = [
        ['EcoPod - Central Station', 30.2672, -97.7431, 95, 1, now, 1],
        ['EcoPod - Market Street', 30.2696, -97.7420, 88, 1, now, 1],
        ['EcoPod - Riverfront', 30.2715, -97.7370, 70, 1, now, 1],
        ['EcoPod - Uptown Plaza', 30.2655, -97.7500, 60, 1, now, 0]
      ];
      sample.forEach(s => stmt.run(...s));
      stmt.finalize();
      console.log('Seeded sample pods');
    }
  });
});

// --- Helpers ---
function haversine(lat1, lon1, lat2, lon2) {
  function toRad(x) { return x * Math.PI / 180; }
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function emitPodUpdate(pod) {
  io.emit('pod-updated', pod);
}

// --- API Endpoints ---

// Get all pods
app.get('/api/pods', (req, res) => {
  db.all('SELECT * FROM pods', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get a single pod by id
app.get('/api/pods/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM pods WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Pod not found' });
    res.json(row);
  });
});

// Get nearby pods
app.get('/api/pods/near', (req, res) => {
  const { lat, lng, radius = 5 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  db.all('SELECT * FROM pods', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const filtered = rows
      .map(r => ({ ...r, distance_km: haversine(parseFloat(lat), parseFloat(lng), r.lat, r.lng) }))
      .filter(r => r.distance_km <= parseFloat(radius))
      .sort((a, b) => a.distance_km - b.distance_km);
    res.json(filtered);
  });
});

// Update pod cleanliness (admin or sensor)
app.post('/api/pods/:id/cleanliness', (req, res) => {
  const id = req.params.id;
  const { cleanliness } = req.body;
  if (cleanliness == null) return res.status(400).json({ error: 'cleanliness required' });
  const last_cleaned = new Date().toISOString();
  db.run('UPDATE pods SET cleanliness = ?, last_cleaned = ? WHERE id = ?', [cleanliness, last_cleaned, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM pods WHERE id = ?', [id], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      emitPodUpdate(row);
      res.json(row);
    });
  });
});

// Toggle availability / self_cleaning flags
app.put('/api/pods/:id/status', (req, res) => {
  const id = req.params.id;
  const { available, self_cleaning } = req.body;
  db.get('SELECT * FROM pods WHERE id = ?', [id], (err, pod) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!pod) return res.status(404).json({ error: 'pod not found' });
    const newAvailable = (available == null) ? pod.available : (available ? 1 : 0);
    const newSelf = (self_cleaning == null) ? pod.self_cleaning : (self_cleaning ? 1 : 0);
    db.run('UPDATE pods SET available = ?, self_cleaning = ? WHERE id = ?', [newAvailable, newSelf, id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      db.get('SELECT * FROM pods WHERE id = ?', [id], (err3, row) => {
        emitPodUpdate(row);
        res.json(row);
      });
    });
  });
});

// Report a cleanliness issue (user report)
app.post('/api/report', (req, res) => {
  const { podId, note } = req.body;
  if (!podId) return res.status(400).json({ error: 'podId required' });
  io.emit('report-submitted', { podId, note, at: new Date().toISOString() });
  res.json({ ok: true });
});

// Non-transactional check-in (simulated Apple Pay)
app.post('/api/checkin', (req, res) => {
  const { podId, method = 'apple_pay' } = req.body;
  if (!podId) return res.status(400).json({ error: 'podId required' });
  db.get('SELECT * FROM pods WHERE id = ?', [podId], (err, pod) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!pod) return res.status(404).json({ error: 'pod not found' });
    if (!pod.available) return res.status(409).json({ error: 'Pod not available' });

    const newClean = Math.max(0, pod.cleanliness - 3);
    const newAvailable = 0;
    db.run('UPDATE pods SET cleanliness = ?, available = ? WHERE id = ?', [newClean, newAvailable, podId], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      db.get('SELECT * FROM pods WHERE id = ?', [podId], (err3, updated) => {
        io.emit('usage', { podId, method, at: new Date().toISOString() });
        emitPodUpdate(updated);

        // auto-available after 30s (demo)
        setTimeout(() => {
          db.run('UPDATE pods SET available = 1 WHERE id = ?', [podId], function () {
            db.get('SELECT * FROM pods WHERE id = ?', [podId], (er, back) => {
              if (!er && back) emitPodUpdate(back);
            });
          });
        }, 30 * 1000);

        res.json({ ok: true, pod: updated });
      });
    });
  });
});

app.post('/api/pods', (req, res) => {
  let { name, lat, lng, cleanliness = 90, available = 1, self_cleaning = 1 } = req.body;

  // ✅ Robust auto-fill coordinates
  lat = Number(lat);
  lng = Number(lng);
  if (isNaN(lat)) lat = 30.2672;
  if (isNaN(lng)) lng = -97.7431;

  const last_cleaned = new Date().toISOString();
  db.run(
    'INSERT INTO pods (name, lat, lng, cleanliness, available, last_cleaned, self_cleaning) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, lat, lng, cleanliness, available, last_cleaned, self_cleaning],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM pods WHERE id = ?', [this.lastID], (err2, row) => {
        emitPodUpdate(row);
        res.json(row);
      });
    }
  );
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Socket.IO
io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);
  socket.on('disconnect', () => console.log('Socket disconnected', socket.id));
});

// Simulated sensors / robots
setInterval(() => {
  db.all('SELECT * FROM pods', (err, rows) => {
    if (err || !rows.length) return;
    const idx = Math.floor(Math.random() * rows.length);
    const pod = rows[idx];
    let newClean = pod.cleanliness;
    if (pod.self_cleaning) {
      newClean = Math.min(100, pod.cleanliness + Math.floor(Math.random() * 10));
    } else {
      newClean = Math.max(0, pod.cleanliness - Math.floor(Math.random() * 5));
    }
    if (newClean !== pod.cleanliness) {
      const last_cleaned = new Date().toISOString();
      db.run('UPDATE pods SET cleanliness = ?, last_cleaned = ? WHERE id = ?', [newClean, last_cleaned, pod.id], function () {
        db.get('SELECT * FROM pods WHERE id = ?', [pod.id], (err2, updated) => {
          if (!err2 && updated) emitPodUpdate(updated);
        });
      });
    }
  });
}, 45 * 1000);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`EcoPod server running at http://localhost:${PORT}`);
});
