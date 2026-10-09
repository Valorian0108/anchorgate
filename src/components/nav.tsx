"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Gate" },
  { href: "/statute", label: "Statute" },
  { href: "/record", label: "Record" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav>
      {ITEMS.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={active ? "active" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}