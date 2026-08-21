# 🎂 Umu Emily Birthday Reminder

A WhatsApp birthday reminder system for the Umu Emily Grandchildren group. Automatically sends 7-day reminders, 1-day reminders, and birthday messages to your WhatsApp group.

## Architecture

```
┌─────────────────────────────┐     ┌─────────────────────────────────┐
│   Frontend (Vercel)         │     │   Backend (emily.sammiehosty.com)│
│   Next.js Static App        │────▶│   PHP API + MySQL Database      │
│                             │     │                                 │
└─────────────────────────────┘     └─────────────────────────────────┘
                                              │
                                              ▼
                                    ┌─────────────────────┐
                                    │   cron-job.org      │
                                    │   Daily @ 8AM WAT   │
                                    └─────────────────────┘
                                              │
                                              ▼
                                    ┌─────────────────────┐
                                    │   WA Client API     │
                                    │   waclient.com      │
                                    └─────────────────────┘
```

## Deployment Guide

### Step 1: Deploy Backend to emily.sammiehosty.com

1. **Upload the `backend` folder** to your hosting via FTP/cPanel File Manager:
   ```
   /public_html/
   ├── config.php
   ├── setup.php
   ├── .htaccess
   └── api/
       ├── auth.php
       ├── cron.php
       ├── db-status.php
       ├── logs.php
       ├── members.php
       ├── send-message.php
       ├── settings.php
       └── test-send.php
   ```

2. **Edit `config.php`** with your database credentials (already configured):
   ```php
   define('DB_HOST', 'localhost');
   define('DB_NAME', 'sammarle_emily');
   define('DB_USER', 'sammarle_emily');
   define('DB_PASS', 'sammarle_emily');
   ```

3. **Run the setup script** by visiting:
   ```
   https://emily.sammiehosty.com/setup.php
   ```
   This creates database tables and seeds the member data.

4. **⚠️ DELETE setup.php** after running it for security.

### Step 2: Deploy Frontend to Vercel

1. **Push this repository to GitHub**

2. **Import to Vercel** at vercel.com/new

3. **Set Environment Variable**:
   ```
   NEXT_PUBLIC_API_URL=https://emily.sammiehosty.com
   ```

4. **Deploy** - Your app will be live!

### Step 3: Configure WA Client API

1. **Get your credentials from waclient.com**:
   - Access Token
   - Instance ID

2. **Get your WhatsApp Group ID**:
   - Format: `234xxxxxxxxxx-xxxxxxxxxx@g.us`
   - Find this in your WA Client dashboard

3. **Log into your app** with password: `admin123`

4. **Go to Settings tab** and enter:
   - Access Token
   - Instance ID
   - WhatsApp Group ID

### Step 4: Setup Cron Job on cron-job.org

1. **Create free account** at cron-job.org

2. **Create new cron job**:
   - **Title:** Umu Emily Birthday Check
   - **URL:** `https://emily.sammiehosty.com/api/cron.php?secret=YOUR_CRON_SECRET`
   - **Schedule:** Daily at 8:00 AM
   - **Timezone:** Africa/Lagos (WAT)

3. **Update the cron secret** in your app's Settings tab

## Features

- ✅ **Password Protected** - Default password: `admin123`
- ✅ **Database Status** - Shows connection status on login
- ✅ **Member Management** - Add, edit, delete family members
- ✅ **Three Message Types**:
  - 📅 7-Day Notice
  - ⏰ 1-Day Notice  
  - 🎂 Birthday Message
- ✅ **Custom Messages** - Send personalized messages
- ✅ **Message Templates** - Customizable with {name} and {date}
- ✅ **Message Logs** - Track all sent messages
- ✅ **Automated Cron** - No app needs to be open

## Pre-loaded Members

| Name | Birthday |
|------|----------|
| Ada Chimezie | January 23rd |
| Lotanna Egwuatu | January 23rd |
| Ezinne Egwuatu | March 17th |
| Chinenye Okonkwo | March 25th |
| Kingsley Egwuatu | March 27th |
| Uche Okonkwo | April 4th |
| Tochukwu Egwuatu | April 16th |
| Chukwuka Okonkwo | May 4th |
| Ogechukwu Unigwe | May 6th |
| Uche Egwuatu | September 7th |
| Mrs. Ukamaka Obi | September 15th |
| Kosi Ezeh | October 20th |
| Blessing Egwuatu | October 28th |
| Precious Egwuatu | November 1st |
| Nneoma Egwuatu | November 6th |
| Chikamso Egwuatu | November 7th |
| David Egwuatu | November 16th |
| Maxwell Egwuatu | December 6th |

## API Endpoints (Backend)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/db-status.php` | GET | Check database connection |
| `/api/auth.php` | POST | Login authentication |
| `/api/members.php` | GET/POST/PUT/DELETE | Manage members |
| `/api/settings.php` | GET/PUT | Manage settings |
| `/api/logs.php` | GET | View message logs |
| `/api/send-message.php` | POST | Send custom message |
| `/api/test-send.php` | POST | Send template message |
| `/api/cron.php?secret=XXX` | GET | Cron job endpoint |

## Security

- All sensitive data (API keys, tokens) stored in database
- Nothing hardcoded in the frontend
- Cron endpoint protected with secret key
- Password protected admin access
- Config file protected via .htaccess

## Tech Stack

- **Frontend:** Next.js 16, React, TailwindCSS
- **Backend:** PHP 7.4+, MySQL
- **Hosting:** Vercel (frontend), cPanel (backend)
- **Automation:** cron-job.org
- **Messaging:** WA Client API (waclient.com)
