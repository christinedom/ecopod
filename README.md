# EcoPod Prototype

**EcoPod** is a real-time web platform for locating and checking the cleanliness of public restrooms. This prototype uses **Node.js, Express, SQLite, Leaflet, and Socket.IO** to provide live updates, proximity search, and simulated check-ins.

---

## Features

* View a list of nearby EcoPods with cleanliness and availability status
* Real-time updates via **Socket.IO**
* Search by your current location (autofill coordinates using browser geolocation)
* Map integration using **Leaflet**
* Simulated check-ins and auto-availability timers
* Admin endpoints to add and update EcoPods

---

## Tech Stack

* **Backend**: Node.js, Express, SQLite
* **Frontend**: HTML, CSS, JavaScript, Leaflet
* **Real-time**: Socket.IO

---

## Installation

1. Clone the repository:

```bash
git clone <repo-url>
cd ecopod
```

2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

4. Open in browser: [http://localhost:3000](http://localhost:3000)

---

## API Endpoints

* `GET /api/pods` – List all pods
* `GET /api/pods/:id` – Get a single pod
* `GET /api/pods/near?lat=&lng=&radius=` – Find nearby pods
* `POST /api/pods/:id/cleanliness` – Update pod cleanliness
* `PUT /api/pods/:id/status` – Toggle availability/self-cleaning
* `POST /api/report` – Submit a cleanliness report
* `POST /api/checkin` – Simulate a pod check-in
* `POST /api/pods` – Admin: create a new pod

---

## Notes

* Geolocation works on **HTTPS** or **localhost**
* Apple Pay is simulated; real integration requires HTTPS & merchant validation
* Demo pods are pre-populated in the SQLite database on first run
