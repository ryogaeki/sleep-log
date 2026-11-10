import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

export function MobileMenu({ onData, onLogout, demo }: { onData: () => void; onLogout: () => void; demo: boolean }) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  function close() { if (menu.current) menu.current.open = false; }
  return <details className="mobile-menu" ref={menu}>
    <summary aria-label="メニュー"><Icon name="menu" size={23} /></summary>
    <div className="header-menu-panel">
      <button type="button" onClick={() => { close(); onData(); }}><Icon name="settings" size={19} />データ管理</button>
      <button type="button" onClick={() => { close(); onLogout(); }}><Icon name="logout" size={19} />{demo ? "体験を終了する" : "ログアウト"}</button>
    </div>
  </details>;
}
