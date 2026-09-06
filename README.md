# Hustle - On-Demand Local Services & Gig Marketplace

Hustle is a full-stack on-demand local services platform connecting customers with verified trade specialists across home care, repairs, beauty, tutoring, and tech support. Built with modern Node.js, Express, MongoDB Atlas, and client-side web technologies, featuring AI-assisted price estimation, real-time bargaining, secure escrow payments, location-based service filtering, and an Operations Admin Console with dispute arbitrations.

---

## 🌟 Key Features

### 1. Multi-Role Authentication & Onboarding
- **Customer Portal**: Direct email/phone registration, password-based authentication, and Google OAuth One-Tap sign-in.
- **Gig Worker Partner Portal**: Detailed trade onboarding with compulsory working city, trade category, experience, and verification document upload (`approvalStatus: pending`).
- **Role Enforcement**: Strict cross-portal protection prevents customer accounts from accessing worker features and vice-versa.
- **Operations Admin Console**: Privately configured staff operations console to review partner credentials, verify uploaded documents, approve/reject workers, and oversee accounts.

### 2. Location-Based Service Discovery & Map API
- **Mandatory Customer Location Gate**: Prompts customer on login to select or confirm their city/area using GPS geolocation with reverse-geocoding, Google Places autocomplete, or quick metro chips (Bengaluru, Mumbai, Delhi, Kolkata, etc.).
- **Dynamic Pricing & Filtering**: Automatically adjusts service card rates and availability based on verified active workers in the selected city.

### 3. Smart Search & AI Price Diagnostics
- **18 On-Demand Services**: Electrician, Plumbing, Carpentry, AC Servicing, Deep Cleaning, Home Salon, Math Tutoring, Device Repair, and more.
- **Fast-Path Heuristic Token Matching**: Sub-millisecond instant matching with local memory caching.
- **Real-Time Rate & Budget Guidance**: Dynamically calculates suggested rates and budgets from actual active worker demands in that city; automatically falls back to in-real-life (IRL) Indian market benchmarks if no local pros exist.

### 4. Direct Booking & Real-Time Negotiation Engine
- **Appointments & Open Pro Pool**: Book a specific specialist directly or broadcast to the open community pool.
- **Two-Way Price & Schedule Bargaining**: Specialists can propose counter-prices and times.
- **Self-Acceptance Guard**: Prevents workers from accepting their own counter-offers without explicit customer approval.
- **Real-Time Notification Badges**: Visual indicators alert customers immediately when an offer is accepted or countered.

### 5. Secure Escrow & Payout System
- **Escrow Holding**: Customer payments (UPI, Cards) are held securely in Hustle Escrow upon acceptance.
- **Completion Confirmation**: Specialists mark jobs complete; funds are safeguarded in escrow pending verified completion or resolution.

### 6. Confidential Dispute Resolution & Admin Settlement
- **Private Support Tickets (`TKT-XXXXXX`)**: Either party can file an official complaint on a completed task.
- **Mutual Confidentiality**: If a customer files against a worker (or vice versa), the complaint remains **strictly invisible** to the opposing party until an official admin verdict is reached.
- **Admin Settlement Console**: Admin reviews statements, task scope, escrow amount, and settles with options:
  - *In Favor of Worker*: Releases escrow to worker, **voids retaliatory customer ratings**, and issues customer an official warning.
  - *In Favor of Customer*: Full refund from escrow to customer and issues worker an official warning.
  - *Mutual Split (50/50)*: Even split without penalties.
  - *Dismissal*: Closed without penalties.
- **Permanent Ban Enforcement**: Accumulating **more than 3 warnings** permanently bans the account forever (blocking login and revoking API access).

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js (REST API, JWT authentication, bcryptjs, Google OAuth client)
- **Database**: MongoDB Atlas (Mongoose ODM) with dual-mode persistent file database fallback (`data/db.json`)
- **Frontend**: Vanilla JavaScript (ES6+), CSS3 (Modern responsive design, custom animations), HTML5
- **APIs & Integrations**: Google Maps / Geocoding API, Google Gemini AI API, Google Identity Services

---
