// @vitest-environment jsdom
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { render } from './helpers/dom';
import { RepositoryCard } from '@/components/settings/repository-card';
import { CiCard } from '@/components/settings/ci-card';
vi.mock('@/app/(edit)/projects/[slug]/settings/actions', () => ({ connectRepository: vi.fn(async () => ({ ok: false, error: 'unavailable' })), updateRepositorySettings: vi.fn() }));
vi.mock('@/app/(edit)/projects/actions', () => ({ listRepoBranches: vi.fn(async () => ({ ok: true, names: ["main"], defaultBranch: "main", truncated: false })), rotatePushToken: vi.fn(async () => ({ ok: false, error: 'unavailable' })) }));
it.each(['repository', 'token'])('%s failures use the full-width card notice', async kind => {
  const { container } = await render(kind === 'repository'
    ? <RepositoryCard slug="acme" owner="acme" repo="web" branch="main" archived={false} health={{ status: 'not-connected' }} account={{ status: 'ok', login: 'owner' }} />
    : <CiCard slug="acme" archived={false} stale={[]}>{null}</CiCard>);
  const label = kind === 'repository' ? 'Connect' : 'Rotate token';
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === label)!;
  await act(async () => { await userEvent.setup().click(button); });
  const alert = container.querySelector('[role="alert"]')!;
  expect(alert).not.toBeNull();
  expect(alert.className).toContain('rounded-none');
  expect(alert.parentElement).toBe(container.querySelector('section'));
});

/**
 * ⚠️ **Sources 링크가 낱말 하나가 아니라 문장이다** (2026-09-23 실측). Settings에서 소스 카드를 걷은 자리에
 * 남긴 안내(Sources 시안 §13-2)가 `Sources` 한 낱말로만 서서 무엇으로 가는 링크인지 읽히지 않았다.
 */
it('the CI card points to Sources with a sentence and a visible link', async () => {
  const { container } = await render(<CiCard slug="acme" archived={false} stale={[]}>{null}</CiCard>);
  const link = container.querySelector('a[href="/projects/acme/sources"]')!;
  expect(link).not.toBeNull();
  expect(link.className).toContain('text-blue-600');
  expect(link.parentElement!.textContent!.trim()).not.toBe(link.textContent!.trim());
});
