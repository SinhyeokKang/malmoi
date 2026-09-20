// @vitest-environment jsdom
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { render } from './helpers/dom';
import { RepositoryCard } from '@/components/settings/repository-card';
import { CiCard } from '@/components/settings/ci-card';
vi.mock('@/app/(edit)/projects/[slug]/settings/actions', () => ({ connectRepository: vi.fn(async () => ({ ok: false, error: 'unavailable' })), updateRepositorySettings: vi.fn() }));
vi.mock('@/app/(edit)/projects/actions', () => ({ rotatePushToken: vi.fn(async () => ({ ok: false, error: 'unavailable' })) }));
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
