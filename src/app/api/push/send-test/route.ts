// POST /api/push/send-test
//
// Admin-only: sends a test push notification to ALL admin subscriptions.
// Used by the "Send test notification" button in the admin dashboard so
// the admin can verify their subscription is working end-to-end.
//
// Returns the SendPushResult so the UI can show how many subscriptions
// received it vs failed vs were cleaned up.
//
// Route path note: the directory is `send-test/` (not `test/`) because
// the project's .gitignore has a top-level `test` rule that would
// otherwise exclude the route file from version control.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorized } from '@/lib/admin-guard'
import { sendPush } from '@/lib/push'

export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await sendPush('admin', null, {
    title: '🔔 Test notification',
    body: 'If you can see this, push notifications are working.',
    url: '/admin',
    tag: 'test-push',
  })

  return NextResponse.json({ ok: true, result })
}
