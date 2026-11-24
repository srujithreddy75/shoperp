/**
 * Sri Sai Sandhya Vastralayam & Boutique — Full-Stack ERP Server
 * Built with Node.js, SQLite (node:sqlite), Server-Sent Events (SSE), and REST API.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'boutique_erp.db');
const JSON_BACKUP_FILE = path.join(DATA_DIR, 'boutique_erp.json');
const INITIAL_SEED_FILE = path.join(DATA_DIR, 'initial_seed.json');

// Ensure necessary directories exist
[DATA_DIR, PUBLIC_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/*************************************************************************
 * 1. DATABASE LAYER (SQLite with JSON Dual-Persistence & Backup)
 *************************************************************************/
const sseClients = new Set();

function broadcastSSE(data, senderClientId = null) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    if (senderClientId && client.clientId === senderClientId) {
      continue;
    }
    try {
      client.write(msg);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

let sqliteDb = null;
try {
  sqliteDb = new DatabaseSync(DB_FILE);
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS erp_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  console.log('✅ SQLite Database initialized at:', DB_FILE);
} catch (err) {
  console.error('⚠️ SQLite initialization notice:', err.message);
}

// In-Memory Master Database Reference
let db = null;

function getDefaultState() {
  return {
    settings: {
      boutiqueName: "Sri Sai Sandhya Vastralayam & Boutique",
      branch: "Main Branch",
      gstin: "36AABCS1429B1Z1",
      phone: "+91 98490 11223",
      autoSmsDisabled: true,
      credentials: {
        owner: {
          role: "owner",
          username: "owner",
          password: "123",
          name: "Sandhya Garu (Owner)",
          staffId: "EMP-01",
          designation: "Founder & Managing Owner",
          phone: "+91 98490 11223",
          joinedDate: "2020-01-15",
          avatar: "https://placehold.co/120x120/801326/ffffff?text=SG"
        },
        madam: {
          role: "madam",
          username: "madam",
          password: "123",
          name: "Kavitha (Boutique Madam)",
          staffId: "EMP-02",
          designation: "Boutique Floor Manager & Measurement Specialist",
          phone: "+91 98490 44556",
          joinedDate: "2022-05-10",
          avatar: "https://placehold.co/120x120/b58416/ffffff?text=KM"
        },
        stitching: {
          role: "stitching",
          username: "stitching",
          password: "123",
          name: "Ramesh Master (Stitching)",
          staffId: "EMP-03",
          designation: "Senior Blouse Cutting & Stitching Master",
          phone: "+91 98490 77889",
          joinedDate: "2021-08-01",
          avatar: "https://placehold.co/120x120/0369a1/ffffff?text=RM"
        },
        maggam: {
          role: "maggam",
          username: "maggam",
          password: "123",
          name: "Salim Karigar (Maggam)",
          staffId: "EMP-04",
          designation: "Lead Zardosi & Bridal Maggam Artist",
          phone: "+91 98490 99001",
          joinedDate: "2021-11-20",
          avatar: "https://placehold.co/120x120/6b21a8/ffffff?text=SK"
        }
      }
    },
    customers: [],
    orders: [],
    staffPayroll: [],
    expenses: [],
    suppliers: [],
    materialPurchases: [],
    dailyAttendanceLogs: [],
    reviews: []
  };
}

function loadDatabase() {
  let hasValidRecords = false;

  // 1. Try loading from SQLite
  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare("SELECT value FROM erp_state WHERE key = 'master_state'");
      const row = stmt.get();
      if (row && row.value) {
        const parsed = JSON.parse(row.value);
        if (parsed && Array.isArray(parsed.customers) && parsed.customers.length > 0) {
          db = parsed;
          hasValidRecords = true;
          console.log(`📦 Loaded master state from SQLite (${db.customers.length} customers, ${db.orders.length} orders)`);
          return;
        }
      }
    } catch (e) {
      console.warn('Could not read from SQLite erp_state:', e.message);
    }
  }

  // 2. Try loading from initial_seed.json if available
  if (!hasValidRecords && fs.existsSync(INITIAL_SEED_FILE)) {
    try {
      const content = fs.readFileSync(INITIAL_SEED_FILE, 'utf8');
      const seedObj = JSON.parse(content);
      db = seedObj.data || seedObj;
      console.log(`🌱 Seeded master state from initial_seed.json (${db.customers ? db.customers.length : 0} customers, ${db.orders ? db.orders.length : 0} orders)`);
      saveDatabase();
      return;
    } catch (e) {
      console.warn('Could not read initial_seed.json:', e.message);
    }
  }

  // 3. Try loading from boutique_erp.json
  if (!hasValidRecords && fs.existsSync(JSON_BACKUP_FILE)) {
    try {
      const content = fs.readFileSync(JSON_BACKUP_FILE, 'utf8');
      db = JSON.parse(content);
      console.log('📦 Loaded master state from boutique_erp.json');
      saveDatabase();
      return;
    } catch (e) {
      console.warn('Could not read boutique_erp.json:', e.message);
    }
  }

  // 4. Default fallback
  db = getDefaultState();
  console.log('✨ Initialized default ERP state');
  saveDatabase();
}

