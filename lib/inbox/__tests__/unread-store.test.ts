import { afterEach, expect, it, vi } from "vitest";
import { getUnread, notifySeen, onSeen, setUnread, subscribe } from "../unread-store";

afterEach(() => setUnread(0));

it("처음은 0이고 쓴 값을 그대로 읽는다", () => {
  expect(getUnread()).toBe(0);
  setUnread(12);
  expect(getUnread()).toBe(12);
  setUnread(0);
  expect(getUnread()).toBe(0);
});

it("구독자 모두에게 알리고 해제한 구독자는 부르지 않는다", () => {
  const first = vi.fn();
  const second = vi.fn();
  const stopFirst = subscribe(first);
  const stopSecond = subscribe(second);
  setUnread(3);
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  stopFirst();
  setUnread(4);
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledTimes(2);
  stopSecond();
  setUnread(5);
  expect(second).toHaveBeenCalledTimes(2);
});

it("읽음 신호는 수를 바꾸지 않고 수 구독자도 부르지 않는다", () => {
  setUnread(7);
  const count = vi.fn();
  const seen = vi.fn();
  const stopCount = subscribe(count);
  const stopSeen = onSeen(seen);
  notifySeen();
  expect(seen).toHaveBeenCalledOnce();
  expect(count).not.toHaveBeenCalled();
  expect(getUnread()).toBe(7);
  stopCount();
  stopSeen();
});

it("읽음 신호를 거듭 보내도 store 상태는 같고 해제한 수신자는 부르지 않는다", () => {
  setUnread(2);
  const seen = vi.fn();
  const other = vi.fn();
  const stop = onSeen(seen);
  const stopOther = onSeen(other);
  notifySeen();
  notifySeen();
  expect(getUnread()).toBe(2);
  expect(seen).toHaveBeenCalledTimes(2);
  stop();
  notifySeen();
  expect(seen).toHaveBeenCalledTimes(2);
  expect(other).toHaveBeenCalledTimes(3);
  stopOther();
});

it("알림 도중 자기 구독을 해제해도 나머지는 그대로 받는다", () => {
  const second = vi.fn();
  const stopFirst = subscribe(() => stopFirst());
  const stopSecond = subscribe(second);
  setUnread(1);
  setUnread(2);
  expect(second).toHaveBeenCalledTimes(2);
  stopSecond();
});
