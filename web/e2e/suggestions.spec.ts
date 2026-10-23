import { expect, test } from '@playwright/test';

test('shows only fresh suggestions on the latest answer', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('yt-consent-2026-10c', '1');
    localStorage.setItem('yt-lang', 'es');
  });
  await page.route('**/__yachi_api/trends*', (route) => route.fulfill({ json: [] }));
  await page.route('**/__yachi_api/topics', (route) => route.fulfill({ json: [] }));
  await page.route('**/__yachi_api/chat', (route) => route.fulfill({
    headers: { 'content-type': 'text/event-stream' },
    body: [
      { type: 'token', text: 'Respuesta de prueba con información.' },
      { type: 'suggestions', items: ['¿Cómo pido una beca?', '¿Qué documentos necesito?', 'Que documentos necesito!', '¿Cuál es el plazo?'] },
      { type: 'done', messageId: 'suggestion-test' },
    ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
  }));
  await page.goto('/');
  await page.locator('#ask').fill('Como pido una beca');
  await page.locator('#ask').press('Enter');
  const first = page.locator('.msg-ai').first();
  await expect(first.locator('.follow .chip')).toHaveCount(2);
  await first.getByRole('button', { name: '¿Qué documentos necesito?', exact: true }).click();
  const latest = page.locator('.msg-ai').last();
  await expect(latest.locator('.follow .chip')).toHaveCount(1);
  await expect(latest.locator('.follow .chip')).toHaveText('¿Cuál es el plazo?');
  await expect(first.locator('.follow .chip')).toHaveCount(0);
});
