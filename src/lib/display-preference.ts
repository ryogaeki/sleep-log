import { useState } from "react";

// 表示設定だけを端末に保存する。睡眠記録や日記本文は含めない。
export function useDisplayPreference<T extends string | boolean>(userId: string, name: string, fallback: T, valid: (value: unknown) => value is T) {
  const key = `sleep-log-display:${userId}:${name}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      if (valid(stored)) return stored;
    } catch { /* 保存が使えない場合も画面は操作できる。 */ }
    return fallback;
  });
  function change(next: T) {
    setValue(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  }
  return [value, change] as const;
}
