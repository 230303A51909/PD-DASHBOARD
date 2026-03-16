const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ===== MONGODB ===== */
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/pd_system';

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

/* ===== SCHEMAS ===== */

// Exchange session
const exchangeSchema = new mongoose.Schema({
  patientId:    { type: String, required: true },
  sessionType:  { type: String, enum: ['morning','noon','afternoon','evening'], default: 'morning' },
  drainageVol:  { type: Number, required: true },   // ml
  infusionVol:  { type: Number, required: true },   // ml
  drainageTime: { type: Number, required: true },   // minutes
  infusionTime: { type: Number, required: true },   // minutes
  totalTime:    Number,
  mlScore:      { type: Number, min: 0, max: 100 },
  mlLabel:      { type: String, enum: ['Excellent','Good','Fair','Poor'] },
  kernel:       { type: String, default: 'quartic_polynomial' },
  ventingDone:  { type: Boolean, default: true },
  abnormal:     { type: Boolean, default: false },
  suggestion:   String,
  lineNotified: { type: Boolean, default: false },
  timestamp:    { type: Date, default: Date.now }
});

// Patient
const patientSchema = new mongoose.Schema({
  patientId:   { type: String, unique: true },
  name:        String,
  age:         Number,
  gender:      { type: String, enum: ['M','F'] },
  diagnosis:   { type: String, default: 'Chronic Kidney Disease' },
  targetVol:   { type: Number, default: 2000 },
  targetTime:  { type: Number, default: 20 },
  dailyExchanges: { type: Number, default: 4 },
  stats: {
    totalSessions: { type: Number, default: 0 },
    avgScore:      { type: Number, default: 0 },
    alertCount:    { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

// Alert
const alertSchema = new mongoose.Schema({
  patientId:  String,
  type:       { type: String, enum: ['catheter_displacement','air_embolism','low_score','reminder','info'] },
  severity:   { type: String, enum: ['critical','warning','info'] },
  title:      String,
  message:    String,
  sessionRef: mongoose.Schema.Types.ObjectId,
  lineNotified: { type: Boolean, default: false },
  resolved:   { type: Boolean, default: false },
  timestamp:  { type: Date, default: Date.now }
});

// ML Model performance log
const mlLogSchema = new mongoose.Schema({
  kernel:       String,
  degree:       Number,
  accuracy:     Number,
  mse:          Number,
  foldResults:  [Number],
  dataPoints:   { type: Number, default: 1600 },
  selectedModel:{ type: Boolean, default: false },
  timestamp:    { type: Date, default: Date.now }
});

const Exchange   = mongoose.model('Exchange', exchangeSchema);
const Patient    = mongoose.model('Patient',  patientSchema);
const Alert      = mongoose.model('Alert',    alertSchema);
const MLLog      = mongoose.model('MLLog',    mlLogSchema);

/* ===== SEED ===== */
async function seed() {
  const count = await Patient.countDocuments();
  if (count > 0) return;

  await Patient.insertMany([
    { patientId:'PT-001', name:'Lin Wei-Chen', age:68, gender:'M', stats:{ totalSessions:127, avgScore:91.2, alertCount:2 } },
    { patientId:'PT-002', name:'Wang Mei-Ling', age:72, gender:'F', stats:{ totalSessions:89, avgScore:85.7, alertCount:5 } },
    { patientId:'PT-003', name:'Chen Jia-Hao', age:55, gender:'M', stats:{ totalSessions:204, avgScore:95.1, alertCount:0 } }
  ]);

  await MLLog.insertMany([
    { kernel:'polynomial', degree:3, accuracy:93, mse:26,  foldResults:[92.8,93.4,93.1,93.7,92.9,94.0,93.2,93.0,93.5,92.6], selectedModel:false },
    { kernel:'polynomial', degree:4, accuracy:98, mse:6.8, foldResults:[97.2,98.1,97.8,98.4,97.9,98.6,98.0,97.7,98.3,97.5], selectedModel:true  },
    { kernel:'polynomial', degree:5, accuracy:97, mse:11,  foldResults:[96.5,97.2,97.0,97.4,96.8,97.6,97.1,96.9,97.3,96.7], selectedModel:false }
  ]);

  console.log('🌱 Seed data inserted');
}
mongoose.connection.once('open', seed);

/* ===== ROUTES ===== */

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', timestamp: new Date() });
});

/* ML Scoring endpoint (implements the paper's formula) */
app.post('/api/score', async (req, res) => {
  try {
    const { patientId, drainageVol, infusionVol, drainageTime, infusionTime, sessionType } = req.body;
    const TARGET_VOL  = 2000;
    const TARGET_TIME = 20;

    const totalTime = drainageTime + infusionTime;
    const avgVol    = (drainageVol + infusionVol) / 2;
    const timeDiff  = Math.abs(totalTime - TARGET_TIME);
    const volDiff   = Math.abs(avgVol - TARGET_VOL) / 100;
    let score       = 100 - (timeDiff * 2.5) - (volDiff * 2.5);
    score = Math.max(0, Math.round(score * 10) / 10);

    const abnormal = Math.abs(infusionVol - drainageVol) > 200 || drainageTime > 25;
    let label, suggestion;

    if      (score >= 90) { label='Excellent'; suggestion='Fluid exchange in excellent condition, keep it up.'; }
    else if (score >= 75) { label='Good';      suggestion='Exchange acceptable. Ensure bag height is optimal.'; }
    else if (score >= 50) { label='Fair';      suggestion='Exchange outside optimal range. Check tubing position.'; }
    else                  { label='Poor';      suggestion='Score critically low. Seek medical assistance.'; }

    if (abnormal) suggestion = 'Abnormal detected — possible catheter displacement. Contact medical staff.';

    const exchange = new Exchange({
      patientId, sessionType, drainageVol, infusionVol,
      drainageTime, infusionTime, totalTime, avgVol,
      mlScore: score, mlLabel: label, abnormal, suggestion,
      lineNotified: false
    });
    await exchange.save();

    if (abnormal) {
      await Alert.create({
        patientId, type:'catheter_displacement', severity:'critical',
        title:'Catheter Displacement Suspected',
        message:`Drainage time: ${drainageTime}min, volume diff: ${Math.abs(infusionVol-drainageVol)}ml. ${suggestion}`,
        sessionRef: exchange._id
      });
    }

    res.json({ success:true, exchange, score, label, suggestion, abnormal });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

/* Exchanges */
app.get('/api/exchanges', async (req, res) => {
  try {
    const { patientId, limit=20, page=1 } = req.query;
    const filter = {};
    if (patientId) filter.patientId = patientId;
    const skip = (page-1)*limit;
    const [exchanges, total] = await Promise.all([
      Exchange.find(filter).sort({ timestamp:-1 }).limit(Number(limit)).skip(skip),
      Exchange.countDocuments(filter)
    ]);
    res.json({ exchanges, total, page:Number(page), pages:Math.ceil(total/limit) });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/exchanges', async (req, res) => {
  try {
    const ex = new Exchange(req.body);
    await ex.save();
    res.status(201).json({ success:true, exchange:ex });
  } catch(err) { res.status(400).json({ error: err.message }); }
});

/* Patients */
app.get('/api/patients', async (req, res) => {
  try { res.json(await Patient.find().sort({ 'stats.avgScore':-1 })); }
  catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/patients/:id', async (req, res) => {
  try {
    const p = await Patient.findOne({ patientId: req.params.id });
    if (!p) return res.status(404).json({ error:'Patient not found' });
    res.json(p);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

/* Alerts */
app.get('/api/alerts', async (req, res) => {
  try {
    const alerts = await Alert.find({ resolved:false }).sort({ timestamp:-1 }).limit(50);
    res.json(alerts);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/alerts/:id/resolve', async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(req.params.id, { resolved:true }, { new:true });
    res.json({ success:true, alert });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

/* ML Logs */
app.get('/api/mllog', async (req, res) => {
  try { res.json(await MLLog.find().sort({ degree:1 })); }
  catch(err) { res.status(500).json({ error: err.message }); }
});

/* Analytics summary */
app.get('/api/analytics', async (req, res) => {
  try {
    const [totalEx, todayEx, avgScoreData, abnormalCount] = await Promise.all([
      Exchange.countDocuments(),
      Exchange.countDocuments({ timestamp:{ $gte: new Date(new Date().setHours(0,0,0,0)) } }),
      Exchange.aggregate([{ $group:{ _id:null, avg:{ $avg:'$mlScore' } } }]),
      Exchange.countDocuments({ abnormal:true })
    ]);
    res.json({
      totalExchanges: totalEx,
      todayExchanges: todayEx,
      avgScore: avgScoreData[0]?.avg?.toFixed(1) || 0,
      abnormalCount,
      modelAccuracy: 98,
      bestKernel: 'quartic_polynomial',
      trainingPoints: 1600
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n💧 ML-IH-PDS Server running at http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🗄️  MongoDB:  ${MONGO_URI}\n`);
});
