# Sri Sai Sandhya Vastralayam & Boutique — Full-Stack ERP Server

A complete, production-grade Full-Stack ERP and Customer Management System tailored for bridal boutique operations, tailor shops, and Maggam embroidery workshops.

---

## 🌟 Architecture & Features

### 1. Backend Server (`server.js`)
* **Runtime**: Standalone Node.js v22.11.0 (located in `bin/node.exe`, zero external dependencies required).
* **Database & Persistence**:
  * **Primary**: Embedded SQLite database (`data/boutique_erp.db`) using native `node:sqlite`.
  * **Secondary / Backup**: Transactional atomic JSON snapshot (`data/boutique_erp.json`).
  * **Initial Seed**: Automatically seeds records from `data/initial_seed.json` on first launch.
* **Real-time Live Sync**: **Server-Sent Events (SSE)** on `/api/events` broadcasts state mutations (orders, duty status, measurements, expenses) in real-time across all connected devices (Madam's floor tablet, Stitching workshop PCs, Maggam karigar devices, and Owner's desk).
* **File & Media Storage**: File upload handler (`/api/upload`) permanently stores uploaded design sketches, voice notes, and customer photos in `public/uploads/`.

### 2. Frontend Application (`public/index.html`)
* **Role-Based Portals**:
  1. **Owner (`owner` / `123`)**: Full access — confidential profit/loss, billing, Sunday payroll calculations, master settings, employee profile editor.
  2. **Madam / Manager (`madam` / `123`)**: Order bookings, repeat customer lookup, 14 blouse measurements & garment schemas, workshop assignments, and operational reports.
  3. **Stitching Master (`stitching` / `123`)**: Department queue, garment measurements snapshot, design sketches zoom gallery, voice note player, step-by-step progress tracking (`Stitching Assigned` → `Stitching In Progress` → `Stitching Completed`).
  4. **Maggam Karigar (`maggam` / `123`)**: Maggam queue with customer phone/address masking for privacy. Automated transition: marking `Maggam Completed` immediately auto-transfers the order into Stitching queue!
* **Dual Mode**:
  * **Online Mode**: Directly synchronizes with backend REST API and SQLite database.
  * **Offline Resilience**: Automatically falls back to browser localStorage if server connection is interrupted, and resyncs once reconnected.

---

## 🚀 Quick Start

### Method 1: Double-Click Launcher (Windows)
Double-click `start-server.bat`. It will start the server and automatically open `http://localhost:3000` in your default browser.

### Method 2: Command Line
Open PowerShell or CMD in this directory and run:
```powershell
bin\node.exe --experimental-sqlite server.js
```
Then visit **http://localhost:3000** in Chrome, Edge, or Firefox.

---

## 📡 REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Health check, server uptime, and connected SSE client count |
| `/api/state` | `GET`, `POST` | Retrieve or overwrite complete master ERP state |
| `/api/events` | `GET` | Server-Sent Events (SSE) live sync stream |
| `/api/auth/login` | `POST` | Authenticate role credentials (`owner`, `madam`, `stitching`, `maggam`) |
| `/api/auth/profile` | `PUT` | Update staff profile, password, designation, or salary |
| `/api/customers` | `GET`, `POST` | Query customer directory or register new customer |
| `/api/customers/:id` | `PUT`, `DELETE` | Update customer measurements/details or delete customer |
| `/api/orders` | `GET`, `POST` | List orders (with search/urgent filters) or book new order |
| `/api/orders/:id/status`| `PUT` | Advance order status (includes Maggam → Stitching auto-transfer) |
| `/api/orders/:id/urgent`| `PUT` | Toggle priority urgent tag on an order |
| `/api/orders/:id` | `DELETE` | Permanently delete an order |
| `/api/attendance` | `GET` | List daily staff attendance logs |
| `/api/attendance/start` | `POST` | Record start of 11-hour duty |
| `/api/attendance/end` | `POST` | Record end of duty (auto-calculates shift & overtime) |
| `/api/attendance/manual`| `POST` | Manual attendance sheet entry |
| `/api/attendance/:id` | `DELETE` | Delete attendance record |
| `/api/payroll` | `GET` | Retrieve Sunday weekly payroll register |
| `/api/payroll/:id/pay-sunday` | `POST` | Mark Sunday payout as Paid |
| `/api/payroll/:id/ot` | `POST` | Adjust overtime hours (+1h / -1h) |
| `/api/expenses` | `GET`, `POST` | Retrieve or add expense voucher |
| `/api/expenses/:id` | `DELETE` | Delete expense voucher |
| `/api/upload` | `POST` | Upload design sketch, customer photo, or voice audio recording |
| `/api/backup/export` | `GET` | Download full JSON backup file |
| `/api/backup/import` | `POST` | Restore ERP database from backup file |

---

## 📁 Project Directory Structure

```
sareeshoperp/
├── bin/
│   └── node.exe                 # Standalone portable Node.js runtime (v22.11.0)
├── data/
│   ├── boutique_erp.db          # Persistent SQLite Database
│   ├── boutique_erp.json        # Synchronized atomic JSON state
│   └── initial_seed.json        # Initial backup seed records
├── public/
│   ├── index.html               # Frontend ERP Single Page Application
│   └── uploads/                 # Permanent uploads (sketches, voice audio, photos)
├── server.js                    # Full-stack backend server
├── start-server.bat             # One-click Windows launcher
├── index.html                   # Workspace root reference copy
└── README.md                    # System documentation
```