function saveDatabase(senderClientId = null) {
  if (!db) return;
  const jsonStr = JSON.stringify(db, null, 2);
  const now = new Date().toISOString();

  // Save to SQLite
  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare(`
        INSERT INTO erp_state (key, value, updated_at)
        VALUES ('master_state', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `);
      stmt.run(jsonStr, now);
    } catch (err) {
      console.error('Failed to save to SQLite:', err.message);
    }
  }

  // Save atomic JSON file
  try {
    const tempFile = `${JSON_BACKUP_FILE}.tmp`;
    fs.writeFileSync(tempFile, jsonStr, 'utf8');
    fs.renameSync(tempFile, JSON_BACKUP_FILE);
  } catch (err) {
    console.error('Failed to write JSON backup file:', err.message);
  }

  // Broadcast change to all OTHER connected SSE clients
  broadcastSSE({ type: 'sync', timestamp: now }, senderClientId);
}

// Initial DB load
loadDatabase();



/*************************************************************************
 * 3. REQUEST PARSER & UTILITIES
 *************************************************************************/
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB limit for image/audio uploads
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(payload);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { success: false, error: message });
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.webm': 'audio/webm',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8'
  };
  return map[ext] || 'application/octet-stream';
}

function serveStaticFile(req, res, targetPath) {
  if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }
  const mime = getMimeType(targetPath);
  const stream = fs.createReadStream(targetPath);
  res.writeHead(200, {
    'Content-Type': mime,
    'Access-Control-Allow-Origin': '*'
  });
  stream.pipe(res);
}

/*************************************************************************
 * 4. ROUTER & REST CONTROLLERS
 *************************************************************************/
