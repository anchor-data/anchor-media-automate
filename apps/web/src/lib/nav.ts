import type { IconName } from "../components/icon";

export interface NavLeaf {
  readonly href: string;
  readonly label: string;
  /** Show the pending-review count next to this item. */
  readonly reviewBadge?: boolean;
}

export interface NavSection {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  /** Heading shown above the secondary menu. */
  readonly heading: string;
  readonly items: readonly NavLeaf[];
  /** Temporarily switched off: shown greyed out in the rail and its routes redirect away. */
  readonly disabled?: boolean;
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: "home",
    label: "ホーム",
    icon: "home",
    heading: "ホーム",
    items: [
      { href: "/calendar", label: "カレンダー" },
      { href: "/pipeline", label: "制作パイプライン" },
      { href: "/ideas", label: "アイデア" },
      { href: "/review", label: "承認・レビュー", reviewBadge: true }
    ]
  },
  {
    id: "assets",
    label: "素材",
    icon: "image",
    heading: "素材",
    items: [
      { href: "/assets", label: "アセットライブラリ" },
      { href: "/templates", label: "テンプレート管理" },
      { href: "/guidelines", label: "参照資料・メモリ" }
    ]
  },
  {
    id: "analytics",
    disabled: true,
    label: "分析",
    icon: "bar-chart",
    heading: "分析",
    items: [
      { href: "/analytics", label: "パフォーマンス分析" },
      { href: "/analytics/posts", label: "投稿別分析" },
      { href: "/analytics/benchmark", label: "競合ベンチマーク" }
    ]
  },
  {
    id: "agent",
    label: "エージェント",
    icon: "bot",
    heading: "エージェント",
    items: [
      { href: "/agent/accounts", label: "アカウント管理" },
      { href: "/agent/logs", label: "実行ログ" }
    ]
  },
  {
    id: "settings",
    disabled: true,
    label: "設定",
    icon: "sliders",
    heading: "設定",
    items: [
      { href: "/settings/members", label: "メンバーと権限" },
      { href: "/settings/approval", label: "承認ルール" },
      { href: "/settings/integrations", label: "外部サービス連携" },
      { href: "/settings/notifications", label: "通知" },
      { href: "/settings/billing", label: "請求とプラン" }
    ]
  }
];

/** Section whose menu contains `pathname` (editor pages belong to Home). */
export function sectionFor(pathname: string): NavSection {
  if (pathname.startsWith("/editor")) return NAV_SECTIONS[0]!;
  const match = NAV_SECTIONS.find((section) =>
    section.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
  );
  return match ?? NAV_SECTIONS[0]!;
}

/** Most specific menu item for `pathname`. */
export function activeItemHref(section: NavSection, pathname: string): string | null {
  const matches = section.items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length);
  if (matches[0]) return matches[0].href;
  return pathname.startsWith("/editor") ? "/pipeline" : null;
}
