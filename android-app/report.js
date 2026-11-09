// "Report this answer" (Google Play's AI-generated content policy requires in-app
// reporting of offensive AI replies). Reports go to the robinthood-reports worker;
// if it can't be reached, they wait on the phone and are sent on a later launch.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch } from 'expo/fetch';
import { installId } from './install';
import { makeAuthHeaders } from './web';

export const REPORT_URL = 'https://robinthood-reports.phone-liaison.workers.dev/report';
const QUEUE_KEY = '@robinthood_report_queue_v1';

export const REPORT_REASONS = [
  { id: 'offensive', label: 'Offensive or hateful' },
  { id: 'sexual', label: 'Sexual content' },
  { id: 'dangerous', label: 'Dangerous or harmful' },
  { id: 'wrong', label: 'Wrong or made up' },
  { id: 'other', label: 'Something else' },
];

// Signed when sent (not when queued), so a report saved offline is still inside the
// worker's time window when it finally goes.
async function post(report) {
  const body = JSON.stringify(report);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(REPORT_URL, { method: 'POST', headers: await makeAuthHeaders(body), body, signal: ctrl.signal });
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
  } finally {
    clearTimeout(timer);
  }
}

// The worker refused this report as malformed or too big; retrying never helps.
const refused = (e) => e?.status === 400 || e?.status === 413;

async function readQueue() {
  try { return JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) || '[]'); } catch { return []; }
}

// Returns 'sent', 'queued' (network/server trouble; retried on a later launch),
// 'refused' (worker rejected it; not kept) or 'failed' (could not be saved on the phone).
export async function submitReport({ reason, note, model, question, answer, version }) {
  const report = {
    reason, note: note || '', model: model || '', version: version || '',
    question: (question || '').slice(0, 2000), answer: (answer || '').slice(0, 6000),
    install_id: await installId(),
  };
  try {
    await post(report);
    return 'sent';
  } catch (e) {
    if (refused(e)) return 'refused';
    const q = await readQueue();
    q.push(report);
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-50)));
    } catch {
      return 'failed';
    }
    return 'queued';
  }
}

// Settings > Send feedback. Same signed pipeline and offline queue as answer reports.
export function submitFeedback({ note, version }) {
  return submitReport({ reason: 'feedback', note: (note || '').trim().slice(0, 4000), version });
}

// Try to send reports that were saved while offline.
export async function flushReports() {
  const q = await readQueue();
  if (!q.length) return;
  const left = [];
  for (const r of q) {
    try { await post(r); } catch (e) { if (!refused(e)) left.push(r); }
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(left)).catch(() => {});
}