const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(urlObj.pathname);
  const method = req.method.toUpperCase();

  // CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // Request logger
  const startTime = Date.now();
  res.on('finish', () => {
    if (!pathname.startsWith('/api/events')) {
      console.log(`[${new Date().toISOString()}] ${method} ${pathname} -> ${res.statusCode} (${Date.now() - startTime}ms)`);
    }
  });

  try {
    /*************************************************************************
     * SSE STREAM: /api/events
     *************************************************************************/
    if (pathname === '/api/events' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.clientId = urlObj.searchParams.get('clientId') || null;
      res.write(`data: ${JSON.stringify({ type: 'connected', clientsCount: sseClients.size + 1 })}\n\n`);
      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    /*************************************************************************
     * API: SYSTEM HEALTH & MASTER STATE
     *************************************************************************/
    if (pathname === '/api/health' && method === 'GET') {
      return sendJson(res, 200, {
        status: 'ok',
        app: 'Sri Sai Sandhya Vastralayam & Boutique ERP Server',
        version: '6.0.0',
        uptime: process.uptime(),
        connectedClients: sseClients.size,
        timestamp: new Date().toISOString()
      });
    }

    if (pathname === '/api/state' && method === 'GET') {
      return sendJson(res, 200, { success: true, data: db });
    }

    if (pathname === '/api/state' && (method === 'POST' || method === 'PUT')) {
      const body = await parseJsonBody(req);
      if (body && typeof body === 'object') {
        const senderClientId = req.headers['x-client-id'] || body.clientId || null;
        db = body.data || body;
        saveDatabase(senderClientId);
        return sendJson(res, 200, { success: true, message: 'Master state updated successfully', data: db });
      }
      return sendError(res, 400, 'Invalid state payload');
    }

    /*************************************************************************
     * API: AUTHENTICATION & LOGIN
     *************************************************************************/
    if (pathname === '/api/auth/login' && method === 'POST') {
      const { role, password } = await parseJsonBody(req);
      const cred = db.settings.credentials[role];
      if (!cred) {
        return sendError(res, 404, 'Role not found');
      }
      if (String(cred.password).trim() !== String(password).trim()) {
        return sendError(res, 401, `Incorrect password for ${cred.name}`);
      }

      // Auto-record login attendance
      const todayIso = new Date().toISOString().slice(0, 10);
      const existingAtt = (db.dailyAttendanceLogs || []).find(l => l.date === todayIso && l.staffId === cred.staffId);
      if (!existingAtt) {
        const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        db.dailyAttendanceLogs.unshift({
          id: `ATT-${100 + db.dailyAttendanceLogs.length + 1}`,
          date: todayIso,
          staffId: cred.staffId,
          role: cred.role,
          staffName: cred.name,
          loginTime: nowTime,
          dutyStartTime: '-',
          dutyEndTime: '-',
          totalHours: 'Logged In',
          status: 'Logged In'
        });
        saveDatabase();
      }

      return sendJson(res, 200, {
        success: true,
        user: { ...cred },
        message: `Welcome ${cred.name}!`
      });
    }

    if (pathname === '/api/auth/profile' && method === 'PUT') {
      const { role, name, designation, phone, password, avatar, salaries } = await parseJsonBody(req);
      const cred = db.settings.credentials[role];
      if (!cred) return sendError(res, 404, 'Role not found');

      if (name) cred.name = String(name).trim();
      if (designation) cred.designation = String(designation).trim();
      if (phone) cred.phone = String(phone).trim();
      if (password) cred.password = String(password).trim();
      if (avatar) cred.avatar = avatar;

      // Sync with staff payroll if present
      const payrollRec = (db.staffPayroll || []).find(p => p.id === cred.staffId);
      if (payrollRec) {
        payrollRec.name = cred.name;
        if (salaries) {
          if (salaries.baseSalary !== undefined) payrollRec.baseSalary = Number(salaries.baseSalary);
          if (salaries.dailyWage8Hr !== undefined) payrollRec.dailyWage8Hr = Number(salaries.dailyWage8Hr);
          if (salaries.otHourlyRate !== undefined) payrollRec.otHourlyRate = Number(salaries.otHourlyRate);
          if (salaries.presentDays !== undefined) payrollRec.presentDays = Number(salaries.presentDays);
          if (salaries.otHoursWeek !== undefined) payrollRec.otHoursWeek = Number(salaries.otHoursWeek);
        }
      }

      saveDatabase();
      return sendJson(res, 200, { success: true, user: cred, message: 'Profile updated' });
    }

    /*************************************************************************
     * API: CUSTOMERS
     *************************************************************************/
    if (pathname === '/api/customers' && method === 'GET') {
      const q = (urlObj.searchParams.get('q') || '').trim().toLowerCase();
      let results = db.customers;
      if (q) {
        results = results.filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.mobile.includes(q) ||
          c.id.toLowerCase().includes(q)
        );
      }
      return sendJson(res, 200, { success: true, count: results.length, data: results });
    }

    if (pathname === '/api/customers' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.name || !body.mobile) {
        return sendError(res, 400, 'Customer name and 10-digit mobile number are required');
      }
      const existing = db.customers.find(c => c.mobile === String(body.mobile).trim());
      if (existing) {
        return sendError(res, 409, `Customer with mobile ${body.mobile} already exists (${existing.name})`);
      }

      const nextNum = 1000 + db.customers.length + 1;
      const newCust = {
        id: body.id || `CUST-${nextNum}`,
        name: String(body.name).trim(),
        mobile: String(body.mobile).trim(),
        address: String(body.address || '').trim(),
        photoUrl: body.photoUrl || `https://placehold.co/160x160/9e1c34/ffffff?text=${encodeURIComponent(body.name)}`,
        loyaltyPoints: Number(body.loyaltyPoints || 50),
        referralCode: body.referralCode || `${body.name.slice(0, 4).toUpperCase()}${nextNum}`,
        referredBy: body.referredBy || 'Direct Walk-in',
        measurements: body.measurements || {},
        measurementHistory: body.measurementHistory || [
          {
            date: new Date().toISOString().slice(0, 10),
            note: 'Initial Registration Measurements',
            values: body.measurements || {}
          }
        ]
      };

      db.customers.unshift(newCust);
      saveDatabase();
      return sendJson(res, 201, { success: true, customer: newCust, message: 'Customer registered successfully' });
    }

    if (pathname.startsWith('/api/customers/') && method === 'PUT') {
      const custId = pathname.replace('/api/customers/', '');
      const cust = db.customers.find(c => c.id === custId);
      if (!cust) return sendError(res, 404, 'Customer not found');

      const body = await parseJsonBody(req);
      if (body.name) cust.name = String(body.name).trim();
      if (body.mobile) cust.mobile = String(body.mobile).trim();
      if (body.address) cust.address = String(body.address).trim();
      if (body.photoUrl) cust.photoUrl = body.photoUrl;
      if (body.measurements) cust.measurements = { ...cust.measurements, ...body.measurements };
      if (body.historyNote) {
        cust.measurementHistory = cust.measurementHistory || [];
        cust.measurementHistory.unshift({
          date: new Date().toISOString().slice(0, 10),
          note: body.historyNote,
          values: { ...cust.measurements }
        });
      }

      saveDatabase();
      return sendJson(res, 200, { success: true, customer: cust, message: 'Customer updated' });
    }

    if (pathname.startsWith('/api/customers/') && method === 'DELETE') {
      const custId = pathname.replace('/api/customers/', '');
      const idx = db.customers.findIndex(c => c.id === custId);
      if (idx === -1) return sendError(res, 404, 'Customer not found');
      const removed = db.customers.splice(idx, 1)[0];
      saveDatabase();
      return sendJson(res, 200, { success: true, removed, message: `Customer ${removed.name} deleted` });
    }

    /*************************************************************************
     * API: ORDERS & WORKFLOW AUTOMATION
     *************************************************************************/
    if (pathname === '/api/orders' && method === 'GET') {
      const q = (urlObj.searchParams.get('q') || '').trim().toLowerCase();
      const status = urlObj.searchParams.get('status');
      const urgentOnly = urlObj.searchParams.get('urgent') === 'true';

      let results = db.orders;
      if (q) {
        results = results.filter(o =>
          o.id.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerMobile.includes(q) ||
          o.serviceType.toLowerCase().includes(q)
        );
      }
      if (status && status !== 'ALL') {
        results = results.filter(o => o.status === status);
      }
      if (urgentOnly) {
        results = results.filter(o => o.isUrgentAllocated);
      }
      return sendJson(res, 200, { success: true, count: results.length, data: results });
    }

    if (pathname === '/api/orders' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.customerId || !body.customerName || !body.serviceType) {
        return sendError(res, 400, 'Customer details and service type are required');
      }

      const nextNum = 2000 + db.orders.length + 1;
      const orderId = body.id || `ORD-${nextNum}`;
      const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

      const newOrder = {
        id: orderId,
        customerId: body.customerId,
        customerName: body.customerName,
        customerMobile: body.customerMobile || '',
        customerAddress: body.customerAddress || '',
        branch: body.branch || 'Main Branch',
        serviceType: body.serviceType,
        status: body.status || (body.serviceType === "Maggam Work + Blouse Stitching" ? "Maggam Assigned" : "Stitching Assigned"),
        bookingDate: body.bookingDate || new Date().toISOString().slice(0, 10),
        deliveryDate: body.deliveryDate || '2026-11-28',
        isUrgentAllocated: Boolean(body.isUrgentAllocated),
        urgentNote: body.urgentNote || '',
        assignedMaggam: body.assignedMaggam || (body.serviceType === "Maggam Work + Blouse Stitching" ? "Salim Karigar (Maggam)" : "-"),
        assignedStitching: body.assignedStitching || "Ramesh Master (Stitching)",
        garmentDesc: body.garmentDesc || 'Custom Boutique Garment',
        outfitLabel: body.outfitLabel || 'Blouse Only',
        measurementSchemas: body.measurementSchemas || ['BLOUSE'],
        customMeasurements: body.customMeasurements || {},
        designImages: body.designImages || [],
        voiceNoteDuration: body.voiceNoteDuration || 'No Audio',
        voiceNoteTranscript: body.voiceNoteTranscript || '',
        voiceAudioDataUrl: body.voiceAudioDataUrl || '',
        measurementsSnapshot: body.measurementsSnapshot || {},
        invoiceItems: body.invoiceItems || [{ title: body.serviceType, amount: Number(body.totalAmount || 0) }],
        totalAmount: Number(body.totalAmount || 0),
        advancePaid: Number(body.advancePaid || 0),
        payments: body.payments || (Number(body.advancePaid || 0) > 0 ? [{
          id: `PAY-${900 + db.orders.length + 1}`,
          date: new Date().toISOString().slice(0, 10),
          type: 'Advance',
          mode: body.advancePaymentMode || 'UPI',
          amount: Number(body.advancePaid),
          note: 'Booking Advance Payment'
        }] : []),
        historyLog: [
          { time: nowTime, text: `Order created by ${body.bookedBy || 'Staff'} at Main Branch` }
        ]
      };

      db.orders.unshift(newOrder);
      saveDatabase();
      return sendJson(res, 201, { success: true, order: newOrder, message: 'Order booked successfully' });
    }

    if (pathname.startsWith('/api/orders/') && pathname.endsWith('/status') && method === 'PUT') {
      const orderId = pathname.replace('/api/orders/', '').replace('/status', '');
      const order = db.orders.find(o => o.id === orderId);
      if (!order) return sendError(res, 404, 'Order not found');

      const { status, updatedBy } = await parseJsonBody(req);
      if (!status) return sendError(res, 400, 'Status is required');

      const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      order.historyLog = order.historyLog || [];

      // Maggam Completed -> Automatically transfers to Stitching Assigned!
      if (status === 'Maggam Completed') {
        order.status = 'Stitching Assigned';
        order.historyLog.unshift({
          time: nowTime,
          text: `Maggam Completed by ${updatedBy || 'Maggam Staff'} ⚡ Automatically transferred to Stitching Assigned`
        });
      } else {
        order.status = status;
        if (status === 'Ready for Delivery') {
          order.completedDate = new Date().toISOString().slice(0, 10);
        }
        order.historyLog.unshift({
          time: nowTime,
          text: `Status updated to "${status}" by ${updatedBy || 'Staff'}`
        });
      }

      saveDatabase();
      return sendJson(res, 200, { success: true, order, message: `Status updated to ${order.status}` });
    }

    if (pathname.startsWith('/api/orders/') && pathname.endsWith('/urgent') && method === 'PUT') {
      const orderId = pathname.replace('/api/orders/', '').replace('/urgent', '');
      const order = db.orders.find(o => o.id === orderId);
      if (!order) return sendError(res, 404, 'Order not found');

      const { isUrgentAllocated, urgentNote } = await parseJsonBody(req);
      order.isUrgentAllocated = isUrgentAllocated !== undefined ? Boolean(isUrgentAllocated) : !order.isUrgentAllocated;
      if (urgentNote !== undefined) order.urgentNote = urgentNote;

      saveDatabase();
      return sendJson(res, 200, {
        success: true,
        order,
        message: order.isUrgentAllocated ? `Marked ${order.id} as URGENT` : `Urgent tag removed from ${order.id}`
      });
    }

    if (pathname.startsWith('/api/orders/') && method === 'DELETE') {
      const orderId = pathname.replace('/api/orders/', '');
      const idx = db.orders.findIndex(o => o.id === orderId);
      if (idx === -1) return sendError(res, 404, 'Order not found');
      const removed = db.orders.splice(idx, 1)[0];
      saveDatabase();
      return sendJson(res, 200, { success: true, removed, message: `Order ${removed.id} deleted` });
    }

    /*************************************************************************
     * API: DAILY ATTENDANCE & DUTY TRACKING
     *************************************************************************/
    if (pathname === '/api/attendance' && method === 'GET') {
      return sendJson(res, 200, { success: true, data: db.dailyAttendanceLogs });
    }

    if (pathname === '/api/attendance/start' && method === 'POST') {
      const { staffId, staffName, role } = await parseJsonBody(req);
      const todayIso = new Date().toISOString().slice(0, 10);
      const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

      let rec = (db.dailyAttendanceLogs || []).find(l => l.date === todayIso && l.staffId === staffId);
      if (!rec) {
        rec = {
          id: `ATT-${100 + db.dailyAttendanceLogs.length + 1}`,
          date: todayIso,
          staffId,
          role,
          staffName,
          loginTime: nowTime,
          dutyStartTime: nowTime,
          dutyEndTime: '-',
          totalHours: 'On Duty (11-Hr Shift)',
          status: 'On Duty'
        };
        db.dailyAttendanceLogs.unshift(rec);
      } else {
        rec.dutyStartTime = nowTime;
        rec.status = 'On Duty';
        rec.totalHours = 'On Duty (11-Hr Shift)';
      }

      saveDatabase();
      return sendJson(res, 200, { success: true, attendance: rec, message: `Duty started for ${staffName} at ${nowTime}` });
    }

    if (pathname === '/api/attendance/end' && method === 'POST') {
      const { staffId, staffName } = await parseJsonBody(req);
      const todayIso = new Date().toISOString().slice(0, 10);
      const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

      let rec = (db.dailyAttendanceLogs || []).find(l => l.date === todayIso && l.staffId === staffId);
      if (!rec) {
        rec = {
          id: `ATT-${100 + db.dailyAttendanceLogs.length + 1}`,
          date: todayIso,
          staffId,
          role: 'staff',
          staffName,
          loginTime: nowTime,
          dutyStartTime: '10:00 AM',
          dutyEndTime: nowTime,
          totalHours: '11 hrs (11-hour daily duty)',
          status: 'Duty Completed'
        };
        db.dailyAttendanceLogs.unshift(rec);
      } else {
        if (!rec.dutyStartTime || rec.dutyStartTime === '-') rec.dutyStartTime = rec.loginTime || '10:00 AM';
        rec.dutyEndTime = nowTime;
        rec.status = 'Duty Completed';
      }

      // Automatically recalculate staff payroll
      const payroll = (db.staffPayroll || []).find(p => p.id === staffId);
      if (payroll) {
        payroll.presentDays = Number((payroll.presentDays || 0) + 1);
        const pendingSunday = (payroll.weeklySundayPayouts || []).find(w => w.status !== 'Paid');
        if (pendingSunday) {
          pendingSunday.daysWorked8Hr = payroll.presentDays;
          pendingSunday.regularPay8Hr = payroll.presentDays * (payroll.dailyWage8Hr || 650);
          pendingSunday.totalSundayPayout = pendingSunday.regularPay8Hr + (pendingSunday.otPay || 0);
        }
      }

      saveDatabase();
      return sendJson(res, 200, { success: true, attendance: rec, message: `Duty ended for ${staffName} at ${nowTime}` });
    }

    if (pathname === '/api/attendance/manual' && method === 'POST') {
      const entry = await parseJsonBody(req);
      const newAtt = {
        id: `ATT-${100 + db.dailyAttendanceLogs.length + 1}`,
        date: entry.date || new Date().toISOString().slice(0, 10),
        staffId: entry.staffId,
        role: entry.role || 'staff',
        staffName: entry.staffName,
        loginTime: entry.loginTime || '10:00 AM',
        dutyStartTime: entry.dutyStartTime || '10:00 AM',
        dutyEndTime: entry.dutyEndTime || '09:00 PM',
        totalHours: entry.totalHours || '11 hrs (11-hour daily duty)',
        status: entry.status || 'Duty Completed'
      };
      db.dailyAttendanceLogs.unshift(newAtt);
      saveDatabase();
      return sendJson(res, 201, { success: true, attendance: newAtt });
    }

    if (pathname.startsWith('/api/attendance/') && method === 'DELETE') {
      const attId = pathname.replace('/api/attendance/', '');
      const idx = db.dailyAttendanceLogs.findIndex(l => l.id === attId);
      if (idx === -1) return sendError(res, 404, 'Attendance log not found');
      const removed = db.dailyAttendanceLogs.splice(idx, 1)[0];
      saveDatabase();
      return sendJson(res, 200, { success: true, removed });
    }

    /*************************************************************************
     * API: PAYROLL & SUNDAY PAYOUTS
     *************************************************************************/
    if (pathname === '/api/payroll' && method === 'GET') {
      return sendJson(res, 200, { success: true, data: db.staffPayroll });
    }

    if (pathname.startsWith('/api/payroll/') && pathname.endsWith('/pay-sunday') && method === 'POST') {
      const staffId = pathname.replace('/api/payroll/', '').replace('/pay-sunday', '');
      const { weekIndex, mode } = await parseJsonBody(req);
      const staff = (db.staffPayroll || []).find(p => p.id === staffId);
      if (!staff) return sendError(res, 404, 'Staff member not found');

      if (staff.weeklySundayPayouts && staff.weeklySundayPayouts[weekIndex]) {
        staff.weeklySundayPayouts[weekIndex].status = 'Paid';
        staff.weeklySundayPayouts[weekIndex].mode = mode || 'Cash';
      }
      saveDatabase();
      return sendJson(res, 200, { success: true, staff, message: 'Sunday payout recorded as Paid' });
    }

    if (pathname.startsWith('/api/payroll/') && pathname.endsWith('/ot') && method === 'POST') {
      const staffId = pathname.replace('/api/payroll/', '').replace('/ot', '');
      const { deltaHours } = await parseJsonBody(req);
      const staff = (db.staffPayroll || []).find(p => p.id === staffId);
      if (!staff) return sendError(res, 404, 'Staff member not found');

      staff.otHoursWeek = Math.max(0, Number((staff.otHoursWeek || 0) + Number(deltaHours || 0)));
      const pendingSunday = (staff.weeklySundayPayouts || []).find(w => w.status !== 'Paid');
      if (pendingSunday) {
        pendingSunday.otHours = staff.otHoursWeek;
        pendingSunday.otPay = staff.otHoursWeek * (staff.otHourlyRate || 100);
        pendingSunday.totalSundayPayout = (pendingSunday.regularPay8Hr || 0) + pendingSunday.otPay;
      }

      saveDatabase();
      return sendJson(res, 200, { success: true, staff, message: `Updated OT hours to ${staff.otHoursWeek} hrs` });
    }

    /*************************************************************************
     * API: EXPENSES
     *************************************************************************/
    if (pathname === '/api/expenses' && method === 'GET') {
      const role = urlObj.searchParams.get('role');
      let results = db.expenses;
      if (role && role !== 'owner') {
        results = results.filter(e => e.createdByRole === role);
      }
      return sendJson(res, 200, { success: true, count: results.length, data: results });
    }

    if (pathname === '/api/expenses' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.category || !body.amount) {
        return sendError(res, 400, 'Expense category and amount are required');
      }

      const nextNum = 100 + db.expenses.length + 1;
      const newExp = {
        id: body.id || `EXP-${nextNum}`,
        date: body.date || new Date().toISOString().slice(0, 10),
        category: String(body.category).trim(),
        mode: body.mode || 'Cash',
        amount: Number(body.amount),
        createdByRole: body.createdByRole || 'owner',
        createdByName: body.createdByName || 'Sandhya Garu (Owner)'
      };

      db.expenses.unshift(newExp);
      saveDatabase();
      return sendJson(res, 201, { success: true, expense: newExp, message: 'Expense logged successfully' });
    }

    if (pathname.startsWith('/api/expenses/') && method === 'DELETE') {
      const expId = pathname.replace('/api/expenses/', '');
      const idx = db.expenses.findIndex(e => e.id === expId);
      if (idx === -1) return sendError(res, 404, 'Expense not found');
      const removed = db.expenses.splice(idx, 1)[0];
      saveDatabase();
      return sendJson(res, 200, { success: true, removed });
    }

    /*************************************************************************
     * API: FILE UPLOAD (Base64 or Raw to Permanent /uploads File)
     *************************************************************************/
    if (pathname === '/api/upload' && method === 'POST') {
      const { dataUrl, filename, category } = await parseJsonBody(req);
      if (!dataUrl || !dataUrl.includes(',')) {
        return sendError(res, 400, 'Invalid dataUrl payload');
      }

      const [header, base64Data] = dataUrl.split(',');
      const match = header.match(/data:([a-zA-Z0-9/+-]+);base64/);
      const mime = match ? match[1] : 'application/octet-stream';

      let ext = '.bin';
      if (mime.includes('jpeg') || mime.includes('jpg')) ext = '.jpg';
      else if (mime.includes('png')) ext = '.png';
      else if (mime.includes('webp')) ext = '.webp';
      else if (mime.includes('wav')) ext = '.wav';
      else if (mime.includes('mp3') || mime.includes('mpeg')) ext = '.mp3';
      else if (mime.includes('webm')) ext = '.webm';

      const fileId = `${category || 'file'}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
      const destPath = path.join(UPLOADS_DIR, fileId);
      fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));

      const relativeUrl = `/uploads/${fileId}`;
      console.log(`📁 Saved uploaded asset: ${relativeUrl} (${mime})`);
      return sendJson(res, 201, { success: true, url: relativeUrl, filename: fileId, mime });
    }

    /*************************************************************************
     * API: BACKUP EXPORT & IMPORT
     *************************************************************************/
    if (pathname === '/api/backup/export' && method === 'GET') {
      const backupPayload = {
        app: "Sri Sai Sandhya Vastralayam & Boutique ERP",
        backupVersion: 2,
        exportedAt: new Date().toISOString(),
        data: db
      };
      const jsonStr = JSON.stringify(backupPayload, null, 2);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="sri-sai-sandhya-backup-${new Date().toISOString().slice(0, 10)}.json"`
      });
      res.end(jsonStr);
      return;
    }

    if (pathname === '/api/backup/import' && method === 'POST') {
      const body = await parseJsonBody(req);
      const importedData = body.data || body;
      if (!importedData.settings || !Array.isArray(importedData.customers)) {
        return sendError(res, 400, 'Invalid backup format');
      }
      db = importedData;
      saveDatabase();
      return sendJson(res, 200, { success: true, message: 'Database restored successfully from backup', data: db });
    }

    /*************************************************************************
     * STATIC FILES & SINGLE PAGE APP SERVING
     *************************************************************************/
    if (pathname.startsWith('/uploads/')) {
      const subPath = pathname.replace('/uploads/', '');
      const filePath = path.join(UPLOADS_DIR, subPath);
      return serveStaticFile(req, res, filePath);
    }

    // Serve public/index.html on root or any unknown non-api path
    let staticFilePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(staticFilePath)) {
      staticFilePath = path.join(PUBLIC_DIR, 'index.html');
    }
    return serveStaticFile(req, res, staticFilePath);

  } catch (err) {
    console.error('Unhandled server error:', err);
    return sendError(res, 500, 'Internal Server Error: ' + err.message);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
========================================================================
🚀 Sri Sai Sandhya Vastralayam & Boutique — Full-Stack ERP Server
📡 Server listening on: http://localhost:${PORT}
📁 Database file:       ${DB_FILE} (SQLite)
📁 Backup JSON:         ${JSON_BACKUP_FILE}
📁 Static Web Root:     ${PUBLIC_DIR}
👥 Connected SSE:       Live auto-sync enabled
========================================================================
`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  if (sqliteDb) sqliteDb.close();
  server.close(() => process.exit(0));
});
