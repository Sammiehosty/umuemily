# Umu Emily Family Manager — Production V2

A Next.js admin dashboard with a PHP/MySQL API for:

- automatic WhatsApp birthday reminders
- 7-day, 1-day and birthday-day automation
- monthly contribution reminders
- cron heartbeat/health monitoring
- idempotent message queue and retries
- family member management and birthday privacy controls
- ₦200 weekly dues tracking
- ₦1,000 birthday contributions
- ₦20,000 birthday payouts
- financial ledger and debt recovery
- transaction voiding and audit logs
- scheduled/custom WhatsApp messages
- CSV reports
- role-based admin/contributor access

## Deployment

Frontend: deploy the project root to Vercel and set `NEXT_PUBLIC_API_URL`.

Backend: deploy `/backend` to `emily.sammiehosty.com`, configure the PHP environment variables, run `php scripts/migrate.php`, then configure cron-job.org to call `/api/cron.php` every 5 minutes with `X-Cron-Secret`.

Do not expose real credentials in source control.
