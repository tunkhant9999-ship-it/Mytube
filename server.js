const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'mytube-secret-key-2024-very-long';
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const VIDEOS_FILE = path.join(DATA_DIR, 'videos.json');

function load(file, fb) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fb; }
}
function save(file, d) { fs.writeFileSync(file, JSON.stringify(d, null, 2)); }

let users = load(USERS_FILE, []);
let videos = load(VIDEOS_FILE, []);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (r, f, cb) => cb(null, UPLOAD_DIR),
  filename: (r, f, cb) => {
    const ext = path.extname(f.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    req.userId = p.id;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

app.post('/api/register', async (req, res) => {
  const { name, gmail, password, region } = req.body;
  if (!name || !gmail || !password || !region)
    return res.status(400).json({ error: 'အချက်အလက်အားလုံး ဖြည့်ပါ' });
  if (users.find(u => u.gmail.toLowerCase() === gmail.toLowerCase()))
    return res.status(400).json({ error: 'ဒီ Gmail နဲ့ အကောင့်ရှိပြီးသား' });
  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    name, gmail, region,
    password: hash,
    joined: Date.now()
  };
  users.push(user);
  save(USERS_FILE, users);
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '365d' });
  res.json({ token, user: { id: user.id, name, gmail, region, joined: user.joined } });
});

app.post('/api/login', async (req, res) => {
  const { gmail, password } = req.body;
  const user = users.find(u => u.gmail.toLowerCase() === gmail.toLowerCase());
  if (!user) return res.status(400).json({ error: 'Gmail မတွေ့ပါ' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'စကားဝှက် မှားနေပါ' });
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '365d' });
  res.json({ token, user: { id: user.id, name: user.name, gmail: user.gmail, region: user.region, joined: user.joined } });
});

app.get('/api/me', auth, (req, res) => {
  const u = users.find(x => x.id === req.userId);
  if (!u) return res.status(404).json({ error: 'မတွေ့ပါ' });
  res.json({ id: u.id, name: u.name, gmail: u.gmail, region: u.region, joined: u.joined });
});

app.get('/api/videos', auth, (req, res) => {
  const list = videos.filter(v => v.userId === req.userId).sort((a, b) => b.date - a.date);
  res.json(list);
});

app.get('/api/user/:gmail', (req, res) => {
  const u = users.find(x => x.gmail.toLowerCase() === req.params.gmail.toLowerCase());
  if (!u) return res.status(404).json({ error: 'ဒီ Gmail နဲ့ အကောင့် မတွေ့ပါ' });
  const list = videos.filter(v => v.userId === u.id).sort((a, b) => b.date - a.date);
  res.json({ user: { name: u.name, gmail: u.gmail, region: u.region, joined: u.joined }, videos: list });
});

app.post('/api/videos', auth, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File မပါပါ' });
  const user = users.find(u => u.id === req.userId);
  const v = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    userId: req.userId,
    userName: user.name,
    title: req.body.title || req.file.originalname.replace(/\.[^.]+$/, ''),
    filename: req.file.filename,
    size: req.file.size,
    mimeType: req.file.mimetype,
    duration: parseFloat(req.body.duration) || 0,
    views: 0,
    date: Date.now()
  };
  videos.push(v);
  save(VIDEOS_FILE, videos);
  res.json(v);
});

app.delete('/api/videos/:id', auth, (req, res) => {
  const i = videos.findIndex(v => v.id === req.params.id && v.userId === req.userId);
  if (i === -1) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const v = videos[i];
  const fp = path.join(UPLOAD_DIR, v.filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  videos.splice(i, 1);
  save(VIDEOS_FILE, videos);
  res.json({ ok: true });
});

app.post('/api/videos/:id/view', (req, res) => {
  const v = videos.find(x => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'မတွေ့ပါ' });
  v.views = (v.views || 0) + 1;
  save(VIDEOS_FILE, videos);
  res.json({ views: v.views });
});

app.listen(PORT, () => {
  console.log('🎬 MyTube Server running on port ' + PORT);
});
